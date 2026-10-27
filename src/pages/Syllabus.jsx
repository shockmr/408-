import { useState, useRef } from 'react'
import { SUBJECTS } from '../data'
import { parseMarkdownToTree } from '../utils/markdownTree'
import { parseExcelToTree, parseWordTables, downloadExcelTemplate } from '../utils/tableTree'
import { useStore, setSyllabus, mergeSyllabus, readSyllabus } from '../store'
import { putAttachment, openAttachment, deleteAttachment } from '../utils/attachments'
import { renderContent } from '../utils/markdownRender'
import Icon from '../components/Icon'

// 叶子节点附件支持的类型（Word / 图片 / PDF）
const ACCEPTED_EXT = ['doc', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf']
const ACCEPTED_ACCEPT = ACCEPTED_EXT.map((e) => '.' + e).join(',')

// 单个附件上传上限：超过这个体积基本能确定会拖垮本机存储
const MAX_ATTACH_BYTES = 20 * 1024 * 1024

// 上传模板示例（一级/二级/三级 三列模板）
const TEMPLATE_AOA = [
  ['一级目录', '二级目录', '三级目录'],
  ['高等数学', '函数、极限与连续', ''],
  ['高等数学', '函数、极限与连续', '函数的概念与性质'],
  ['高等数学', '函数、极限与连续', '数列极限的定义与性质'],
  ['高等数学', '一元函数微分学', ''],
  ['高等数学', '一元函数微分学', '导数的定义与几何意义'],
  ['高等数学', '一元函数微分学', '微分中值定理'],
  ['线性代数', '行列式', ''],
  ['线性代数', '行列式', '行列式的定义'],
  ['线性代数', '矩阵', '逆矩阵'],
]

const subjectColor = (name) => SUBJECTS.find((s) => s.name === name)?.color || '#64748b'

const extOf = (name) => (String(name).split('.').pop() || '').toLowerCase()

// 富文本粘贴 → 纯文本。浏览器剪贴板里的 HTML 直接塞进 textarea 会带出一堆标签。
const plainTextFromClipboard = (e) => {
  const html = e.clipboardData?.getData('text/html')
  if (!html) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const text = (doc.body.innerText || '').replace(/\u00a0/g, ' ')
  if (!text.trim()) return null
  e.preventDefault()
  return text
}

export default function Syllabus() {
  const { syllabus } = useStore()
  const [subject, setSubject] = useState('数二')
  const [expanded, setExpanded] = useState({}) // { nodeId: true }
  const fileInputRef = useRef(null)
  const [editing, setEditing] = useState(null) // { nodeId, title } 正在编辑
  const [addingChild, setAddingChild] = useState(null) // 给哪个节点加子节点
  const [leafNodeId, setLeafNodeId] = useState(null) // 正在打开附件/手写面板的叶子节点
  const [draftContent, setDraftContent] = useState({}) // { nodeId: 手写草稿 }
  const [uploading, setUploading] = useState(false) // 附件写入中
  const [message, setMessageState] = useState(null) // { text, error } 上传反馈

  const currentTree = syllabus[subject] || []

  const setMessage = (text, error = false) => {
    setMessageState({ text, error })
    window.clearTimeout(setMessage._t)
    setMessage._t = window.setTimeout(() => setMessageState(null), 4000)
  }

  // 生成并下载 Excel 上传模板（.xlsx）——xlsx 库按需加载，不拖累首屏
  const downloadTemplate = async () => {
    try {
      await downloadExcelTemplate(TEMPLATE_AOA, '章节目录上传模板.xlsx', '章节目录模板')
    } catch (err) {
      setMessage(`生成模板失败：${err.message || err}`, true)
    }
  }

  // ---------- 文件上传解析 ----------
  const handleFile = async (file) => {
    const ext = extOf(file.name)
    try {
      let parsed = null
      if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target.result)
          reader.onerror = () => reject(new Error('读取文件失败'))
          reader.readAsText(file)
        })
        parsed = { tree: parseMarkdownToTree(text) }
      } else if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
        parsed = await parseExcelToTree(file)
      } else if (ext === 'docx') {
        parsed = await parseWordTables(file)
      } else {
        throw new Error(`不支持的文件类型 .${ext}，请上传 .md / .xlsx / .xls / .csv / .docx`)
      }
      if (!parsed || !parsed.tree || parsed.tree.length === 0) {
        throw new Error('未解析出任何目录节点，请检查文件内容')
      }
      // 408 科目走「按一级目录查重合并」，其余科目整体覆盖
      const isCs = subject === '408'
      if (isCs) {
        const { added, skipped } = mergeSyllabus(subject, parsed.tree)
        setMessage(`已解析 ${file.name}：新增 ${added} 个一级目录${skipped ? `，跳过重复 ${skipped} 个` : ''}`)
      } else {
        setSyllabus(subject, parsed.tree)
        setMessage(`已解析 ${file.name}（${parsed.template ? '表格模板' : 'Markdown'}，${countNodes(parsed.tree)} 个节点）`)
      }
      // 默认展开前两级
      const newExpanded = {}
      expandLevels(readSyllabus(subject), 0, newExpanded)
      setExpanded(newExpanded)
    } catch (err) {
      setMessage(err.message, true)
    }
  }

  // ---------- 展开/折叠 ----------
  const toggle = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ---------- 手动增删改 ----------
  const addRoot = () => {
    const title = prompt('一级目录名称：')
    if (!title.trim()) return
    setSyllabus(subject, [...currentTree, { id: genId(), title: title.trim(), children: [] }])
  }

  const addChild = (nodeId) => {
    setAddingChild({ nodeId, title: '' })
  }

  const confirmAddChild = () => {
    if (!addingChild || !addingChild.title.trim()) return
    const newChild = { id: genId(), title: addingChild.title.trim(), children: [] }
    const next = insertNode(currentTree, addingChild.nodeId, newChild)
    setSyllabus(subject, next)
    setExpanded((prev) => ({ ...prev, [addingChild.nodeId]: true }))
    setAddingChild(null)
  }

  const startEdit = (node) => {
    setEditing({ nodeId: node.id, title: node.title })
  }

  const confirmEdit = () => {
    if (!editing) return
    if (!editing.title.trim()) {
      setEditing(null)
      return
    }
    const next = updateNode(currentTree, editing.nodeId, (n) => ({ ...n, title: editing.title.trim() }))
    setSyllabus(subject, next)
    setEditing(null)
  }

  const deleteNode = (nodeId) => {
    const target = findNode(currentTree, nodeId)
    // 删节点会连带删子节点与附件，确认文案把代价说清楚
    const attachCount = countAttachments(target)
    const tip = attachCount
      ? `确定删除该节点及其所有子节点？其中 ${attachCount} 个附件会一并删除。`
      : '确定删除该节点及其所有子节点？'
    if (!confirm(tip)) return
    collectAttachmentIds(target).forEach((id) => deleteAttachment(id).catch(() => {}))
    const next = removeNode(currentTree, nodeId)
    setSyllabus(subject, next)
  }

  // ---------- 叶子节点：附件/手写内容 ----------
  const findNode = (nodes, id) => {
    for (const n of nodes) {
      if (n.id === id) return n
      if (n.children && n.children.length) {
        const hit = findNode(n.children, id)
        if (hit) return hit
      }
    }
    return null
  }

  const applyLeaf = (nodeId, fn) => {
    setSyllabus(subject, updateOne(currentTree, nodeId, fn))
  }

  // 附件上传：二进制存 IndexedDB，节点里只留元数据；同时清空手写内容，二者互斥
  const onAttachFiles = async (nodeId, files) => {
    const list = Array.from(files || [])
    if (!list.length) return
    const bad = list.filter((f) => !ACCEPTED_EXT.includes(extOf(f.name)))
    if (bad.length) {
      setMessage(`不支持的附件类型：${bad.map((f) => f.name).join('、')}（仅支持 Word / 图片 / PDF）`, true)
      return
    }
    const tooBig = list.filter((f) => f.size > MAX_ATTACH_BYTES)
    if (tooBig.length) {
      setMessage(`${tooBig.map((f) => f.name).join('、')} 超过 20MB 上限，请压缩后上传`, true)
      return
    }

    setUploading(true)
    const metas = []
    try {
      for (const f of list) {
        const id = genId()
        const type = extOf(f.name)
        // File 本身就是 Blob，直接交给 IDB，不再走 base64
        await putAttachment({ id, name: f.name, type, size: f.size, blob: f })
        metas.push({ id, name: f.name, type, size: f.size })
      }
    } catch (err) {
      // 写入失败的条目不能进 state，否则界面上会出现点不开的空附件
      setUploading(false)
      if (metas.length) {
        applyLeaf(nodeId, (n) => ({
          ...n,
          attachments: [...(n.attachments || []), ...metas],
          content: '',
        }))
      }
      setMessage(`附件保存失败：${err.message}`, true)
      return
    }
    setUploading(false)
    applyLeaf(nodeId, (n) => ({
      ...n,
      attachments: [...(n.attachments || []), ...metas],
      content: '',
    }))
    setMessage(`已为节点添加 ${metas.length} 个附件`)
  }

  // 手写内容：更新该节点的 content；同时清空附件，二者互斥
  const onSaveContent = (nodeId, text) => {
    const node = findNode(currentTree, nodeId)
    // 覆盖手写内容会丢掉已有附件，先确认
    if (node?.attachments?.length && !confirm('保存手写内容会删除该节点已有的附件，确定继续？')) return
    collectAttachmentIds(node).forEach((id) => deleteAttachment(id).catch(() => {}))
    applyLeaf(nodeId, (n) => ({
      ...n,
      content: (text || '').trim() ? text : '',
      attachments: [],
    }))
    setMessage((text || '').trim() ? '已保存手写内容' : '已清除该节点内容')
    setLeafNodeId(null)
  }

  // 删除单个附件：先删实体再改元数据
  const removeAttachment = async (nodeId, attId) => {
    await deleteAttachment(attId).catch(() => {})
    applyLeaf(nodeId, (n) => ({
      ...n,
      attachments: (n.attachments || []).filter((a) => a.id !== attId),
    }))
  }

  const viewAttachment = async (att) => {
    try {
      await openAttachment(att)
    } catch (err) {
      setMessage(err.message, true)
    }
  }

  const openLeaf = (nodeId) => {
    if (leafNodeId === nodeId) {
      setLeafNodeId(null)
      return
    }
    const n = findNode(currentTree, nodeId)
    setDraftContent((prev) => ({ ...prev, [nodeId]: n?.content || '' }))
    setLeafNodeId(nodeId)
  }

  // 渲染 ----------
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">章节目录</h1>
          <p className="text-sm text-slate-500 mt-1">四科知识点树 · 上传 MD / Excel / Word 表格解析或手动维护</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt,.xlsx,.xls,.csv,.tsv,.docx"
            className="hidden"
            onChange={(e) => {
              if (e.target.files[0]) handleFile(e.target.files[0])
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors duration-200 cursor-pointer"
          >
            <Icon name="file" className="w-4 h-4" />
            上传目录解析
          </button>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors duration-200 cursor-pointer"
            title="下载 Excel 上传模板"
          >
            <Icon name="download" className="w-4 h-4" />
            下载模板
          </button>
          <button
            onClick={addRoot}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors duration-200 cursor-pointer"
          >
            <Icon name="plus" className="w-4 h-4" />
            添加一级目录
          </button>
        </div>
      </header>

      {/* 上传反馈 */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 py-2.5 rounded-lg text-sm border ${message.error ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}
        >
          {message.error ? '✗ ' : '✓ '}
          {message.text}
        </div>
      )}

      {/* 格式说明 */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 leading-relaxed">
        <span className="font-semibold">上传格式说明：</span>
        支持 Markdown（# / 列表层级）、Excel（.xlsx/.xls/.csv）、Word 表格（.docx）。表格推荐三列结构：
        <span className="font-mono ml-1">一级目录 | 二级目录 | 三级目录</span>
        ，空白单元格表示沿用上一行。可点击「下载模板」获取示例文件。
        <div className="mt-1 text-blue-600/80">
          叶子节点可挂载 Word / 图片 / PDF（单个 ≤20MB，存在本机浏览器库中），或直接手写内容，二者二选一。
        </div>
      </div>

      {/* 科目切换 */}
      <div className="flex flex-wrap gap-2">
        {SUBJECTS.map((s) => (
          <button
            key={s.name}
            onClick={() => setSubject(s.name)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
              subject === s.name ? 'text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
            style={subject === s.name ? { backgroundColor: s.color } : {}}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* 目录树 */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        {currentTree.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-12">
            <Icon name="book" className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            暂无目录，上传 Markdown / Excel / Word 表格文件或点击「添加一级目录」
          </div>
        ) : (
          <div className="space-y-1">
            {currentTree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                editing={editing}
                addingChild={addingChild}
                onStartEdit={startEdit}
                onConfirmEdit={confirmEdit}
                onEditTitleChange={(title) => setEditing((prev) => prev && { ...prev, title })}
                onCancelEdit={() => setEditing(null)}
                onAddChild={addChild}
                onConfirmAddChild={confirmAddChild}
                onAddTitleChange={(title) => setAddingChild((prev) => prev && { ...prev, title })}
                onCancelAdd={setAddingChild}
                onDelete={deleteNode}
                leafNodeId={leafNodeId}
                onOpenLeaf={openLeaf}
                draftContent={draftContent[leafNodeId] || ''}
                onDraftChange={(text) => setDraftContent((prev) => ({ ...prev, [leafNodeId]: text }))}
                onAttachFiles={onAttachFiles}
                onSaveContent={onSaveContent}
                onRemoveAttachment={removeAttachment}
                onViewAttachment={viewAttachment}
                uploading={uploading}
                color={subjectColor(subject)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// 递归树节点
function TreeNode({
  node, depth, expanded, onToggle, editing, addingChild,
  onStartEdit, onConfirmEdit, onEditTitleChange, onCancelEdit,
  onAddChild, onConfirmAddChild, onAddTitleChange, onCancelAdd, onDelete, color,
  leafNodeId, onOpenLeaf, draftContent, onDraftChange, onAttachFiles, onSaveContent,
  onRemoveAttachment, onViewAttachment, uploading,
}) {
  const hasChildren = node.children && node.children.length > 0
  const isOpen = !!expanded[node.id]
  const isEditing = editing && editing.nodeId === node.id
  const isAdding = addingChild && addingChild.nodeId === node.id
  const isLeaf = !hasChildren
  const leafOpen = leafNodeId === node.id
  const hasAttachments = node.attachments && node.attachments.length > 0
  const attachInputId = `leaf-file-${node.id}`

  return (
    <div>
      {/* 节点行 */}
      <div
        className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors duration-200 ${
          depth === 0 ? 'mt-1' : ''
        }`}
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
            aria-label={isOpen ? '折叠' : '展开'}
            aria-expanded={isOpen}
          >
            <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: depth === 0 ? color : '#cbd5e1' }}
        />

        {isEditing ? (
          <input
            autoFocus
            value={editing.title}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onBlur={onConfirmEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur()
              else if (e.key === 'Escape') onCancelEdit()
            }}
            className="flex-1 px-2 py-0.5 rounded border border-blue-400 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <span
            className={`flex-1 text-sm ${depth === 0 ? 'font-semibold text-slate-900' : depth === 1 ? 'text-slate-700' : 'text-slate-600'}`}
          >
            {node.title}
            {/* 有附件/有内容时给个标记，不然收着看不出来 */}
            {isLeaf && (hasAttachments || node.content) && (
              <span className="ml-1.5 text-[11px] text-slate-400">
                {hasAttachments ? `· ${node.attachments.length} 个附件` : '· 已写内容'}
              </span>
            )}
          </span>
        )}

        {/* 操作按钮（hover 显示；键盘 focus 也可见） */}
        <div className="hidden group-hover:flex group-focus-within:flex items-center gap-1 shrink-0">
          {isLeaf && (
            <>
              <span className="mx-0.5 text-slate-200">|</span>
              <button
                onClick={() => onOpenLeaf(leafOpen ? null : node.id)}
                className="flex items-center gap-0.5 w-auto px-1 h-6 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                title="上传附件或手写内容"
                aria-label="上传附件或手写内容"
              >
                <Icon name="paperclip" className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button onClick={() => onAddChild(node.id)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer" title="添加子节点" aria-label="添加子节点">
            <Icon name="plus" className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onStartEdit(node)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer" title="编辑" aria-label="编辑">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          </button>
          <button onClick={() => onDelete(node.id)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="删除" aria-label="删除">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        </div>
      </div>

      {/* 添加子节点输入框 */}
      {isAdding && (
        <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ paddingLeft: (depth + 1) * 20 + 8 }}>
          <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
          <input
            autoFocus
            placeholder="输入节点名称，Enter 确认"
            value={addingChild.title}
            onChange={(e) => onAddTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirmAddChild()
              else if (e.key === 'Escape') onCancelAdd(null)
            }}
            onBlur={() => onCancelAdd(null)}
            className="flex-1 px-2 py-0.5 rounded border border-blue-400 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* 叶子节点：附件 / 手写内容面板 */}
      {isLeaf && leafOpen && (
        <div
          className="mt-1 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3 space-y-3"
          style={{ marginLeft: depth * 20 + 8 }}
        >
          <input
            id={attachInputId}
            type="file"
            accept={ACCEPTED_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length) onAttachFiles(node.id, e.target.files)
              e.target.value = ''
            }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => document.getElementById(attachInputId)?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="file" className="w-3.5 h-3.5" />
              {uploading ? '上传中…' : '上传文件'}
            </button>
            <span className="text-[11px] text-slate-400">Word / 图片（png 等）/ PDF，可多选</span>
          </div>

          {/* 已挂载附件 */}
          {hasAttachments ? (
            <ul className="space-y-1">
              {node.attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-xs">
                  <Icon name={a.type === 'pdf' ? 'fileText' : 'file'} className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-slate-600" title={a.name}>{a.name}</span>
                  {a.size > 0 && <span className="text-slate-400 shrink-0">{formatSize(a.size)}</span>}
                  <button
                    onClick={() => onViewAttachment(a)}
                    className="text-blue-600 hover:underline shrink-0 cursor-pointer"
                  >
                    查看
                  </button>
                  <button
                    onClick={() => onRemoveAttachment(node.id, a.id)}
                    className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                    title="删除附件"
                    aria-label="删除附件"
                  >
                    <Icon name="x" className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-400">该节点尚未挂载附件。附件与手写内容二选一。</p>
          )}

          {/* 手写内容 */}
          <div>
            <textarea
              value={draftContent}
              onChange={(e) => onDraftChange(e.target.value)}
              onPaste={(e) => {
                const text = plainTextFromClipboard(e)
                if (text != null) onDraftChange(text)
              }}
              placeholder="在这里手动编写该知识点的内容（支持 Markdown：**加粗**、- 列表、# 标题）……"
              rows={5}
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
            {draftContent.trim() && (
              <details className="mt-1.5" open={false}>
                <summary className="text-[11px] text-slate-500 cursor-pointer select-none">预览渲染效果</summary>
                <div
                  className="mt-1.5 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 leading-relaxed [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:font-medium [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-slate-100 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2 [&_blockquote]:text-slate-500 [&_table]:w-full [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_a]:text-blue-600 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: renderContent(draftContent) }}
                />
              </details>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={() => onSaveContent(node.id, draftContent)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 cursor-pointer"
              >
                保存手写内容
              </button>
              {hasAttachments && <span className="text-[11px] text-rose-500">保存会清空已挂载的附件</span>}
            </div>
          </div>
        </div>
      )}

      {/* 子节点（展开时） */}
      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              editing={editing}
              addingChild={addingChild}
              onStartEdit={onStartEdit}
              onConfirmEdit={onConfirmEdit}
              onEditTitleChange={onEditTitleChange}
              onCancelEdit={onCancelEdit}
              onAddChild={onAddChild}
              onConfirmAddChild={onConfirmAddChild}
              onAddTitleChange={onAddTitleChange}
              onCancelAdd={onCancelAdd}
              onDelete={onDelete}
              color={color}
              leafNodeId={leafNodeId}
              onOpenLeaf={onOpenLeaf}
              draftContent={draftContent}
              onDraftChange={onDraftChange}
              onAttachFiles={onAttachFiles}
              onSaveContent={onSaveContent}
              onRemoveAttachment={onRemoveAttachment}
              onViewAttachment={onViewAttachment}
              uploading={uploading}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- 树操作工具 ----------
let idCounter = 0
function genId() {
  return 'node_' + Date.now().toString(36) + '_' + (++idCounter) + '_' + Math.random().toString(36).slice(2, 7)
}

function updateOne(nodes, targetId, fn) {
  return nodes.map((n) => {
    if (n.id === targetId) return fn(n)
    if (n.children && n.children.length) return { ...n, children: updateOne(n.children, targetId, fn) }
    return n
  })
}

function insertNode(nodes, targetId, newNode) {
  return nodes.map((n) => {
    if (n.id === targetId) {
      return { ...n, children: [...(n.children || []), newNode] }
    }
    if (n.children && n.children.length) {
      return { ...n, children: insertNode(n.children, targetId, newNode) }
    }
    return n
  })
}

function updateNode(nodes, targetId, fn) {
  return nodes.map((n) => {
    if (n.id === targetId) return fn(n)
    if (n.children && n.children.length) return { ...n, children: updateNode(n.children, targetId, fn) }
    return n
  })
}

function removeNode(nodes, targetId) {
  return nodes
    .filter((n) => n.id !== targetId)
    .map((n) => {
      if (n.children && n.children.length) return { ...n, children: removeNode(n.children, targetId) }
      return n
    })
}

function expandLevels(nodes, depth, acc) {
  nodes.forEach((n) => {
    if (depth < 2) acc[n.id] = true
    if (n.children && n.children.length) expandLevels(n.children, depth + 1, acc)
  })
}

function countNodes(nodes) {
  return nodes.reduce((n, node) => n + 1 + (node.children ? countNodes(node.children) : 0), 0)
}

// 收集某节点整棵子树的附件 id（删节点时一并清理 IndexedDB）
function collectAttachmentIds(node) {
  if (!node) return []
  const ids = (node.attachments || []).map((a) => a.id)
  for (const child of node.children || []) ids.push(...collectAttachmentIds(child))
  return ids
}

function countAttachments(node) {
  return collectAttachmentIds(node).length
}

function formatSize(bytes) {
  if (!bytes) return '0B'
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1024 / 1024).toFixed(1) + 'MB'
}