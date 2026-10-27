// @vitest-environment jsdom
// Markdown 目录解析回归测试
import { describe, it, expect } from 'vitest'
import { parseMarkdownToTree } from '../src/utils/markdownTree.js'
// 由 vite 的 ?raw 直接注入源文件内容，避免 node fs 在不同运行环境下的路径限制
import mdRaw from '../src/assets/数二目录.md?raw'

const depthWalk = (nodes, d = 0, acc = []) => {
  for (const n of nodes) {
    acc.push({ d, title: n.title })
    depthWalk(n.children || [], d + 1, acc)
  }
  return acc
}

describe('标题 + 列表混用的层级（原缺陷：标题子节点丢失）', () => {
  it('标题下的列表挂在标题之下，不铺成根节点', () => {
    const md = `#### 高等数学

- **函数、极限与连续**
    - 函数的概念与性质
    - 数列极限的定义
- **一元函数微分学**
    - 导数的定义
`
    const tree = parseMarkdownToTree(md)
    // 只有「高等数学」一个根
    expect(tree.length).toBe(1)
    expect(tree[0].title).toBe('高等数学')
    // 两个二级章节
    expect(tree[0].children.map((c) => c.title)).toEqual(['函数、极限与连续', '一元函数微分学'])
    // 各自挂知识点
    expect(tree[0].children[0].children.map((c) => c.title)).toEqual(['函数的概念与性质', '数列极限的定义'])
    expect(tree[0].children[1].children.map((c) => c.title)).toEqual(['导数的定义'])
  })

  it('多个标题各自成根，列表归属正确', () => {
    const md = `#### 高等数学

- 第一章
    - 1.1
#### 线性代数

- 第二章
    - 2.1
`
    const tree = parseMarkdownToTree(md)
    expect(tree.map((n) => n.title)).toEqual(['高等数学', '线性代数'])
    expect(tree[0].children[0].title).toBe('第一章')
    expect(tree[1].children[0].title).toBe('第二章')
  })

  it('无标题的纯列表按缩进建树', () => {
    const md = `- 一级
  - 二级
    - 三级
- 一级2
`
    const tree = parseMarkdownToTree(md)
    expect(tree.length).toBe(2)
    expect(tree[0].title).toBe('一级')
    expect(tree[0].children[0].title).toBe('二级')
    expect(tree[0].children[0].children[0].title).toBe('三级')
  })
})

describe('真实目录文件（src/assets/数二目录.md）', () => {
  const md = mdRaw

  it('解析出的根节点数量与文件里的标题数一致', () => {
    const tree = parseMarkdownToTree(md)
    const headingCount = md.split(/\r?\n/).filter((l) => /^#{1,6}\s+/.test(l)).length
    expect(tree.length).toBe(headingCount)
  })

  it('高等数学下挂着章节，章节下挂着知识点（不是全部平铺）', () => {
    const tree = parseMarkdownToTree(md)
    const 高数 = tree.find((n) => n.title === '高等数学')
    expect(高数).toBeTruthy()
    expect(高数.children.length).toBeGreaterThan(3)
    // 至少有一章带知识点子节点
    const withKids = 高数.children.filter((c) => (c.children || []).length > 0)
    expect(withKids.length).toBeGreaterThan(3)
  })

  it('不再出现「129 个节点全是根节点」的退化情况', () => {
    const tree = parseMarkdownToTree(md)
    const all = depthWalk(tree)
    expect(all.length).toBeGreaterThan(100)
    // 根节点应为个位数（4 个标题），绝大部分节点在深度 2 及以上
    expect(tree.length).toBeLessThan(10)
    const deep = all.filter((n) => n.d >= 2).length
    expect(deep).toBeGreaterThan(all.length * 0.7)
  })
})