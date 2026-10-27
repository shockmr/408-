import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle' })
await page.locator('aside nav button', { hasText: '章节目录' }).first().click()
await page.waitForTimeout(600)
const info = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('study-progress-state'))
  const walk = (ns, d = 0, acc = []) => { for (const n of ns) { acc.push({ d, t: n.title, kids: (n.children || []).length }); walk(n.children || [], d + 1, acc) } return acc }
  const all = walk(s.syllabus['数二'])
  // 只打印前 8 条
  return { head: all.slice(0, 10), total: all.length }
})
console.log(JSON.stringify(info, null, 1))
// 检查第一条渲染行的箭头
const firstRow = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('div.group')]
  return rows.slice(0, 3).map(r => ({
    text: r.innerText.slice(0, 20),
    hasArrowBtn: !!r.querySelector('button[aria-label="展开"], button[aria-label="折叠"]'),
    padLeft: getComputedStyle(r).paddingLeft,
  }))
})
console.log(JSON.stringify(firstRow, null, 1))
await browser.close()
