export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatOptions { model: string; temperature?: number; max_tokens?: number; stream?: boolean }
export interface ChatResponse { content: string; token_usage?: { prompt: number; completion: number; total: number } }

export interface ProviderAdapter {
  chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse>;
  listModels(): Promise<string[]>;
  testConnection(): Promise<boolean>;
}
