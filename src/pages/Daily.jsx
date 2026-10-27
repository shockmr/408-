import { useState } from 'react'
import { SUBJECTS } from '../data'
import { useStore, addDailyTask, setTaskStatus, setStudyDuration, setReflection, deleteDailyTask } from '../store'
import Icon from '../components/Icon'

const subjectColor = (name) => SUBJECTS.find((s) => s.name === name)?.color || '#64748b'

const STATUS = {
  done: { label: '已完成', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  undone: { label: '未完成', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  pending: { label: '待完成', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
}

// done / undone 两个状态靠勾选圆圈切换，pending 只在新建时出现
const nextStatus = (s) => (s === 'done' ? 'pending' : 'done')

const today = () => new Date().toLocaleDateString('sv-SE')

const EMPTY_LOG = { day: 0, tasks: [], durations: [], reflection: '' }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (v) => typeof v === 'string' && DATE_RE.test(v)

export default function Daily() {
  const { dailyLogs } = useStore()
  const [date, setDate] = useState(today)
  const [adding, setAdding] = useState(false)
  const log = dailyLogs[date] || EMPTY_LOG

  const totalHours = SUBJECTS.reduce(
    (n, s) => n + (log.durations.find((d) => d.subject === s.name)?.hours || 0),
    0,
  )

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">每日日志</h1>
          <p className="text-sm text-slate-500 mt-1">
            今日任务派发 · 完成/未完成记录 · 复盘
            {log.day > 0 && <span className="ml-2 text-slate-400">第 {log.day} 天</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={isDate(date) ? date : today()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="选择日期"
          />
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors duration-200 cursor-pointer"
          >
            <Icon name={adding ? 'x' : 'plus'} className="w-4 h-4" />
            {adding ? '取消' : '派发今日任务'}
          </button>
        </div>
      </header>

      {adding && <AddTaskForm date={date} onDone={() => setAdding(false)} />}

      {/* 学习时长 */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Icon name="clock" className="w-4 h-4 text-slate-400" />
            今日学习时长
          </h2>
          <span className="text-xs text-slate-500">
            合计 <span className="font-semibold text-slate-900">{totalHours.toFixed(1)}</span> 小时
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SUBJECTS.map((s) => (
            <DurationInput
              key={`${date}-${s.name}`}
              date={date}
              subject={s.name}
              color={s.color}
              hours={log.durations.find((d) => d.subject === s.name)?.hours ?? 0}
            />
          ))}
        </div>
      </section>

      {/* 任务列表 */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">今日任务</h2>
          <span className="text-xs text-slate-500">
            {log.tasks.filter((t) => t.status === 'done').length}/{log.tasks.length} 完成
          </span>
        </div>
        {log.tasks.length === 0 && (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">今日暂无任务</div>
        )}
        <ul className="divide-y divide-slate-100">
          {log.tasks.map((t) => {
            const st = STATUS[t.status] || STATUS.pending
            return (
              <li key={t.id} className="group px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors duration-200">
                <button
                  onClick={() => setTaskStatus({ date, taskId: t.id, status: nextStatus(t.status) })}
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-200 cursor-pointer ${
                    t.status === 'done'
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-slate-300 text-transparent hover:border-emerald-400'
                  }`}
                  aria-label={t.status === 'done' ? '标记为未完成' : '标记为已完成'}
                  aria-pressed={t.status === 'done'}
                >
                  <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />
                </button>

                <span className="text-xs text-slate-400 font-mono w-24 shrink-0 hidden sm:inline">{t.id}</span>

                <span
                  className="px-2 py-0.5 rounded text-xs font-medium shrink-0"
                  style={{ backgroundColor: subjectColor(t.subject) + '1a', color: subjectColor(t.subject) }}
                >
                  {t.subject}
                </span>

                <span className="flex-1 text-sm text-slate-700 min-w-0">
                  <span className={t.status === 'done' ? 'text-slate-400 line-through' : ''}>{t.title}</span>
                  {t.reason && <span className="ml-2 text-xs text-rose-500">（{t.reason}）</span>}
                </span>

                <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">{t.stage}</span>

                {/* 未完成时补一个原因入口：没有原因的话复盘时想不起为什么没做 */}
                {t.status !== 'done' && (
                  <button
                    onClick={() => {
                      const reason = prompt('未完成的原因（留空则清除）：', t.reason || '')
                      if (reason === null) return
                      setTaskStatus({
                        date,
                        taskId: t.id,
                        status: reason.trim() ? 'undone' : 'pending',
                        reason: reason.trim(),
                      })
                    }}
                    className="text-xs text-slate-400 hover:text-rose-500 cursor-pointer shrink-0 hidden sm:inline"
                    title="记录未完成原因"
                  >
                    {t.reason ? '改原因' : '填原因'}
                  </button>
                )}

                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${st.cls}`}>{st.label}</span>

                <button
                  onClick={() => {
                    if (!confirm(`删除任务「${t.title}」？`)) return
                    deleteDailyTask({ date, taskId: t.id })
                  }}
                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  title="删除任务"
                  aria-label="删除任务"
                >
                  <Icon name="trash" className="w-3.5 h-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <Reflection key={date} date={date} text={log.reflection} />
    </div>
  )
}

// 时长输入：本地草稿态，失焦 / Enter / 上下箭头结束编辑时才落盘。
// 原来每次 onChange 都直接写 store，输入「2.5」的中间态（2）会被反复落盘，
// 而且丢焦点前刷新页面会把半截数字存进去。
function DurationInput({ date, subject, color, hours }) {
  const [draft, setDraft] = useState(String(hours ?? 0))
  const [focused, setFocused] = useState(false)

  // 外部数据变化（换日期、智能体写入）时同步显示值，但不要覆盖正在输入的草稿
  if (!focused && String(hours ?? 0) !== draft) {
    // 在渲染期同步即可，避免额外一次 effect 造成的闪烁
    setDraft(String(hours ?? 0))
  }

  const commit = () => {
    setFocused(false)
    const n = Number(draft)
    const safe = Number.isFinite(n) && n >= 0 ? Math.min(n, 24) : Number(hours) || 0
    if (safe !== Number(hours)) setStudyDuration({ date, subject, hours: safe })
    setDraft(String(safe))
  }

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        {subject}
      </div>
      <div className="flex items-baseline gap-1">
        <input
          type="number"
          min="0"
          max="24"
          step="0.5"
          inputMode="decimal"
          value={draft}
          onFocus={(e) => {
            setFocused(true)
            e.target.select()
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') {
              setDraft(String(hours ?? 0))
              e.currentTarget.blur()
            }
          }}
          className="w-16 bg-transparent text-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          aria-label={`${subject}学习时长（小时）`}
        />
        <span className="text-sm text-slate-400">h</span>
      </div>
    </div>
  )
}

// 复盘：本地草稿态编辑，失焦或点保存时落盘。key 换日期时重置（见调用处）
function Reflection({ date, text }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text || '')

  const save = () => {
    setReflection({ date, text: draft.trim() })
    setEditing(false)
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <Icon name="file" className="w-4 h-4 text-slate-400" />
        复盘
        {!editing && (
          <button
            onClick={() => {
              setDraft(text || '')
              setEditing(true)
            }}
            className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            {text ? '编辑' : '写复盘'}
          </button>
        )}
      </h2>

      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="今日卡点、明日计划…"
            className="w-full resize-y px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors duration-200 cursor-pointer"
            >
              保存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{text || '暂无复盘'}</p>
      )}
    </section>
  )
}

function AddTaskForm({ date, onDone }) {
  const [subject, setSubject] = useState(SUBJECTS[0].name)
  const [title, setTitle] = useState('')
  const [stage, setStage] = useState('基础')

  const submit = () => {
    if (!title.trim()) return
    addDailyTask({ date, subject, title: title.trim(), stage })
    onDone()
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-2">
      <select
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        aria-label="科目"
      >
        {SUBJECTS.map((s) => (
          <option key={s.name}>{s.name}</option>
        ))}
      </select>
      <select
        value={stage}
        onChange={(e) => setStage(e.target.value)}
        className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        aria-label="阶段"
      >
        {['基础', '强化', '冲刺', '复习'].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="任务内容，例如：高数·定积分 刷 20 题"
        className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      <button
        onClick={submit}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors duration-200 cursor-pointer"
      >
        添加
      </button>
    </section>
  )
}