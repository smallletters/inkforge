import { ProviderAdapter, ChatMessage, ChatOptions, ChatResponse } from './types';

const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_RETRIES = 2;

function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries: number, delay: number): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export class OpenAIAdapter implements ProviderAdapter {
  constructor(private baseUrl: string, private apiKey: string) {}

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
    const requestBody = {
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: false,
    };

    const fn = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      try {
        const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errorBody = await resp.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(`OpenAI API error ${resp.status}: ${errorBody.error?.message || errorBody.message}`);
        }

        const json = await resp.json() as any;
        return { 
          content: json.choices[0].message.content, 
          token_usage: { 
            prompt: json.usage?.prompt_tokens ?? 0, 
            completion: json.usage?.completion_tokens ?? 0, 
            total: json.usage?.total_tokens ?? 0 
          } 
        };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    return withRetry(fn, DEFAULT_MAX_RETRIES, 1000);
  }

  async listModels(): Promise<string[]> {
    const resp = await fetch(`${this.baseUrl}/v1/models`, { 
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) throw new Error(`OpenAI list models error: ${resp.status}`);
    const json = await resp.json() as any;
    return json.data.map((m: any) => m.id);
  }

  async testConnection(): Promise<boolean> { 
    try { 
      await Promise.race([this.listModels(), createTimeout(30000)]); 
      return true; 
    } catch { 
      return false; 
    } 
  }
}

export class AnthropicAdapter implements ProviderAdapter {
  constructor(private baseUrl: string, private apiKey: string) {}

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
    const systemMsg = messages.find(m => m.role === 'system');
    const normalMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));

    const fn = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      try {
        const resp = await fetch(`${this.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'x-api-key': this.apiKey, 
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ 
            model: options.model, 
            messages: normalMsgs, 
            system: systemMsg?.content, 
            max_tokens: options.max_tokens ?? 4096, 
            temperature: options.temperature ?? 0.7 
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errorBody = await resp.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(`Anthropic API error ${resp.status}: ${errorBody.error?.message || errorBody.message}`);
        }

        const json = await resp.json() as any;
        const textContent = json.content?.find((c: any) => c.type === 'text')?.text || '';
        return { 
          content: textContent, 
          token_usage: { 
            prompt: json.usage?.input_tokens ?? 0, 
            completion: json.usage?.output_tokens ?? 0, 
            total: (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0) 
          } 
        };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    return withRetry(fn, DEFAULT_MAX_RETRIES, 1000);
  }

  async listModels(): Promise<string[]> { 
    return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229']; 
  }

  async testConnection(): Promise<boolean> { 
    const fn = async () => {
      const resp = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'x-api-key': this.apiKey, 
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ 
          model: 'claude-3-5-haiku-20241022', 
          messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
          max_tokens: 10,
        }),
        signal: AbortSignal.timeout(30000),
      });
      return resp.ok;
    };
    try {
      return await withRetry(fn, DEFAULT_MAX_RETRIES, 1000);
    } catch {
      return false;
    }
  }
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(private baseUrl: string, private apiKey: string, private providerLabel: string) {}

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
    const requestBody = {
      model: options.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: false,
    };

    const fn = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      try {
        const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errorBody = await resp.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(`${this.providerLabel} API error ${resp.status}: ${errorBody.error?.message || errorBody.message || 'Unknown error'}`);
        }

        const json = await resp.json() as any;
        return {
          content: json.choices[0]?.message?.content || '',
          token_usage: {
            prompt: json.usage?.prompt_tokens ?? 0,
            completion: json.usage?.completion_tokens ?? 0,
            total: json.usage?.total_tokens ?? 0
          }
        };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    return withRetry(fn, DEFAULT_MAX_RETRIES, 1000);
  }

  async listModels(): Promise<string[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) return [];
      const json = await resp.json() as any;
      return json.data?.map((m: any) => m.id) ?? [];
    } catch {
      return [];
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await Promise.race([this.listModels(), createTimeout(30000)]);
      return true;
    } catch {
      return false;
    }
  }
}

export class GeminiAdapter implements ProviderAdapter {
  constructor(private baseUrl: string, private apiKey: string) {}

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find(m => m.role === 'system');

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.max_tokens ?? 4096,
      },
    };

    if (systemInstruction) {
      requestBody.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }

    const fn = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      try {
        const modelName = options.model.startsWith('gemini-') ? options.model : `models/${options.model}`;
        const resp = await fetch(`${this.baseUrl}/v1beta/${modelName}:generateContent?key=${this.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errorBody = await resp.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(`Gemini API error ${resp.status}: ${errorBody.error?.message || errorBody.message || 'Unknown error'}`);
        }

        const json = await resp.json() as any;
        const textContent = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const usageMeta = json.usageMetadata || {};

        return {
          content: textContent,
          token_usage: {
            prompt: usageMeta.promptTokenCount ?? 0,
            completion: usageMeta.candidatesTokenCount ?? 0,
            total: usageMeta.totalTokenCount ?? 0,
          },
        };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    return withRetry(fn, DEFAULT_MAX_RETRIES, 1000);
  }

  async listModels(): Promise<string[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1beta/models?key=${this.apiKey}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) return [];
      const json = await resp.json() as any;
      return json.models?.map((m: any) => m.name.replace('models/', '')) ?? [];
    } catch {
      return [];
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1beta/models?key=${this.apiKey}`, {
        signal: AbortSignal.timeout(30000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}