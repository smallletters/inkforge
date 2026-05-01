import { providerBank } from '../provider-bank';
import { eventBus } from '../sse/event-bus';
import { db } from '../db';
import { llmProviders, agentConfigs } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../lib/crypto';

export type AgentName = 'radar' | 'planner' | 'composer' | 'architect' | 'writer' | 'observer' | 'reflector' | 'normalizer' | 'auditor' | 'reviser';

export interface AgentContext {
  novelId: string;
  userId: string;
  pipelineId: string;
  chapterNumber: number;
  config: { 
    provider: string; 
    model: string; 
    systemPrompt?: string; 
    temperature: number; 
    maxTokens: number;
    pipelineData?: Record<string, unknown>;
    currentContent?: string;
  };
}

export interface AgentOutput {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

async function getUserProviderAdapter(userId: string, agentName: string, preferredProvider?: string) {
  const userProviders = await db.select().from(llmProviders).where(eq(llmProviders.user_id, userId));
  const activeProviders = userProviders.filter((p: any) => p.is_active);
  
  if (activeProviders.length === 0) {
    throw new Error('未配置LLM服务商，请先在模型配置中添加API密钥');
  }
  
  const agentConfigList = await db.select().from(agentConfigs).where(
    and(eq(agentConfigs.user_id, userId), eq(agentConfigs.agent_name, agentName))
  );
  const agentConfig = agentConfigList[0];
  
  const providerType = agentConfig?.provider ?? preferredProvider ?? 'openai';
  const model = agentConfig?.model ?? (providerType === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini');
  
  const provider = activeProviders.find((p: any) => p.provider_type === providerType) ?? activeProviders[0];
  if (!provider) throw new Error(`未找到${providerType}服务商配置`);
  
  let apiKey: string;
  try {
    apiKey = decrypt(provider.api_key_encrypted);
  } catch {
    throw new Error('API Key解密失败，请重新配置服务商');
  }
  
  const adapterKey = `${userId}-${agentName}`;
  providerBank.register(adapterKey, provider.provider_type, apiKey, provider.base_url);
  
  return { adapterKey, model, temperature: agentConfig?.temperature ?? 0.7, maxTokens: agentConfig?.max_tokens ?? 4096, systemPrompt: agentConfig?.system_prompt };
}

export abstract class BaseAgent {
  abstract name: AgentName;

  async execute(ctx: AgentContext): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });
    try {
      const result = await this.run(ctx);
      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.complete', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, duration_ms: durationMs, output_summary: JSON.stringify(result).slice(0, 100) } });
      return { success: true, data: result, durationMs };
    } catch (e) {
      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.error', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, error_type: (e as Error).name, retry_count: 0 } });
      return { success: false, error: (e as Error).message, durationMs };
    }
  }

  protected async callLLM(
    ctx: AgentContext, 
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    customSystemPrompt?: string
  ): Promise<string> {
    const { adapterKey, model, temperature, maxTokens, systemPrompt: agentPrompt } = await getUserProviderAdapter(ctx.userId, this.name, ctx.config.provider);
    
    let systemContent = customSystemPrompt ?? agentPrompt ?? ctx.config.systemPrompt ?? this.getDefaultSystemPrompt();
    
    const resp = await providerBank.chat(adapterKey, messages, {
      model: model,
      temperature: temperature ?? ctx.config.temperature,
      max_tokens: Math.min(maxTokens ?? ctx.config.maxTokens, 32000),
    });
    return resp.content;
  }

  protected getDefaultSystemPrompt(): string {
    return `你是灵砚InkForge平台的${this.name} Agent，负责协助用户进行小说创作。`;
  }

  protected abstract run(ctx: AgentContext): Promise<Record<string, unknown>>;
}