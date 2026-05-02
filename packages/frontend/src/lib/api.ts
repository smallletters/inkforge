import { storage } from './storage';
import { useAuthStore } from './store';

const BASE = '/api/v1';

class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = (() => { try { return storage.get('token'); } catch { return null; } })();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  });
  const text = await res.text();
  if (!text) {
    if (!res.ok) throw new ApiError('请求失败', 'NETWORK_ERROR', res.status);
    return undefined as T;
  }
  let json: ApiResponse<T>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError('响应解析失败', 'PARSE_ERROR', res.status);
  }
  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new ApiError('认证已过期，请重新登录', 'UNAUTHORIZED', 401);
  }
  if (!res.ok || !json.success) {
    throw new ApiError(
      json.error?.message ?? '请求失败',
      json.error?.code,
      res.status,
      json.error?.details
    );
  }
  return json.data as T;
}

export const api = {
  auth: {
    login: (email: string, password: string) => request<{ access_token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (username: string, email: string, password: string) => request<{ access_token: string; user: any }>('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }),
  },
  novels: {
    list: () => request<any[]>('/novels'),
    get: (id: string) => request<any>(`/novels/${id}`),
    create: (data: { title: string; genre: string; outline?: string }) => request<any>('/novels', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { title?: string; genre?: string; outline?: any; characters?: any[]; world_setting?: any }) => request<any>(`/novels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/novels/${id}`, { method: 'DELETE' }),
    chapters: (id: string) => request<any[]>(`/novels/${id}/chapters`),
    chapter: (id: string, ch: number) => request<any>(`/novels/${id}/chapters/${ch}`),
    writeNext: (id: string, opts?: { word_count_target?: number }) => request<any>(`/novels/${id}/chapters/write-next`, { method: 'POST', body: JSON.stringify(opts ?? {}) }),
    updateChapter: (id: string, ch: number, data: { title?: string; content?: string }) => request<any>(`/novels/${id}/chapters/${ch}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  chapters: {
    list: (novelId: string) => request<any[]>(`/novels/${novelId}/chapters`),
    get: (novelId: string, ch: number) => request<any>(`/novels/${novelId}/chapters/${ch}`),
    delete: (novelId: string, ch: number) => request<any>(`/novels/${novelId}/chapters/${ch}`, { method: 'DELETE' }),
  },
  truthFiles: {
    list: (novelId: string) => request<any>(`/novels/${novelId}/truth-files`),
    get: (novelId: string, name: string) => request<any>(`/novels/${novelId}/truth-files/${name}`),
  },
  export: {
    create: (novelId: string, format: string, opts?: { chapters?: string; chapter_range?: { start: number; end: number } }) => request<any>(`/novels/${novelId}/export`, { method: 'POST', body: JSON.stringify({ format, chapters: opts?.chapters ?? 'all', chapter_range: opts?.chapter_range }) }),
    formats: (novelId: string) => request<any>(`/novels/${novelId}/export/formats`),
  },
  import: {
    upload: (data: { title: string; genre: string; file_content: string; file_type: string }) => request<any>('/novels/import', { method: 'POST', body: JSON.stringify(data) }),
    formats: () => request<any>('/novels/import/formats'),
  },
  agents: {
    list: () => request<any[]>('/agents-api/'),
    configs: () => request<any[]>('/agents/config'),
    config: (name: string) => request<any>(`/agents/${name}/config`),
    update: (name: string, data: { provider_id?: string; model?: string; system_prompt?: string; temperature?: number; max_tokens?: number }) => request<any>(`/agents/${name}/config`, { method: 'PUT', body: JSON.stringify(data) }),
    versions: (name: string) => request<any[]>(`/agents/${name}/versions`),
    rollback: (name: string, version: number) => request<any>(`/agents/${name}/rollback`, { method: 'POST', body: JSON.stringify({ version }) }),
  },
  providers: {
    list: () => request<any[]>('/providers'),
    create: (data: any) => request<any>('/providers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/providers/${id}`, { method: 'DELETE' }),
    test: (id: string) => request<any>(`/providers/${id}/test`, { method: 'POST' }),
  },
  pipeline: {
    status: (id: string) => request<any>(`/pipeline/${id}/status`),
    active: (novelId: string) => request<any>(`/pipeline/novel/${novelId}/active`),
    cancel: (id: string) => request<any>(`/pipeline/${id}/cancel`, { method: 'POST' }),
  },
  truth: {
    files: (novelId: string) => request<{ files: any[] }>(`/novels/${novelId}/truth-files`),
    file: (novelId: string, name: string) => request<any>(`/novels/${novelId}/truth-files/${name}`),
  },
  chat: {
    send: (data: { novel_id?: string; messages: { role: 'user' | 'assistant'; content: string }[]; extracted_info?: { genre?: string; title?: string; outline?: string; characters?: string; world_setting?: string } }) =>
      request<{ reply: string; current_step: string; extracted_info: any; suggestions: string[]; is_complete: boolean; ready_to_create: boolean }>('/chat', { method: 'POST', body: JSON.stringify(data) }),
    create: (data: { genre: string; title: string; outline?: string; characters?: any[]; world_setting?: any; author_intent?: string }) =>
      request<any>('/chat/create', { method: 'POST', body: JSON.stringify(data) }),
  },
  subscription: {
    plans: () => request<any>('/subscription/plans'),
    current: () => request<any>('/subscription/current'),
    usage: () => request<any>('/subscription/usage'),
    upgrade: (planId: string) => request<any>('/subscription/upgrade', { method: 'POST', body: JSON.stringify({ plan_id: planId }) }),
    cancel: () => request<any>('/subscription/cancel', { method: 'POST' }),
    features: () => request<any>('/features/availability'),
  },
};

export { ApiError };
export type { ApiResponse };
