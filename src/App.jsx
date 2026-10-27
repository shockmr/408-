import { useState, useRef, useEffect } from 'react'
import NavPanel, { ChatPanel } from './components/ChatPanel'
import { loadChat, saveChat, clearChatStorage, hydrateChat } from './utils/chatStore'
import BackupPanel from './components/BackupPanel'
import Timeline from './pages/Timeline'
import Daily from './pages/Daily'
import Syllabus from './pages/Syllabus'
import Wrong from './pages/Wrong'
import Exam from './pages/Exam'
import Icon from './components/Icon'
import { chatCompletion, getApiKey, MissingKeyError } from './agent/client'
import { buildSystemPrompt } from './agent/systemPrompt'
import { toolSchemas, getTool, describeToolUse } from './agent/tools'
import { filesToParts } from './agent/files'
import { usePersistError, clearPersistError, migrateInlineAttachments } from './store'

// 构建时由 vite.config.js 从 package.json 注入
const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__

const PAGES = {
  timeline: Timeline,
  daily: Daily,
  syllabus: Syllabus,
  wrong: Wrong,
  exam: Exam,
  chat: ChatPanel,
}

let msgId = 0
const nextId = () => ++msgId

export default function App() {
  const [page, setPage] = useState('timeline')
  const [messages, setMessages] = useState(() => hydrateChat(loadChat()))
  const [pendingFiles, setPendingFiles] = useState([])
  const [thinking, setThinking] = useState(false)
  const [needsKey, setNeedsKey] = useState(!getApiKey())
  const [showBackup, setShowBackup] = useState(false)
  const persistError = usePersistError()
  // 用 ref 保存最新的 messages，供异步循环里读取（避免闭包拿到旧值）
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const Page = PAGES[page] ?? Timeline

  // 对话落 sessionStorage：刷新页面后助手还记得刚才聊到哪儿
  useEffect(() => {
    saveChat(messages)
  }, [messages])

  // 启动时把旧版内联在 state 里的 base64 附件搬进 IndexedDB，
  // 否则它们会一直占着 localStorage 的 5MB 配额。
  useEffect(() => {
    migrateInlineAttachments()
      .then((n) => {
        if (n > 0) console.info(`[附件迁移] 已把 ${n} 个旧附件转入 IndexedDB`)
      })
      .catch(() => {
        // 迁移失败不阻塞使用，附件仍可从旧数据里读
      })
  }, [])

  // 把 React 的 message 列表转成 OpenAI messages（含历史 tool_calls / tool 结果）
  const toApiMessages = () =>
    messagesRef.current.flatMap((m) => {
      if (m.role === 'user') {
        // 如果有存储的 API content parts（含图片/文本内容），重放它们；否则只发文本
        if (m._apiContent) {
          return [{ role: 'user', content: m._apiContent }]
        }
        const names = m.files?.length ? `\n（附件：${m.files.map((f) => f.name).join('、')}）` : ''
        return [{ role: 'user', content: (m.text || '（上传了文件）') + names }]
      }
      // 确认卡：折成一条 assistant 文本摘要。带上 tool_calls 会要求紧跟配对的
      // tool 结果，跨轮重建时很容易失配，摘要足够让模型知道上一轮做了什么。
      if (m.role === 'tool-pending') {
        const done = m.calls
          .filter((c) => c.state !== 'pending')
          .map((c) => `${c.summary}：${c.state === 'confirmed' ? c.result || '已执行' : '用户已拒绝'}`)
        const parts = [m.text, ...done].filter(Boolean)
        return parts.length ? [{ role: 'assistant', content: parts.join('\n') }] : []
      }
      if (!m.text) return []
      return [{ role: 'assistant', content: m.text }]
    })

  // 执行一条 tool_call。write 类需要确认，read 类直接跑。
  // 返回 { ok, text }，或抛错。
  function runToolCall(call) {
    const tool = getTool(call.function.name)
    if (!tool) return { ok: false, text: `未知工具 ${call.function.name}` }
    const input = safeParse(call.function.arguments)
    const result = tool.run(input, { navigate: setPage })
    return { ok: true, text: typeof result === 'string' ? result : String(result) }
  }

  // 主循环：调 API，处理 tool_calls。返回给 UI 的最终文本。
  async function runLoop(initialApiMessages) {
    let apiMessages = initialApiMessages
    for (;;) {
      const resp = await chatCompletion({
        messages: [{ role: 'system', content: buildSystemPrompt() }, ...apiMessages],
        tools: toolSchemas,
        tool_choice: 'auto',
        temperature: 0.2,
      })

      const choice = resp.choices?.[0]
      if (!choice) throw new Error('中转站返回为空')

      const msg = choice.message
      const text = msg.content || ''
      const calls = msg.tool_calls || []

      // 无工具调用：正常文本回复，结束
      if (calls.length === 0) {
        return { text }
      }

      // 拆 read / write
      const reads = []
      const writes = []
      calls.forEach((c) => {
        const tool = getTool(c.function.name)
        if (tool?.kind === 'write') writes.push(c)
        else reads.push(c)
      })

      // 先执行 read
      const readResults = []
      reads.forEach((c) => {
        const r = runToolCall(c)
        readResults.push({ call: c, ...r })
      })

      // 若本轮已有文本（模型可能边解释边调用），先落地一条助手文本消息
      if (text) {
        const assistantMsg = { id: nextId(), role: 'assistant', text, pending: true }
        setMessages((prev) => [...prev, assistantMsg])
        apiMessages.push({ role: 'assistant', content: text })
      }

      // 有写操作 → 暂停，弹确认。把已执行的 read 结果和待确认的 write 存进一条消息
      if (writes.length > 0) {
        // 已执行的 read 结果和待确认的 write 属于同一轮 tool_calls，
        // 恢复时会在 handleConfirm 里一起补回消息栈
        const pendingMsg = {
          id: nextId(),
          role: 'tool-pending',
          text,
          calls: writes.map((c) => ({
            call: c,
            summary: describeToolUse(c.function.name, safeParse(c.function.arguments)),
            state: 'pending', // pending | confirmed | rejected
            result: '',
          })),
          readResults,
          // 保存暂停时的 API 消息栈，恢复时从这里继续
          _apiMessages: apiMessages,
        }
        setMessages((prev) => [...prev, pendingMsg])
        setThinking(false)
        return { pending: true }
      }

      // 只有 read（或无工具但有文本）→ 把 read 结果回给模型，继续循环
      // 注意：OpenAI 要求 tool 调用必须紧跟 assistant(tool_calls) → tool 结果
      const assistantCallMsg = { role: 'assistant', content: null, tool_calls: reads.map((r) => r.call) }
      const toolResults = reads.map((r) => ({
        role: 'tool',
        tool_call_id: r.call?.id || `fallback-${Math.random().toString(36).slice(2)}`,
        content: r.text,
      }))
      apiMessages.push(assistantCallMsg, ...toolResults)
      // 无写操作、无文本时，不产生可见消息，直接续跑
      if (!text) {
        continue
      }
      // 有文本但无写操作：文本已落，继续
      continue
    }
  }

  // 用户发送消息
  async function handleSend(text) {
    const files = [...pendingFiles]
    setPendingFiles([])

    const userText = text || '（上传了文件）'
    // 先取历史快照再入队：下面有 await，ref 可能已经被重渲染更新，
    // 那样这条用户消息会被算进历史又追加一次。
    const history = toApiMessages()
    setThinking(true)

    try {
      // 有附件时用 content parts 数组，否则保持纯字符串（中转站兼容性更好）
      let content = userText
      if (files.length > 0) {
        const parts = await filesToParts(files)
        content = [{ type: 'text', text: userText }, ...parts]
      }
      // 把 content 存到消息上，后续轮次 toApiMessages 会原样重放（含图片 base64）
      const userMsg = { id: nextId(), role: 'user', text: userText, files, _apiContent: content }
      setMessages((prev) => [...prev, userMsg])
      const apiMessages = [...history, { role: 'user', content }]
      const result = await runLoop(apiMessages)

      if (result.pending) return // 已弹确认卡，等用户处理

      if (result.text) {
        setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: result.text }])
      }
    } catch (err) {
      if (err instanceof MissingKeyError) {
        setNeedsKey(true)
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', text: '请先配置中转站密钥（见输入框上方的设置）。' },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', text: `出错：${err.message}` },
        ])
      }
    } finally {
      setThinking(false)
    }
  }

  // 处理用户对写操作的确认/拒绝
  async function handleConfirm(pendingMsgId, choice) {
    // choice: { index, approved }
    const target = messagesRef.current.find((m) => m.id === pendingMsgId)
    if (!target) return

    const call = target.calls[choice.index]
    if (call.state !== 'pending') return

    // 先在 setState 之外执行工具（保持 updater 纯净），再把结果写进消息
    let decided
    if (choice.approved) {
      const r = runToolCall(call.call)
      decided = { ...call, state: r.ok ? 'confirmed' : 'rejected', result: r.text }
    } else {
      decided = { ...call, state: 'rejected', result: '用户已拒绝' }
    }

    const after = {
      ...target,
      calls: target.calls.map((c, i) => (i === choice.index ? decided : c)),
    }
    setMessages((prev) => prev.map((m) => (m.id === pendingMsgId ? after : m)))

    // 还有未处理的写操作 → 等用户全部处理完再继续循环
    if (after.calls.some((c) => c.state === 'pending')) return

    // 组装 tool 结果（拒绝的记为 is_error）
    const toolResults = after.calls.map((c) => ({
      role: 'tool',
      tool_call_id: c.call.id,
      content: c.state === 'confirmed' ? c.result : '用户拒绝了此操作',
    }))
    // 也补上暂停前已执行的 read 结果
    const readResults = (after.readResults || []).map((r) => ({
      role: 'tool',
      tool_call_id: r.call.id,
      content: r.text,
    }))

    const apiMessages = [...(after._apiMessages || [])]
    // tool 结果必须与紧邻的 assistant.tool_calls 一一对应，read / write 都要列进去
    apiMessages.push(
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          ...(after.readResults || []).map((r) => r.call),
          ...after.calls.map((c) => c.call),
        ],
      },
      ...readResults,
      ...toolResults,
    )

    setThinking(true)
    try {
      const result = await runLoop(apiMessages)
      if (result.pending) return
      if (result.text) {
        setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: result.text }])
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', text: `出错：${err.message}` },
      ])
    } finally {
      setThinking(false)
    }
  }

  const handleUpload = (fileList) => {
    setPendingFiles((prev) => [...prev, ...fileList])
  }

  const handleRemoveFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleClearChat = () => {
    if (!confirm('确定清空所有对话记录？')) return
    setMessages([])
    clearChatStorage()
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 左侧栏：导航 + 备份入口 */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border-r border-slate-200 h-screen">
        <NavPanel active={page} onChange={setPage} />
        <div className="mt-auto px-3 py-3 border-t border-slate-200">
          <button
            onClick={() => setShowBackup(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-200 cursor-pointer"
          >
            <Icon name="download" className="w-4 h-4" />
            数据备份
          </button>
          <p className="px-3 pt-2 text-[11px] text-slate-400 leading-relaxed">
            数据只存在本机浏览器，建议每周导出一次备份。
          </p>
          <p className="px-3 pt-2 text-[11px] text-slate-400">v{APP_VERSION}</p>
        </div>
      </aside>

      {/* 移动端：顶部 tab 切换 */}
      <div className="md:hidden fixed top-0 inset-x-0 z-10 bg-white border-b border-slate-200 px-3 py-2 flex gap-2 overflow-x-auto">
        {Object.keys(PAGES).map((key) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors duration-200 cursor-pointer ${
              page === key ? 'bg-blue-600 text-white' : 'text-slate-600 bg-slate-50'
            }`}
          >
            {{ timeline: '总时间轴', daily: '每日日志', syllabus: '章节目录', wrong: '错题档案', exam: '月考分析', chat: '对话' }[key]}
          </button>
        ))}
        <button
          onClick={() => setShowBackup(true)}
          className="px-3 py-1.5 rounded-lg text-sm whitespace-nowrap text-slate-600 bg-slate-50 shrink-0 cursor-pointer"
        >
          备份
        </button>
      </div>

      {/* 右侧：内容展示区 */}
      <main className="flex-1 min-w-0 overflow-hidden bg-slate-50 flex flex-col">
        {/* 存储写入失败提示：配额满 / 隐私模式下必须让用户知道改动没落盘 */}
        {persistError && (
          <div className="shrink-0 px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
            <span className="text-amber-600 text-sm leading-5">⚠</span>
            <p className="flex-1 text-xs text-amber-800 leading-5">{persistError.message}</p>
            <button
              onClick={() => setShowBackup(true)}
              className="shrink-0 text-xs font-medium text-amber-800 underline hover:text-amber-900 cursor-pointer"
            >
              去备份
            </button>
            <button
              onClick={clearPersistError}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-amber-600 hover:bg-amber-100 cursor-pointer"
              aria-label="关闭提示"
            >
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {page === 'chat' ? (
          <ChatPanel
            messages={messages}
            thinking={thinking}
            needsKey={needsKey}
            onKeySaved={() => setNeedsKey(false)}
            onSend={handleSend}
            onUpload={handleUpload}
            pendingFiles={pendingFiles}
            onRemoveFile={handleRemoveFile}
            onConfirm={handleConfirm}
            onClearChat={handleClearChat}
          />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8 pt-16 md:pt-8">
              <Page />
            </div>
          </div>
        )}
      </main>

      {showBackup && <BackupPanel onClose={() => setShowBackup(false)} />}
    </div>
  )
}

function safeParse(s) {
  if (s == null) return {}
  try {
    return typeof s === 'string' ? JSON.parse(s) : s
  } catch {
    return {}
  }
}
