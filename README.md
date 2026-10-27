# 考研进度追踪 · Study Progress App

> 408 考研进度记录智能体：一个纯前端、本地化的考研复习管理系统 —— 追踪时间轴、每日日志、章节目录、错题档案与月考成绩，并内置 AI 智能助手，用自然语言帮你录入和查询数据。

**当前版本：v1.0.0**（数据协议 VERSION 3）

**线上地址：http://124.221.222.190/kaoyan/** · 部署与更新见 [DEPLOY.md](./DEPLOY.md)

## ✨ 功能特性

- **总时间轴**：基础 / 强化 / 冲刺三阶段 × 四科目的里程碑进度可视化，含整体与分阶段进度条
- **每日日志**：管理每日学习任务、各科时长与复盘（时长失焦才落盘，支持任务增删与状态流转）
- **章节目录**：树形知识点目录，支持手动维护与批量导入
  - 支持上传 **Markdown / Excel（.xlsx .xls .csv）/ Word 表格（.docx）** 自动解析
  - 内置可下载的上传模板（一级 / 二级 / 三级目录列）
  - 408 模块按一级目录查重，重复条目不重复添加
  - 叶子节点可挂 **Word / 图片 / PDF 附件**（≤20MB，存 IndexedDB）或**手写内容**（支持 Markdown 渲染预览）
- **错题档案**：四科恒定展示，按状态筛选，记录错误原因与掌握状态，支持配图与删除
- **月考分析**：列表 → 详情两级视图，各科得分率、趋势与模块化错误表，支持删除场次
- **AI 智能助手**：对话式操作数据，内置 17 个工具（3 读 / 14 写），写操作需确认后落盘
- **数据备份**：侧边栏一键导出/导入 JSON，迁移前自动留快照，重置前自动下载备份

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 框架 | React 19 + Vite 8 |
| 样式 | Tailwind CSS 4 |
| 表格解析 | SheetJS（xlsx，按需懒加载）+ JSZip |
| Markdown | marked + hast-util-sanitize（白名单消毒后渲染） |
| 数据持久化 | `localStorage`（结构化状态）+ `IndexedDB`（附件二进制），纯前端无后端 |
| AI 集成 | OpenAI 兼容 API（中转站模式） |
| 质量校验 | oxlint + Vitest + Playwright |

## 📁 数据模型

| 数据域 | 说明 |
|--------|------|
| 时间轴 `timeline` | 3 阶段 × 4 科目 × 里程碑 |
| 关键日期 `keyDates` | 报名、现场确认、初试等重要节点 |
| 每日日志 `dailyLogs` | 每日任务、学习时长、复盘 |
| 错题档案 `wrongQuestions` | 按科目分类的错题 |
| 月考分析 `exams` | 场次成绩、得分率、模块化错误表 |
| 章节目录 `syllabus` | 各科目章节树、叶子内容与附件元数据 |

**科目配置**：数学二（150）· 英语二（100）· 408（150）· 政治（100）

**存储位置**：

| 键名 | 内容 |
|------|------|
| `study-progress-state` | 全部结构化状态（VERSION 3） |
| `study-progress-state-backup` | 迁移/重置前的自动快照 |
| `study-progress-chat`（sessionStorage） | 对话历史 |
| `study-progress-attachments`（IndexedDB） | 附件二进制实体 |

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview

# 质量校验
npx oxlint src          # 静态检查
npx vitest run          # 单元测试
node tests/e2e.mjs      # 页面 e2e（需 dev server 在 5199 端口）
node tests/e2e-attach.mjs
```

首次使用请在「智能助手」右上角设置中配置中转站地址、模型名与 API Key（点击「测速」可验证连接）。

## 📂 项目结构

```
src/
├── main.jsx              # 入口
├── App.jsx               # 主控制器（AI 循环 + 路由）
├── store.js              # 数据层（localStorage + 字段级迁移 + 错误通道）
├── data.js               # 种子数据 + 科目配置
├── agent/                # AI 智能体
│   ├── client.js         # API 客户端
│   ├── tools.js          # 工具定义（17 个）
│   ├── systemPrompt.js   # 系统提示词
│   └── files.js          # 文件上传处理
├── components/           # 对话面板、备份面板、图标
├── pages/                # 5 个数据页面
└── utils/                # Markdown/表格解析、附件层、安全渲染、对话持久化
```

## 📝 说明

- 数据保存在浏览器本地，仅适合个人单机使用，请勿部署到公网（API Key 明文存储）。
- 换设备或换浏览器时，请先用「数据备份 → 导出备份」，再到新环境导入。附件实体存在 IndexedDB，不在备份 JSON 内，需重新上传。
- 如需多设备同步或团队协作，需后续开发后端服务。
