import { useState } from 'react'
import { SUBJECTS } from '../data'
import { useStore, setMilestone, setStageRange, setKeyDate } from '../store'
import Icon from '../components/Icon'

const subjectColor = (name) => SUBJECTS.find((s) => s.name === name)?.color || '#64748b'

const dateInputCls =
  'px-2 py-1 rounded-md border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

// 种子数据里日期是 '____' 占位，直接喂给 <input type="date"> 会触发 React 的 invalid value 警告，
// 且输入框显示空白、值也读不回来。这里统一做合法性判定：只有 YYYY-MM-DD 才算有效。
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (v) => typeof v === 'string' && DATE_RE.test(v)

// 日期 → 更好读的展示（9月1日），未填时给出明确提示而不是一串下划线
const showDate = (v) => {
  if (!isDate(v)) return null
  const [, m, d] = v.split('-')
  return `${Number(m)}月${Number(d)}日`
}

const todayStr = () => new Date().toLocaleDateString('sv-SE')

// 阶段状态：未开始 / 进行中 / 已结束 / 未排期
function stageStatus(phase) {
  const t = todayStr()
  if (!isDate(phase.start) && !isDate(phase.end)) return { label: '未排期', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
  if (isDate(phase.end) && t > phase.end) return { label: '已结束', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
  if (isDate(phase.start) && t < phase.start) return { label: '未开始', cls: 'bg-blue-50 text-blue-600 border-blue-200' }
  return { label: '进行中', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
}

export default function Timeline() {
  const { timeline: TIMELINE, keyDates: KEY_DATES } = useStore()
  const [editDates, setEditDates] = useState(false)

  // 全局完成度：所有里程碑 done / 总数
  const allMilestones = TIMELINE.flatMap((p) => p.subjects.flatMap((s) => s.milestones))
  const doneCount = allMilestones.filter((m) => m.done).length
  const overallPct = allMilestones.length ? Math.round((doneCount / allMilestones.length) * 100) : 0

  // 关键日期里未填的数量，作为「该不该点调整」的提示
  const missingDates = KEY_DATES.filter((d) => !isDate(d.date)).length

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">总时间轴</h1>
          <p className="text-sm text-slate-500 mt-1">
            四科三阶段规划 · 单条时间轴
            {missingDates > 0 && <span className="ml-2 text-amber-600">（{missingDates} 个关键日期未填）</span>}
          </p>
        </div>
        <button
          onClick={() => setEditDates((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
            editDates
              ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <Icon name={editDates ? 'check' : 'plus'} className="w-4 h-4" />
          {editDates ? '完成调整' : '调整时间节点'}
        </button>
      </header>

      {/* 总进度 */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-900">整体完成度</h2>
          <span className="text-sm text-slate-500">
            <span className="font-semibold text-slate-900">{doneCount}</span> / {allMilestones.length} 个里程碑
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={overallPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${overallPct}%` }} />
        </div>
        <div className="text-xs text-slate-400 mt-1.5">{overallPct}% 已完成</div>
      </section>

      {/* 关键日期卡片 */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {KEY_DATES.map((d) => {
          const ok = isDate(d.date)
          return (
            <div key={d.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Icon name="flag" className="w-4 h-4" />
                {d.label}
              </div>
              {editDates ? (
                <input
                  type="date"
                  // value 只放合法值，占位符走空字符串，否则 React 会警告 invalid value
                  value={ok ? d.date : ''}
                  onChange={(e) => e.target.value && setKeyDate({ label: d.label, date: e.target.value })}
                  className={`w-full ${dateInputCls}`}
                  aria-label={`${d.label}日期`}
                />
              ) : ok ? (
                <div className="text-sm font-semibold text-slate-900">{showDate(d.date)}</div>
              ) : (
                <button
                  onClick={() => setEditDates(true)}
                  className="text-sm text-slate-400 hover:text-blue-600 cursor-pointer text-left"
                >
                  待填写
                </button>
              )}
            </div>
          )
        })}
      </section>

      {/* 三阶段时间轴 */}
      <div className="space-y-4">
        {TIMELINE.map((phase, idx) => {
          const ms = phase.subjects.flatMap((s) => s.milestones)
          const done = ms.filter((m) => m.done).length
          const pct = ms.length ? Math.round((done / ms.length) * 100) : 0
          const st = stageStatus(phase)
          return (
            <section key={phase.stage} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* 阶段头部 */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: ['#3b82f6', '#8b5cf6', '#ef4444'][idx] }}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{phase.stage}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{done}/{ms.length} 个里程碑 · {pct}%</div>
                </div>
                {editDates ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={isDate(phase.start) ? phase.start : ''}
                      onChange={(e) => e.target.value && setStageRange({ stage: phase.stage, start: e.target.value })}
                      className={dateInputCls}
                      aria-label={`${phase.stage}开始日期`}
                    />
                    <span className="text-slate-400">—</span>
                    <input
                      type="date"
                      value={isDate(phase.end) ? phase.end : ''}
                      onChange={(e) => e.target.value && setStageRange({ stage: phase.stage, end: e.target.value })}
                      className={dateInputCls}
                      aria-label={`${phase.stage}结束日期`}
                    />
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">
                    {isDate(phase.start) ? showDate(phase.start) : <span className="text-slate-300">待填</span>}
                    <span className="mx-1 text-slate-300">—</span>
                    {isDate(phase.end) ? showDate(phase.end) : <span className="text-slate-300">待填</span>}
                  </div>
                )}
              </div>

              {/* 阶段进度条 */}
              <div className="h-1 w-full bg-slate-100">
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: ['#3b82f6', '#8b5cf6', '#ef4444'][idx] }}
                />
              </div>

              {/* 四科 */}
              <div className="divide-y divide-slate-100">
                {phase.subjects.map((s) => (
                  <div key={s.subject} className="px-5 py-4 flex flex-col sm:flex-row gap-3">
                    <div className="w-24 shrink-0 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subjectColor(s.subject) }} />
                      <span className="text-sm font-medium text-slate-700">{s.subject}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {s.milestones.map((m) => (
                        <button
                          key={m.title}
                          onClick={() => setMilestone({ stage: phase.stage, subject: s.subject, title: m.title, done: !m.done })}
                          title={m.done ? '点击标记为未完成' : '点击标记为已完成'}
                          aria-pressed={!!m.done}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 cursor-pointer ${
                            m.done
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Icon name={m.done ? 'check' : 'circle'} className="w-3.5 h-3.5" />
                          {m.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}