import { Hono } from 'hono';
import { db } from '../db';
import { agentConfigs, llmProviders, agentPromptVersions } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';

type Variables = {
  user_id: string;
  username: string;
};

const VALID_AGENTS = ['plot-generator', 'worldbuilding', 'character-generator', 'dialogue-generator', 'emotion-craft', 'scene-designer', 'title-generator', 'description-enhancer', 'creative-mentor', 'consistency-checker', 'style-analyzer', 'planner', 'writer', 'auditor', 'reviser', 'architect', 'composer', 'observer', 'reflector', 'normalizer', 'radar'];

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
    if (parsed.data.system_prompt && existing[0].system_prompt !== parsed.data.system_prompt) {
      const [lastVersion] = await db.select({ version: agentPromptVersions.version })
        .from(agentPromptVersions)
        .where(eq(agentPromptVersions.agent_config_id, existing[0].id))
        .orderBy(desc(agentPromptVersions.version))
        .limit(1);

      await db.insert(agentPromptVersions).values({
        agent_config_id: existing[0].id,
        version: (lastVersion?.version ?? 0) + 1,
        system_prompt: existing[0].system_prompt ?? '',
        change_reason: '用户更新',
      });
    }

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

agentsRoute.get('/:name/versions', async (c) => {
  const name = c.req.param('name');
  if (!VALID_AGENTS.includes(name)) {
    return c.json({ success: false, error: { code: 'AGENT_404', message: `Agent 名称无效` } }, 404);
  }

  const userId = c.get('user_id') as string;
  const [config] = await db.select().from(agentConfigs).where(
    and(eq(agentConfigs.user_id, userId), eq(agentConfigs.agent_name, name))
  ).limit(1);

  if (!config) {
    return c.json({ success: true, data: [] });
  }

  const versions = await db.select()
    .from(agentPromptVersions)
    .where(eq(agentPromptVersions.agent_config_id, config.id))
    .orderBy(desc(agentPromptVersions.version))
    .limit(20);

  return c.json({ success: true, data: versions });
});

agentsRoute.post('/:name/rollback', async (c) => {
  const name = c.req.param('name');
  if (!VALID_AGENTS.includes(name)) {
    return c.json({ success: false, error: { code: 'AGENT_404', message: `Agent 名称无效` } }, 404);
  }

  const userId = c.get('user_id') as string;
  const body = await c.req.json();
  const schema = z.object({ version: z.number() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_400', message: '参数校验失败' } }, 400);
  }

  const [config] = await db.select().from(agentConfigs).where(
    and(eq(agentConfigs.user_id, userId), eq(agentConfigs.agent_name, name))
  ).limit(1);

  if (!config) {
    return c.json({ success: false, error: { code: 'AGENT_404', message: 'Agent配置不存在' } }, 404);
  }

  const [targetVersion] = await db.select().from(agentPromptVersions).where(
    and(eq(agentPromptVersions.agent_config_id, config.id), eq(agentPromptVersions.version, parsed.data.version))
  ).limit(1);

  if (!targetVersion) {
    return c.json({ success: false, error: { code: 'AGENT_404', message: '版本不存在' } }, 404);
  }

  await db.update(agentConfigs).set({
    system_prompt: targetVersion.system_prompt,
    updated_at: new Date(),
  }).where(eq(agentConfigs.id, config.id));

  return c.json({ success: true, data: { message: '已回滚到指定版本', version: parsed.data.version } });
});

export default agentsRoute;