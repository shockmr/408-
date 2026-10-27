// 附件链路验证：上传 → IndexedDB 存储 → state 只留元数据 → 查看可打开 → 删除清理
import { chromium } from 'playwright'

const errors = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const step = async (name, fn) => {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (e) {
    console.log(`✗ ${name}\n    ${e.message.split('\n')[0]}`)
  }
}

// 层级修好后树默认折叠，叶子行不可见。每次进页面都要递归展开到底。
const expandAll = async () => {
  for (let i = 0; i < 10; i++) {
    const arrows = await page.$$('button[aria-label="展开"]')
    if (!arrows.length) break
    for (const a of arrows) await a.click({ force: true }).catch(() => {})
    await page.waitForTimeout(150)
  }
}

// 打开第一个叶子的编辑面板（操作按钮 hover 才出现）
const openFirstLeaf = async () => {
  await page.locator('aside nav button', { hasText: '章节目录' }).first().click()
  await page.waitForTimeout(300)
  await expandAll()
  const attachBtns = await page.$$('button[aria-label="上传附件或手写内容"]')
  if (!attachBtns.length) throw new Error('找不到叶子节点')
  const handle = attachBtns[0]
  const row = await handle.evaluateHandle((el) => el.closest('div.group'))
  await row.asElement().hover()
  await handle.click()
  await page.waitForTimeout(300)
}

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' })

// 先清空状态，从干净数据开始
await page.evaluate(() => {
  localStorage.clear()
  sessionStorage.clear()
})
await page.reload({ waitUntil: 'networkidle' })

// 记录 localStorage 体积基线
const baseSize = await page.evaluate(() => localStorage.getItem('study-progress-state')?.length || 0)

// IndexedDB 查询辅助：必须在页面里执行，且不能裸 open() 建空库。
// 用 window.X = 赋值而不是 const，避免 eval 作用域把函数困在内部。
const IDB_HELPERS = `
  window.__listFiles = async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('study-progress-attachments')
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    if (!db.objectStoreNames.contains('files')) return { count: 0, rows: [] }
    const rows = await new Promise((res) => {
      const tx = db.transaction('files', 'readonly')
      const r = tx.objectStore('files').getAll()
      r.onsuccess = () => res(r.result || [])
    })
    return { count: rows.length, rows: rows.map((x) => ({ id: x.id, name: x.name, size: x.size, hasBlob: !!x.blob })) }
  }
`

await step('上传附件后 state 不膨胀（走 IndexedDB）', async () => {
  await openFirstLeaf()

  // 上传一个 2MB 的假 PDF（模拟真实教材扫描件）
  const buf = Buffer.alloc(2 * 1024 * 1024, 0x41)
  await page.setInputFiles('input[type=file][accept*=".pdf"]', {
    name: '扫描件.pdf',
    mimeType: 'application/pdf',
    buffer: buf,
  })
  await page.waitForTimeout(1500)

  const info = await page.evaluate(async (helper) => {
    eval(helper)
    const raw = localStorage.getItem('study-progress-state') || ''
    const s = JSON.parse(raw)
    const walk = (ns) => ns.map((x) => [x, ...walk(x.children || [])]).flat()
    const nodes = walk(s.syllabus['数二'])
    const withAtt = nodes.filter((n) => n.attachments?.length)
    const files = await window.__listFiles()
    return {
      localStorageBytes: raw.length,
      attachMeta: withAtt[0]?.attachments?.[0] || null,
      attachNodeTitle: withAtt[0]?.title || null,
      idbRecords: files.rows,
    }
  }, IDB_HELPERS)

  console.log(`    localStorage 体积: ${baseSize} → ${info.localStorageBytes}`)
  console.log(`    节点「${info.attachNodeTitle}」附件元数据: ${JSON.stringify(info.attachMeta)}`)
  console.log(`    IndexedDB 记录: ${JSON.stringify(info.idbRecords)}`)

  if (!info.attachMeta) throw new Error('节点上没有附件元数据')
  if ('data' in info.attachMeta) throw new Error('state 里仍保留 base64 data 字段')
  if (!info.idbRecords.length || !info.idbRecords[0].hasBlob) throw new Error('IndexedDB 里没有实体')
  // 2MB 文件不应让 localStorage 增长超过 10KB
  const growth = info.localStorageBytes - baseSize
  if (growth > 10_000) throw new Error(`localStorage 增长了 ${growth} 字节，附件没走 IDB`)
})

await step('刷新后附件仍在（IndexedDB 持久化）', async () => {
  await page.reload({ waitUntil: 'networkidle' })
  const n = await page.evaluate(async (helper) => {
    eval(helper)
    const s = JSON.parse(localStorage.getItem('study-progress-state'))
    const walk = (ns) => ns.map((x) => [x, ...walk(x.children || [])]).flat()
    const withAtt = walk(s.syllabus['数二']).filter((x) => x.attachments?.length)
    const files = await window.__listFiles()
    return { nodes: withAtt.length, idbCount: files.count }
  }, IDB_HELPERS)
  console.log(`    节点数=${n.nodes} IDB记录=${n.idbCount}`)
  if (n.nodes === 0 || n.idbCount === 0) throw new Error('刷新后附件丢失')
})

await step('查看附件能拿到 blob URL', async () => {
  await page.locator('aside nav button', { hasText: '章节目录' }).first().click()
  await page.waitForTimeout(300)
  await expandAll()
  const attachBtns = await page.$$('button[aria-label="上传附件或手写内容"]')
  if (!attachBtns.length) throw new Error('找不到叶子节点')
  // 带附件的那个叶子未必是第一个，逐个打开直到面板里有「查看」
  let found = false
  for (const handle of attachBtns) {
    const row = await handle.evaluateHandle((el) => el.closest('div.group'))
    await row.asElement().hover()
    await handle.click()
    await page.waitForTimeout(400)
    if ((await page.locator('button', { hasText: '查看' }).count()) > 0) {
      found = true
      break
    }
    await page.click('button[aria-label="关闭"]').catch(() => {})
    await page.waitForTimeout(200)
  }
  if (!found) throw new Error('没有找到带附件的叶子节点')

  // 拦截 window.open，验证 URL 是 blob: 且可读
  const ok = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      const orig = window.open
      window.open = (url) => {
        window.open = orig
        resolve({ url: String(url), isBlob: String(url).startsWith('blob:') })
        return null
      }
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '查看')
      if (!btn) return resolve({ url: '', isBlob: false, missing: true })
      btn.click()
      setTimeout(() => resolve({ url: '', isBlob: false, timeout: true }), 3000)
    })
  })
  console.log(`    查看结果: ${JSON.stringify(ok)}`)
  if (ok.missing) throw new Error('找不到「查看」按钮')
  if (!ok.isBlob) throw new Error('查看没有生成 blob URL')
})

await step('删除附件同时清理 IndexedDB', async () => {
  const before = await page.evaluate(async (helper) => {
    eval(helper)
    return (await window.__listFiles()).count
  }, IDB_HELPERS)
  const delBtn = page.locator('button[aria-label="删除附件"]').first()
  await delBtn.click()
  await page.waitForTimeout(800)
  const after = await page.evaluate(async (helper) => {
    eval(helper)
    const files = await window.__listFiles()
    const s = JSON.parse(localStorage.getItem('study-progress-state'))
    const walk = (ns) => ns.map((x) => [x, ...walk(x.children || [])]).flat()
    return {
      count: files.count,
      nodesWithAtt: walk(s.syllabus['数二']).filter((x) => x.attachments?.length).length,
    }
  }, IDB_HELPERS)
  console.log(`    IDB记录: ${before} → ${after.count}，有附件的节点: ${after.nodesWithAtt}`)
  if (after.count !== before - 1) throw new Error('IndexedDB 没清理')
  if (after.nodesWithAtt !== 0) throw new Error('节点元数据没清理')
})

console.log('\n控制台报错：', errors.length === 0 ? '无' : `\n  - ${errors.join('\n  - ')}`)
await browser.close()
if (errors.length) process.exit(1)
