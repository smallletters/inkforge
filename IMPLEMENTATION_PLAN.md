# InkForge 开发完善计划

## 当前状态分析

### 已完成 ✅
- 后端：Hono框架 + Drizzle ORM + 完整DB schema
- 后端：10个Agent骨架（但都是stub实现）
- 后端：Provider Bank（OpenAI/Anthropic/Moonshot等适配器）
- 后端：Auth/Novels/Agents/Providers/Pipeline/TruthFiles/Export路由
- 后端：EventBus SSE事件总线
- 后端：真相文件Zod Schema校验
- 前端：React 19 + Vite + TailwindCSS完整UI
- 前端：6个页面（Dashboard/Works/NovelDetail/ChapterWorkspace/AgentConfig/ModelConfig）
- 前端：Zustand状态管理 + TanStack Query

### 核心缺口 ❌

#### P0 必须修复
1. **Agent调用用dummy key** — BaseAgent.callLLM注册dummy key，无法真正调用LLM
2. **审计员返回假数据** — AuditorAgent.audit_report永远是{passed: true}
3. **Pipeline不读AgentConfig** — orchestrator硬编码provider/model，忽略数据库配置
4. **真相文件不自动生成** — 新建作品后7个真相文件为空

#### P1 重要功能
5. **SSE实时连接** — 前端没有EventSource，后端SSE未真正连接
6. **导出功能stub** — ExportRoute只返回processing，未实现真正导出
7. **API Key简单base64** — 应该用AES-256加密
8. **Auth refresh token** — 只返回"todo_refresh"
9. **写手/大纲师Agent太简单** — 只有占位符prompt

#### P2 完善功能
10. Agent提示词版本历史（已有表但无UI）
11. 33维度审计的完整prompt
12. 真相文件UI编辑
13. 对话式建书
14. 作品导入（TXT/Markdown/EPUB）
15. 文风仿写分析

## 执行计划

### Phase 1: 让LLM真正工作
1. 修复BaseAgent.callLLM，使用用户配置的真实API key
2. 实现Provider Bank从DB读取配置
3. 让Orchestrator读取AgentConfig

### Phase 2: 审计和真相文件
4. 实现真正的33维度审计
5. 实现真相文件初始化（新建作品时）
6. 实现真相文件自动更新

### Phase 3: SSE和前端
7. 实现前端SSE连接（EventSource）
8. 实现管线状态实时推送
9. 添加toast通知

### Phase 4: 导出和加密
10. 实现真正的导出（TXT/MD）
11. 改进API Key加密
12. 实现refresh token

### Phase 5: 增强Agent
13. 实现完整的大纲师、编剧Agent prompt
14. 实现观察者、反射者、真理文件更新
15. 实现修订者修复逻辑