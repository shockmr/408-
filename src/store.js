// 可写数据层：以 data.js 为初始种子，运行态数据存内存 + localStorage
// 页面通过 useStore() 订阅，智能体工具通过下方具名 mutation 写入
import { useSyncExternalStore } from 'react'
import { TIMELINE, KEY_DATES, DAILY_LOGS, WRONG_QUESTIONS, EXAMS, SUBJECTS } from './data'
import { parseMarkdownToTree, genNodeId } from './utils/markdownTree'
import { putAttachment } from './utils/attachments'
import mathSyllabusMd from './assets/数二目录.md?raw'

const STORAGE_KEY = 'study-progress-state'
const BACKUP_KEY = 'study-progress-state-backup'
const VERSION = 3

// 空的科目目录初始值；数二用内置 MD 解析结果，其余为空
const EMPTY_SYLLABUS = { 数二: [], 英二: [], 408: [], 政治: [] }

const seed = () => ({
  version: VERSION,
  timeline: TIMELINE,
  keyDates: KEY_DATES,
  dailyLogs: DAILY_LOGS,
  wrongQuestions: WRONG_QUESTIONS,
  exams: EXAMS,
  syllabus: { ...EMPTY_SYLLABUS, 数二: parseMarkdownToTree(mathSyllabusMd) },
})

// 深拷贝种子，避免运行时改动污染 data.js 里的常量
const clone = (v) => JSON.parse(JSON.stringify(v))

// ---------- 派生值：月考趋势 ----------
// 定义在 load() 之前 —— 模块初始化时 load() 会调 migrate()，而 migrate 要重算趋势。

const rate = (score, full) => (full ? `${Number(((score / full) * 100).toFixed(1))}%` : '—')

// 按日期升序排列，趋势按「时间上的上一场」算，补录旧场次也不会把箭头算反
const examOrder = (a, b) => String(a?.date || '').localeCompare(String(b?.date || ''))

// 只对有真实日期的场次排序；日期还是占位符（____）的场次无法定位先后，排在最后且不参与趋势推算
const isValidDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

// 重算全部场次的 trend 与 total。趋势是「相对上一场同科」的派生值，
// 一旦补录/删除中间场次，后面所有场次的基准都会变，必须整体重算而不是写入时定死。
function recalcExams(exams) {
  const dated = exams.filter((e) => isValidDate(e.date)).sort(examOrder)
  const undated = exams.filter((e) => !isValidDate(e.date))
  const ordered = [...dated, ...undated]

  ordered.forEach((exam, i) => {
    // 只有紧邻的前一场且日期有效时，才作为对比基准
    const prev = i > 0 && isValidDate(exam.date) && isValidDate(ordered[i - 1].date) ? ordered[i - 1] : null
    for (const s of exam.subjects || []) {
      const before = prev?.subjects?.find((p) => p.subject === s.subject)
      const diff = before && Number.isFinite(before.score) ? s.score - before.score : 0
      s.trend = !before || diff === 0 ? '—' : `${diff > 0 ? '↑' : '↓'} ${Math.abs(diff)} 分`
      s.rate = rate(s.score, s.full)
    }
    const full = (exam.subjects || []).reduce((n, s) => n + (Number(s.full) || 0), 0)
    const score = (exam.subjects || []).reduce((n, s) => n + (Number(s.score) || 0), 0)
    exam.total = { full, score, rate: rate(score, full) }
  })
  return ordered
}

// ---------- 错误通道 ----------
// 存储写入失败（配额满 / 隐私模式）必须让用户看见，不能再静默吞掉。
const errorListeners = new Set()
let lastError = null

export function subscribeError(fn) {
  errorListeners.add(fn)
  return () => errorListeners.delete(fn)
}

export function getLastError() {
  return lastError
}

export function usePersistError() {
  return useSyncExternalStore(subscribeError, getLastError, getLastError)
}

function reportError(message) {
  lastError = message ? { message, at: Date.now() } : null
  errorListeners.forEach((fn) => fn())
}

export function clearPersistError() {
  if (lastError) reportError(null)
}

// ---------- 迁移 ----------
// 旧版把章节目录单存在 'study_trees'，迁一次；迁移后不再读它。
function readLegacySyllabus() {
  try {
    const raw = localStorage.getItem('study_trees')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// 版本升级只做字段级迁移，绝不整包丢弃用户数据。
// 旧数据缺什么补什么，结构不明的字段保持原样，宁可留旧值也不清空。
function migrate(parsed) {
  const base = seed()
  const state = { ...base, ...parsed }
  delete state.version

  // 缺失的数据域用种子补，已存在的保留
  if (!Array.isArray(state.timeline) || state.timeline.length === 0) state.timeline = base.timeline
  if (!Array.isArray(state.keyDates)) state.keyDates = base.keyDates
  if (!state.dailyLogs || typeof state.dailyLogs !== 'object') state.dailyLogs = base.dailyLogs
  if (!state.wrongQuestions || typeof state.wrongQuestions !== 'object') state.wrongQuestions = base.wrongQuestions
  if (!Array.isArray(state.exams)) state.exams = base.exams
  if (!state.syllabus || typeof state.syllabus !== 'object') state.syllabus = {}

  // 章节目录：逐科补齐，缺失科目先看旧 key，再退回种子
  const legacy = readLegacySyllabus()
  for (const subject of Object.keys(EMPTY_SYLLABUS)) {
    if (!Array.isArray(state.syllabus[subject])) {
      const fromLegacy = legacy && Array.isArray(legacy[subject]) ? legacy[subject] : null
      state.syllabus[subject] = fromLegacy || base.syllabus[subject] || []
    }
  }

  // 趋势、得分率、总分都是派生值：旧版本可能存在算错的箭头（按数组末位对比），
  // 迁移时统一重算一遍，保证历史数据与当前算法一致。
  state.exams = recalcExams(state.exams)

  state.version = VERSION
  return state
}

function load() {
  let raw = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return clone(seed())
  }
  if (!raw) return clone(seed())

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    // 解析不了：把坏数据原样挪到备份 key，避免被下一次 persist 覆盖后再也找不回
    try {
      localStorage.setItem(BACKUP_KEY, raw)
    } catch {
      // 连备份都写不进去就只能放弃
    }
    reportError('本地数据解析失败，已把原始内容备份到 study-progress-state-backup，当前使用种子数据')
    return clone(seed())
  }

  // 迁移前留一份快照，用户可从「数据备份」里回退
  if (parsed?.version !== VERSION) {
    try {
      localStorage.setItem(BACKUP_KEY, raw)
    } catch {
      // 备份失败不阻塞启动
    }
  }
  return migrate(parsed)
}

let state = load()
const listeners = new Set()

// 返回是否落盘成功。失败时上报，页面顶部据此提示。
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    if (lastError && lastError.message.includes('无法保存')) reportError(null)
    return true
  } catch (err) {
    const isQuota = err && (err.name === 'QuotaExceededError' || err.code === 22)
    reportError(
      isQuota
        ? '浏览器本地存储已满，最近的改动无法保存。请先导出备份，再清理附件或历史数据。'
        : `本地数据无法保存：${err?.message || err}`,
    )
    return false
  }
}

export function getState() {
  return state
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// updater 接收一份可随意改动的深拷贝，返回值忽略
function setState(updater) {
  const draft = clone(state)
  updater(draft)
  state = draft
  persist()
  listeners.forEach((fn) => fn())
}

export function useStore() {
  return useSyncExternalStore(subscribe, getState, getState)
}

// 供智能体读取的运行时视图（含同步的章节目录）
export function stateForAgent() {
  return state
}

// ---------- 章节目录 ----------

export function initSyllabus() {
  // 迁移已在 load() 里完成，这里只补齐运行时缺科的情况
  setState((draft) => {
    if (!draft.syllabus) draft.syllabus = {}
    for (const subject of Object.keys(EMPTY_SYLLABUS)) {
      if (!Array.isArray(draft.syllabus[subject])) {
        draft.syllabus[subject] = EMPTY_SYLLABUS[subject]
      }
    }
  })
}

export function readSyllabus(subject) {
  return state.syllabus?.[subject] || []
}

// 归一并写入目录树。tree 只接受 { id?, title, children } 结构；children 缺省补空数组。
// 可选字段 content（叶子节点手动编写的内容）、attachments（叶子节点挂载的附件元数据）会透传保留。
// 附件只存元数据 { id, name, type, size }，二进制在 IndexedDB（见 utils/attachments.js）。
// id 必须保留：页面的展开状态、编辑和删除都以它为键；智能体写入时通常不带 id，这里补齐。
// inlineData: 迁移旧版 base64 数据时临时携带，由调用方收集后转入 IndexedDB。
function normalizeTree(tree, inlineData) {
  if (!Array.isArray(tree)) return []
  return tree
    .map((n) => {
      const title = typeof n?.title === 'string' ? n.title.trim() : ''
      if (!title) return null
      const node = { id: n.id || genNodeId(), title }
      if (typeof n?.content === 'string' && n.content.trim()) node.content = n.content
      if (Array.isArray(n?.attachments) && n.attachments.length) {
        const metas = []
        for (const a of n.attachments) {
          if (!a || typeof a.name !== 'string' || !a.name) continue
          const id = a.id || genNodeId()
          // 旧版把 base64 直接存在 data 字段，这里剥离出去交给迁移逻辑落地到 IDB
          if (typeof a.data === 'string' && a.data.startsWith('data:') && inlineData) {
            inlineData.push({ id, name: a.name, type: a.type || '', size: a.size || 0, dataUrl: a.data })
          }
          metas.push({
            id,
            name: a.name,
            type: typeof a.type === 'string' ? a.type : '',
            size: typeof a.size === 'number' ? a.size : 0,
          })
        }
        if (metas.length) node.attachments = metas
      }
      node.children = normalizeTree(n.children, inlineData)
      return node
    })
    .filter(Boolean)
}

export function setSyllabus(subject, tree) {
  const inlineData = []
  setState((draft) => {
    if (!draft.syllabus) draft.syllabus = {}
    draft.syllabus[subject] = normalizeTree(tree, inlineData)
  })
  flushInlineData(inlineData)
}

// 合并目录树并按一级目录查重：与现有该科目录合并。
// 一级目录名已存在的视为重复——不添加新条目、保留原有条目；名称不同的追加到末尾。
// 返回 { added, skipped } 供调用方提示。
export function mergeSyllabus(subject, tree) {
  let added = 0
  let skipped = 0
  const inlineData = []
  setState((draft) => {
    if (!draft.syllabus) draft.syllabus = {}
    const existing = draft.syllabus[subject] || []
    const seen = new Set(existing.map((n) => n.title))
    const incoming = []
    for (const n of normalizeTree(tree, inlineData)) {
      if (seen.has(n.title)) {
        skipped++
        continue
      }
      seen.add(n.title)
      incoming.push(n)
    }
    added = incoming.length
    draft.syllabus[subject] = [...existing, ...incoming]
  })
  flushInlineData(inlineData)
  return { added, skipped }
}

// 把旧版内联的 base64 附件搬进 IndexedDB（失败就放弃搬运，不阻塞主流程）
function flushInlineData(list) {
  if (!list.length) return
  list.forEach((item) => {
    putAttachment(item).catch(() => {
      // 搬运失败的附件在界面上显示为「已丢失」，用户可重新上传
    })
  })
}

// 全量扫描：把仍留在状态里的 base64 附件搬到 IDB，并瘦身 state。
// 由启动流程调用一次，返回值表示迁移了多少条。
export async function migrateInlineAttachments() {
  const inlineData = []
  setState((draft) => {
    if (!draft.syllabus) return
    for (const subject of Object.keys(draft.syllabus)) {
      draft.syllabus[subject] = normalizeTree(draft.syllabus[subject], inlineData)
    }
  })
  for (const item of inlineData) {
    try {
      await putAttachment(item)
    } catch {
      // 单条失败不影响其他
    }
  }
  return inlineData.length
}

export function resetState() {
  state = clone(seed())
  persist()
  listeners.forEach((fn) => fn())
}

// ---------- 备份 / 恢复 ----------

export function exportJSON() {
  return JSON.stringify(state, null, 2)
}

// 导入并整体替换。返回 { ok, error }，不抛异常，交给调用方提示。
export function importJSON(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: '文件不是合法的 JSON' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: '文件结构不对，应为导出的进度备份对象' }
  }
  const known = ['timeline', 'keyDates', 'dailyLogs', 'wrongQuestions', 'exams', 'syllabus']
  if (!known.some((k) => parsed[k] != null)) {
    return { ok: false, error: '没有找到任何可识别的数据域（timeline / dailyLogs / exams 等）' }
  }
  // 导入前把当前状态留一份备份，误导入可回退
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(state))
  } catch {
    // 备份失败继续，导入本身更重要
  }
  state = migrate(parsed)
  persist()
  listeners.forEach((fn) => fn())
  return { ok: true }
}

export function readBackupRaw() {
  try {
    return localStorage.getItem(BACKUP_KEY)
  } catch {
    return null
  }
}

// ---------- 内部工具 ----------

const EMPTY_LOG = { day: 0, tasks: [], durations: [], reflection: '' }

// day 序号是派生值：按日期排序后取序号。补录旧日期时若只在创建时赋值，
// 会和已有序号撞号（比如先建 09-20 拿到 3，再补 09-15 又拿到 3）。
// 因此每次 dailyLogs 变动后整体重算，保证唯一且连续。
const isLogDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d)

function recalcDays(dailyLogs) {
  if (!dailyLogs) return
  const dates = Object.keys(dailyLogs)
    .filter(isLogDate)
    .sort()
  dates.forEach((d, i) => {
    if (dailyLogs[d]) dailyLogs[d].day = i + 1
  })
  // 非标准格式的历史键（如手动写入的 '____'）不参与排序，序号置 0
  for (const d of Object.keys(dailyLogs)) {
    if (!isLogDate(d) && dailyLogs[d]) dailyLogs[d].day = 0
  }
}

// 拿到某天的日志，没有就现建一个（day 由 recalcDays 统一赋值）
function ensureLog(draft, date) {
  if (!draft.dailyLogs[date]) {
    draft.dailyLogs[date] = { ...EMPTY_LOG }
    recalcDays(draft.dailyLogs)
  }
  return draft.dailyLogs[date]
}

// T-0824-01：日期取 MMDD，序号在当天内取「已用最大序号 + 1」
function nextTaskId(date, tasks) {
  const md = date.replaceAll('-', '').slice(4)
  const used = tasks
    .map((t) => {
      const m = new RegExp(`^T-${md}-(\\d+)$`).exec(t?.id || '')
      return m ? Number(m[1]) : 0
    })
    .filter((n) => Number.isFinite(n))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `T-${md}-${String(next).padStart(2, '0')}`
}

// C-数二-001：序号取该科目内已用最大序号 + 1，删除中间项后也不会撞号
function nextWrongId(subject, chapters) {
  const all = Object.values(chapters).flat()
  const used = all
    .map((q) => {
      const m = new RegExp(`^C-${subject}-(\\d+)$`).exec(q?.id || '')
      return m ? Number(m[1]) : 0
    })
    .filter((n) => Number.isFinite(n))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `C-${subject}-${String(next).padStart(3, '0')}`
}

// ---------- 每日日志 ----------

export function addDailyTask({ date, subject, title, stage = '基础', status = 'pending' }) {
  let id
  setState((draft) => {
    const log = ensureLog(draft, date)
    id = nextTaskId(date, log.tasks)
    log.tasks.push({ id, subject, title, stage, status })
  })
  return id
}

export function setTaskStatus({ date, taskId, status, reason }) {
  let ok = false
  setState((draft) => {
    const task = draft.dailyLogs[date]?.tasks.find((t) => t.id === taskId)
    if (!task) return
    task.status = status
    if (status === 'undone' && reason) task.reason = reason
    else delete task.reason
    ok = true
  })
  return ok
}

export function deleteDailyTask({ date, taskId }) {
  let ok = false
  setState((draft) => {
    const log = draft.dailyLogs[date]
    if (!log) return
    const before = log.tasks.length
    log.tasks = log.tasks.filter((t) => t.id !== taskId)
    ok = log.tasks.length !== before
    // 任务删空且无时长/复盘时，把空日志一并清掉，避免累积空壳日期
    if (log.tasks.length === 0 && !log.reflection && log.durations.length === 0) delete draft.dailyLogs[date]
  })
  return ok
}

export function setStudyDuration({ date, subject, hours }) {
  setState((draft) => {
    const log = ensureLog(draft, date)
    const row = log.durations.find((d) => d.subject === subject)
    if (row) row.hours = hours
    else log.durations.push({ subject, hours })
  })
}

export function setReflection({ date, text }) {
  setState((draft) => {
    ensureLog(draft, date).reflection = text
  })
}

// ---------- 错题档案 ----------

export function addWrongQuestion({ subject, module, topic, reason, img = '', status = '待复习' }) {
  let id
  setState((draft) => {
    if (!draft.wrongQuestions[subject]) draft.wrongQuestions[subject] = {}
    const chapters = draft.wrongQuestions[subject]
    id = nextWrongId(subject, chapters)
    if (!chapters[module]) chapters[module] = []
    chapters[module].push({ id, img, topic, reason, status })
  })
  return id
}

export function setWrongQuestionStatus({ id, status }) {
  let ok = false
  setState((draft) => {
    for (const chapters of Object.values(draft.wrongQuestions)) {
      for (const list of Object.values(chapters)) {
        const q = list.find((item) => item.id === id)
        if (q) {
          q.status = status
          ok = true
          return
        }
      }
    }
  })
  return ok
}

export function deleteWrongQuestion({ id }) {
  let ok = false
  setState((draft) => {
    for (const chapters of Object.values(draft.wrongQuestions)) {
      for (const key of Object.keys(chapters)) {
        const before = chapters[key].length
        chapters[key] = chapters[key].filter((q) => q.id !== id)
        if (chapters[key].length !== before) {
          ok = true
          if (chapters[key].length === 0) delete chapters[key]
          return
        }
      }
    }
  })
  return ok
}

// ---------- 月考 ----------

// subjects: [{ subject, full, score }]，得分率与趋势（对比时间上相邻的上一场同科）自动算
export function addExam({ name, date, subjects, errors = [] }) {
  setState((draft) => {
    const rows = (subjects || []).map((s) => ({
      subject: s.subject,
      full: s.full,
      score: s.score,
      rate: rate(s.score, s.full),
      trend: '—', // 真实值由 recalcExams 统一推算
    }))
    draft.exams.push({ name, date, subjects: rows, errors })
    draft.exams = recalcExams(draft.exams)
  })
}

export function deleteExam({ name, date }) {
  let ok = false
  setState((draft) => {
    const before = draft.exams.length
    draft.exams = draft.exams.filter((e) => !(e.name === name && e.date === date))
    ok = draft.exams.length !== before
    if (ok) draft.exams = recalcExams(draft.exams)
  })
  return ok
}

// ---------- 时间轴 ----------

export function setMilestone({ stage, subject, title, done }) {
  let ok = false
  setState((draft) => {
    const m = draft.timeline
      .find((p) => p.stage === stage)
      ?.subjects.find((s) => s.subject === subject)
      ?.milestones.find((item) => item.title === title)
    if (!m) return
    m.done = done
    ok = true
  })
  return ok
}

export function setStageRange({ stage, start, end }) {
  let ok = false
  setState((draft) => {
    const phase = draft.timeline.find((p) => p.stage === stage)
    if (!phase) return
    if (start) phase.start = start
    if (end) phase.end = end
    ok = true
  })
  return ok
}

export function setKeyDate({ label, date }) {
  setState((draft) => {
    const row = draft.keyDates.find((d) => d.label === label)
    if (row) row.date = date
    else draft.keyDates.push({ label, date })
  })
}

// 供页面做校验：四科名称列表
export const SUBJECT_NAMES = SUBJECTS.map((s) => s.name)