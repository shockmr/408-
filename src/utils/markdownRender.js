// 叶子节点手写内容的 Markdown 渲染。
// 用 marked 解析 + rehype-sanitize 白名单过滤，只保留排版类标签，杜绝脚本注入。
// 用户粘贴的富文本（浏览器剪贴板里的 HTML）也走这里，先转纯文本再渲染。
import { marked } from 'marked'
import { sanitize } from 'hast-util-sanitize'
import { fromHtml } from 'hast-util-from-html'
import { toHtml } from 'hast-util-to-html'

// 白名单：结构 + 排版 + 表格 + 代码 + 链接（链接只允许 http/https/mailto）
const SCHEMA = {
  tagNames: [
    'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'del', 's', 'u', 'mark', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote',
    'pre', 'code', 'kbd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'a', 'span', 'div',
  ],
  attributes: {
    a: ['href', 'title', 'target', 'rel'],
    code: ['className'],
    pre: ['className'],
    span: ['className'],
    div: ['className'],
    th: ['align', 'colSpan', 'rowSpan'],
    td: ['align', 'colSpan', 'rowSpan'],
    '*': ['id'],
  },
  protocols: { href: ['http', 'https', 'mailto'] },
  clobberPrefix: 'md-',
}

// 允许 className 但只保留语言标记类（code-block 高亮用），形如 language-js
const SAFE_CLASS = /^language-[\w+#-]+$/

marked.setOptions({ gfm: true, breaks: true })

// 文本 → 安全 HTML 字符串
export function renderMarkdown(text) {
  if (!text) return ''
  const raw = marked.parse(String(text))
  const clean = sanitize(fromHtml(raw), SCHEMA)
  // 二次收紧 className：白名单 schema 对 className 是全放行，这里过滤成只认 language-*
  walk(clean, (node) => {
    if (!node.properties?.className) return
    const keep = [].concat(node.properties.className).filter((c) => SAFE_CLASS.test(String(c)))
    if (keep.length) node.properties.className = keep
    else delete node.properties.className
  })
  return toHtml(clean)
}

function walk(node, fn) {
  fn(node)
  const kids = node.children || []
  for (const child of kids) walk(child, fn)
}

// 判断一段文本「看起来是 Markdown」：有标题、列表、加粗、代码块、表格等标记
export function looksLikeMarkdown(text) {
  const s = String(text || '')
  if (!s.trim()) return false
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)/.test(s) || /\*\*[^*]+\*\*/.test(s)
}

// 纯文本（保留换行）与 Markdown 两种展示的轻量分流
export function renderContent(text) {
  const s = String(text || '')
  if (!s.trim()) return ''
  if (looksLikeMarkdown(s)) return renderMarkdown(s)
  // 纯文本：转义后按空行分段，段内换行保留
  const esc = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}