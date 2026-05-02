import { OpenAIAdapter, AnthropicAdapter, OpenAICompatibleAdapter, GeminiAdapter } from './adapters/index';
import { ProviderAdapter, ChatMessage, ChatOptions, ChatResponse } from './adapters/types';

const PROVIDER_MAP: Record<string, { baseUrl: string; adapterClass: new (baseUrl: string, apiKey: string, label?: string) => ProviderAdapter; validModels?: string[] }> = {
  openai: { baseUrl: 'https://api.openai.com', adapterClass: OpenAIAdapter as any, validModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4o-2024-05-13', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'] },
  anthropic: { baseUrl: 'https://api.anthropic.com', adapterClass: AnthropicAdapter as any, validModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240229'] },
  moonshot: { baseUrl: 'https://api.moonshot.cn', adapterClass: OpenAICompatibleAdapter as any, validModels: ['kimi-k2.5', 'kimi-latest', 'moonshot-v1-128k'] },
  deepseek: { baseUrl: 'https://api.deepseek.com', adapterClass: OpenAICompatibleAdapter as any, validModels: ['deepseek-chat', 'deepseek-coder', 'deepseek-v3'] },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', adapterClass: OpenAICompatibleAdapter as any, validModels: ['glm-4', 'glm-4-flash', 'glm-4-plus', 'glm-3-turbo'] },
  bailian: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', adapterClass: OpenAICompatibleAdapter as any, validModels: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext'] },
  google: { baseUrl: 'https://generativelanguage.googleapis.com', adapterClass: GeminiAdapter as any, validModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro-exp'] },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com', adapterClass: GeminiAdapter as any, validModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro-exp'] },
  minimax: { baseUrl: 'https://api.minimax.chat/v1', adapterClass: OpenAICompatibleAdapter as any, validModels: ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2', 'abab6-chat', 'abab5.5-chat'] },
  ollama: { baseUrl: 'http://localhost:11434', adapterClass: OpenAICompatibleAdapter as any },
};

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses: number[];
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half_open';
  consecutiveSuccesses: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 16000,
  backoffMultiplier: 4,
  retryableStatuses: [429, 503],
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 30000;
const CIRCUIT_BREAKER_HALF_OPEN_SUCCESS_THRESHOLD = 2;

export class ProviderBank {
  private adapters = new Map<string, ProviderAdapter>();
  private retryConfigs = new Map<string, RetryConfig>();
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private metrics = new Map<string, { totalRequests: number; failedRequests: number; totalLatency: number }>();

  register(name: string, providerType: string, apiKey: string, baseUrlOverride?: string, retryConfig?: Partial<RetryConfig>) {
    const info = PROVIDER_MAP[providerType];
    if (!info && providerType !== 'custom') throw new Error(`未知的服务商类型: ${providerType}。支持: ${Object.keys(PROVIDER_MAP).join(', ')}`);

    const baseUrl = baseUrlOverride ?? info?.baseUrl ?? '';
    const AdapterClass = info?.adapterClass ?? OpenAICompatibleAdapter;
    const adapter = new AdapterClass(baseUrl, apiKey, providerType);
    this.adapters.set(name, adapter);
    
    if (retryConfig) {
      this.retryConfigs.set(name, { ...DEFAULT_RETRY_CONFIG, ...retryConfig });
    }
    
    this.circuitBreakers.set(name, { failures: 0, lastFailure: 0, state: 'closed', consecutiveSuccesses: 0 });
    this.metrics.set(name, { totalRequests: 0, failedRequests: 0, totalLatency: 0 });
  }

  getAdapter(name: string): ProviderAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) throw new Error(`未注册的服务商: ${name}`);
    return adapter;
  }

  private getRetryConfig(serviceName: string): RetryConfig {
    return this.retryConfigs.get(serviceName) ?? DEFAULT_RETRY_CONFIG;
  }

  private getCircuitBreaker(serviceName: string): CircuitBreakerState {
    let cb = this.circuitBreakers.get(serviceName);
    if (!cb) {
      cb = { failures: 0, lastFailure: 0, state: 'closed', consecutiveSuccesses: 0 };
      this.circuitBreakers.set(serviceName, cb);
    }
    
    if (cb.state === 'open' && Date.now() - cb.lastFailure > CIRCUIT_BREAKER_TIMEOUT) {
      cb.state = 'half_open';
    }
    
    return cb;
  }

  private recordFailure(serviceName: string): void {
    const cb = this.getCircuitBreaker(serviceName);
    cb.failures++;
    cb.lastFailure = Date.now();
    cb.consecutiveSuccesses = 0;
    
    if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      cb.state = 'open';
    }

    const metrics = this.metrics.get(serviceName);
    if (metrics) metrics.failedRequests++;
  }

  private recordSuccess(serviceName: string): void {
    const cb = this.getCircuitBreaker(serviceName);
    cb.consecutiveSuccesses++;
    cb.failures = 0;
    
    if (cb.consecutiveSuccesses >= CIRCUIT_BREAKER_HALF_OPEN_SUCCESS_THRESHOLD) {
      cb.state = 'closed';
    }
  }

  private isRetryableError(status: number): boolean {
    return [429, 503].includes(status);
  }

  private calculateBackoffDelay(retryConfig: RetryConfig, attempt: number, isRateLimit: boolean): number {
    if (isRateLimit) {
      return retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt);
    }
    return Math.min(retryConfig.initialDelayMs * Math.pow(2, attempt), retryConfig.maxDelayMs);
  }

  async chat(serviceName: string, messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
    const adapter = this.getAdapter(serviceName);
    const retryConfig = this.getRetryConfig(serviceName);
    const circuitBreaker = this.getCircuitBreaker(serviceName);
    const metrics = this.metrics.get(serviceName);

    if (circuitBreaker.state === 'open') {
      throw new Error(`服务商 ${serviceName} 熔断器已打开，请在 ${Math.ceil((CIRCUIT_BREAKER_TIMEOUT - (Date.now() - circuitBreaker.lastFailure)) / 1000)} 秒后重试`);
    }

    if (metrics) metrics.totalRequests++;
    let lastError: Error | undefined;
    let delay = retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      const startTime = Date.now();
      
      try {
        const result = await adapter.chat(messages, options);
        this.recordSuccess(serviceName);
        
        if (metrics) {
          metrics.totalLatency += Date.now() - startTime;
        }
        
        return result;
      } catch (error) {
        const err = error as Error & { status?: number };
        lastError = err;
        const isRateLimit = err.status === 429;
        const isServerError = err.status === 503;
        
        if (metrics) {
          metrics.totalLatency += Date.now() - startTime;
        }
        
        if (attempt < retryConfig.maxRetries) {
          if (isServerError) {
            await new Promise(r => setTimeout(r, 10000));
          } else {
            delay = this.calculateBackoffDelay(retryConfig, attempt, isRateLimit);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
    }

    this.recordFailure(serviceName);
    throw lastError ?? new Error(`服务商 ${serviceName} 调用失败`);
  }

  validateModel(serviceName: string, model: string): boolean {
    const adapter = this.adapters.get(serviceName);
    if (!adapter) return true;

    const providerInfo = Object.entries(PROVIDER_MAP).find(([key]) => {
      return serviceName.includes(key);
    });

    if (!providerInfo || providerInfo[1].validModels === undefined) {
      return true;
    }

    const validModels = providerInfo[1].validModels!;
    const isValid = validModels.some(validModel =>
      model.toLowerCase().includes(validModel.toLowerCase()) ||
      validModel.toLowerCase().includes(model.toLowerCase())
    );

    return isValid;
  }

  getValidModels(providerType: string): string[] {
    const info = PROVIDER_MAP[providerType];
    return info?.validModels ?? [];
  }

  getSupportedProviders(): string[] {
    return Object.keys(PROVIDER_MAP);
  }

  resolveModelConfig(providerType: string, model: string): { valid: boolean; message?: string } {
    if (!model || model.trim() === '') {
      return { valid: true };
    }

    const info = PROVIDER_MAP[providerType];
    if (!info) {
      return { valid: true };
    }

    if (info.validModels === undefined || info.validModels.length === 0) {
      return { valid: true };
    }

    const isValid = info.validModels.some(validModel =>
      model.toLowerCase().includes(validModel.toLowerCase()) ||
      validModel.toLowerCase().includes(model.toLowerCase())
    );

    if (!isValid) {
      return {
        valid: false,
        message: `模型 ${model} 不属于 ${providerType} 服务商。有效模型: ${info.validModels.slice(0, 10).join(', ')}${info.validModels.length > 10 ? '...' : ''}`
      };
    }
    return { valid: true };
  }

  getMetrics(serviceName: string) {
    return this.metrics.get(serviceName) ?? { totalRequests: 0, failedRequests: 0, totalLatency: 0 };
  }

  getCircuitBreakerStatus(serviceName: string) {
    return this.getCircuitBreaker(serviceName);
  }
}

export const providerBank = new ProviderBank();

export async function initializeProviderBank(userId: string) {
  const { db } = await import('../db');
  const { llmProviders } = await import('../db/schema');
  const { eq } = await import('drizzle-orm');
  const { decrypt } = await import('../lib/crypto');
  
  const userProviders = await db.select().from(llmProviders).where(eq(llmProviders.user_id, userId));
  const activeProviders = userProviders.filter(p => p.is_active);
  
  for (const provider of activeProviders) {
    const apiKey = decrypt(provider.api_key_encrypted);
    providerBank.register(
      `${userId}-${provider.provider_type}`, 
      provider.provider_type, 
      apiKey, 
      provider.base_url
    );
  }
  
  return { providerBank, providers: activeProviders };
}
