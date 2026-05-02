/**
 * 灵砚 InkForge - Agent配置路由
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-30
 *
 * 功能描述：Agent配置管理，支持版本历史和回滚
 * 提供Agent配置的CRUD操作和版本管理
 */
import { Hono } from 'hono';
import { db } from '../db';
import { agentConfigs, llmProviders, agentPromptVersions } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';

type Variables = {
  user_id: string;
  username: string;
};

const VALID_AGENTS = ['plot-generator', 'worldbuilding', 'character-generator', 'dialogue-generator', 'emotion-craft', 'scene-designer', 'title-generator', 'description-enhancer', 'creative-mentor', 'consistency-checker', 'style-analyzer', 'planner', 'writer', 'auditor', 'reviser', 'architect', 'composer', 'observer', 'reflector', 'normalizer', 'radar', 'ai-detector', 'style-imitation', 'pacing-control'];

const AGENT_DESCRIPTIONS: Record<string, { name: string; description: string; default_model: string; default_temperature: number }> = {
  'plot-generator': {
    name: '剧情生成器',
    description: '根据作品大纲和真相文件生成完整的情节发展',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.7,
  },
  'worldbuilding': {
    name: '世界观构建器',
    description: '创建和维护故事发生的世界观设定',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.8,
  },
  'character-generator': {
    name: '角色生成器',
    description: '生成具有深度和复杂性的角色设定',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.75,
  },
  'dialogue-generator': {
    name: '对话生成器',
    description: '为角色生成符合性格和情境的对话',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.8,
  },
  'emotion-craft': {
    name: '情感描写器',
    description: '生成细腻的情感描写和心理活动',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.85,
  },
  'scene-designer': {
    name: '场景设计师',
    description: '设计具有氛围感和画面感的场景',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.8,
  },
  'title-generator': {
    name: '标题生成器',
    description: '为章节和故事生成吸引人的标题',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.9,
  },
  'description-enhancer': {
    name: '描述增强器',
    description: '增强和润色已有的文字描述',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.6,
  },
  'creative-mentor': {
    name: '创意导师',
    description: '提供创作建议和灵感启发',
    default_model: 'gpt-4o',
    default_temperature: 0.9,
  },
  'consistency-checker': {
    name: '一致性检查器',
    description: '检查故事中的人物设定和情节一致性',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.3,
  },
  'style-analyzer': {
    name: '文风分析器',
    description: '分析作品文风并提供风格指导',
    default_model: 'gpt-4o',
    default_temperature: 0.5,
  },
  'planner': {
    name: '规划Agent',
    description: '负责任务分解和执行规划',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.5,
  },
  'writer': {
    name: '写作Agent',
    description: '执行具体的写作任务',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.75,
  },
  'auditor': {
    name: '审核Agent',
    description: '审核写作内容的质量',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.3,
  },
  'reviser': {
    name: '修订Agent',
    description: '根据反馈修订内容',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.6,
  },
  'architect': {
    name: '架构Agent',
    description: '负责整体架构设计',
    default_model: 'gpt-4o',
    default_temperature: 0.7,
  },
  'composer': {
    name: '组合Agent',
    description: '负责内容组织和组合',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.6,
  },
  'observer': {
    name: '观察Agent',
    description: '观察和分析当前状态',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.4,
  },
  'reflector': {
    name: '反思Agent',
    description: '反思和总结执行结果',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.5,
  },
  'normalizer': {
    name: '标准化Agent',
    description: '标准化输出格式',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.3,
  },
  'radar': {
    name: '雷达Agent',
    description: '检测潜在问题和风险',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.4,
  },
  'ai-detector': {
    name: 'AI检测器',
    description: '检测文本中可能的AI生成痕迹',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.3,
  },
  'style-imitation': {
    name: '文风模仿器',
    description: '模仿特定作者或作品的文风',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.8,
  },
  'pacing-control': {
    name: '节奏控制器',
    description: '控制故事的节奏和张力',
    default_model: 'gpt-4o-mini',
    default_temperature: 0.7,
  },
};

const agentsRoute = new Hono<{ Variables: Variables }>();

agentsRoute.get('/list', async (c) => {
  const userId = c.get('user_id') as string;

  const configs = await db.select().from(agentConfigs).where(eq(agentConfigs.user_id, userId));
  const configMap = new Map(configs.map(c => [c.agent_name, c]));

  const agents = Object.entries(AGENT_DESCRIPTIONS).map(([key, info]) => {
    const config = configMap.get(key);
    return {
      name: key,
      display_name: info.name,
      description: info.description,
      default_model: info.default_model,
      default_temperature: info.default_temperature,
      has_custom_config: !!config,
      config: config ? {
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        has_custom_prompt: !!config.system_prompt,
      } : null,
    };
  });

  return c.json({ success: true, data: agents });
});

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