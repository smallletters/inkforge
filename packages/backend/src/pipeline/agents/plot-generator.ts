/**
 * 灵砚 InkForge - 剧情生成Agent
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：基于世界观和角色设定生成故事剧情线
 */
import { z } from 'zod';
import { providerBank } from '../../provider-bank';
import { eventBus } from '../../sse/event-bus';
import { db } from '../../db';
import { llmProviders, agentConfigs, truthFiles } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../../lib/crypto';
import type { AgentContext, AgentOutput } from '../base-agent';

const PlotOutlineSchema = z.object({
  title: z.string(),
  genre: z.string(),
  logline: z.string(),
  themes: z.array(z.string()),
  acts: z.array(z.object({
    act_number: z.number(),
    title: z.string(),
    summary: z.string(),
    key_events: z.array(z.string()),
    chapters: z.array(z.object({
      chapter_number: z.number(),
      title: z.string(),
      synopsis: z.string(),
      scenes: z.array(z.object({
        setting: z.string(),
        characters: z.array(z.string()),
        conflict: z.string(),
        resolution: z.string(),
      })),
    })),
  })),
  subplots: z.array(z.object({
    title: z.string(),
    summary: z.string(),
    chapters_affected: z.array(z.number()),
  })),
  foreshadowing: z.array(z.object({
    early_reference: z.string(),
    payoff_later: z.string(),
    chapter: z.number(),
  })),
});

const ChapterPlotSchema = z.object({
  chapter_number: z.number(),
  title: z.string(),
  synopsis: z.string(),
  pov_character: z.string().optional(),
  opening_hook: z.string(),
  key_scenes: z.array(z.object({
    scene_number: z.number(),
    setting: z.string(),
    time_period: z.string(),
    characters_present: z.array(z.string()),
    action: z.string(),
    dialogue_highlights: z.array(z.string()),
    emotional_beat: z.string(),
  })),
  conflict_threads: z.array(z.object({
    thread_name: z.string(),
    status: z.enum(['introduced', 'escalating', 'resolved', 'foreshadowed']),
    progression: z.string(),
  })),
  pacing_notes: z.object({
    tempo: z.enum(['slow', 'moderate', 'fast']),
    tension_curve: z.array(z.number()),
    chapter_cliffhanger: z.string().optional(),
  }),
  word_count_target: z.number(),
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

export class PlotGeneratorAgent {
  name = 'plot_generator' as const;

  async generateOutline(ctx: AgentContext, params: {
    genre?: string;
    target_chapters?: number;
    themes?: string[];
  }): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const worldbuilding = await getTruthFileContent(ctx.novelId, 'current_state');
    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');

    const prompt = `你是灵砚InkForge平台的剧情架构师，负责构建完整的故事大纲。

当前项目信息：
${worldbuilding ? `世界观设定：\n${JSON.stringify(worldbuilding, null, 2)}\n` : ''}
${characterMatrix ? `角色设定：\n${JSON.stringify(characterMatrix, null, 2)}\n` : ''}

用户指定参数：
- 类型：${params.genre || '未指定'}
- 目标章节数：${params.target_chapters || 20}
- 主题：${params.themes?.join(', ') || '未指定'}

请生成完整的剧情大纲，包含：
1. 一句话简介（logline）
2. 三幕式结构（建置、对抗、解决）
3. 每章概要
4. 副线剧情
5. 伏笔与呼应

输出格式（JSON）：
{
  "title": "故事标题",
  "genre": "类型",
  "logline": "一句话简介",
  "themes": ["主题1", "主题2"],
  "acts": [
    {
      "act_number": 1,
      "title": "第一幕标题",
      "summary": "幕概要",
      "key_events": ["关键事件1", "关键事件2"],
      "chapters": [
        {
          "chapter_number": 1,
          "title": "章标题",
          "synopsis": "章概要",
          "scenes": [{"setting": "", "characters": [], "conflict": "", "resolution": ""}]
        }
      ]
    }
  ],
  "subplots": [{"title": "", "summary": "", "chapters_affected": []}],
  "foreshadowing": [{"early_reference": "", "payoff_later": "", "chapter": 0}]
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

  async expandChapter(ctx: AgentContext, chapterNumber: number, previousChapterSummary?: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const chapterSummaries = await getTruthFileContent(ctx.novelId, 'chapter_summaries');
    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');
    const currentState = await getTruthFileContent(ctx.novelId, 'current_state');

    const chapterInfo = chapterSummaries?.chapters?.find((c: any) => c.chapter_number === chapterNumber);
    const previousChapter = chapterSummaries?.chapters?.find((c: any) => c.chapter_number === chapterNumber - 1);

    const prompt = `你是灵砚InkForge平台的剧情细化专家，负责将章节概要扩展为详细的场景规划。

当前章节信息：
- 章节号：${chapterNumber}
- 标题：${chapterInfo?.title || '待定'}
- 概要：${chapterInfo?.summary || chapterInfo?.synopsis || '暂无'}

${previousChapter ? `上一章概要：\n${previousChapter.summary || previousChapter.synopsis || '暂无'}\n` : ''}
${previousChapterSummary ? `前章回顾：\n${previousChapterSummary}\n` : ''}

${characterMatrix ? `角色库：\n${JSON.stringify(characterMatrix, null, 2)}\n` : ''}
${currentState ? `当前世界观状态：\n${JSON.stringify(currentState, null, 2)}\n` : ''}

请将章节概要扩展为详细的场景规划：

输出格式（JSON）：
{
  "chapter_number": ${chapterNumber},
  "title": "章标题",
  "synopsis": "章概要",
  "pov_character": "视角角色名",
  "opening_hook": "开篇钩子",
  "key_scenes": [
    {
      "scene_number": 1,
      "setting": "场景地点",
      "time_period": "时间",
      "characters_present": ["角色1", "角色2"],
      "action": "动作描述",
      "dialogue_highlights": ["对话1", "对话2"],
      "emotional_beat": "情感节奏"
    }
  ],
  "conflict_threads": [
    {"thread_name": "线索名", "status": "introduced|escalating|resolved|foreshadowed", "progression": "进展描述"}
  ],
  "pacing_notes": {
    "tempo": "slow|moderate|fast",
    "tension_curve": [30, 45, 60, 75, 90],
    "chapter_cliffhanger": "章节悬念（可选）"
  },
  "word_count_target": 3000
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

  async suggestPlotTwists(ctx: AgentContext, chapterNumber: number): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const chapterSummaries = await getTruthFileContent(ctx.novelId, 'chapter_summaries');
    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');
    const subplotBoard = await getTruthFileContent(ctx.novelId, 'subplot_board');

    const chapterInfo = chapterSummaries?.chapters?.find((c: any) => c.chapter_number === chapterNumber);
    const previousChapters = chapterSummaries?.chapters?.slice(Math.max(0, chapterNumber - 5), chapterNumber) || [];

    const prompt = `你是灵砚InkForge平台的剧情反转专家，负责为指定章节提供意想不到的剧情转折建议。

当前章节：
- 章节号：${chapterNumber}
- 标题：${chapterInfo?.title || '待定'}
- 概要：${chapterInfo?.summary || chapterInfo?.synopsis || '暂无'}

前几章回顾：
${previousChapters.map((c: any) => `- 第${c.chapter_number}章 ${c.title}：${c.summary || c.synopsis || '暂无'}`).join('\n')}

${characterMatrix ? `角色状态：\n${JSON.stringify(characterMatrix, null, 2)}\n` : ''}
${subplotBoard ? `副线剧情：\n${JSON.stringify(subplotBoard, null, 2)}\n` : ''}

请提供3-5个符合故事发展的剧情反转建议，每个反转应该：
1. 意料之外但情理之中
2. 与已有伏笔呼应
3. 推动角色成长或揭示真相

输出格式（JSON）：
{
  "chapter_number": ${chapterNumber},
  "twist_suggestions": [
    {
      "twist_type": "身份揭示|关系逆转|意外事件|隐藏动机|时机巧合",
      "title": "反转标题",
      "description": "反转描述",
      "surprise_factor": 0.0-1.0,
      "setup_required": ["需要的伏笔1", "需要的伏笔2"],
      "consequences": ["后果1", "后果2"],
      "integration_notes": "如何与现有剧情融合"
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
}

export const plotGeneratorAgent = new PlotGeneratorAgent();