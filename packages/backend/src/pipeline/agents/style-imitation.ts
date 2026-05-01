/**
 * 灵砚 InkForge - 文风仿写Agent
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-30
 *
 * 功能描述：分析参考文本的写作风格，并将其应用到AI生成的内容中
 */
import { z } from 'zod';
import { providerBank } from '../../provider-bank';
import { eventBus } from '../../sse/event-bus';
import { db } from '../../db';
import { llmProviders, agentConfigs } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { Buffer } from 'buffer';
import type { AgentContext, AgentOutput } from '../base-agent';

const StyleAnalysisSchema = z.object({
  writing_style: z.object({
    vocabulary_level: z.enum(['simple', 'moderate', 'advanced', 'literary']),
    sentence_structure: z.enum(['short', 'medium', 'long', 'varied']),
    paragraph_length: z.enum(['short', 'medium', 'long']),
    dialogue_ratio: z.number().min(0).max(1),
    narrative_perspective: z.enum(['first', 'second', 'third']),
    tone: z.array(z.string()),
    common_patterns: z.array(z.string()),
  }),
  distinctive_features: z.array(z.object({
    feature: z.string(),
    example: z.string(),
  })),
});

const StyleImitationSchema = z.object({
  adapted_content: z.string(),
  style_elements_applied: z.array(z.string()),
  deviations_from_original: z.array(z.string()),
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

export class StyleImitationAgent {
  name = 'style_imitation' as const;

  async analyze(ctx: AgentContext, referenceText: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const prompt = `你是灵砚InkForge平台的文风分析师，负责分析参考文本的写作风格特征。

分析以下文本的写作风格，并返回JSON格式的分析结果：

参考文本：
---
${referenceText}
---

分析维度：
1. 词汇水平（简单/中等/高级/文学化）
2. 句子结构（短句/中等/长句/多变）
3. 段落长度（短段/中等/长段）
4. 对话比例（0-1之间的数值）
5. 叙事视角（第一人称/第二人称/第三人称）
6. 语气/基调
7. 常用表达模式

同时识别3-5个该文本的独特风格特征，并提供具体例子。

输出格式（JSON）：
{
  "writing_style": {
    "vocabulary_level": "simple|moderate|advanced|literary",
    "sentence_structure": "short|medium|long|varied",
    "paragraph_length": "short|medium|long",
    "dialogue_ratio": 0.0-1.0,
    "narrative_perspective": "first|second|third",
    "tone": ["语气词1", "语气词2"],
    "common_patterns": ["模式1", "模式2"]
  },
  "distinctive_features": [
    {"feature": "特征描述", "example": "具体例子"},
    ...
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

  async imitate(ctx: AgentContext, content: string, styleProfile: z.infer<typeof StyleAnalysisSchema>): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const prompt = `你是灵砚InkForge平台的文风仿写Agent，负责将内容改写为指定的写作风格。

原始内容：
---
${content}
---

目标风格特征：
${JSON.stringify(styleProfile, null, 2)}

任务要求：
1. 保持内容的事实性和情节不变
2. 调整语言风格以匹配目标风格
3. 应用 distinctive_features 中的特征
4. 保持角色对话的自然性

输出格式（JSON）：
{
  "adapted_content": "改写后的内容",
  "style_elements_applied": ["应用的风格元素1", "应用的风格元素2"],
  "deviations_from_original": ["与原文的偏差1", "与原文的偏差2"]
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

export const styleImitationAgent = new StyleImitationAgent();
