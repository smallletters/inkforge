import { Hono } from 'hono';
import { db } from '../db';
import { llmProviders } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { providerBank } from '../provider-bank';
import { OpenAIAdapter, AnthropicAdapter, OpenAICompatibleAdapter, GeminiAdapter } from '../provider-bank/adapters';
import { encrypt, decrypt } from '../lib/crypto';

type Variables = {
  user_id: string;
  username: string;
};

const providersRoute = new Hono<{ Variables: Variables }>();

providersRoute.get('/', async (c) => {
  const userId = c.get('user_id') as string;
  const providers = await db.select({
    id: llmProviders.id,
    name: llmProviders.name,
    provider_type: llmProviders.provider_type,
    base_url: llmProviders.base_url,
    models: llmProviders.models,
    is_active: llmProviders.is_active,
    last_tested_at: llmProviders.last_tested_at,
    created_at: llmProviders.created_at,
    updated_at: llmProviders.updated_at,
  }).from(llmProviders).where(eq(llmProviders.user_id, userId));

  return c.json({ success: true, data: providers });
});

providersRoute.post('/', async (c) => {
  const userId = c.get('user_id') as string;
  const body = await c.req.json();

  const schema = z.object({
    name: z.string().min(1).max(100),
    provider_type: z.enum(['openai', 'anthropic', 'google', 'gemini', 'moonshot', 'deepseek', 'zhipu', 'bailian', 'ollama', 'custom']),
    base_url: z.string(),
    api_key: z.string(),
    models: z.array(z.string()).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ 
      success: false, 
      error: { code: 'PROVIDER_400', message: '参数校验失败', details: parsed.error.flatten() } 
    }, 400);
  }

  const validation = providerBank.resolveModelConfig(parsed.data.provider_type, parsed.data.models?.[0] || '');
  if (!validation.valid) {
    return c.json({ 
      success: false, 
      error: { code: 'PROVIDER_422', message: validation.message } 
    }, 422);
  }

  let models: string[] = parsed.data.models || [];
  
  try {
    let adapter;
    switch (parsed.data.provider_type) {
      case 'anthropic':
        adapter = new AnthropicAdapter(parsed.data.base_url, parsed.data.api_key);
        models = await adapter.listModels();
        break;
      case 'openai':
        adapter = new OpenAIAdapter(parsed.data.base_url, parsed.data.api_key);
        models = await adapter.listModels();
        break;
      case 'google':
      case 'gemini':
        adapter = new GeminiAdapter(parsed.data.base_url, parsed.data.api_key);
        models = await adapter.listModels();
        break;
      default:
        adapter = new OpenAICompatibleAdapter(parsed.data.base_url, parsed.data.api_key, parsed.data.provider_type);
        models = await adapter.listModels();
        break;
    }
  } catch {
    models = parsed.data.models || [];
  }

  const [provider] = await db.insert(llmProviders).values({
    user_id: userId,
    name: parsed.data.name,
    provider_type: parsed.data.provider_type,
    base_url: parsed.data.base_url,
    api_key_encrypted: encrypt(parsed.data.api_key),
    models,
    is_active: true,
    last_tested_at: new Date(),
  }).returning();

  return c.json({ 
    success: true, 
    data: {
      id: provider.id,
      name: provider.name,
      provider_type: provider.provider_type,
      base_url: provider.base_url,
      models,
      is_active: provider.is_active,
      last_tested_at: provider.last_tested_at,
      created_at: provider.created_at,
    }
  }, 201);
});

providersRoute.post('/:id/test', async (c) => {
  const userId = c.get('user_id') as string;
  const providerId = c.req.param('id');

  const [provider] = await db.select().from(llmProviders).where(
    and(eq(llmProviders.id, providerId), eq(llmProviders.user_id, userId))
  ).limit(1);

  if (!provider) {
    return c.json({ success: false, error: { code: 'PROVIDER_400', message: '服务商不存在' } }, 400);
  }

  let apiKey: string;
  try {
    apiKey = decrypt(provider.api_key_encrypted);
  } catch {
    return c.json({ success: false, error: { code: 'PROVIDER_422', message: 'API Key解密失败' } }, 422);
  }

  let success = false;
  let httpStatus: number | undefined;
  let response: string | undefined;

  try {
    let adapter;
    switch (provider.provider_type) {
      case 'anthropic':
        adapter = new AnthropicAdapter(provider.base_url, apiKey);
        break;
      case 'openai':
        adapter = new OpenAIAdapter(provider.base_url, apiKey);
        break;
      case 'google':
      case 'gemini':
        adapter = new GeminiAdapter(provider.base_url, apiKey);
        break;
      default:
        adapter = new OpenAICompatibleAdapter(provider.base_url, apiKey, provider.provider_type);
        break;
    }
    
    success = await adapter.testConnection();
  } catch (err) {
    httpStatus = (err as any)?.status || 500;
    response = (err as Error).message;
  }

  await db.update(llmProviders).set({
    is_active: success,
    last_tested_at: new Date(),
  }).where(eq(llmProviders.id, providerId));

  if (!success) {
    return c.json({ 
      success: false, 
      error: { 
        code: 'PROVIDER_422', 
        message: '连接测试失败',
        details: { http_status: httpStatus, response }
      } 
    }, 422);
  }

  return c.json({ success: true, data: { message: '连接测试成功' } });
});

providersRoute.put('/:id', async (c) => {
  const userId = c.get('user_id') as string;
  const providerId = c.req.param('id');
  const body = await c.req.json();

  const [existing] = await db.select().from(llmProviders).where(
    and(eq(llmProviders.id, providerId), eq(llmProviders.user_id, userId))
  ).limit(1);

  if (!existing) {
    return c.json({ success: false, error: { code: 'PROVIDER_404', message: '服务商不存在' } }, 404);
  }

  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    base_url: z.string().optional(),
    api_key: z.string().optional(),
    models: z.array(z.string()).optional(),
    is_active: z.boolean().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_400', message: '参数校验失败' } }, 400);
  }

  const updateData: any = { updated_at: new Date() };
  if (parsed.data.name) updateData.name = parsed.data.name;
  if (parsed.data.base_url) updateData.base_url = parsed.data.base_url;
  if (parsed.data.api_key) updateData.api_key_encrypted = encrypt(parsed.data.api_key);
  if (parsed.data.models) updateData.models = parsed.data.models;
  if (parsed.data.is_active !== undefined) updateData.is_active = parsed.data.is_active;

  await db.update(llmProviders).set(updateData).where(eq(llmProviders.id, providerId));

  return c.json({ success: true, data: { message: '更新成功' } });
});

providersRoute.delete('/:id', async (c) => {
  const userId = c.get('user_id') as string;
  const providerId = c.req.param('id');

  const result = await db.delete(llmProviders).where(
    and(eq(llmProviders.id, providerId), eq(llmProviders.user_id, userId))
  );

  if ((result as any)?.rowCount === 0) {
    return c.json({ success: false, error: { code: 'PROVIDER_400', message: '服务商不存在或无权限删除' } }, 400);
  }

  return c.json({ success: true, data: { message: '服务商已删除' } });
});

providersRoute.get('/supported', async (c) => {
  return c.json({
    success: true,
    data: {
      providers: [
        { id: 'openai', name: 'OpenAI', description: 'GPT-4o, GPT-4o-mini', base_url: 'https://api.openai.com' },
        { id: 'anthropic', name: 'Anthropic', description: 'Claude 3.5 Sonnet, Haiku', base_url: 'https://api.anthropic.com' },
        { id: 'google', name: 'Google', description: 'Gemini 2.5 Flash, Pro', base_url: 'https://generativelanguage.googleapis.com' },
        { id: 'moonshot', name: 'Moonshot', description: 'Kimi k2.5', base_url: 'https://api.moonshot.cn' },
        { id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek V3, R1', base_url: 'https://api.deepseek.com' },
        { id: 'zhipu', name: '智谱', description: 'GLM-4, GLM-4 Flash', base_url: 'https://open.bigmodel.cn/api/paas/v4' },
        { id: 'bailian', name: '百炼', description: 'Qwen系列', base_url: 'https://dashscope.aliyuncs.com/compatible-mode' },
        { id: 'ollama', name: 'Ollama', description: '本地开源模型', base_url: 'http://localhost:11434' },
        { id: 'custom', name: '自定义', description: 'OpenAI兼容接口', base_url: '' },
      ],
    },
  });
});

export default providersRoute;