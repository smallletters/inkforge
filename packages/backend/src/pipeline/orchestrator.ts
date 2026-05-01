import { db } from '../db';
import { chapters, pipelineRuns, novels, truthFiles, agentConfigs } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { eventBus } from '../sse/event-bus';
import { BaseAgent, AgentContext } from './base-agent';
import { AGENT_MAP } from './agents/index';
import { truthFileManager } from '../truth-files/manager';

export type AgentName = 'radar' | 'planner' | 'composer' | 'architect' | 'writer' | 'observer' | 'reflector' | 'normalizer' | 'auditor' | 'reviser';
export type TruthFileName = 'current_state' | 'particle_ledger' | 'pending_hooks' | 'chapter_summaries' | 'subplot_board' | 'emotional_arcs' | 'character_matrix';

const PIPELINE_ORDER: AgentName[] = ['radar', 'planner', 'composer', 'architect', 'writer', 'observer', 'reflector', 'normalizer', 'auditor', 'reviser'];

const DEFAULT_SYSTEM_PROMPTS: Record<AgentName, string> = {
  radar: `你是灵砚InkForge平台的策划Agent，负责分析当前创作趋势和用户意图。

职责：
1. 分析当前章节的创作方向和趋势
2. 提供创作建议和伏笔埋设提示
3. 识别潜在的故事发展方向

输出格式（JSON）：
{
  "trends": ["趋势1", "趋势2"],
  "suggestions": ["建议1", "建议2"],
  "warnings": ["警告1"]
}`,
  planner: `你是灵砚InkForge平台的大纲师Agent，负责规划章节创作方向。

职责：
1. 分析当前章节的创作意图
2. 确定本章的核心目标和关键情节点
3. 与已发布章节保持一致性

输出格式（JSON）：
{
  "chapter_intent": "本章核心意图",
  "key_points": ["要点1", "要点2"],
  "foreshadowing_hints": ["伏笔提示1"]
}`,
  composer: `你是灵砚InkForge平台的编剧Agent，负责构建上下文和保证连贯性。

职责：
1. 选择相关上下文（角色状态、世界状态、已发生事件）
2. 保证本章与前序章节的连贯性
3. 管理信息呈现的节奏

输出格式（JSON）：
{
  "relevant_context": ["上下文1", "上下文2"],
  "continuity_notes": "连贯性备注"
}`,
  architect: `你是灵砚InkForge平台的架构师Agent，负责规划章节结构。

职责：
1. 将章节拆分为场景
2. 规划每个场景的目标和情绪
3. 设计场景之间的过渡

输出格式（JSON）：
{
  "scenes": [
    {"name": "场景名", "goal": "场景目标", "emotion": "情绪", "key_elements": ["元素1"]}
  ],
  "structure": "总-分-总"
}`,
  writer: `你是灵砚InkForge平台的写手Agent，负责生成章节正文。

核心规则：
1. 每章字数控制在目标字数±10%范围内
2. 叙事性描述为主，对话不超过30%
3. 严格遵循真相文件中的设定
4. 每章至少推进一条主线或支线

输出格式（JSON）：
{
  "content": "章节正文内容（3000-4000字）",
  "word_count": 字数,
  "characters_involved": ["角色1", "角色2"],
  "locations": ["地点1"],
  "items_used": ["物品1"]
}`,
  observer: `你是灵砚InkForge平台的资料员Agent，负责提取和记录事实。

职责：
1. 从章节内容中提取关键事实
2. 记录角色位置、物品、关系变化
3. 识别新埋设的伏笔

输出格式（JSON）：
{
  "extracted_facts": [
    {"type": "character_location", "character": "角色名", "location": "地点", "chapter": 章节号},
    {"type": "item_acquired", "item": "物品名", "owner": "持有人", "chapter": 章节号},
    {"type": "relationship_change", "character_a": "角色A", "character_b": "角色B", "change": "关系变化", "chapter": 章节号}
  ],
  "new_hooks": ["新伏笔描述1"]
}`,
  reflector: `你是灵砚InkForge平台的审核员Agent，负责生成真相文件更新delta。

职责：
1. 根据资料员的提取结果生成真相文件更新操作
2. 确保更新操作是幂等的（同一操作多次执行结果一致）

输出格式（JSON）：
{
  "deltas": [
    {"file": "真相文件名", "operations": [{"op": "upsert|delete", "path": "路径", "value": 值}]}
  ],
  "version_increment": 1
}`,
  normalizer: `你是灵砚InkForge平台的校对员Agent，负责格式标准化和字数纠偏。

职责：
1. 标准化标点符号（全角/半角）
2. 检查段落分隔
3. 字数纠偏（如果偏离目标±15%，提示需要重写）

输出格式（JSON）：
{
  "normalized": true,
  "issues_fixed": ["问题1", "问题2"],
  "word_count_delta": 字数偏差
}`,
  auditor: `你是灵砚InkForge平台的审计员Agent，负责33维度质量审计。

维度分类：
【一致性】character_memory, item_continuity, location_consistency, temporal_consistency, relationship_consistency
【逻辑性】plot_logic, cause_effect, character_behavior, world_rules
【结构性】narrative_rhythm, pacing, chapter_structure, scene_transitions
【文风】writing_style, dialogue_ratio, show_vs_tell, prose_quality
【伏笔】foreshadowing_setup, hook_closure, plot_holes
【情感】emotional_arc, character_development, tension_buildup
【AI痕迹】ai_detection, repetitive_patterns, generic_phrasing

输出格式（JSON）：
{
  "audit_report": {
    "passed": true或false,
    "dimensions": {
      "character_memory": "passed|failed|warning",
      "item_continuity": "passed|failed|warning",
      ...（全部33个维度）
    },
    "issues": [
      {"severity": "critical|major|minor|suggestion", "dimension": "维度名", "description": "问题描述", "resolved": false}
    ]
  }
}`,
  reviser: `你是灵砚InkForge平台的修订者Agent，负责修复审计发现的问题。

职责：
1. 根据审计报告修复问题
2. 保持修复后内容与整体风格一致
3. 记录修复内容

输出格式（JSON）：
{
  "revisions": [
    {"original": "原文", "revised": "修订后", "reason": "修复原因", "dimension": "维度"}
  ],
  "revised": true或false,
  "issues_resolved": 已解决问题数,
  "issues_remaining": 剩余问题数
}`,
};

async function getAgentConfig(userId: string, agentName: AgentName) {
  const configs = await db.select().from(agentConfigs).where(
    and(eq(agentConfigs.user_id, userId), eq(agentConfigs.agent_name, agentName))
  ).limit(1);
  
  if (configs.length > 0) {
    return {
      provider: configs[0].provider,
      model: configs[0].model,
      systemPrompt: configs[0].system_prompt ?? DEFAULT_SYSTEM_PROMPTS[agentName],
      temperature: configs[0].temperature,
      maxTokens: configs[0].max_tokens,
    };
  }
  
  return {
    provider: 'openai',
    model: agentName === 'writer' ? 'gpt-4o-mini' : 'gpt-4o-mini',
    systemPrompt: DEFAULT_SYSTEM_PROMPTS[agentName],
    temperature: 0.7,
    maxTokens: agentName === 'writer' ? 4000 : 2048,
  };
}

async function initTruthFiles(novelId: string) {
  await truthFileManager.initializeForNovel(novelId);
}

export async function executePipeline(pipelineId: string, novelId: string, userId: string, wordCountTarget = 3000) {
  const [novel] = await db.select({ 
    id: novels.id, title: novels.title, genre: novels.genre, 
    total_chapters: novels.total_chapters, word_count: novels.word_count,
    outline: novels.outline, characters: novels.characters, world_setting: novels.world_setting 
  }).from(novels).where(eq(novels.id, novelId)).limit(1);

  if (!novel) throw new Error('作品不存在');

  await initTruthFiles(novelId);

  const chapterNumber = (novel.total_chapters ?? 0) + 1;
  const startTime = Date.now();

  const [run] = await db.insert(pipelineRuns).values({
    id: pipelineId, novel_id: novelId, user_id: userId, status: 'running',
    agents_progress: PIPELINE_ORDER.map(name => ({ agent_name: name, status: 'pending' as const })),
  }).returning();

  eventBus.publish(userId, { event: 'pipeline.start', data: { pipeline_id: pipelineId, novel_id: novelId, chapter_number: chapterNumber } });

  let pipelineData: Record<string, unknown> = {};
  let auditPassed = true;
  let revisionCount = 0;
  let currentContent = '';

  try {
    for (let i = 0; i < PIPELINE_ORDER.length; i++) {
      const agentName = PIPELINE_ORDER[i];
      const AgentClass = AGENT_MAP[agentName as keyof typeof AGENT_MAP];
      if (!AgentClass) continue;

      const agent: BaseAgent = new AgentClass();
      const agentConfig = await getAgentConfig(userId, agentName);

      const currentProgress = PIPELINE_ORDER.map((name, idx) => ({
        agent_name: name,
        status: idx < i ? 'completed' as const : idx === i ? 'running' as const : 'pending' as const,
        duration_ms: idx < i ? 0 : undefined,
      }));
      await db.update(pipelineRuns).set({ agents_progress: currentProgress }).where(eq(pipelineRuns.id, pipelineId));

      // 传递前置数据给Agent
      const ctx: AgentContext = {
        novelId, userId, pipelineId, chapterNumber,
        config: { 
          ...agentConfig, 
          maxTokens: agentName === 'writer' ? wordCountTarget * 2 : agentConfig.maxTokens,
          pipelineData, // 将pipeline数据传递给Agent
        },
      };

      const output = await agent.execute(ctx);

      const updatedProgress = PIPELINE_ORDER.map((name, idx) => ({
        agent_name: name,
        status: idx < i ? 'completed' as const : idx === i ? (output.success ? 'completed' as const : 'failed' as const) : 'pending' as const,
        duration_ms: idx === i ? output.durationMs : idx < i ? 0 : undefined,
      }));
      await db.update(pipelineRuns).set({ agents_progress: updatedProgress }).where(eq(pipelineRuns.id, pipelineId));

      if (!output.success) {
        await db.update(pipelineRuns).set({ 
          status: 'failed', failed_agent: agentName, 
          error_message: output.error, completed_at: new Date() 
        }).where(eq(pipelineRuns.id, pipelineId));
        eventBus.publish(userId, { event: 'pipeline.fail', data: { pipeline_id: pipelineId, failed_agent: agentName, error: output.error } });
        return;
      }

      pipelineData = { ...pipelineData, [agentName]: output.data };

      // 保存Writer的输出内容，供后续Agent使用
      if (agentName === 'writer') {
        const writerData = output.data as any;
        currentContent = writerData.content ?? '';
      }

      if (agentName === 'auditor' && output.data) {
        const report = (output.data as any)?.audit_report;
        auditPassed = report?.passed ?? true;

        eventBus.publish(userId, { event: 'audit.complete', data: { 
          pipeline_id: pipelineId, passed: auditPassed, 
          issues_found: report?.issues?.length ?? 0 
        }});

        if (!auditPassed && revisionCount < 3) {
          revisionCount++;
          eventBus.publish(userId, { event: 'audit.revision', data: { 
            pipeline_id: pipelineId, revision_count: revisionCount, 
            issues_remaining: report?.issues?.length ?? 0 
          }});

          const ReviserClass = AGENT_MAP.reviser;
          const reviser = new ReviserClass();
          const reviserConfig = await getAgentConfig(userId, 'reviser');
          const reviserCtx: AgentContext = {
            novelId, userId, pipelineId, chapterNumber,
            config: { ...reviserConfig, pipelineData, currentContent },
          };
          const reviserOutput = await reviser.execute(reviserCtx);
          
          if (reviserOutput.success) {
            pipelineData.reviser = reviserOutput.data;
            const reviserData = reviserOutput.data as any;
            if (reviserData.revised_content) {
              currentContent = reviserData.revised_content;
            }
          }

          i--;
          continue;
        }
      }
    }

    // 保存章节到数据库
    const [chapter] = await db.insert(chapters).values({
      novel_id: novelId,
      chapter_number: chapterNumber,
      title: `第${chapterNumber}章`,
      content: currentContent,
      status: 'reviewing',
      word_count: currentContent.length,
      audit_report: (pipelineData.auditor as any)?.audit_report ?? { passed: true, dimensions: {}, issues: [] },
    }).returning();

    // 更新作品统计
    const newWordCount = (novel.word_count ?? 0) + currentContent.length;
    await db.update(novels).set({ 
      total_chapters: chapterNumber, 
      word_count: newWordCount,
      updated_at: new Date(),
    }).where(eq(novels.id, novelId));

    // 更新真相文件
    const reflectorData = pipelineData.reflector as any;
    if (reflectorData?.deltas) {
      for (const delta of reflectorData.deltas as Array<{ file: TruthFileName; operations: Array<{ op: string; path: string; value?: unknown }> }>) {
        const existingFile = await db.select().from(truthFiles).where(
          and(eq(truthFiles.novel_id, novelId), eq(truthFiles.file_name, delta.file))
        ).limit(1);

        if (existingFile.length > 0) {
          const currentContent = existingFile[0].content_json as Record<string, unknown>;
          const newContent = truthFileManager.applyDelta(currentContent, delta as any);
          await truthFileManager.update(novelId, delta.file, newContent);
        } else {
          // 如果文件不存在，创建它
          const defaultContent = truthFileManager.createDefaultContent(delta.file);
          const newContent = truthFileManager.applyDelta(defaultContent, delta as any);
          await truthFileManager.update(novelId, delta.file, newContent);
        }
      }
    }

    // 更新章节摘要
    const existingSummary = await db.select().from(truthFiles).where(
      and(eq(truthFiles.novel_id, novelId), eq(truthFiles.file_name, 'chapter_summaries'))
    ).limit(1);

    if (existingSummary.length > 0) {
      const current = existingSummary[0].content_json as { summaries?: Array<{ chapter_number: number; summary: string }> };
      const summaries = current?.summaries ?? [];
      summaries.push({
        chapter_number: chapterNumber,
        summary: currentContent.slice(0, 200) + '...',
      });

      await truthFileManager.update(novelId, 'chapter_summaries', { ...current, summaries });
    }

    await db.update(pipelineRuns).set({
      status: 'completed',
      total_duration_ms: Date.now() - startTime,
      completed_at: new Date(),
    }).where(eq(pipelineRuns.id, pipelineId));

    eventBus.publish(userId, { event: 'pipeline.complete', data: { 
      pipeline_id: pipelineId, chapter_id: chapter.id, 
      chapter_number: chapterNumber, word_count: chapter.word_count 
    }});

  } catch (err) {
    console.error(`[Pipeline ${pipelineId}] Error:`, err);
    await db.update(pipelineRuns).set({
      status: 'failed',
      error_message: (err as Error).message,
      completed_at: new Date(),
    }).where(eq(pipelineRuns.id, pipelineId));
    eventBus.publish(userId, { event: 'pipeline.fail', data: {
      pipeline_id: pipelineId, error: (err as Error).message
    }});
    throw err;
  }
}