// 表格目录树解析：把 Excel / Word（.docx）表格解析成任意深度的目录树
// 目标场景：考研教材章节目录常以表格整理（列=层级，如 一级/二级/三级；或 章节编号+名称）
// 兼容两种主流模板 + 通用兜底。
//
// xlsx 约 950KB（gzip 后仍有 ~320KB），只在用户真的上传/下载表格时才需要。
// 这里一律动态 import，让打包器把它挪出首屏 bundle；否则静态 import 会让
// 页面里的 import('xlsx') 退化，整个库被塞进主包。
import { genNodeId } from './markdownTree'

const loadXLSX = () => import('xlsx')

// 单元格值整理：null/空 → ''
const cellText = (v) => (v == null ? '' : String(v).trim())

// 整行都空则跳过
const isBlankRow = (row, width) => {
  for (let c = 0; c < width; c++) if (row[c]) return false
  return true
}

// 表头模板匹配：只区分「章节编号+名称」两列，其余一律按「列=层级」处理
function detectTemplate(headers) {
  const h = headers.map((s) => String(s ?? '').trim())
  // 章节编号 + 名称 两列：首列标题含 章节/编号/序号，次列含 名称/标题/内容
  if (h.length >= 2 && /(章节|编号|序号|code|no)/i.test(h[0]) && /(名称|标题|内容|title|name)/i.test(h[1])) {
    return 'numberName'
  }
  // 其余统一走「列=层级」
  return 'columns'
}

// 通用树构建：每列代表一个固定层级，从左到右层级递增。
// 规则：
//  - 列 0 有值 → 新建根节点
//  - 列 c(c>0) 有值 → 新建节点，父级为「层级 c-1 当前最新节点」
//  - 空白单元格 = 沿用上一行同列（不新建），这正是目录表格的常见约定
//  - 同列连续重复值（合并单元格补值或手动重复）= 视为同一父节点，只建一次
function columnsToTree(rows, width) {
  const roots = []
  const lastAtLevel = [] // 每个层级最近创建的节点（跨行保持）
  const lastText = [] // 每列最近一次"新建"用的文本，用于去重

  for (const row of rows) {
    if (isBlankRow(row, width)) continue
    for (let c = 0; c < width; c++) {
      const v = row[c]
      if (!v) continue // 空白：沿用上一行
      if (v === lastText[c]) continue // 合并/重复：跳过，不新建

      const node = { id: genNodeId(), title: v, children: [] }
      lastText[c] = v

      if (c === 0) {
        roots.push(node)
        lastAtLevel.length = 1
        lastAtLevel[0] = node
        continue
      }

      // 找父级：优先上一级，跳级时回退到最近的已存在层级
      let parent = lastAtLevel[c - 1]
      if (!parent) {
        for (let k = c - 1; k >= 0; k--) {
          if (lastAtLevel[k]) { parent = lastAtLevel[k]; break }
        }
      }
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
      lastAtLevel.length = c + 1
      lastAtLevel[c] = node
    }
  }
  return roots
}

// 章节编号+名称 → 树：编号中「.」的个数决定层级（如 1 / 1.1 / 1.1.1）
function numberNameToTree(rows, width) {
  const roots = []
  const lastAtDepth = [] // 按编号深度记录最近节点
  for (const row of rows) {
    if (isBlankRow(row, width)) continue
    const name = (row[1] || row[0] || '').trim()
    if (!name) continue
    const no = String(row[0] ?? '').trim()
    // 深度 = 编号里点号个数；无编号时按 0 处理
    const depth = no ? (no.match(/\./g) || []).length : 0
    const node = { id: genNodeId(), title: name, children: [] }
    if (depth <= 0) {
      roots.push(node)
      lastAtDepth.length = 1
      lastAtDepth[0] = node
    } else {
      let parent = lastAtDepth[depth - 1]
      if (!parent) {
        for (let k = depth - 1; k >= 0; k--) {
          if (lastAtDepth[k]) { parent = lastAtDepth[k]; break }
        }
      }
      if (parent) parent.children.push(node)
      else roots.push(node)
      lastAtDepth.length = depth + 1
      lastAtDepth[depth] = node
    }
  }
  return roots
}

// 工作表 AOA → 树。返回 { tree, template, headers }
function aoaToTree(aoa) {
  const width = Math.max(0, ...aoa.map((r) => (Array.isArray(r) ? r.length : 0)))
  if (!width || !aoa.length) return { tree: [], template: 'columns', headers: [] }

  const headers = Array.from({ length: width }, (_, c) => cellText(aoa[0]?.[c]))
  // 把数据行转成 { 列下标: 文本 }，空白列保留为 ''
  const rows = aoa.slice(1).map((r) => {
    const obj = {}
    for (let c = 0; c < width; c++) obj[c] = cellText(r?.[c])
    return obj
  })

  const template = detectTemplate(headers)
  const tree = template === 'numberName' ? numberNameToTree(rows, width) : columnsToTree(rows, width)
  return { tree, template, headers }
}

// 主入口：工作簿 → 目录树（默认取第一个工作表）
export async function tableToTree(wb, sheetName = wb.SheetNames[0]) {
  const XLSX = await loadXLSX()
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error(`找不到工作表 ${sheetName}`)
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (!aoa.length) throw new Error('表格为空')
  return aoaToTree(aoa)
}

// 解析 Excel 文件（.xlsx/.xls/.csv/.tsv）
export async function parseExcelToTree(file) {
  const XLSX = await loadXLSX()
  const buffer = await file.arrayBuffer()
  let wb
  try {
    wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  } catch (err) {
    throw new Error(`解析 Excel 失败：${err.message || err}`)
  }
  return tableToTree(wb)
}

// 生成并下载 Excel 上传模板（.xlsx）
export async function downloadExcelTemplate(aoa, filename, sheetName) {
  const XLSX = await loadXLSX()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

// 解析 Word（.docx）表格：解压 word/document.xml，提取第一个表格
export async function parseWordTables(file) {
  const data = await file.arrayBuffer()
  const { readZipEntry } = await import('./zipReader.js')
  const docXml = await readZipEntry(data, 'word/document.xml')
  if (!docXml) throw new Error('Word 文件中没有找到文档内容，请确认是 .docx 格式')
  const tables = extractWordTables(docXml)
  if (!tables.length) throw new Error('Word 文件中没有表格，请使用「一级/二级/三级」列的表格格式')
  return aoaToTree(tables[0])
}

// 从 document.xml 提取所有表格（每个表格是 AOA）
function extractWordTables(xml) {
  const tables = []
  const tblRe = /<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g
  let m
  while ((m = tblRe.exec(xml))) {
    const rows = []
    const trRe = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g
    let rm
    while ((rm = trRe.exec(m[1]))) {
      const row = []
      const tcRe = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g
      let cm
      while ((cm = tcRe.exec(rm[1]))) {
        // vMerge（纵向合并）的续行单元格取空文本，交给 columnsToTree 的空白沿用逻辑
        const isContinuation = /<w:vMerge\s*\/>/.test(cm[1]) || /<w:vMerge[^>]*w:val="continue"/.test(cm[1])
        row.push(isContinuation ? '' : extractTextFromCell(cm[1]))
      }
      if (row.length) rows.push(row)
    }
    if (rows.length) tables.push(rows)
  }
  return tables
}

function extractTextFromCell(tcXml) {
  const parts = []
  const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
  let m
  while ((m = tRe.exec(tcXml))) parts.push(decodeXml(m[1]))
  return parts.join('').trim()
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
