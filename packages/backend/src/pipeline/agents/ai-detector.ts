/**
 * 灵砚 InkForge - AI检测Agent
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-30
 *
 * 功能描述：检测AI生成内容的特征，降低AI味，提升内容自然度
 */
import { z } from 'zod';
import { providerBank } from '../../provider-bank';
import { eventBus } from '../../sse/event-bus';
import { db } from '../../db';
import { llmProviders, agentConfigs } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { Buffer } from 'buffer';
import type { AgentContext, AgentOutput } from '../base-agent';

const AIDetectionSchema = z.object({
  ai_probability: z.number().min(0).max(1),
  detected_patterns: z.array(z.object({
    pattern: z.string(),
    severity: z.enum(['high', 'medium', 'low']),
    occurrences: z.number(),
    examples: z.array(z.string()),
  })),
  overall_assessment: z.object({
    score: z.number().min(0).max(100),
    label: z.enum(['very_likely_ai', 'likely_ai', 'uncertain', 'likely_human', 'very_likely_human']),
    summary: z.string(),
  }),
});

const HumanizationSchema = z.object({
  original_segments: z.array(z.object({
    text: z.string(),
    reason: z.string(),
  })),
  humanized_content: z.string(),
  modifications_made: z.array(z.object({
    original: z.string(),
    revised: z.string(),
    reason: z.string(),
  })),
  authenticity_score: z.number().min(0).max(100),
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
    apiKey = Buffer.from(provider.api_key_encrypted, 'base64').toString('utf8');
  } catch {
    throw new Error('API Key解密失败');
  }

  const adapterKey = `${userId}-${agentName}`;
  providerBank.register(adapterKey, provider.provider_type, apiKey, provider.base_url);
  return { adapterKey, model, temperature: agentConfig?.temperature ?? 0.7, maxTokens: agentConfig?.max_tokens ?? 4096 };
}

export class AIDetectionAgent {
  name = 'ai_detector' as const;

  async detect(ctx: AgentContext, content: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const prompt = `你是灵砚InkForge平台的AI内容检测专家，负责分析文本是否为AI生成，并识别常见的AI写作模式。

请分析以下内容的AI生成概率和特征：

---
${content}
---

检测维度：
1. **词汇选择**：AI倾向于使用过于正式或书面的词汇
2. **句式结构**：AI喜欢使用整齐划一的句式
3. **重复模式**：AI容易出现词汇和句式的重复
4. **情感表达**：AI的情感表达往往缺乏真实感
5. **逻辑连接**：AI的逻辑过渡有时过于生硬
6. **细节描写**：AI的细节描写可能过于笼统或过于堆砌

请返回详细的分析报告：

输出格式（JSON）：
{
  "ai_probability": 0.0-1.0之间的概率值,
  "detected_patterns": [
    {
      "pattern": "模式名称",
      "severity": "high|medium|low",
      "occurrences": 发现次数,
      "examples": ["具体例子1", "具体例子2"]
    }
  ],
  "overall_assessment": {
    "score": 0-100的评分,
    "label": "very_likely_ai|likely_ai|uncertain|likely_human|very_likely_human",
    "summary": "总体评价总结"
  }
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 32000) });
      const responseContent = resp.content;

      let parsedData;
      try {
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: responseContent };
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

export class HumanizationAgent {
  name = 'humanization' as const;

  async humanize(ctx: AgentContext, content: string, detectionResult?: z.infer<typeof AIDetectionSchema>): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const prompt = `你是灵砚InkForge平台的内容优化专家，负责将AI生成的内容改写得更自然、更有人的味道。

请对以下内容进行"去AI味"改写：

---
${content}
---

${detectionResult ? `已检测到的AI特征（请重点优化这些部分）：
${JSON.stringify(detectionResult.detected_patterns, null, 2)}
` : ''}

改写原则：
1. **词汇多样化**：用更口语化、更具体的词汇替换AI常用的正式词汇
2. **句式变化**：打破AI喜欢的整齐句式，引入更多长短变化
3. **减少重复**：消除词汇和表达方式的重复
4. **增加细节**：加入AI往往忽略的具体感官描写
5. **情感真实**：让人物的情感反应更真实、更独特
6. **自然过渡**：使用更自然的逻辑连接词

请进行改写：

输出格式（JSON）：
{
  "original_segments": [
    {"text": "原文片段", "reason": "被判定为AI特征的原因"}
  ],
  "humanized_content": "改写后的完整内容",
  "modifications_made": [
    {"original": "原文", "revised": "改后", "reason": "修改原因"}
  ],
  "authenticity_score": 0-100的评分
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 32000) });
      const responseContent = resp.content;

      let parsedData;
      try {
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: responseContent };
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

export const aiDetectionAgent = new AIDetectionAgent();
export const humanizationAgent = new HumanizationAgent();
