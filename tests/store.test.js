// @vitest-environment jsdom
// 数据层回归测试：覆盖本次修复的缺陷
// 运行：npx vitest run
import { describe, it, expect, beforeEach, vi } from 'vitest'

// 每个用例前清空存储并重置模块缓存，拿到全新初始化的 store 实例
let store

async function freshStore() {
  localStorage.clear()
  sessionStorage.clear()
  vi.resetModules()
  return import('../src/store.js')
}

beforeEach(async () => {
  store = await freshStore()
})

describe('种子与初始化', () => {
  it('四科章节目录都存在且数二有内容', () => {
    const s = store.getState()
    for (const sub of ['数二', '英二', '408', '政治']) {
      expect(Array.isArray(s.syllabus[sub])).toBe(true)
    }
    expect(s.syllabus['数二'].length).toBeGreaterThan(0)
  })

  it('六个数据域齐全', () => {
    const s = store.getState()
    for (const k of ['timeline', 'keyDates', 'dailyLogs', 'wrongQuestions', 'exams', 'syllabus']) {
      expect(s[k]).toBeDefined()
    }
  })
})

describe('版本迁移（缺陷1：升级不清空用户数据）', () => {
  it('旧版数据升级后保留原有内容，不清回种子', async () => {
    // 写一份 v2 的旧数据，含用户自建内容
    const old = {
      version: 2,
      timeline: [{ stage: '基础阶段', start: '2026-03-01', end: '2026-06-30', subjects: [] }],
      keyDates: [{ label: '初试', date: '2026-12-19' }],
      dailyLogs: { '2026-09-01': { day: 1, tasks: [{ id: 'T-0901-01', subject: '数二', title: '老任务', stage: '基础', status: 'done' }], durations: [], reflection: '老复盘' } },
      wrongQuestions: { 数二: { 高数: [{ id: 'C-数二-001', topic: '极限', reason: '算错', status: '待复习' }] } },
      exams: [],
      syllabus: { 数二: [{ id: 'keep-1', title: '我自己的章节', children: [] }], 英二: [], 408: [], 政治: [] },
    }
    localStorage.setItem('study-progress-state', JSON.stringify(old))

    vi.resetModules()
    const mod = await import('../src/store.js')
    const s = mod.getState()
    expect(s.version).toBe(3)
    // 用户数据必须原样保留
    expect(s.dailyLogs['2026-09-01'].reflection).toBe('老复盘')
    expect(s.dailyLogs['2026-09-01'].tasks[0].title).toBe('老任务')
    expect(s.keyDates[0].date).toBe('2026-12-19')
    expect(s.wrongQuestions['数二']['高数'][0].topic).toBe('极限')
    expect(s.syllabus['数二'][0].title).toBe('我自己的章节')
    // 迁移前的原始数据应留了快照
    expect(localStorage.getItem('study-progress-state-backup')).toBeTruthy()
  })

  it('损坏的 JSON 不静默丢弃，先备份原文', async () => {
    localStorage.setItem('study-progress-state', '{坏掉的 json')
    vi.resetModules()
    const mod = await import('../src/store.js')
    expect(mod.getState().timeline.length).toBeGreaterThan(0)
    expect(localStorage.getItem('study-progress-state-backup')).toBe('{坏掉的 json')
    expect(mod.getLastError()?.message).toContain('解析失败')
  })

  it('缺章的旧数据按科补齐，不清空已有科目', async () => {
    const old = {
      version: 2,
      dailyLogs: {},
      syllabus: { 数二: [{ id: 'x', title: '保留我', children: [] }] },
    }
    localStorage.setItem('study-progress-state', JSON.stringify(old))
    vi.resetModules()
    const mod = await import('../src/store.js')
    const s = mod.getState()
    expect(s.syllabus['数二'][0].title).toBe('保留我')
    expect(Array.isArray(s.syllabus['408'])).toBe(true)
  })
})

describe('任务 ID（缺陷5：基于 length+1 会撞号）', () => {
  it('删除中间任务后新增不回退撞号', () => {
    const date = '2026-09-01'
    const a = store.addDailyTask({ date, subject: '数二', title: 'A' })
    const b = store.addDailyTask({ date, subject: '数二', title: 'B' })
    const c = store.addDailyTask({ date, subject: '数二', title: 'C' })
    expect(a).toBe('T-0901-01')
    expect(b).toBe('T-0901-02')
    expect(c).toBe('T-0901-03')

    expect(store.deleteDailyTask({ date, taskId: b })).toBe(true)
    const d = store.addDailyTask({ date, subject: '数二', title: 'D' })
    // 旧实现会生成 T-0901-03 与 c 撞号
    expect(d).toBe('T-0901-04')
    // 全部 ID 唯一
    const ids = store.getState().dailyLogs[date].tasks.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('日志 day 序号按日期算，补录旧日期不打乱顺序', () => {
    // 种子自带 2026-08-24 一天，作为基线
    const seedDay = store.getState().dailyLogs['2026-08-24'].day
    expect(seedDay).toBe(1)

    store.addDailyTask({ date: '2026-09-10', subject: '数二', title: 'A' })
    store.addDailyTask({ date: '2026-09-20', subject: '数二', title: 'B' })
    // 补录中间日期：旧实现按「日志条数+1」会给它 3，把它排到最后
    store.addDailyTask({ date: '2026-09-15', subject: '数二', title: 'C' })

    const logs = store.getState().dailyLogs
    const order = Object.keys(logs).sort()
    const days = order.map((d) => logs[d].day)
    // day 应随日期单调递增，且连续
    expect(days).toEqual([1, 2, 3, 4])
    expect(logs['2026-09-15'].day).toBe(3)
    expect(logs['2026-09-20'].day).toBe(4)
  })
})

describe('错题 ID', () => {
  it('删除后再新增不回退撞号', () => {
    // 用一个种子没有错题的科目，编号从 001 起；种子里数二已有 001/002
    const id1 = store.addWrongQuestion({ subject: '英二', module: '阅读', topic: '转折词', reason: '漏读' })
    const id2 = store.addWrongQuestion({ subject: '英二', module: '阅读', topic: '指代', reason: '粗心' })
    expect(id1).toBe('C-英二-001')
    expect(id2).toBe('C-英二-002')

    store.deleteWrongQuestion({ id: id1 })
    const id3 = store.addWrongQuestion({ subject: '英二', module: '阅读', topic: '主旨', reason: '偏题' })
    // 旧实现按 count+1 会给 002，与 id2 撞号
    expect(id3).toBe('C-英二-003')

    // 全部 ID 唯一
    const all = Object.values(store.getState().wrongQuestions['英二']).flat().map((q) => q.id)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('月考趋势（缺陷3：只对比数组末位）', () => {
  it('补录旧场次后，趋势仍按时间顺序计算', () => {
    const seedCount = store.getState().exams.length
    store.addExam({ name: 'A', date: '2026-09-10', subjects: [{ subject: '数二', full: 150, score: 90 }, { subject: '英二', full: 100, score: 60 }] })
    store.addExam({ name: 'C', date: '2026-10-10', subjects: [{ subject: '数二', full: 150, score: 110 }, { subject: '英二', full: 100, score: 70 }] })
    // 补录中间场次
    store.addExam({ name: 'B', date: '2026-09-25', subjects: [{ subject: '数二', full: 150, score: 100 }, { subject: '英二', full: 100, score: 65 }] })

    const exams = store.getState().exams
    const get = (n) => exams.find((e) => e.name === n)
    // B 对比 A：90 → 100
    expect(get('B').subjects.find((s) => s.subject === '数二').trend).toBe('↑ 10 分')
    // C 对比 B：100 → 110（旧实现会拿数组末位 B 当基准，得到错误结果甚至方向相反）
    expect(get('C').subjects.find((s) => s.subject === '数二').trend).toBe('↑ 10 分')
    // 数组按日期升序
    const dates = exams.map((e) => e.date)
    expect(dates).toEqual([...dates].sort())
  })

  it('删除月考只移除目标场次', () => {
    const before = store.getState().exams.length
    store.addExam({ name: 'A', date: '2026-09-10', subjects: [{ subject: '数二', full: 150, score: 90 }] })
    store.addExam({ name: 'B', date: '2026-10-10', subjects: [{ subject: '数二', full: 150, score: 95 }] })
    expect(store.getState().exams.length).toBe(before + 2)
    expect(store.deleteExam({ name: 'A', date: '2026-09-10' })).toBe(true)
    expect(store.getState().exams.length).toBe(before + 1)
    expect(store.getState().exams.some((e) => e.name === 'A')).toBe(false)
    expect(store.getState().exams.some((e) => e.name === 'B')).toBe(true)
  })

  it('总分与得分率自动汇总', () => {
    store.addExam({
      name: '合计',
      date: '2026-11-01',
      subjects: [
        { subject: '数二', full: 150, score: 100 },
        { subject: '英二', full: 100, score: 80 },
        { subject: '408', full: 150, score: 90 },
        { subject: '政治', full: 100, score: 70 },
      ],
    })
    const e = store.getState().exams.find((x) => x.name === '合计')
    expect(e.total.score).toBe(340)
    expect(e.total.full).toBe(500)
    expect(e.total.rate).toBe('68%')
  })
})

describe('备份导入导出', () => {
  it('导出后可原样导入', () => {
    store.addDailyTask({ date: '2026-09-01', subject: '英二', title: '阅读精读' })
    const json = store.exportJSON()
    expect(JSON.parse(json).version).toBe(3)
    const r = store.importJSON(json)
    expect(r.ok).toBe(true)
    expect(store.getState().dailyLogs['2026-09-01'].tasks[0].title).toBe('阅读精读')
  })

  it('非法输入被拒绝且不改动现有数据', () => {
    store.addDailyTask({ date: '2026-09-01', subject: '英二', title: '保留我' })
    const before = JSON.stringify(store.getState())
    expect(store.importJSON('not json').ok).toBe(false)
    expect(store.importJSON('[]').ok).toBe(false)
    expect(store.importJSON('{"foo":1}').ok).toBe(false)
    expect(JSON.stringify(store.getState())).toBe(before)
  })

  it('缺字段的旧备份能补全，显式空数组被保留', () => {
    const r = store.importJSON(JSON.stringify({ version: 1, exams: [] }))
    expect(r.ok).toBe(true)
    const s = store.getState()
    expect(s.exams).toEqual([])
    expect(s.timeline.length).toBeGreaterThan(0)
    expect(s.syllabus['数二'].length).toBeGreaterThan(0)
  })
})

describe('附件元数据（缺陷2：base64 撑爆 localStorage）', () => {
  it('写入含 data 字段的树后，state 里只留元数据', () => {
    const dataUrl = 'data:text/plain;base64,' + 'a'.repeat(500)
    store.setSyllabus('数二', [
      {
        id: 'n1',
        title: '测试章节',
        children: [],
        attachments: [{ id: 'a1', name: 'x.txt', type: 'txt', size: 5, data: dataUrl }],
      },
    ])
    const node = store.getState().syllabus['数二'][0]
    expect(node.attachments[0].name).toBe('x.txt')
    expect(node.attachments[0].data).toBeUndefined()
    // 落盘的字符串里不应出现 base64 大块
    expect(localStorage.getItem('study-progress-state').length).toBeLessThan(200_000)
  })
})

describe('存储失败上报（缺陷2：静默吞掉配额错误）', () => {
  it('写入超配额时上报错误而不是静默失败', () => {
    const mod = store
    // 模拟配额满：覆盖 Storage.prototype 上的 setItem（在 localStorage 实例上
    // 直接 defineProperty 对 jsdom 无效，必须走原型）
    const orig = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value: () => {
        const e = new Error('quota')
        e.name = 'QuotaExceededError'
        throw e
      },
    })
    try {
      mod.addDailyTask({ date: '2026-09-02', subject: '数二', title: '会失败的写入' })
      // 内存里的改动仍生效，但必须有错误上报
      expect(mod.getLastError()?.message).toContain('存储已满')
      expect(mod.getState().dailyLogs['2026-09-02'].tasks.length).toBe(1)
    } finally {
      if (orig) Object.defineProperty(Storage.prototype, 'setItem', orig)
    }
  })

  it('clearPersistError 能清掉提示', () => {
    store.clearPersistError()
    expect(store.getLastError()).toBe(null)
  })
})