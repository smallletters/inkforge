# InkForge

> AI-Powered Novel Writing Platform

🇬🇧 English | [中文 🇨🇳](README.md)

An intelligent novel writing tool based on multi-agent system, helping writers boost productivity and unleash creativity.

## ✨ Core Features

### 🎯 Multi-Agent Writing Pipeline
10 specialized roles working together to cover the entire writing lifecycle:
- **Planner (策划)**: Intent understanding and recognition
- **Outline Master (大纲师)**: Chapter planning and plot design
- **Scriptwriter (编剧)**: Context building and coherence assurance
- **Architect (架构师)**: Chapter structure planning
- **Writer (写手)**: Content generation
- **Documenter (资料员)**: Fact extraction and recording
- **Reviewer (审核员)**: Self-reflection and quality check
- **Proofreader (校对员)**: Format standardization
- **Auditor (审计员)**: 33-dimension quality audit
- **Reviser (修订者)**: Issue fixing and improvement

### 🤝 7 Truth Files System
Structured long-term memory system ensuring consistency in long novels:
- `current_state.md` — World state (character locations, relationship network)
- `particle_ledger.md` — Resource ledger (items, money, materials)
- `pending_hooks.md` — Unresolved foreshadowing
- `chapter_summaries.md` — Chapter summaries
- `subplot_board.md` — Subplot progress board
- `emotional_arcs.md` — Emotional arcs
- `character_matrix.md` — Character interaction matrix

### 🔧 Multi-Model Routing
Support for major LLM providers with per-agent allocation:
- OpenAI, Anthropic, Google Gemini
- Moonshot(Kimi), DeepSeek, Zhipu
- Ollama local deployment support

### ✏️ Custom Agent Prompts
Each agent supports independent System Prompt configuration:
- Variable injection (`{{book_title}}`, `{{chapter_number}}`, etc.)
- Prompt version management and rollback
- Global/Work/Chapter level overrides

## 🎨 Studio-Style UI
Modern dark theme writing workspace with visual workflow

## 🚀 Quick Start

### Requirements

- Node.js >= 20.x
- Python >= 3.12
- pnpm >= 9.x
- Docker >= 24.x

### Install Dependencies

```bash
# Install frontend dependencies
cd inkforge/packages/frontend
pnpm install

# Install backend dependencies
cd inkforge/packages/backend
pip install -r requirements.txt
```

### Configure Environment Variables

```bash
# Copy environment variable template
cp inkforge/.env.example inkforge/.env

# Edit environment variables (database connection, LLM API keys, etc.)
vim inkforge/.env
```

### Start Development Server

```bash
# Start backend (port: 8000)
cd inkforge/packages/backend
uvicorn main:app --reload

# Start frontend development server (port: 5173)
cd inkforge/packages/frontend
pnpm dev
```

### Using Docker Compose

```bash
cd inkforge
docker-compose up -d
```

## 📁 Project Structure

```
inkforge/
├── packages/
│   ├── frontend/          # Frontend Application
│   │   ├── src/
│   │   │   ├── components/ # Components
│   │   │   ├── pages/      # Pages
│   │   │   ├── lib/        # Utilities
│   │   │   └── styles/     # Styles
│   │   └── package.json
│   └── backend/           # Backend Service
│       ├── app/            # Application Code
│       ├── tests/          # Test Files
│       └── requirements.txt
├── docs/                   # Documentation
│   └── PRD.md             # Product Requirements Document
├── design/                 # Design Documents and Prototypes
├── .env.example           # Environment Variable Template
├── docker-compose.yml     # Docker Configuration
└── README.md              # Project Documentation
```

## 🎯 Target Users

| User Type | Characteristics | Core Value |
|-----------|----------------|------------|
| **Novice Writers** | 18-25 years old, passionate but inexperienced | Guided workflow from concept to chapter completion |
| **Intermediate Writers** | 25-35 years old, with 1-3 completed works | Fine-grained quality control, improved serialization consistency |
| **Professional Writers/Studios** | 30-45 years old, full-time authors or small studios | Industrial writing pipeline, multi-model strategy |

## 💰 Business Model

| Tier | Pricing | Core Features |
|------|---------|---------------|
| **Free** | ¥0 | Basic agent pipeline, word limit (≤100K/month), community models |
| **Pro** | ¥29/month or ¥199/year | Full agent pipeline, custom prompts, multi-model routing, advanced export |
| **Enterprise** | Custom quote | Private deployment, dedicated agent customization, SLA guarantee, API access |

## 🔧 Feature Modules

### 1. Dashboard
- Work statistics display (chapters, word count, audit pass rate, etc.)
- AI writing suggestions
- Quick actions

### 2. Work Management
- Work list management
- Chapter editing
- Content review

### 3. Agent Configuration
- Agent role definition
- Workflow configuration
- Prompt management

### 4. Model Configuration
- AI model management
- API key configuration
- Provider management

## 📖 Usage Guide

### Create New Work

1. Click "New Work" button
2. Enter title and description
3. Select genre and template
4. AI Architect generates outline, worldbuilding, and character settings
5. Confirm or iterate, then save

### AI-Assisted Writing

1. Go to work detail page
2. Click "Write Next Chapter" to start automated pipeline
3. Pipeline executes: Planner → Composer → Architect → Writer → Observer → Auditor → Reviser
4. Review AI-generated content, iterate or publish

### Customize Agent Configuration

1. Go to Agent Configuration panel
2. Select agent (e.g., Writer, Auditor)
3. Choose provider and model
4. Customize System Prompt (supports variable injection)
5. Apply globally or per-work

## 🏛️ Technical Architecture

```
User Layer       Web Studio UI → Work Management → Agent Configuration Panel
    ↓
Agent Pipeline   Planner → Outline Master → Scriptwriter → Architect → Writer → Documenter → Reviewer → Proofreader → Auditor → Reviser
    ↓
Infrastructure  7 Truth Files | LLM Provider Bank | Event Bus
    ↓
Data Layer       PostgreSQL | Redis Cache | File Storage
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork this repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'feat: Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

## 📧 Contact

- Author: <smallletters@sina.com>
- Project: https://github.com/smallletters/inkforge

---

**InkForge** - Forging every creative spark into timeless masterpieces ✍️