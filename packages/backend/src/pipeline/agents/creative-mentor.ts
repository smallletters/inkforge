/**
 * 灵砚 InkForge - 创意导师Agent
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：提供写作指导、反馈和创意建议
 */
import { z } from 'zod';
import { providerBank } from '../../provider-bank';
import { eventBus } from '../../sse/event-bus';
import { db } from '../../db';
import { llmProviders, agentConfigs, truthFiles } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../../lib/crypto';
import type { AgentContext, AgentOutput } from '../base-agent';

const WritingGuidanceSchema = z.object({
  topic: z.string(),
  guidance: z.string(),
  examples: z.array(z.string()),
  exercises: z.array(z.string()),
});

const ContentFeedbackSchema = z.object({
  overall_assessment: z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    rating: z.number().min(0).max(100),
  }),
  specific_feedback: z.array(z.object({
    aspect: z.string(),
    comment: z.string(),
    severity: z.enum(['critical', 'major', 'minor', 'suggestion']),
    suggestion: z.string(),
  })),
  priority_fixes: z.array(z.string()),
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

export class CreativeMentorAgent {
  name = 'creative_mentor' as const;

  async provideGuidance(ctx: AgentContext, topic: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const prompt = `你是灵砚InkForge平台的创意写作导师，负责提供专业的写作指导。

用户请求指导的主题：${topic}

请提供：
1. 核心概念的详细解释
2. 3-5个优秀写作示例
3. 2-3个实践练习建议
4. 常见错误和如何避免

指导语言：中文
指导风格：专业、鼓励、实用

输出格式（JSON）：
{
  "topic": "${topic}",
  "guidance": "详细指导内容",
  "examples": ["示例1", "示例2", "示例3"],
  "exercises": ["练习1", "练习2"]
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

  async reviewContent(ctx: AgentContext, content: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');
    const currentState = await getTruthFileContent(ctx.novelId, 'current_state');

    const prompt = `你是灵砚InkForge平台的资深编辑，负责提供建设性的写作反馈。

待审阅内容：
---
${content}
---

${characterMatrix ? `角色设定：\n${JSON.stringify(characterMatrix, null, 2)}\n` : ''}
${currentState ? `世界观设定：\n${JSON.stringify(currentState, null, 2)}\n` : ''}

请进行以下审阅：

**总体评价**：
- 主要优点
- 主要不足
- 评分（0-100）

**具体反馈**：
- 方面（情节/角色/对话/描写/节奏等）
- 评论
- 严重程度（critical/major/minor/suggestion）
- 改进建议

**优先修复项**：按重要性排列需要修复的问题

输出格式（JSON）：
{
  "overall_assessment": {
    "strengths": ["优点1", "优点2"],
    "weaknesses": ["不足1", "不足2"],
    "rating": 0-100
  },
  "specific_feedback": [
    {
      "aspect": "方面",
      "comment": "评论",
      "severity": "critical|major|minor|suggestion",
      "suggestion": "建议"
    }
  ],
  "priority_fixes": ["优先修复1", "修复2"]
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

  async brainstorm(ctx: AgentContext, query: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const chapterSummaries = await getTruthFileContent(ctx.novelId, 'chapter_summaries');
    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');

    const prompt = `你是灵砚InkForge平台的创意头脑风暴专家，负责帮助用户产生创意想法。

用户问题/需求：${query}

${chapterSummaries ? `当前章节概要：\n${JSON.stringify(chapterSummaries, null, 2)}\n` : ''}
${characterMatrix ? `当前角色库：\n${JSON.stringify(characterMatrix, null, 2)}\n` : ''}

请提供：
1. 10-15个创意方向
2. 每个方向简要说明
3. 创意之间的关联性分析
4. 最具潜力的3个方向推荐

输出格式（JSON）：
{
  "ideas": [
    {
      "title": "创意标题",
      "description": "简要描述",
      "potential": "high|medium|low",
      "connection_to_existing": "与现有内容的关联"
    }
  ],
  "connections": ["创意关联分析"],
  "top_recommendations": ["推荐1", "推荐2", "推荐3"]
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 64000) });
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

export const creativeMentorAgent = new CreativeMentorAgent();