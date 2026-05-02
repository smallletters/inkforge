/**
 * 灵砚 InkForge - 对话生成Agent
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：生成自然、符合角色性格的对话内容
 */
import { z } from 'zod';
import { providerBank } from '../../provider-bank';
import { eventBus } from '../../sse/event-bus';
import { db } from '../../db';
import { llmProviders, agentConfigs, truthFiles } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../../lib/crypto';
import type { AgentContext, AgentOutput } from '../base-agent';

const DialogueSceneSchema = z.object({
  scene_context: z.object({
    setting: z.string(),
    time: z.string(),
    atmosphere: z.string(),
  }),
  participants: z.array(z.object({
    name: z.string(),
    emotional_state: z.string(),
    subtext: z.string(),
  })),
  dialogue_exchanges: z.array(z.object({
    speaker: z.string(),
    content: z.string(),
    subtext: z.string().optional(),
    action: z.string().optional(),
    emotional_beat: z.string().optional(),
  })),
  pacing_notes: z.string(),
  scene_summary: z.string(),
});

const DialogueOptionsSchema = z.object({
  context: z.string(),
  speaker: z.string(),
  situation: z.string(),
  options: z.array(z.object({
    content: z.string(),
    tone: z.enum(['formal', 'casual', 'aggressive', 'defensive', 'romantic', 'humorous', 'serious']),
    subtext: z.string(),
    implications: z.array(z.string()),
  })),
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

export class DialogueGeneratorAgent {
  name = 'dialogue_generator' as const;

  async generateDialogue(ctx: AgentContext, params: {
    characters: string[];
    situation: string;
    setting?: string;
    targetLength?: 'short' | 'medium' | 'long';
  }): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');

    const characterInfos = params.characters.map(name => {
      const char = characterMatrix?.characters?.find((c: any) => c.basic_info?.name === name);
      return { name, info: char };
    });

    const prompt = `你是灵砚InkForge平台的对话写作专家，负责生成自然、符合角色性格的对话。

角色信息：
${characterInfos.map(c => `
【${c.name}】
${c.info ? JSON.stringify(c.info, null, 2) : '（使用默认性格）'}
`).join('\n')}

场景参数：
- 情境：${params.situation}
- 地点：${params.setting || '未指定'}
- 目标长度：${params.targetLength || 'medium'}

请生成符合以下要求的对话：
1. 每个角色的台词必须符合其性格特征
2. 对话应推进情节或揭示角色内心
3. 包含适当的潜台词（subtext）
4. 对话节奏自然，有起有伏
5. 适当添加动作描写和情感节奏

输出格式（JSON）：
{
  "scene_context": {
    "setting": "场景地点",
    "time": "时间",
    "atmosphere": "氛围"
  },
  "participants": [
    {"name": "角色名", "emotional_state": "情绪状态", "subtext": "潜台词"}
  ],
  "dialogue_exchanges": [
    {
      "speaker": "角色名",
      "content": "对话内容",
      "subtext": "潜台词（可选）",
      "action": "动作描写（可选）",
      "emotional_beat": "情感节奏（可选）"
    }
  ],
  "pacing_notes": "节奏说明",
  "scene_summary": "场景概要"
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

  async suggestResponses(ctx: AgentContext, params: {
    character: string;
    context: string;
    situation: string;
    count?: number;
  }): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');
    const character = characterMatrix?.characters?.find((c: any) => c.basic_info?.name === params.character);

    const prompt = `你是灵砚InkForge平台的对话顾问，负责为指定角色提供多种可能的回应选项。

角色信息：
${character ? JSON.stringify(character, null, 2) : `角色名：${params.character}`}

情境上下文：
${params.context}

当前情况：
${params.situation}

请为该角色生成${params.count || 3}种不同风格的回应选项：

输出格式（JSON）：
{
  "context": "${params.context}",
  "speaker": "${params.character}",
  "situation": "${params.situation}",
  "options": [
    {
      "content": "回应内容",
      "tone": "formal|casual|aggressive|defensive|romantic|humorous|serious",
      "subtext": "潜台词",
      "implications": ["可能的暗示1", "暗示2"]
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

  async improveDialogue(ctx: AgentContext, originalDialogue: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');

    const prompt = `你是灵砚InkForge平台的对话润色专家，负责将平淡的对话改写得更加生动自然。

原有对话：
---
${originalDialogue}
---

${characterMatrix ? `角色库：\n${JSON.stringify(characterMatrix, null, 2)}\n` : ''}

请对这段对话进行以下改进：
1. 让每个角色的说话方式更加独特
2. 增加潜台词和言外之意
3. 添加适当的肢体语言和动作描写
4. 提升对话的戏剧张力
5. 保持自然流畅的节奏

输出格式（JSON）：
{
  "improved_dialogue": [
    {
      "speaker": "角色名",
      "original": "原文",
      "improved": "改进后",
      "improvements": ["改进点1", "改进点2"]
    }
  ],
  "overall_notes": "整体改进说明"
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

export const dialogueGeneratorAgent = new DialogueGeneratorAgent();