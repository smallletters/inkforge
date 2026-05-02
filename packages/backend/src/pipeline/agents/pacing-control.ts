/**
 * 灵砚 InkForge - 节奏控制Agent
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：分析和优化叙事节奏，增强故事张力
 */
import { z } from 'zod';
import { providerBank } from '../../provider-bank';
import { eventBus } from '../../sse/event-bus';
import { db } from '../../db';
import { llmProviders, agentConfigs, truthFiles } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../../lib/crypto';
import type { AgentContext, AgentOutput } from '../base-agent';

const PacingAnalysisSchema = z.object({
  overall_pacing: z.object({
    rating: z.enum(['too_slow', 'balanced', 'too_fast']),
    score: z.number().min(0).max(100),
    summary: z.string(),
  }),
  chapter_analysis: z.array(z.object({
    chapter_number: z.number(),
    pacing_rating: z.enum(['slow', 'moderate', 'fast']),
    tension_level: z.number().min(0).max(10),
    page_turner_quality: z.number().min(0).max(10),
    issues: z.array(z.string()),
    strengths: z.array(z.string()),
  })),
  scene_analysis: z.array(z.object({
    scene_id: z.string(),
    pacing_effect: z.enum(['delays', 'maintains', 'accelerates']),
    tension_contribution: z.enum(['builds', 'releases', 'maintains']),
    suggested_adjustment: z.string().optional(),
  })),
  recommendations: z.array(z.object({
    priority: z.enum(['high', 'medium', 'low']),
    issue: z.string(),
    solution: z.string(),
    expected_impact: z.string(),
  })),
});

const PacingOptimizationSchema = z.object({
  modifications: z.array(z.object({
    location: z.string(),
    current_issue: z.string(),
    suggested_change: z.string(),
    reason: z.string(),
  })),
  tension_curve_redesign: z.object({
    description: z.string(),
    scene_sequence: z.array(z.object({
      scene: z.string(),
      tension_level: z.number(),
      pacing_effect: z.string(),
    })),
  }),
  cliffhanger_suggestions: z.array(z.object({
    chapter: z.number(),
    current_ending: z.string(),
    suggested_ending: z.string(),
    type: z.enum(['question', 'revelation', 'action', 'dilemma']),
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

export class PacingControlAgent {
  name = 'pacing_control' as const;

  async analyzePacing(ctx: AgentContext, content: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const chapterSummaries = await getTruthFileContent(ctx.novelId, 'chapter_summaries');

    const prompt = `你是灵砚InkForge平台的节奏分析师，负责分析叙事节奏并提供优化建议。

待分析内容：
---
${content}
---

${chapterSummaries ? `章节概要：\n${JSON.stringify(chapterSummaries, null, 2)}\n` : ''}

请进行以下分析：

**整体节奏评估**：
- 节奏评分（0-100）
- 节奏类型（过慢/均衡/过快）
- 总体评价

**章节级分析**：
- 每章的节奏评级
- 张力水平（0-10）
- 可读性评分

**场景级分析**：
- 各场景的节奏效果
- 张力贡献度
- 调整建议

**问题识别与建议**：
- 按优先级排列的问题
- 解决方案
- 预期效果

输出格式（JSON）：
{
  "overall_pacing": {
    "rating": "too_slow|balanced|too_fast",
    "score": 0-100,
    "summary": "总体评价"
  },
  "chapter_analysis": [
    {
      "chapter_number": 1,
      "pacing_rating": "slow|moderate|fast",
      "tension_level": 0-10,
      "page_turner_quality": 0-10,
      "issues": ["问题1"],
      "strengths": ["优点1"]
    }
  ],
  "scene_analysis": [
    {
      "scene_id": "scene-1",
      "pacing_effect": "delays|maintains|accelerates",
      "tension_contribution": "builds|releases|maintains",
      "suggested_adjustment": "调整建议"
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "issue": "问题描述",
      "solution": "解决方案",
      "expected_impact": "预期效果"
    }
  ]
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 64000) });
      const content_text = resp.content;

      let parsedData;
      try {
        const jsonMatch = content_text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: content_text };
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

  async optimizePacing(ctx: AgentContext, targetChapter?: number): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const chapterSummaries = await getTruthFileContent(ctx.novelId, 'chapter_summaries');
    const subplotBoard = await getTruthFileContent(ctx.novelId, 'subplot_board');

    const chapterInfo = targetChapter
      ? chapterSummaries?.chapters?.find((c: any) => c.chapter_number === targetChapter)
      : null;

    const prompt = `你是灵砚InkForge平台的节奏优化专家，负责提供具体的节奏优化方案。

${chapterSummaries ? `章节概要：\n${JSON.stringify(chapterSummaries, null, 2)}\n` : ''}
${subplotBoard ? `副线剧情：\n${JSON.stringify(subplotBoard, null, 2)}\n` : ''}
${targetChapter ? `目标章节：${targetChapter}，信息：\n${JSON.stringify(chapterInfo, null, 2)}\n` : ''}

请提供以下优化建议：

**节奏问题修改**：
- 定位具体问题
- 建议的修改方案
- 修改原因

**张力曲线重新设计**：
- 描述整体张力走向
- 场景序列与张力分布

**章节结尾悬念建议**：
- 当前结尾分析
- 建议的新结尾
- 悬念类型

输出格式（JSON）：
{
  "modifications": [
    {
      "location": "位置",
      "current_issue": "当前问题",
      "suggested_change": "建议修改",
      "reason": "原因"
    }
  ],
  "tension_curve_redesign": {
    "description": "张力曲线描述",
    "scene_sequence": [
      {"scene": "场景", "tension_level": 0-10, "pacing_effect": "效果"}
    ]
  },
  "cliffhanger_suggestions": [
    {
      "chapter": 1,
      "current_ending": "当前结尾",
      "suggested_ending": "建议结尾",
      "type": "question|revelation|action|dilemma"
    }
  ]
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 48000) });
      const content_text = resp.content;

      let parsedData;
      try {
        const jsonMatch = content_text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: content_text };
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

  async suggestCliffhangers(ctx: AgentContext, chapterNumber: number): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const chapterSummaries = await getTruthFileContent(ctx.novelId, 'chapter_summaries');
    const emotionalArcs = await getTruthFileContent(ctx.novelId, 'emotional_arcs');

    const chapterInfo = chapterSummaries?.chapters?.find((c: any) => c.chapter_number === chapterNumber);
    const previousChapters = chapterSummaries?.chapters?.slice(Math.max(0, chapterNumber - 3), chapterNumber) || [];

    const prompt = `你是灵砚InkForge平台的悬念设计专家，负责为章节结尾创作引人入胜的悬念。

当前章节：
- 章节号：${chapterNumber}
- 标题：${chapterInfo?.title || '待定'}
- 概要：${chapterInfo?.summary || chapterInfo?.synopsis || '暂无'}

前几章回顾：
${previousChapters.map((c: any) => `- 第${c.chapter_number}章 ${c.title}：${c.summary || c.synopsis || '暂无'}`).join('\n')}

${emotionalArcs ? `情感弧线：\n${JSON.stringify(emotionalArcs, null, 2)}\n` : ''}

请提供5个不同类型的章节悬念结尾建议：

输出格式（JSON）：
{
  "chapter_number": ${chapterNumber},
  "cliffhanger_suggestions": [
    {
      "type": "question|revelation|action|dilemma",
      "title": "悬念标题",
      "description": "悬念描述",
      "setup_required": "需要的铺垫",
      "impact_on_reader": "对读者的影响",
      "execution_difficulty": "easy|medium|hard"
    }
  ]
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 48000) });
      const content_text = resp.content;

      let parsedData;
      try {
        const jsonMatch = content_text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: content_text };
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

export const pacingControlAgent = new PacingControlAgent();