import { useState, useMemo } from 'react'
import { SUBJECTS } from '../data'
import { useStore, setWrongQuestionStatus, addWrongQuestion, deleteWrongQuestion } from '../store'
import { putAttachment, openAttachment, deleteAttachment } from '../utils/attachments'
import Icon from '../components/Icon'

const subjectColor = (name) => SUBJECTS.find((s) => s.name === name)?.color || '#64748b'

const STATUS = {
  '待复习': { cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  '已掌握': { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

const MAX_IMG_BYTES = 10 * 1024 * 1024

export default function Wrong() {
  const { wrongQuestions } = useStore()
  // 四科固定展示：原来只列「已有错题的科目」，刚接触 408 时看不到入口
  const subjects = useMemo(() => SUBJECTS.map((s) => s.name), [])
  const [picked, setPicked] = useState(subjects[0])
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState(null)
  const [filter, setFilter] = useState('全部') // 全部 / 待复习 / 已掌握

  const active = subjects.includes(picked) ? picked : subjects[0]
  const chapters = wrongQuestions[active] || {}
  const chapterNames = Object.keys(chapters)

  // 统计口径：全科目合计，而不是只看当前科
  const stats = useMemo(() => {
    let total = 0
    let pending = 0
    for (const list of Object.values(wrongQuestions)) {
      for (const items of Object.values(list)) {
        for (const q of items) {
          total++
          if (q.status !== '已掌握') pending++
        }
      }
    }
    return { total, pending, mastered: total - pending }
  }, [wrongQuestions])

  const notify = (text, error = false) => {
    setMessage({ text, error })
    window.clearTimeout(notify._t)
    notify._t = window.setTimeout(() => setMessage(null), 4000)
  }

  const viewImage = async (q) => {
    try {
      await openAttachment({ ...q.img, name: q.img.name || `${q.id}.jpg` })
    } catch (err) {
      notify(`图片打不开：${err.message}`, true)
    }
  }

  const removeQuestion = async (q) => {
    if (!confirm(`删除错题「${q.topic}」（${q.id}）？`)) return
    // 图片实体跟着走，否则 IndexedDB 里会留下永远点不到的孤儿文件
    if (q.img?.id) await deleteAttachment(q.img.id).catch(() => {})
    deleteWrongQuestion({ id: q.id })
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">错题档案</h1>
          <p className="text-sm text-slate-500 mt-1">
            按科目 + 章节归类 · 共 {stats.total} 题，待复习{' '}
            <span className="text-amber-600 font-medium">{stats.pending}</span> 题
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors duration-200 cursor-pointer"
        >
          <Icon name={adding ? 'x' : 'plus'} className="w-4 h-4" />
          {adding ? '取消' : '录入错题'}
        </button>
      </header>

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

      {adding && (
        <AddWrongForm
          subject={active}
          chapters={chapterNames}
          onDone={(text, error) => {
            setAdding(false)
            if (text) notify(text, error)
          }}
        />
      )}

      {/* 科目切换 */}
      <div className="flex flex-wrap items-center gap-2">
        {subjects.map((s) => {
          const count = Object.values(wrongQuestions[s] || {}).reduce((n, list) => n + list.length, 0)
          return (
            <button
              key={s}
              onClick={() => setPicked(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
                active === s ? 'text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
              style={active === s ? { backgroundColor: subjectColor(s) } : {}}
            >
              {s}
              <span className={`ml-1.5 text-xs ${active === s ? 'text-white/70' : 'text-slate-400'}`}>{count}</span>
            </button>
          )
        })}

        {/* 掌握状态筛选 */}
        <div className="ml-auto flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          {['全部', '待复习', '已掌握'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-200 cursor-pointer ${
                filter === f ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* 章节错题表 */}
      <div className="space-y-5">
        {chapterNames.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
            {active} 暂无错题记录 —— 点右上角「录入错题」，或让助手帮你录
          </div>
        )}
        {chapterNames.map((chapter) => {
          const all = chapters[chapter]
          const items = filter === '全部' ? all : all.filter((q) => (filter === '已掌握') === (q.status === '已掌握'))
          if (items.length === 0) return null
          return (
            <section key={chapter} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subjectColor(active) }} />
                <h2 className="text-sm font-semibold text-slate-900">{chapter}</h2>
                <span className="text-xs text-slate-400">
                  ({items.length} 题{filter !== '全部' ? ` / 共 ${all.length}` : ''})
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="px-5 py-2.5 font-medium">编号</th>
                      <th className="px-5 py-2.5 font-medium">知识点</th>
                      <th className="px-5 py-2.5 font-medium">错误原因</th>
                      <th className="px-5 py-2.5 font-medium">掌握状态</th>
                      <th className="px-5 py-2.5 font-medium text-right">图片</th>
                      <th className="px-5 py-2.5 font-medium text-right sr-only">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((q) => {
                      const st = STATUS[q.status] || STATUS['待复习']
                      const hasImg = !!q.img?.id
                      return (
                        <tr key={q.id} className="group hover:bg-slate-50 transition-colors duration-200">
                          <td className="px-5 py-3 font-mono text-xs text-slate-400">{q.id}</td>
                          <td className="px-5 py-3 text-slate-700">{q.topic}</td>
                          <td className="px-5 py-3 text-slate-600">{q.reason || '—'}</td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() =>
                                setWrongQuestionStatus({ id: q.id, status: q.status === '已掌握' ? '待复习' : '已掌握' })
                              }
                              title="点击切换掌握状态"
                              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors duration-200 cursor-pointer ${st.cls}`}
                            >
                              {q.status}
                            </button>
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            {hasImg ? (
                              <button
                                onClick={() => viewImage(q)}
                                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                              >
                                <Icon name="camera" className="w-4 h-4" />
                                查看
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300">无</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => removeQuestion(q)}
                              className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                              title="删除该错题"
                              aria-label="删除该错题"
                            >
                              <Icon name="trash" className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// 录入错题：科目 / 章节 / 知识点 / 原因 / 可选拍照或选图
function AddWrongForm({ subject, chapters, onDone }) {
  const [module, setModule] = useState('')
  const [topic, setTopic] = useState('')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!topic.trim()) return onDone('请填写知识点', true)
    if (!module.trim()) return onDone('请填写所属章节', true)
    if (!reason.trim()) return onDone('请填写错误原因', true)
    if (file && file.size > MAX_IMG_BYTES) return onDone('图片超过 10MB，请压缩后再上传', true)

    setBusy(true)
    let img = ''
    try {
      if (file) {
        const id = 'qimg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
        const type = (file.name.split('.').pop() || 'jpg').toLowerCase()
        // 图片实体进 IndexedDB，错题记录里只留元数据
        await putAttachment({ id, name: file.name, type, size: file.size, blob: file })
        img = { id, name: file.name, type, size: file.size }
      }
    } catch (err) {
      setBusy(false)
      return onDone(`图片保存失败：${err.message}（错题未录入）`, true)
    }

    const id = addWrongQuestion({
      subject,
      module: module.trim(),
      topic: topic.trim(),
      reason: reason.trim(),
      img,
      status: '待复习',
    })
    setBusy(false)
    setTopic('')
    setReason('')
    setFile(null)
    onDone(`已录入错题 ${id}`)
  }

  const field =
    'px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="px-2.5 py-1 rounded text-xs font-medium"
          style={{ backgroundColor: subjectColor(subject) + '1a', color: subjectColor(subject) }}
        >
          {subject}
        </span>

        <input
          list="wrong-chapters"
          value={module}
          onChange={(e) => setModule(e.target.value)}
          placeholder="所属章节，如「数据结构」"
          className={`${field} w-52`}
        />
        <datalist id="wrong-chapters">
          {chapters.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="知识点，如「二叉树遍历」"
          className={`${field} flex-1 min-w-[180px]`}
        />

        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="错误原因，如「概念混淆」"
          className={`${field} w-48`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null
              setFile(f)
              e.target.value = ''
            }}
          />
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
            <Icon name="camera" className="w-3.5 h-3.5" />
            拍照 / 选图（可选）
          </span>
        </label>
        {file && (
          <span className="text-xs text-slate-500">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
            <button onClick={() => setFile(null)} className="ml-1.5 text-rose-500 hover:underline cursor-pointer">
              移除
            </button>
          </span>
        )}
        <button
          onClick={submit}
          disabled={busy}
          className="ml-auto px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
        >
          {busy ? '保存中…' : '添加错题'}
        </button>
      </div>
    </section>
  )
}