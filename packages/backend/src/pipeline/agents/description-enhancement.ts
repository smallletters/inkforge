/**
 * 灵砚 InkForge - 描述增强Agent
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：增强场景、人物和动作描写的细节和感官体验
 */
import { z } from 'zod';
import { providerBank } from '../../provider-bank';
import { eventBus } from '../../sse/event-bus';
import { db } from '../../db';
import { llmProviders, agentConfigs, truthFiles } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../../lib/crypto';
import type { AgentContext, AgentOutput } from '../base-agent';

const SceneEnhancementSchema = z.object({
  enhanced_description: z.string(),
  sensory_details: z.object({
    visual: z.array(z.string()),
    auditory: z.array(z.string()).optional(),
    olfactory: z.array(z.string()).optional(),
    tactile: z.array(z.string()).optional(),
    taste: z.array(z.string()).optional(),
  }),
  atmosphere: z.object({
    mood: z.string(),
    emotional_tone: z.string(),
    weather: z.string().optional(),
    lighting: z.string().optional(),
  }),
  notable_elements: z.array(z.string()),
  pacing_impact: z.enum(['slows', 'maintains', 'quickens']),
});

const CharacterDescriptionSchema = z.object({
  physical_description: z.string(),
  body_language: z.object({
    posture: z.string(),
    gestures: z.array(z.string()),
    facial_expressions: z.array(z.string()),
    movement_patterns: z.array(z.string()),
  }),
  appearance_in_context: z.string(),
  transformation_description: z.string().optional(),
});

const ActionEnhancementSchema = z.object({
  original_action: z.string(),
  enhanced_action: z.string(),
  sensory_expansion: z.object({
    what_character_sees: z.string(),
    what_character_feels: z.string(),
    what_character_hears: z.string(),
    internal_sensations: z.array(z.string()),
  }),
  emotional_context: z.string(),
  impact_on_character: z.string(),
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

export class DescriptionEnhancementAgent {
  name = 'description_enhancement' as const;

  async enhanceScene(ctx: AgentContext, sceneDescription: string, params?: {
    focus?: 'setting' | 'atmosphere' | 'sensory' | 'all';
    intensity?: 'subtle' | 'moderate' | 'vivid';
  }): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const currentState = await getTruthFileContent(ctx.novelId, 'current_state');

    const prompt = `你是灵砚InkForge平台的描写增强专家，负责将平淡的场景描述转化为生动、沉浸式的体验。

原文场景：
---
${sceneDescription}
---

${currentState ? `世界观设定：\n${JSON.stringify(currentState, null, 2)}\n` : ''}

增强参数：
- 重点：${params?.focus || 'all'}
- 强度：${params?.intensity || 'moderate'}

请从以下维度增强场景描写：
1. **视觉**：颜色、光影、形状、空间感
2. **听觉**：声音、音效、静谧
3. **嗅觉**：气味、香气、腐臭
4. **触觉**：温度、质地、触感
5. **味觉**（如适用）：口感、风味
6. **氛围**：情绪基调和环境氛围

同时注意：
- 保持与整体风格的统一
- 不要过度堆砌感官细节
- 让描写服务于情节和情绪

输出格式（JSON）：
{
  "enhanced_description": "增强后的完整场景描写",
  "sensory_details": {
    "visual": ["视觉细节1", "细节2"],
    "auditory": ["听觉细节"],
    "olfactory": ["嗅觉细节"],
    "tactile": ["触觉细节"],
    "taste": ["味觉细节"]
  },
  "atmosphere": {
    "mood": "整体情绪",
    "emotional_tone": "情感基调",
    "weather": "天气（如适用）",
    "lighting": "光线（如适用）"
  },
  "notable_elements": ["值得注意的元素1", "元素2"],
  "pacing_impact": "slows|maintains|quickens"
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

  async enhanceCharacterDescription(ctx: AgentContext, characterName: string, context?: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');
    const character = characterMatrix?.characters?.find((c: any) => c.basic_info?.name === characterName);

    const prompt = `你是灵砚InkForge平台的描写增强专家，负责创建生动的人物描写。

角色信息：
${character ? JSON.stringify(character, null, 2) : `角色名：${characterName}`}

${context ? `当前场景上下文：\n${context}\n` : ''}

请提供以下类型的描写：
1. **物理外观**：身体特征、穿着打扮、区分性特征
2. **肢体语言**：姿态、手势、表情、移动模式
3. **情境中的人物呈现**：在当前场景中如何被感知
4. **（如有变化）转变描写**：外貌的动态变化

输出格式（JSON）：
{
  "physical_description": "物理外观描写",
  "body_language": {
    "posture": "姿态",
    "gestures": ["手势1", "手势2"],
    "facial_expressions": ["表情1", "表情2"],
    "movement_patterns": ["移动模式1", "模式2"]
  },
  "appearance_in_context": "情境中的呈现",
  "transformation_description": "转变描写（如适用）"
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

  async enhanceAction(ctx: AgentContext, action: string, characterEmotion?: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const prompt = `你是灵砚InkForge平台的描写增强专家，负责将简单的动作描写转化为富有感染力的细节呈现。

原动作：
---
${action}
---

${characterEmotion ? `角色情绪状态：\n${characterEmotion}\n` : ''}

请从以下维度扩展动作描写：
1. 角色看到了什么
2. 角色感受到了什么（身体和内心）
3. 角色听到了什么
4. 内部身体感受（心跳、呼吸、肌肉紧张等）
5. 动作背后的情感含义

输出格式（JSON）：
{
  "original_action": "${action}",
  "enhanced_action": "增强后的动作描写",
  "sensory_expansion": {
    "what_character_sees": "角色视野",
    "what_character_feels": "角色感受",
    "what_character_hears": "角色听到",
    "internal_sensations": ["内部感受1", "感受2"]
  },
  "emotional_context": "情感背景",
  "impact_on_character": "对角色的影响"
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

export const descriptionEnhancementAgent = new DescriptionEnhancementAgent();