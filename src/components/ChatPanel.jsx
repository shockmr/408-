import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import {
  setApiKey,
  getApiKey,
  getBaseUrl,
  setBaseUrl,
  getModel,
  setModel,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  chatCompletion,
} from '../agent/client'

const NAV = [
  { key: 'timeline', label: '总时间轴', icon: 'timeline' },
  { key: 'daily', label: '每日日志', icon: 'calendar' },
  { key: 'syllabus', label: '章节目录', icon: 'book' },
  { key: 'wrong', label: '错题档案', icon: 'file' },
  { key: 'exam', label: '月考分析', icon: 'chart' },
  { key: 'chat', label: '智能助手', icon: 'sparkle' },
]

// 左上：功能导航
export default function NavPanel({ active, onChange }) {
  return (
    <div className="px-3 py-4 border-b border-slate-200 space-y-1">
      <div className="px-3 pb-2 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 text-sm leading-tight">考研进度追踪</div>
          <div className="text-[11px] text-slate-500">Study Progress</div>
        </div>
      </div>

      <nav className="space-y-1">
        {NAV.map((item) => (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
              active === item.key
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Icon name={item.icon} className="w-4.5 h-4.5" />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

// 左下：对话界面
// 模型设置：中转站地址、模型名、密钥
function SettingsPanel({ onKeySaved }) {
  const [base, setBase] = useState(getBaseUrl)
  const [model, setModelInput] = useState(getModel)
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // { ok: bool, time: number, error: string }

  const hasKey = !!getApiKey()

  const save = () => {
    setBaseUrl(base.trim() || DEFAULT_BASE_URL)
    setModel(model.trim() || DEFAULT_MODEL)
    if (key.trim()) {
      setApiKey(key.trim())
      setKey('')
      onKeySaved()
    }
    setBase(getBaseUrl())
    setModelInput(getModel())
    setSaved(true)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    const start = Date.now()
    try {
      // 先保存当前配置，确保测试使用最新设置
      save()
      // 发送一个简单的测试请求
      await chatCompletion({
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
        temperature: 0,
      })
      const time = Date.now() - start
      setTestResult({ ok: true, time })
    } catch (err) {
      const time = Date.now() - start
      setTestResult({ ok: false, time, error: err.message })
    } finally {
      setTesting(false)
    }
  }

  const field = 'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

  return (
    <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50 space-y-2">
      <label className="block">
        <span className="text-[11px] text-slate-500">中转站地址</span>
        <input value={base} onChange={(e) => { setBase(e.target.value); setSaved(false) }} placeholder={DEFAULT_BASE_URL} className={field} />
      </label>
      <label className="block">
        <span className="text-[11px] text-slate-500">模型名</span>
        <input value={model} onChange={(e) => { setModelInput(e.target.value); setSaved(false) }} placeholder={DEFAULT_MODEL} className={field} />
      </label>
      <label className="block">
        <span className="text-[11px] text-slate-500">API Key{hasKey && <span className="text-emerald-600 ml-1">已配置</span>}</span>
        <input type="password" value={key} onChange={(e) => { setKey(e.target.value); setSaved(false) }} placeholder={hasKey ? '留空则不修改' : '粘贴 API Key'} className={field} />
      </label>
      <div className="flex items-center gap-2">
        <button onClick={save} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 cursor-pointer">
          保存
        </button>
        <button
          onClick={testConnection}
          disabled={testing}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {testing ? '测试中...' : '测速'}
        </button>
        {saved && !testResult && <span className="text-[11px] text-emerald-600">已保存</span>}
      </div>
      {testResult && (
        <div className={`text-[11px] px-2 py-1.5 rounded ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {testResult.ok ? (
            <>✓ 连接成功，响应时间 {testResult.time}ms</>
          ) : (
            <>✗ 连接失败：{testResult.error}</>
          )}
        </div>
      )}
    </div>
  )
}

export function ChatPanel({ messages, thinking, needsKey, onKeySaved, onSend, onUpload, pendingFiles, onRemoveFile, onConfirm, onClearChat }) {
  const [input, setInput] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const fileInputRef = useRef(null)
  const scrollRef = useRef(null)

  // 新消息 / 思考状态变化时滚到底
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, thinking])

  const handleSend = (text) => {
    const t = typeof text === 'string' ? text : input
    if (!t.trim() && pendingFiles.length === 0) return
    onSend(t.trim())
    setInput('')
  }

  const QUICK_ACTIONS = [
    '派发今日任务',
    '完成数二定积分20题',
    '录入月考：数二 90 分',
  ]

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const saveKey = () => {
    if (!keyInput.trim()) return
    setApiKey(keyInput.trim())
    setKeyInput('')
    onKeySaved()
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Icon name="sparkle" className="w-5 h-5 text-blue-600" />
        <span className="text-base font-semibold text-slate-900">智能助手</span>
        {messages.length > 0 && (
          <button
            onClick={onClearChat}
            title="清空对话"
            className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors duration-200 cursor-pointer"
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => setShowSettings((v) => !v)}
          title="模型设置"
          className={`ml-auto p-1 rounded-md transition-colors duration-200 cursor-pointer ${
            showSettings ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Icon name="settings" className="w-4 h-4" />
        </button>
      </div>

      {showSettings && <SettingsPanel onKeySaved={onKeySaved} />}

      {/* 密钥配置（未配置时显示） */}
      {needsKey && (
        <div className="px-3 py-2 border-b border-slate-100 bg-amber-50">
          <div className="text-xs text-amber-700 mb-1.5">尚未配置中转站密钥</div>
          <div className="flex items-center gap-1.5">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="粘贴 API Key"
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={saveKey}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 cursor-pointer"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-xs text-slate-400 pt-8 px-2 leading-relaxed">
            <div className="mb-3">和助手对话来操作数据，例如：</div>
            <div className="space-y-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  onClick={() => handleSend(action)}
                  className="block w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-left text-xs transition-colors duration-200 cursor-pointer"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => {
          // 写操作确认卡
          if (m.role === 'tool-pending') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[92%] rounded-xl bg-slate-100 rounded-bl-sm px-3 py-2 text-sm">
                  {m.text && <div className="whitespace-pre-wrap break-words mb-2 text-slate-800">{m.text}</div>}
                  <div className="space-y-2">
                    {m.calls.map((c, i) => (
                      <div key={c.call?.id || `c-${i}`} className="rounded-lg bg-white border border-slate-200 p-2.5">
                        <div className="flex items-start gap-2">
                          <Icon name="sparkle" className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-800">{c.summary || '（历史操作）'}</div>
                            {c.state === 'confirmed' && (
                              <div className="text-xs text-emerald-600 mt-1">{c.result}</div>
                            )}
                            {c.state === 'rejected' && (
                              <div className="text-xs text-slate-400 mt-1">{c.result || '已拒绝'}</div>
                            )}
                          </div>
                        </div>
                        {c.state === 'pending' && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => onConfirm(m.id, { index: i, approved: true })}
                              className="flex-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 cursor-pointer"
                            >
                              确认
                            </button>
                            <button
                              onClick={() => onConfirm(m.id, { index: i, approved: false })}
                              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 cursor-pointer"
                            >
                              拒绝
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          }

          if (m.role === 'tool-result') return null

          return (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}
              >
                {/* 附件 */}
                {m.files && m.files.length > 0 && (
                  <div className="mb-1.5 space-y-1">
                    {m.files.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs bg-white/20 rounded px-2 py-1">
                        <Icon name={f.type?.startsWith('image') ? 'image' : 'fileText'} className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{f.name}</span>
                        <span className="text-[10px] opacity-70 shrink-0">({formatSize(f.size)})</span>
                      </div>
                    ))}
                  </div>
                )}
                <span className="whitespace-pre-wrap break-words">{m.text}</span>
              </div>
            </div>
          )
        })}
        {thinking && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl bg-slate-100 rounded-bl-sm px-3 py-2 text-sm text-slate-400 flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* 待发送附件预览 */}
      {pendingFiles.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-100 flex flex-wrap gap-2">
          {pendingFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg px-2 py-1">
              <Icon name={f.type?.startsWith('image') ? 'image' : 'fileText'} className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[120px]">{f.name}</span>
              <button onClick={() => onRemoveFile(i)} className="text-blue-400 hover:text-blue-700 cursor-pointer" aria-label="移除">
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t border-slate-100 p-2.5">
        <div className="flex items-end gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors duration-200 cursor-pointer"
            aria-label="上传文件"
            title="上传文件"
          >
            <Icon name="paperclip" className="w-4.5 h-4.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              onUpload(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="输入指令，Enter 发送…"
            className="flex-1 resize-none px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-200 cursor-pointer"
            aria-label="发送"
            title="发送"
          >
            <Icon name="send" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function formatSize(bytes) {
  if (!bytes) return '0B'
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1024 / 1024).toFixed(1) + 'MB'
}
