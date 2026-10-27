// 目录树解析：把 Markdown 标题/列表层级解析成任意深度的树

/**
 * 解析 Markdown 文本为目录树。
 * 规则：
 *  - `#` ~ `######` 标题 → 节点，层级由 # 数量决定（1个# = level 0，…）
 *  - `- ` / `* ` 列表项 → 节点，层级由前导缩进决定
 *  - 列表项内的更深缩进项作为子节点
 *
 * 关键一：标题与列表属于两套层级坐标。考研教材常用「#### 高等数学」配「- 章节」
 * 的写法，若把标题 level 和列表 level 直接混在同一坐标系里比较，
 * 列表的 level 0 会低于标题的 level 3，导致标题下的所有条目被平铺成根节点。
 * 因此列表层级一律相对「当前所在标题」递进：level = 标题 level + 1 + 相对缩进级。
 *
 * 关键二：缩进宽度不一定是 2 空格。真实教材目录里 4 空格缩进很常见（本项目的
 * 数二目录就是「2 空格写章、4 空格写知识点」）。若固定按「每 2 空格一级」折算，
 * 4 空格会算出 2 级，层级出现空洞（4 → 6，缺 5 级），后续混排时父子关系会漂移。
 * 因此改为「缩进宽度栈」：见过的缩进宽度按大小入栈，相对级别 = 它在栈中的下标，
 * 与具体空格数解耦，2 空格 / 4 空格 / tab / 混排都能得到正确层级。
 *
 * 返回: [{ id, title, children: [...] }]
 */
export function parseMarkdownToTree(md) {
  const lines = md.split(/\r?\n/)

  const roots = []
  const stack = [] // [{ level, node }]

  let headingLevel = -1 // 最近一个标题的 level；-1 表示还没遇到标题
  // 缩进宽度栈：见过的层级缩进宽度（升序）。列表项的相对级别 = 它在栈中的下标
  let indentStack = []

  const addNode = (level, title) => {
    const node = { id: genId(), title, children: [] }
    if (level === 0 || stack.length === 0) {
      roots.push(node)
      stack.length = 0
      stack.push({ level, node })
      return node
    }
    // 弹出比当前层级深或相等的栈顶，找到父级
    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop()
    }
    const parent = stack.length ? stack[stack.length - 1].node : null
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push({ level, node })
    return node
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) continue

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = h[1].length - 1 // # -> 0
      const title = h[2].replace(/\*\*/g, '').trim()
      if (!title) continue
      addNode(level, title)
      headingLevel = level
      // 新标题下的列表重新计基准缩进
      indentStack = []
      continue
    }

    // 列表项（- 或 * 开头，前面可能有缩进）
    const li = line.match(/^(\s*)[-*]\s+(.*)$/)
    if (li) {
      // tab 视作 4 个空格，避免 tab 缩进被算成 1 个字符宽
      const indent = li[1].replace(/\t/g, '    ').length
      // 维护升序缩进栈：弹出所有比当前更深的层级，再决定是否新增一层
      while (indentStack.length && indentStack[indentStack.length - 1] > indent) {
        indentStack.pop()
      }
      if (!indentStack.length || indentStack[indentStack.length - 1] < indent) {
        indentStack.push(indent)
      }
      const rel = indentStack.length - 1
      // 有标题时挂在标题下一层，否则退化为绝对层级
      const level = headingLevel >= 0 ? headingLevel + 1 + rel : rel
      const title = li[2].replace(/\*\*/g, '').trim()
      if (title) addNode(level, title)
      continue
    }
  }

  return roots
}

// 节点 id 生成（自增计数器 + 随机后缀，避免跨会话撞号）
let counter = 0
export function genNodeId() {
  return 'n' + ++counter + '_' + Math.random().toString(36).slice(2, 8)
}

const genId = genNodeId