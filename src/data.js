// 考研进度追踪 —— 模拟数据（占位符，后续由智能体解析真实数据填充）

// 四科配置
export const SUBJECTS = [
  { id: 'math', name: '数二', color: '#3b82f6' },
  { id: 'english', name: '英二', color: '#10b981' },
  { id: 'cs', name: '408', color: '#8b5cf6' },
  { id: 'politics', name: '政治', color: '#f59e0b' },
]

export const STAGES = ['基础阶段', '强化阶段', '冲刺阶段']

// 总时间轴：每科 × 三阶段的节点（占位符日期待填）
export const TIMELINE = [
  {
    stage: '基础阶段',
    start: '____', // 待填
    end: '____',
    subjects: [
      { subject: '数二', milestones: [{ title: '高数基础', done: true }, { title: '线代基础', done: false }] },
      { subject: '英二', milestones: [{ title: '词汇一轮', done: true }, { title: '长难句', done: true }, { title: '阅读入门', done: false }] },
      { subject: '408', milestones: [{ title: '数据结构', done: false }, { title: '组成原理', done: false }, { title: '操作系统', done: false }, { title: '计算机网络', done: false }] },
      { subject: '政治', milestones: [{ title: '基础阶段暂缓', done: false }] },
    ],
  },
  {
    stage: '强化阶段',
    start: '____',
    end: '____',
    subjects: [
      { subject: '数二', milestones: [{ title: '强化刷题', done: false }, { title: '真题一轮', done: false }] },
      { subject: '英二', milestones: [{ title: '阅读精刷', done: false }, { title: '写作模板', done: false }, { title: '翻译', done: false }] },
      { subject: '408', milestones: [{ title: '四子科强化', done: false }, { title: '真题/模拟', done: false }] },
      { subject: '政治', milestones: [{ title: '1000题', done: false }, { title: '背诵手册一轮', done: false }] },
    ],
  },
  {
    stage: '冲刺阶段',
    start: '____',
    end: '____',
    subjects: [
      { subject: '数二', milestones: [{ title: '真题二轮', done: false }, { title: '错题复盘', done: false }, { title: '模拟卷', done: false }] },
      { subject: '英二', milestones: [{ title: '套卷模考', done: false }, { title: '作文押题', done: false }] },
      { subject: '408', milestones: [{ title: '全真模拟', done: false }, { title: '高频考点', done: false }] },
      { subject: '政治', milestones: [{ title: '肖四肖八', done: false }, { title: '时政', done: false }, { title: '大题背诵', done: false }] },
    ],
  },
]

// 关键日期
export const KEY_DATES = [
  { label: '报名', date: '____' },
  { label: '现场确认', date: '____' },
  { label: '初试', date: '____' },
  { label: '月考①', date: '____' },
  { label: '月考②', date: '____' },
  { label: '月考③', date: '____' },
]

// 每日日志（示例日期）
export const DAILY_LOGS = {
  '2026-08-24': {
    day: 1,
    tasks: [
      { id: 'T-0824-01', subject: '数二', title: '高数·定积分 刷 20 题', stage: '强化', status: 'done' },
      { id: 'T-0824-02', subject: '408', title: '数据结构·树 过一遍', stage: '基础', status: 'undone', reason: '时间不足，顺延' },
      { id: 'T-0824-03', subject: '英二', title: '阅读 2 篇精读', stage: '基础', status: 'done' },
      { id: 'T-0824-04', subject: '数二', title: '复习：微分中值定理', stage: '复习', status: 'pending' },
    ],
    durations: [
      { subject: '数二', hours: 2.5 },
      { subject: '英二', hours: 1 },
      { subject: '408', hours: 1 },
      { subject: '政治', hours: 0 },
    ],
    reflection: '今日卡点：定积分换元法容易漏掉上下限变换。明日计划：补数据结构·树。',
  },
}

// 错题档案
export const WRONG_QUESTIONS = {
  '408': {
    '数据结构': [
      { id: 'C-408-DS-001', img: '错题/408错题/数据结构/xxx.jpg', topic: '二叉树遍历', reason: '概念混淆', status: '待复习' },
      { id: 'C-408-DS-002', img: '错题/408错题/数据结构/yyy.jpg', topic: '哈夫曼树', reason: '计算失误', status: '已掌握' },
    ],
    '计算机组成原理': [],
  },
  '数二': {
    '高数·定积分': [
      { id: 'C-数二-001', img: '错题/数二错题/定积分/xxx.jpg', topic: '换元积分', reason: '计算失误', status: '已掌握' },
      { id: 'C-数二-002', img: '错题/数二错题/定积分/yyy.jpg', topic: '分部积分', reason: '公式记错', status: '待复习' },
    ],
  },
}

// 月考分析
export const EXAMS = [
  {
    name: '月考①',
    date: '____',
    total: { full: 500, score: 312, rate: '62.4%' },
    subjects: [
      { subject: '数二', full: 150, score: 90, rate: '60%', trend: '↑ 5 分' },
      { subject: '英二', full: 100, score: 72, rate: '72%', trend: '—' },
      { subject: '408', full: 150, score: 85, rate: '56.7%', trend: '↓ 3 分' },
      { subject: '政治', full: 100, score: 65, rate: '65%', trend: '—' },
    ],
    errors: [
      {
        subject: '数二',
        modules: [
          { module: '高数·定积分', items: [{ topic: '换元积分', count: 2, lost: 8, reason: '计算失误' }] },
          { module: '线代·特征值', items: [{ topic: '特征值求解', count: 1, lost: 5, reason: '概念不清' }] },
        ],
      },
      {
        subject: '408',
        modules: [
          { module: '数据结构·树', items: [{ topic: '二叉树遍历', count: 3, lost: 12, reason: '遍历顺序混淆' }] },
        ],
      },
    ],
  },
]
