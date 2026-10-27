// 浏览器端到端验证：真实点击各页面，抓 console 报错与关键交互
import { chromium } from 'playwright'

const URL = 'http://localhost:5199/'
const errors = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

const step = async (name, fn) => {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (e) {
    console.log(`✗ ${name}\n    ${e.message.split('\n')[0]}`)
  }
}

await page.goto(URL, { waitUntil: 'networkidle' })

await step('总时间轴渲染', async () => {
  await page.waitForSelector('text=总时间轴')
  const txt = await page.textContent('main')
  if (!txt.includes('整体完成度')) throw new Error('缺进度条区域')
  if (!txt.includes('待填写')) throw new Error('缺未填日期的提示')
})

await step('调整时间节点不报 invalid value', async () => {
  await page.locator('header button', { hasText: '调整时间节点' }).first().click()
  await page.waitForTimeout(300)
  const dateInputs = await page.$$('input[type=date]')
  if (dateInputs.length < 6) throw new Error(`日期输入框数量异常: ${dateInputs.length}`)
  // 写入一个日期
  await dateInputs[0].fill('2026-12-19')
  await page.waitForTimeout(200)
  await page.locator('header button', { hasText: '完成调整' }).first().click()
})

await step('每日日志：时长输入失焦才落盘', async () => {
  await page.locator('aside nav button', { hasText: '每日日志' }).first().click()
  await page.waitForSelector('text=今日学习时长')
  const input = await page.$('input[aria-label*="数二学习时长"]')
  await input.click()
  await input.fill('')
  await input.type('3.5')
  // 输入过程中不应落盘（还未失焦）
  const mid = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('study-progress-state'))
    const today = new Date().toLocaleDateString('sv-SE')
    return s.dailyLogs[today]?.durations?.find((d) => d.subject === '数二')?.hours ?? null
  })
  await page.keyboard.press('Tab')
  await page.waitForTimeout(200)
  const after = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('study-progress-state'))
    const today = new Date().toLocaleDateString('sv-SE')
    return s.dailyLogs[today]?.durations?.find((d) => d.subject === '数二')?.hours ?? null
  })
  if (after !== 3.5) throw new Error(`失焦后应落盘 3.5，实际 ${after}`)
  console.log(`    输入中=${mid} 失焦后=${after}`)
})

await step('章节目录：树渲染 + 逐级展开到底', async () => {
  await page.locator('aside nav button', { hasText: '章节目录' }).first().click()
  await page.waitForSelector('text=四科知识点树')
  const txt = await page.textContent('main')
  if (!txt.includes('高等数学')) throw new Error('数二目录没渲染出来')
  // 层级正确后树是折叠的，必须递归展开才能看到叶子行
  for (let i = 0; i < 10; i++) {
    const arrows = await page.$$('button[aria-label="展开"]')
    if (!arrows.length) break
    for (const a of arrows) await a.click({ force: true }).catch(() => {})
    await page.waitForTimeout(150)
  }
  const rows = await page.evaluate(() => document.querySelectorAll('div.group').length)
  if (rows < 50) throw new Error(`展开后可见行数过少: ${rows}`)
})

await step('章节目录：叶子手写内容 + Markdown 预览', async () => {
  const attachBtns = await page.$$('button[aria-label="上传附件或手写内容"]')
  if (attachBtns.length === 0) throw new Error('没有找到叶子节点的附件入口')
  // 操作按钮是 hover 才显示，先 hover 所在行再点
  const handle = attachBtns[0]
  const row = await handle.evaluateHandle((el) => el.closest('div.group'))
  await row.asElement().hover()
  await page.waitForTimeout(200)
  await handle.click()
  await page.waitForTimeout(300)
  const ta = await page.$('textarea[placeholder*="手动编写"]')
  if (!ta) throw new Error('叶子面板未打开')
  await ta.fill('**加粗** 和 - 列表\n\n- 第一条\n- 第二条')
  await page.locator('button', { hasText: '保存手写内容' }).first().click()
  await page.waitForTimeout(300)
  const saved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('study-progress-state'))
    const walk = (ns) => ns.map((n) => [n, ...walk(n.children || [])]).flat()
    return walk(s.syllabus['数二']).filter((n) => n.content).length
  })
  if (saved === 0) throw new Error('手写内容没落盘')
})

await step('错题档案：四科都展示 + 筛选 + 录入表单', async () => {
  await page.locator('aside nav button', { hasText: '错题档案' }).first().click()
  await page.waitForSelector('text=按科目 + 章节归类')
  const tabText = await page.textContent('main')
  for (const s of ['数二', '英二', '408', '政治']) {
    if (!tabText.includes(s)) throw new Error(`缺科目 tab: ${s}`)
  }
  await page.locator('button', { hasText: /^已掌握$/ }).first().click()
  await page.waitForTimeout(200)
  await page.locator('button', { hasText: '录入错题' }).first().click()
  await page.waitForTimeout(200)
  const hasForm = await page.$('input[placeholder*="所属章节"]')
  if (!hasForm) throw new Error('录入表单没出现')
})

await step('月考分析：列表 + 排序 + 详情 + 删除按钮', async () => {
  await page.locator('aside nav button', { hasText: '月考分析' }).first().click()
  await page.waitForTimeout(400)
  const txt = await page.textContent('main')
  if (!txt.includes('月考记录')) throw new Error('列表没渲染')
  if (!txt.includes('日期待补')) throw new Error('占位日期应给出「日期待补」提示')
  // 点表格数据行进详情
  const row = page.locator('tbody tr').first()
  await row.click()
  await page.waitForTimeout(500)
  const det = await page.textContent('main')
  if (!det.includes('总分')) throw new Error('详情页没渲染')
  await page.locator('button', { hasText: '返回列表' }).first().click()
  await page.waitForTimeout(400)
  const back = await page.textContent('main')
  if (!back.includes('月考记录')) throw new Error('返回列表失败')
  // 删除按钮存在（hover 显示）
  const delBtn = page.locator('tbody tr').first().locator('button[aria-label="删除该场"]')
  if ((await delBtn.count()) === 0) throw new Error('缺少删除按钮')
})

await step('数据备份面板可打开', async () => {
  await page.locator('aside button', { hasText: '数据备份' }).first().click()
  await page.waitForSelector('text=导出备份')
  await page.click('button[aria-label="关闭"]')
})

await step('对话页可打开且有输入框', async () => {
  await page.locator('aside nav button', { hasText: '智能助手' }).first().click()
  await page.waitForTimeout(300)
  const ta = await page.$('textarea[placeholder*="输入指令"]')
  if (!ta) throw new Error('输入框缺失')
})

// 刷新后检查会话是否保留（写入一条假消息再刷新）
await step('刷新后会话记忆保留', async () => {
  await page.evaluate(() => {
    sessionStorage.setItem(
      'study-progress-chat',
      JSON.stringify([{ id: 1, role: 'assistant', text: '记忆测试消息' }]),
    )
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('aside nav button', { hasText: '智能助手' }).first().click()
  await page.waitForTimeout(500)
  const txt = await page.textContent('main')
  if (!txt.includes('记忆测试消息')) throw new Error('刷新后会话丢失')
})

await step('刷新后数据（手写内容）仍在', async () => {
  await page.reload({ waitUntil: 'networkidle' })
  const n = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('study-progress-state'))
    const walk = (ns) => ns.map((x) => [x, ...walk(x.children || [])]).flat()
    return walk(s.syllabus['数二']).filter((x) => x.content).length
  })
  if (n === 0) throw new Error('刷新后手写内容丢失')
})

await page.screenshot({ path: 'tests/e2e-final.png', fullPage: false })

console.log('\n控制台报错：', errors.length === 0 ? '无' : `\n  - ${errors.join('\n  - ')}`)
await browser.close()
if (errors.length) process.exit(1)
