/**
 * 灵砚 InkForge - 情感弧线Agent
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：设计和追踪角色情感发展轨迹
 */
import { z } from 'zod';
import { providerBank } from '../../provider-bank';
import { eventBus } from '../../sse/event-bus';
import { db } from '../../db';
import { llmProviders, agentConfigs, truthFiles } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../../lib/crypto';
import type { AgentContext, AgentOutput } from '../base-agent';

const EmotionalArcSchema = z.object({
  character_name: z.string(),
  arc_type: z.enum(['positive', 'negative', 'flat', 'circular', 'complex']),
  starting_emotion: z.string(),
  ending_emotion: z.string(),
  emotional_journey: z.array(z.object({
    phase: z.string(),
    chapter_range: z.tuple([z.number(), z.number()]),
    dominant_emotion: z.string(),
    supporting_emotions: z.array(z.string()),
    key_event: z.string(),
    emotional_shift: z.string(),
  })),
  emotional_peaks: z.array(z.object({
    chapter: z.number(),
    emotion: z.string(),
    intensity: z.number().min(0).max(10),
    trigger_event: z.string(),
  })),
  emotional_valleys: z.array(z.object({
    chapter: z.number(),
    emotion: z.string(),
    intensity: z.number().min(0).max(10),
    trigger_event: z.string(),
  })),
  transformation_summary: z.string(),
});

const EmotionalMomentSchema = z.object({
  chapter: z.number(),
  scene: z.string(),
  character: z.string(),
  emotional_state_before: z.string(),
  emotional_state_after: z.string(),
  trigger: z.string(),
  intensity: z.number().min(0).max(10),
  physical_manifestation: z.string(),
  dialogue_indicators: z.array(z.string()),
});

async function getAdapterForAgent(userId: string, agentName: string) {
  const userProviders = await db.select().from(llmProviders).where(eq(llmProviders.user_id, userId));
  const activeProviders = userProviders.filter((p: any) => p.is_active);
  if (activeProviders.length === 0) throw new Error('未配置LLM服务商');

  const agentConfigList = await db.select().from(agentConfigs).where(
    and(eq(agentConfigs.user_id, userId), eq(agentConfigs.agent_name, agentName))
  );
  const agentConfig = agentConfigList[0];
  const providerType = agentConfig?.provider ?? 'openai';
  const model = agentConfig?.model ?? 'gpt-4o-mini';
  const provider = activeProviders.find((p: any) => p.provider_type === providerType) ?? activeProviders[0];
  if (!provider) throw new Error(`未找到${providerType}服务商配置`);

  let apiKey: string;
  try {
    apiKey = decrypt(provider.api_key_encrypted);
  } catch {
    throw new Error('API Key解密失败');
  }

  const adapterKey = `${userId}-${agentName}`;
  providerBank.register(adapterKey, provider.provider_type, apiKey, provider.base_url);
  return { adapterKey, model, temperature: agentConfig?.temperature ?? 0.7, maxTokens: agentConfig?.max_tokens ?? 4096 };
}

async function getTruthFileContent(novelId: string, fileName: string): Promise<Record<string, any> | null> {
  const [file] = await db.select().from(truthFiles).where(and(
    eq(truthFiles.novel_id, novelId),
    eq(truthFiles.file_name, fileName as any)
  )).limit(1);
  return file?.content_json as Record<string, any> | null;
}

export class EmotionalArcAgent {
  name = 'emotional_arc' as const;

  async designArc(ctx: AgentContext, characterName: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');
    const chapterSummaries = await getTruthFileContent(ctx.novelId, 'chapter_summaries');

    const character = characterMatrix?.characters?.find((c: any) => c.basic_info?.name === characterName);

    const prompt = `你是灵砚InkForge平台的情感弧线设计师，负责为角色设计完整的情感发展轨迹。

角色信息：
${character ? JSON.stringify(character, null, 2) : `角色名：${characterName}`}

${chapterSummaries ? `章节概要：\n${JSON.stringify(chapterSummaries, null, 2)}\n` : ''}

请为该角色设计情感弧线，包括：

**基础信息**：
- 弧线类型（正面/负面/平直/圆形/复杂）
- 起始情感状态
- 结束情感状态

**情感旅程**：
- 各阶段的情感变化
- 每阶段覆盖的章节范围
- 关键事件触发点
- 情感转变描述

**情感高峰与低谷**：
- 高峰：章节、情感、强度、触发事件
- 低谷：章节、情感、强度、触发事件

**转变总结**：整体情感转变的概括性描述

输出格式（JSON）：
{
  "character_name": "${characterName}",
  "arc_type": "positive|negative|flat|circular|complex",
  "starting_emotion": "起始情感",
  "ending_emotion": "结束情感",
  "emotional_journey": [
    {
      "phase": "阶段名",
      "chapter_range": [开始章, 结束章],
      "dominant_emotion": "主导情感",
      "supporting_emotions": ["辅助情感1", "情感2"],
      "key_event": "关键事件",
      "emotional_shift": "情感变化描述"
    }
  ],
  "emotional_peaks": [
    {"chapter": 1, "emotion": "情感", "intensity": 0-10, "trigger_event": "触发事件"}
  ],
  "emotional_valleys": [
    {"chapter": 1, "emotion": "情感", "intensity": 0-10, "trigger_event": "触发事件"}
  ],
  "transformation_summary": "转变总结"
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 48000) });
      const content = resp.content;

      let parsedData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: content };
      }

      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.complete', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, duration_ms: durationMs } });
      return { success: true, data: parsedData, durationMs };
    } catch (e) {
      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.error', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, error_type: (e as Error).name } });
      return { success: false, error: (e as Error).message, durationMs };
    }
  }

  async analyzeEmotionalMoment(ctx: AgentContext, chapterNumber: number): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');
    const chapterSummaries = await getTruthFileContent(ctx.novelId, 'chapter_summaries');

    const chapterInfo = chapterSummaries?.chapters?.find((c: any) => c.chapter_number === chapterNumber);

    const prompt = `你是灵砚InkForge平台的情感分析师，负责分析特定章节中角色的情感时刻。

章节信息：
- 章节号：${chapterNumber}
- 标题：${chapterInfo?.title || '待定'}
- 概要：${chapterInfo?.summary || chapterInfo?.synopsis || '暂无'}

${characterMatrix ? `角色库：\n${JSON.stringify(characterMatrix, null, 2)}\n` : ''}

请分析该章节中的关键情感时刻：

输出格式（JSON）：
{
  "chapter": ${chapterNumber},
  "emotional_moments": [
    {
      "scene": "场景描述",
      "character": "角色名",
      "emotional_state_before": "变化前情感",
      "emotional_state_after": "变化后情感",
      "trigger": "触发事件",
      "intensity": 0-10,
      "physical_manifestation": "身体表现",
      "dialogue_indicators": ["对话指示1", "指示2"]
    }
  ]
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 48000) });
      const content = resp.content;

      let parsedData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: content };
      }

      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.complete', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, duration_ms: durationMs } });
      return { success: true, data: parsedData, durationMs };
    } catch (e) {
      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.error', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, error_type: (e as Error).name } });
      return { success: false, error: (e as Error).message, durationMs };
    }
  }

  async suggestEmotionalBeat(ctx: AgentContext, params: {
    character: string;
    current_emotion: string;
    target_emotion: string;
  }): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');
    const character = characterMatrix?.characters?.find((c: any) => c.basic_info?.name === params.character);

    const prompt = `你是灵砚InkForge平台的情感节奏专家，负责建议角色从当前情感状态向目标情感状态的转变。

角色信息：
${character ? JSON.stringify(character, null, 2) : `角色名：${params.character}`}

当前情感状态：${params.current_emotion}
目标情感状态：${params.target_emotion}

请提供5个情感节奏建议，每个建议包括：
1. 触发事件
2. 情感转变过程
3. 角色反应
4. 强度（0-10）

输出格式（JSON）：
{
  "suggestions": [
    {
      "trigger_event": "触发事件",
      "emotional_transition": "情感转变过程",
      "character_reaction": "角色反应",
      "intensity": 0-10,
      "physical_manifestation": "身体表现",
      "dialogue_example": "对话示例"
    }
  ]
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 32000) });
      const content = resp.content;

      let parsedData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: content };
      }

      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.complete', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, duration_ms: durationMs } });
      return { success: true, data: parsedData, durationMs };
    } catch (e) {
      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.error', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, error_type: (e as Error).name } });
      return { success: false, error: (e as Error).message, durationMs };
    }
  }
}

export const emotionalArcAgent = new EmotionalArcAgent();