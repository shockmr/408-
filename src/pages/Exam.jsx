import { useState } from 'react'
import { SUBJECTS } from '../data'
import { useStore, deleteExam } from '../store'

const subjectColor = (name) => SUBJECTS.find((s) => s.name === name)?.color || '#64748b'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (v) => typeof v === 'string' && DATE_RE.test(v)

const showDate = (v) => {
  if (!isDate(v)) return '日期待补'
  const [y, m, d] = v.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

// 按日期排序展示（store 写入时已排序，这里再兜一次，防历史数据乱序）
const sorted = (exams) => [...exams].sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || '')))

export default function Exam() {
  const { exams } = useStore()
  const [selectedKey, setSelectedKey] = useState(null)

  const list = sorted(exams)
  // 用 name+date 做选中键，不用数组下标：删除或排序变化后下标会错位，详情会串场。
  // 选中的键在 list 里找不到时（被删掉了）直接在渲染期判定为「回到列表」，不用 effect 改 state。
  const selected = selectedKey ? list.find((e) => `${e.name}|${e.date}` === selectedKey) : null

  if (list.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">月考分析</h1>
          <p className="text-sm text-slate-500 mt-1">模块化错误表 · 各科分数综合</p>
        </header>
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
          暂无月考记录 —— 让左侧助手帮你录入
        </div>
      </div>
    )
  }

  if (selected) {
    return <ExamDetail exam={selected} onBack={() => setSelectedKey(null)} />
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">月考分析</h1>
        <p className="text-sm text-slate-500 mt-1">全部月考数据预览 · 点击查看详情</p>
      </header>

      {/* 汇总表格 */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">月考记录（共 {list.length} 场）</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3 font-medium">场次</th>
                <th className="px-5 py-3 font-medium">考试时间</th>
                <th className="px-5 py-3 font-medium">总分</th>
                <th className="px-5 py-3 font-medium">得分率</th>
                <th className="px-5 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((exam) => {
                const key = `${exam.name}|${exam.date}`
                return (
                  <tr
                    key={key}
                    className="group hover:bg-slate-50 transition-colors duration-200 cursor-pointer"
                    onClick={() => setSelectedKey(key)}
                  >
                    <td className="px-5 py-4 font-medium text-slate-900">
                      {exam.name}
                      {!isDate(exam.date) && (
                        <span className="ml-2 text-[11px] text-amber-600">日期待补</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{showDate(exam.date)}</td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-slate-900">{exam.total.score}</span>
                      <span className="text-slate-400 ml-1">/ {exam.total.full}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-blue-600">{exam.total.rate}</span>
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedKey(key)
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors duration-200 cursor-pointer"
                      >
                        查看详情
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!confirm(`删除「${exam.name}」的整场记录？该场次的各科分数与错误表会一并删除。`)) return
                          deleteExam({ name: exam.name, date: exam.date })
                        }}
                        className="ml-1 w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors duration-200 cursor-pointer opacity-0 group-hover:opacity-100"
                        title="删除该场"
                        aria-label="删除该场"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 各科分数对比 */}
      {list.length > 1 && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">各科分数趋势</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-medium sticky left-0 bg-white z-10">科目</th>
                  {list.map((exam) => (
                    <th key={`${exam.name}|${exam.date}`} className="px-5 py-3 font-medium text-center whitespace-nowrap">
                      {exam.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SUBJECTS.map((subject) => (
                  <tr key={subject.name} className="hover:bg-slate-50">
                    <td className="px-5 py-3 sticky left-0 bg-white">
                      <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subject.color }} />
                        {subject.name}
                      </span>
                    </td>
                    {list.map((exam) => {
                      const subjectData = exam.subjects?.find((s) => s.subject === subject.name)
                      return (
                        <td key={`${exam.name}|${exam.date}`} className="px-5 py-3 text-center">
                          {subjectData ? (
                            <div>
                              <div className="font-semibold text-slate-900">{subjectData.score}</div>
                              <div className="text-xs text-slate-400">/ {subjectData.full}</div>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

// 单场月考详情
function ExamDetail({ exam, onBack }) {
  const scrollToError = (subject) => {
    const el = document.getElementById(`error-${subject}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else alert(`${subject} 没有录入模块化错误表`)
  }

  const hasErrors = (exam.errors || []).length > 0

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors duration-200 cursor-pointer"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回列表
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{exam.name}</h1>
          <p className="text-sm text-slate-500 mt-1">{showDate(exam.date)}</p>
        </div>
      </header>

      {/* 总分卡片 */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 mb-1">总分</div>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold text-slate-900">{exam.total.score}</span>
              <span className="text-sm text-slate-400 mb-1">/ {exam.total.full} 分</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 mb-1">总分率</div>
            <div className="text-2xl font-semibold text-blue-600">{exam.total.rate}</div>
          </div>
        </div>
      </section>

      {/* 各科分数 */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">各科分数</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="px-5 py-2.5 font-medium">科目</th>
                <th className="px-5 py-2.5 font-medium">满分</th>
                <th className="px-5 py-2.5 font-medium">得分</th>
                <th className="px-5 py-2.5 font-medium">得分率</th>
                <th className="px-5 py-2.5 font-medium">趋势</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(exam.subjects || []).map((s) => (
                <tr key={s.subject} className="hover:bg-slate-50 transition-colors duration-200">
                  <td className="px-5 py-3">
                    <button
                      onClick={() => scrollToError(s.subject)}
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 hover:underline font-medium cursor-pointer transition-colors duration-200"
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subjectColor(s.subject) }} />
                      {s.subject}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{s.full}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">{s.score}</td>
                  <td className="px-5 py-3 text-slate-600">{s.rate}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs font-medium ${
                        String(s.trend).startsWith('↑')
                          ? 'text-emerald-600'
                          : String(s.trend).startsWith('↓')
                            ? 'text-rose-600'
                            : 'text-slate-400'
                      }`}
                    >
                      {s.trend || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 模块化错误表 */}
      {hasErrors ? (
        <div className="space-y-5">
          {exam.errors.map((e) => (
            <section key={e.subject} id={`error-${e.subject}`} className="bg-white rounded-xl border border-slate-200 overflow-hidden scroll-mt-4">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subjectColor(e.subject) }} />
                <h2 className="text-sm font-semibold text-slate-900">{e.subject} · 模块化错误表</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {(e.modules || []).map((m) => (
                  <div key={m.module} className="px-5 py-4">
                    <div className="text-xs font-medium text-slate-500 mb-2">{m.module}</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                            <th className="py-2 font-medium">知识点</th>
                            <th className="py-2 font-medium">错误数</th>
                            <th className="py-2 font-medium">失分</th>
                            <th className="py-2 font-medium">错误原因</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {(m.items || []).map((it) => (
                            <tr key={it.topic}>
                              <td className="py-2 text-slate-700">{it.topic}</td>
                              <td className="py-2 text-slate-600">{it.count}</td>
                              <td className="py-2 text-rose-600 font-medium">{it.lost} 分</td>
                              <td className="py-2 text-slate-600">{it.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
          这场还没有录入模块化错误表 —— 可以让助手补录各模块的失分情况
        </div>
      )}
    </div>
  )
}