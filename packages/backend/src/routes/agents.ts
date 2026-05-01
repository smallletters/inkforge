import { Hono } from 'hono';
import { db } from '../db';
import { agentConfigs, llmProviders } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

type Variables = {
  user_id: string;
  username: string;
};

const VALID_AGENTS = ['planner', 'writer', 'auditor', 'reviser', 'architect', 'composer', 'observer', 'reflector', 'normalizer', 'radar'];

const agentsRoute = new Hono<{ Variables: Variables }>();

agentsRoute.get('/config', async (c) => {
  const userId = c.get('user_id') as string;
  const configs = await db.select().from(agentConfigs).where(eq(agentConfigs.user_id, userId));
  return c.json({ success: true, data: configs });
});

agentsRoute.get('/:name/config', async (c) => {
  const name = c.req.param('name');
  if (!VALID_AGENTS.includes(name)) {
    return c.json({ success: false, error: { code: 'AGENT_404', message: `Agent 名称无效，有效值: ${VALID_AGENTS.join(', ')}` } }, 404);
  }

  const userId = c.get('user_id') as string;
  const [config] = await db.select().from(agentConfigs).where(
    and(eq(agentConfigs.user_id, userId), eq(agentConfigs.agent_name, name))
  ).limit(1);

  if (!config) {
    return c.json({ success: true, data: null });
  }

  return c.json({ success: true, data: config });
});

agentsRoute.put('/:name/config', async (c) => {
  const name = c.req.param('name');
  if (!VALID_AGENTS.includes(name)) {
    return c.json({ success: false, error: { code: 'AGENT_404', message: `Agent 名称无效，有效值: ${VALID_AGENTS.join(', ')}` } }, 404);
  }

  const userId = c.get('user_id') as string;
  const body = await c.req.json();
  const schema = z.object({
    provider_id: z.string().uuid().optional(),
    model: z.string().optional(),
    system_prompt: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().min(1).max(128000).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() } }, 422);

  const existing = await db.select().from(agentConfigs).where(and(eq(agentConfigs.user_id, userId), eq(agentConfigs.agent_name, name))).limit(1);

  if (existing.length) {
    const [updated] = await db.update(agentConfigs).set({ 
      provider: body.provider_id ? (await db.select().from(llmProviders).where(eq(llmProviders.id, body.provider_id)).limit(1))[0]?.provider_type ?? 'openai' : undefined,
      model: body.model,
      system_prompt: body.system_prompt,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      updated_at: new Date()
    }).where(eq(agentConfigs.id, existing[0].id)).returning();
    return c.json({ success: true, data: updated });
  }

  const [created] = await db.insert(agentConfigs).values({
    user_id: userId, 
    agent_name: name,
    provider: body.provider_id ? (await db.select().from(llmProviders).where(eq(llmProviders.id, body.provider_id)).limit(1))[0]?.provider_type ?? 'openai' : 'openai',
    model: body.model ?? 'gpt-4o-mini',
    system_prompt: body.system_prompt ?? null,
    temperature: body.temperature ?? 0.7,
    max_tokens: body.max_tokens ?? 4096,
  }).returning();
  return c.json({ success: true, data: created }, 201);
});

export default agentsRoute;