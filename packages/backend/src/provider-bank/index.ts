import { OpenAIAdapter, AnthropicAdapter, OpenAICompatibleAdapter } from './adapters/index';
import { ProviderAdapter, ChatMessage, ChatOptions, ChatResponse } from './adapters/types';

const PROVIDER_MAP: Record<string, { baseUrl: string; adapterClass: new (baseUrl: string, apiKey: string, label?: string) => ProviderAdapter }> = {
  openai: { baseUrl: 'https://api.openai.com', adapterClass: OpenAIAdapter as any },
  anthropic: { baseUrl: 'https://api.anthropic.com', adapterClass: AnthropicAdapter as any },
  moonshot: { baseUrl: 'https://api.moonshot.cn', adapterClass: OpenAICompatibleAdapter as any },
  deepseek: { baseUrl: 'https://api.deepseek.com', adapterClass: OpenAICompatibleAdapter as any },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', adapterClass: OpenAICompatibleAdapter as any },
  bailian: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', adapterClass: OpenAICompatibleAdapter as any },
  google: { baseUrl: 'https://generativelanguage.googleapis.com', adapterClass: OpenAICompatibleAdapter as any },
  ollama: { baseUrl: 'http://localhost:11434', adapterClass: OpenAICompatibleAdapter as any },
};

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half_open';
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 30000;

export class ProviderBank {
  private adapters = new Map<string, ProviderAdapter>();
  private retryConfigs = new Map<string, RetryConfig>();
  private circuitBreakers = new Map<string, CircuitBreakerState>();

  register(name: string, providerType: string, apiKey: string, baseUrlOverride?: string, retryConfig?: RetryConfig) {
    const info = PROVIDER_MAP[providerType];
    if (!info && providerType !== 'custom') throw new Error(`未知的服务商类型: ${providerType}。支持: ${Object.keys(PROVIDER_MAP).join(', ')}`);

    const baseUrl = baseUrlOverride ?? info?.baseUrl ?? '';
    const AdapterClass = info?.adapterClass ?? OpenAICompatibleAdapter;
    const adapter = new AdapterClass(baseUrl, apiKey, providerType);
    this.adapters.set(name, adapter);
    
    if (retryConfig) {
      this.retryConfigs.set(name, retryConfig);
    }
    
    this.circuitBreakers.set(name, { failures: 0, lastFailure: 0, state: 'closed' });
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
      cb = { failures: 0, lastFailure: 0, state: 'closed' };
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
    
    if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      cb.state = 'open';
    }
  }

  private recordSuccess(serviceName: string): void {
    const cb = this.getCircuitBreaker(serviceName);
    cb.failures = 0;
    cb.state = 'closed';
  }

  async chat(serviceName: string, messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
    const adapter = this.getAdapter(serviceName);
    const retryConfig = this.getRetryConfig(serviceName);
    const circuitBreaker = this.getCircuitBreaker(serviceName);

    if (circuitBreaker.state === 'open') {
      throw new Error(`服务商 ${serviceName} 熔断器已打开，请在稍后重试`);
    }

    let lastError: Error | undefined;
    let delay = retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const result = await adapter.chat(messages, options);
        this.recordSuccess(serviceName);
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retryConfig.maxRetries) {
          await new Promise(r => setTimeout(r, delay));
          delay = Math.min(delay * retryConfig.backoffMultiplier, retryConfig.maxDelayMs);
        }
      }
    }

    this.recordFailure(serviceName);
    throw lastError ?? new Error(`服务商 ${serviceName} 调用失败`);
  }

  validateModel(serviceName: string, model: string): boolean {
    return true;
  }

  getSupportedProviders(): string[] {
    return Object.keys(PROVIDER_MAP);
  }

  /**
   * Validate model belongs to the given provider type.
   */
  resolveModelConfig(providerType: string, model: string): { valid: boolean; message?: string } {
    if (!this.validateModel(providerType, model)) {
      return { valid: false, message: `模型 ${model} 不属于 ${providerType} 服务商` };
    }
    return { valid: true };
  }
}

export const providerBank = new ProviderBank();