# 灵砚 InkForge

> AI赋能的小说创作平台

🇨🇳 中文 | [English 🇬🇧](README.en.md)

一款基于多Agent系统的智能小说创作工具，帮助作家提升创作效率，释放创意潜能。

## ✨ 核心特性

### 🎯 多Agent创作管线

10个专业角色接力协作，覆盖创作全生命周期：

- **策划 Radar**：需求理解与意图识别
- **大纲师 Planner**：章节规划与情节设计
- **编剧 Composer**：上下文构建与连贯性保证
- **架构师 Architect**：章节结构规划
- **写手 Writer**：正文生成
- **资料员 Observer**：事实提取与记录
- **审核员 Reflector**：自我反思与质量检查
- **校对员 Normalizer**：格式标准化
- **审计员 Auditor**：33维度质量审计
- **修订者 Reviser**：问题修复与优化

### 🤝 7真相文件系统

结构化长期记忆系统，确保长篇小说一致性：

- `current_state.md` — 世界状态（角色位置、关系网络）
- `particle_ledger.md` — 资源账本（物品、金钱、物资）
- `pending_hooks.md` — 未闭合伏笔
- `chapter_summaries.md` — 各章摘要
- `subplot_board.md` — 支线进度板
- `emotional_arcs.md` — 情感弧线
- `character_matrix.md` — 角色交互矩阵

### 🔧 多模型路由

支持国内外主流大模型，Agent级别精细分配：

- OpenAI、Anthropic、Google Gemini
- Moonshot(Kimi)、DeepSeek、智谱
- Ollama本地部署支持

### ✏️ 自定义提示词

每个Agent可独立配置System Prompt，支持：

- 变量注入（`{{book_title}}`、`{{chapter_number}}`等）
- 提示词版本管理与回退
- 全局/作品/章节三级覆盖

## 🎨 Studio风格UI

现代化深色主题创作工作台，可视化创作流程

## 🚀 快速开始

### 环境要求

- Node.js >= 20.x
- Python >= 3.12
- pnpm >= 9.x
- Docker >= 24.x

### 安装依赖

```bash
# 安装前端依赖
cd inkforge/packages/frontend
pnpm install

# 安装后端依赖
cd inkforge/packages/backend
pip install -r requirements.txt
```

### 配置环境变量

```bash
# 复制环境变量模板
cp inkforge/.env.example inkforge/.env

# 编辑环境变量（配置数据库连接、LLM API密钥等）
vim inkforge/.env
```

### 启动开发服务器

```bash
# 启动后端服务 (端口: 8000)
cd inkforge/packages/backend
uvicorn main:app --reload

# 启动前端开发服务器 (端口: 5173)
cd inkforge/packages/frontend
pnpm dev
```

### 使用 Docker Compose

```bash
cd inkforge
docker-compose up -d
```

## 📁 项目结构

```
inkforge/
├── packages/
│   ├── frontend/          # 前端应用
│   │   ├── src/
│   │   │   ├── components/ # 组件
│   │   │   ├── pages/      # 页面
│   │   │   ├── lib/        # 工具函数
│   │   │   └── styles/     # 样式文件
│   │   └── package.json
│   └── backend/           # 后端服务
│       ├── app/            # 应用代码
│       ├── tests/          # 测试文件
│       └── requirements.txt
├── docs/                   # 文档目录
│   └── PRD.md             # 产品需求文档
├── design/                 # 设计文档和原型
├── .env.example           # 环境变量模板
├── docker-compose.yml     # Docker配置
└── README.md              # 项目说明
```

## 🎯 目标用户

| 用户类型         | 特征                | 核心价值                   |
| ------------ | ----------------- | ---------------------- |
| **新手作者**     | 18-25岁，有写作热情但缺乏经验 | 对话式引导完成从构思到章节创作的全流程    |
| **进阶作者**     | 25-35岁，有1-3部已完成作品 | 精细化控制创作质量，提升连载效率和作品一致性 |
| **专业作者/工作室** | 30-45岁，全职作者或小型工作室 | 工业化创作管线，多模型策略组合        |

## 💰 商业模式

| 层级      | 定价             | 核心功能                         |
| ------- | -------------- | ---------------------------- |
| **免费版** | ¥0             | 基础Agent管线、字数限制（≤10万字/月）、社区模型 |
| **专业版** | ¥29/月 或 ¥199/年 | 完整Agent管线、自定义提示词、多模型路由、高级导出  |
| **企业版** | 定制报价           | 私有化部署、专属Agent定制、SLA保障、API接入  |

## 🔧 功能模块

### 1. 创作总览

- 作品统计数据展示（章节数、字数、审计通过率等）
- AI创作建议
- 快捷操作入口

### 2. 作品管理

- 作品列表管理
- 章节编辑
- 内容审计

### 3. Agent配置

- Agent角色定义
- 创作流程配置
- 提示词管理

### 4. 模型配置

- AI模型管理
- API密钥配置
- 服务商管理

## 📖 使用指南

### 创建新作品

1. 点击"新建作品"按钮
2. 输入作品标题和简介
3. 选择创作类型和模板
4. AI建筑师生成大纲/世界观/角色设定
5. 确认或迭代优化后保存

### AI辅助写作

1. 进入作品详情页
2. 点击"写下一章"启动自动化创作管线
3. 管线自动执行：大纲师→编剧→架构师→写手→资料员→审核员→校对员→审计员→修订者
4. 审阅AI生成内容，可继续迭代或确认发布

### 自定义Agent配置

1. 进入Agent配置面板
2. 选择要配置的Agent（如Writer、Auditor等）
3. 选择模型服务商和具体模型
4. 自定义System Prompt（支持变量注入）
5. 全局应用或按作品覆盖

## 🏛️ 技术架构

```
用户层          Web Studio UI → 作品管理 → Agent配置面板
    ↓
Agent管线层     策划→大纲师→编剧→架构师→写手→资料员→审核员→校对员→审计员→修订者
    ↓
基础设施层     7真相文件系统 | LLM Provider Bank | 消息总线 Event Bus
    ↓
数据层          PostgreSQL | Redis缓存 | 文件存储
```

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: 添加新功能描述'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 📧 联系我们

- 作者：<smallletters@sina.com>
- 项目地址：<https://github.com/smallletters/inkforge>

***

**灵砚 InkForge** - 让每一个创作灵感，都能锻造为传世之作 ✍️
