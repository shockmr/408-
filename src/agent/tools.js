// 智能体可调用的工具：read 类直接执行，write 类需用户在对话里确认后才落盘。
// 工具定义为 OpenAI 兼容的 function 描述；为方便页面侧需要同步分科管理章节，
// 章节目录统一并入 store（见 store.js 的 readSyllabus / initSyllabus 等）。
import {
  stateForAgent,
  addDailyTask,
  setTaskStatus,
  deleteDailyTask,
  setStudyDuration,
  setReflection,
  addWrongQuestion,
  setWrongQuestionStatus,
  deleteWrongQuestion,
  addExam,
  deleteExam,
  setMilestone,
  setStageRange,
  setKeyDate,
  initSyllabus,
  setSyllabus,
} from '../store'

const str = (description) => ({ type: 'string', description })
const num = (description) => ({ type: 'number', description })

const DATE = str('日期，格式 YYYY-MM-DD')
const SUBJECT = { type: 'string', enum: ['数二', '英二', '408', '政治'], description: '科目' }

// 每条工具：name / description / input_schema 发给模型；kind 与 run 只在本地使用。
//   kind: 'read'  —— 代理循环里直接执行，无需用户确认
//   kind: 'write' —— 需要用户确认后才执行
export const TOOLS = [
  {
    name: 'get_state',
    kind: 'read',
    description:
      '读取应用当前数据。修改任何数据之前都应先调用它确认现状（任务 ID、错题编号、月考场次、章节结构）。',
    input_schema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: ['timeline', 'daily', 'wrong', 'exam', 'syllabus', 'all'],
          description:
            'timeline=时间轴与关键日期，daily=每日日志，wrong=错题档案，exam=月考记录，syllabus=章节目录',
        },
        date: str('只在 section=daily 时使用，限定某一天；省略则返回全部日期'),
      },
      required: ['section'],
    },
    run: ({ section, date }) => {
      const s = stateForAgent()
      const pick = {
        timeline: () => ({ timeline: s.timeline, keyDates: s.keyDates }),
        daily: () => ({ dailyLogs: date ? { [date]: s.dailyLogs[date] ?? null } : s.dailyLogs }),
        wrong: () => ({ wrongQuestions: s.wrongQuestions }),
        exam: () => ({ exams: s.exams }),
        syllabus: () => ({ syllabus: s.syllabus }),
        all: () => s,
      }
      const data = (pick[section] || pick.all)()
      return JSON.stringify(data, null, 0)
    },
  },

  {
    name: 'navigate_page',
    kind: 'read',
    description: '把右侧内容区切换到指定页面，方便用户看到刚才讨论或改动的内容。',
    input_schema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          enum: ['timeline', 'daily', 'syllabus', 'wrong', 'exam'],
          description: '目标页面',
        },
      },
      required: ['page'],
    },
    run: ({ page }, ctx) => {
      ctx.navigate(page)
      return `已切换到 ${page} 页面`
    },
  },

  // ---------- 章节目录 ----------

  {
    name: 'read_syllabus',
    kind: 'read',
    description: '读取某科目的章节目录树（含层级）。返回结构化的 JSON 文本。',
    input_schema: {
      type: 'object',
      properties: { subject: SUBJECT },
      required: ['subject'],
    },
    run: ({ subject }) => {
      const tree = stateForAgent().syllabus[subject] || []
      return JSON.stringify(tree)
    },
  },

  {
    name: 'set_syllabus',
    kind: 'write',
    // 摘要取 tree 的一级条目数。原来引用的是 i.rootCount，schema 里没有这个字段，
    // 确认卡会显示「写入数二章节目录（ ）」，用户看不出要覆盖多少条。
    summary: (i) => {
      const roots = Array.isArray(i?.tree) ? i.tree.length : 0
      const total = Array.isArray(i?.tree) ? countTreeNodes(i.tree) : 0
      return `覆盖写入${i?.subject || ''}章节目录（${roots} 个一级条目，共 ${total} 个节点）`
    },
    description:
      '整体覆盖某科目的章节目录树。tree 是 { title, children: [...] } 的数组；某节点无子项时 children 可为空数组。用于批量填写/整理章节。注意：这是覆盖操作，原有目录会被整棵替换，调用前务必先 read_syllabus 查看现状。',
    input_schema: {
      type: 'object',
      properties: {
        subject: SUBJECT,
        tree: {
          type: 'array',
          description: '目录树节点数组，每项 { title: string, children: array }',
          items: {
            type: 'object',
            properties: {
              title: str('条目名'),
              children: { type: 'array', description: '子条目数组，可嵌套', items: { type: 'object' } },
            },
            required: ['title'],
          },
        },
      },
      required: ['subject', 'tree'],
    },
    run: ({ subject, tree }) => {
      const before = countTreeNodes(stateForAgent().syllabus?.[subject] || [])
      setSyllabus(subject, tree)
      const after = countTreeNodes(stateForAgent().syllabus?.[subject] || [])
      return `已写入 ${subject} 章节目录：${before} → ${after} 个节点`
    },
  },

  // ---------- 每日日志 ----------

  {
    name: 'add_daily_task',
    kind: 'write',
    summary: (i) => `派发任务：${i.date} · ${i.subject} · ${i.title}`,
    description: '在某一天的日志里新增一条学习任务。任务 ID 由系统自动生成。',
    input_schema: {
      type: 'object',
      properties: {
        date: DATE,
        subject: SUBJECT,
        title: str('任务内容，例如「高数·定积分 刷 20 题」'),
        stage: { type: 'string', enum: ['基础', '强化', '冲刺', '复习'], description: '任务所属阶段' },
        status: { type: 'string', enum: ['pending', 'done', 'undone'], description: '初始状态，默认 pending' },
      },
      required: ['date', 'subject', 'title'],
    },
    run: (i) => `已新增任务 ${addDailyTask(i)}`,
  },

  {
    name: 'set_task_status',
    kind: 'write',
    summary: (i) => `任务 ${i.taskId} → ${{ done: '已完成', undone: '未完成', pending: '待完成' }[i.status]}`,
    description: '修改某条已有任务的完成状态。taskId 必须来自 get_state 的真实数据，不要臆造。',
    input_schema: {
      type: 'object',
      properties: {
        date: DATE,
        taskId: str('任务 ID，形如 T-0824-01'),
        status: { type: 'string', enum: ['done', 'undone', 'pending'], description: '目标状态' },
        reason: str('未完成的原因，仅在 status=undone 时填写'),
      },
      required: ['date', 'taskId', 'status'],
    },
    run: (i) => (setTaskStatus(i) ? `已更新任务 ${i.taskId}` : `找不到任务 ${i.taskId}，请先用 get_state 确认 ID`),
  },

  {
    name: 'delete_daily_task',
    kind: 'write',
    summary: (i) => `删除任务 ${i.date} · ${i.taskId}`,
    description: '删除某天的某条任务。taskId 必须来自 get_state 的真实数据。用户说「删掉这条任务」时才用。',
    input_schema: {
      type: 'object',
      properties: {
        date: DATE,
        taskId: str('任务 ID，形如 T-0824-01'),
      },
      required: ['date', 'taskId'],
    },
    run: (i) => (deleteDailyTask(i) ? `已删除任务 ${i.taskId}` : `找不到任务 ${i.taskId}，请先用 get_state 确认 ID`),
  },

  {
    name: 'set_study_duration',
    kind: 'write',
    summary: (i) => `${i.date} · ${i.subject} 学习时长 → ${i.hours}h`,
    description: '记录某天某科的学习时长（小时），会覆盖该科当天的原有数值。',
    input_schema: {
      type: 'object',
      properties: { date: DATE, subject: SUBJECT, hours: num('小时数，可带小数') },
      required: ['date', 'subject', 'hours'],
    },
    run: (i) => {
      setStudyDuration(i)
      return `已记录 ${i.subject} ${i.hours} 小时`
    },
  },

  {
    name: 'set_reflection',
    kind: 'write',
    summary: (i) => `写入 ${i.date} 的复盘`,
    description: '写入某天的复盘文字（卡点、明日计划等），会覆盖当天原有复盘。',
    input_schema: {
      type: 'object',
      properties: { date: DATE, text: str('复盘正文') },
      required: ['date', 'text'],
    },
    run: (i) => {
      setReflection(i)
      return '已写入复盘'
    },
  },

  // ---------- 错题档案 ----------

  {
    name: 'add_wrong_question',
    kind: 'write',
    summary: (i) => `录错题：${i.subject} · ${i.module} · ${i.topic}`,
    description: '往错题档案里新增一道错题。编号自动生成。',
    input_schema: {
      type: 'object',
      properties: {
        subject: SUBJECT,
        module: str('章节，例如「数据结构」「高数·定积分」'),
        topic: str('知识点，例如「二叉树遍历」'),
        reason: str('错误原因，例如「计算失误」「概念混淆」'),
        status: { type: 'string', enum: ['待复习', '已掌握'], description: '掌握状态，默认待复习' },
      },
      required: ['subject', 'module', 'topic', 'reason'],
    },
    run: (i) => `已录入错题 ${addWrongQuestion(i)}`,
  },

  {
    name: 'set_wrong_question_status',
    kind: 'write',
    summary: (i) => `错题 ${i.id} → ${i.status}`,
    description: '修改某道错题的掌握状态。id 必须来自 get_state。',
    input_schema: {
      type: 'object',
      properties: {
        id: str('错题编号，形如 C-数二-001'),
        status: { type: 'string', enum: ['待复习', '已掌握'], description: '目标状态' },
      },
      required: ['id', 'status'],
    },
    run: (i) => (setWrongQuestionStatus(i) ? `已更新 ${i.id}` : `找不到错题 ${i.id}`),
  },

  {
    name: 'delete_wrong_question',
    kind: 'write',
    summary: (i) => `删除错题 ${i.id}`,
    description: '删除某道错题。id 必须来自 get_state。',
    input_schema: {
      type: 'object',
      properties: {
        id: str('错题编号，形如 C-数二-001'),
      },
      required: ['id'],
    },
    run: (i) => (deleteWrongQuestion(i) ? `已删除错题 ${i.id}` : `找不到错题 ${i.id}`),
  },

  // ---------- 月考 ----------

  {
    name: 'add_exam',
    kind: 'write',
    summary: (i) => `录入${i.name}：${i.subjects.map((s) => `${s.subject} ${s.score}`).join('，')}`,
    description:
      '录入一场月考成绩。总分、得分率、与上一场的趋势都会自动计算，不要自己算。满分默认：数二150、英二100、408为150、政治100。',
    input_schema: {
      type: 'object',
      properties: {
        name: str('场次名称，例如「月考①」'),
        date: DATE,
        subjects: {
          type: 'array',
          description: '各科分数',
          items: {
            type: 'object',
            properties: { subject: SUBJECT, full: num('该科满分'), score: num('该科得分') },
            required: ['subject', 'full', 'score'],
          },
        },
        errors: {
          type: 'array',
          description: '模块化错误表，可省略',
          items: {
            type: 'object',
            properties: {
              subject: SUBJECT,
              modules: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    module: str('模块名'),
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          topic: str('知识点'),
                          count: num('错误数'),
                          lost: num('失分'),
                          reason: str('错误原因'),
                        },
                        required: ['topic', 'count', 'lost', 'reason'],
                      },
                    },
                  },
                  required: ['module', 'items'],
                },
              },
            },
            required: ['subject', 'modules'],
          },
        },
      },
      required: ['name', 'date', 'subjects'],
    },
    run: (i) => {
      addExam(i)
      return `已录入 ${i.name}`
    },
  },

  {
    name: 'delete_exam',
    kind: 'write',
    summary: (i) => `删除月考 ${i.name}（${i.date}）`,
    description: '删除一整场月考记录（含各科分数与错误表）。name 与 date 必须与 get_state 里的记录完全一致。',
    input_schema: {
      type: 'object',
      properties: {
        name: str('场次名称，例如「月考①」'),
        date: DATE,
      },
      required: ['name', 'date'],
    },
    run: (i) => (deleteExam(i) ? `已删除 ${i.name}` : `找不到 ${i.name}（${i.date}），请先用 get_state 确认`),
  },

  // ---------- 时间轴 ----------

  {
    name: 'set_milestone',
    kind: 'write',
    summary: (i) => `${i.stage} · ${i.subject} · ${i.title} → ${i.done ? '已完成' : '未完成'}`,
    description: '勾选或取消勾选时间轴上的某个里程碑。三个参数必须与 get_state 里的文字完全一致。',
    input_schema: {
      type: 'object',
      properties: {
        stage: { type: 'string', enum: ['基础阶段', '强化阶段', '冲刺阶段'], description: '阶段' },
        subject: SUBJECT,
        title: str('里程碑名称，例如「高数基础」'),
        done: { type: 'boolean', description: '是否已完成' },
      },
      required: ['stage', 'subject', 'title', 'done'],
    },
    run: (i) => (setMilestone(i) ? '已更新里程碑' : `找不到里程碑「${i.title}」，请先用 get_state 确认名称`),
  },

  {
    name: 'set_stage_range',
    kind: 'write',
    summary: (i) => `${i.stage} 时间范围 → ${i.start || '—'} 至 ${i.end || '—'}`,
    description: '设置某个阶段的起止日期，用于填掉时间轴上的 ____ 占位。',
    input_schema: {
      type: 'object',
      properties: {
        stage: { type: 'string', enum: ['基础阶段', '强化阶段', '冲刺阶段'], description: '阶段' },
        start: str('开始日期 YYYY-MM-DD'),
        end: str('结束日期 YYYY-MM-DD'),
      },
      required: ['stage'],
    },
    run: (i) => (setStageRange(i) ? '已更新阶段时间' : `找不到阶段 ${i.stage}`),
  },

  {
    name: 'set_key_date',
    kind: 'write',
    summary: (i) => `关键日期「${i.label}」→ ${i.date}`,
    description: '设置关键日期（报名、现场确认、初试、月考等），用于填掉 ____ 占位。label 不存在时会新增一项。',
    input_schema: {
      type: 'object',
      properties: { label: str('名称，例如「初试」'), date: DATE },
      required: ['label', 'date'],
    },
    run: (i) => {
      setKeyDate(i)
      return `已设置「${i.label}」为 ${i.date}`
    },
  },
]

const BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

export const getTool = (name) => BY_NAME[name]

// 发给 API 的 OpenAI 兼容 function 列表：剥掉本地字段 kind / summary / run
export const toolSchemas = TOOLS.map(({ name, description, input_schema }) => ({
  type: 'function',
  function: { name, description, parameters: input_schema },
}))

// 写操作在确认卡片上的中文描述
export function describeToolUse(name, input) {
  const tool = BY_NAME[name]
  if (!tool) return name
  try {
    return tool.summary?.(input) ?? tool.description
  } catch {
    return tool.description
  }
}

// 目录树节点总数，用于确认卡与执行结果里的量级提示
function countTreeNodes(tree) {
  if (!Array.isArray(tree)) return 0
  return tree.reduce((n, node) => n + 1 + countTreeNodes(node?.children), 0)
}

// 导入时初始化：把章节目录树并入 store，页面借此与智能体共享同一份数据。
// 仅在尚未存在于 store 时执行一次（store 内部保证幂等）。
initSyllabus()
