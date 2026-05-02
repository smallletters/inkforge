/**
 * 灵砚 InkForge - Agents API路由
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：提供直接调用各个Agent功能的API接口
 */
import { Hono } from 'hono';
import { db } from '../db';
import { novels } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { initializeProviderBank } from '../provider-bank';
import {
  plotGeneratorAgent,
  worldbuildingAgent,
  characterGeneratorAgent,
  dialogueGeneratorAgent,
  emotionalArcAgent,
  descriptionEnhancementAgent,
  creativeMentorAgent,
  consistencyCheckerAgent,
  styleImitationAgent,
  pacingControlAgent,
  aiDetectionAgent,
  humanizationAgent,
} from '../pipeline/agents';
import type { AgentContext } from '../pipeline/base-agent';
import crypto from 'crypto';

type Variables = {
  user_id: string;
  username: string;
};

const agentsApiRoute = new Hono<{ Variables: Variables }>();

function createBaseCtx(novelId: string, userId: string, chapterNumber: number = 1): AgentContext {
  return {
    novelId,
    userId,
    pipelineId: crypto.randomUUID(),
    chapterNumber,
    config: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 4096
    }
  };
}

const agentsList = [
  { id: 'plot-generator', name: '情节生成器', description: '生成情节大纲、扩展章节、提供情节转折建议' },
  { id: 'worldbuilding', name: '世界观构建器', description: '创建和扩展世界、地点、派系设定' },
  { id: 'character-generator', name: '角色生成器', description: '生成角色档案、角色关系、角色成长弧光' },
  { id: 'dialogue-generator', name: '对话生成器', description: '生成角色对话、调整对话风格、润色对话' },
  { id: 'emotional-arc', name: '情感曲线师', description: '分析情感基调、设计情感曲线、渲染场景情感' },
  { id: 'pacing-control', name: '节奏控制师', description: '调整叙事节奏、平衡快慢节奏' },
  { id: 'description-enhancement', name: '描写强化师', description: '增强感官描写、优化比喻、统一文风' },
  { id: 'creative-mentor', name: '创意导师', description: '提供写作指导、审阅内容、头脑风暴' },
  { id: 'style-imitation', name: '文风仿写', description: '分析和模仿特定写作风格' },
  { id: 'ai-detection', name: '一致性检查/去AI', description: '检查AI痕迹、内容一致性' },
];

agentsApiRoute.get('/', async (c) => {
  return c.json({ success: true, data: { agents: agentsList } });
});

agentsApiRoute.post('/plot/generate-outline', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    novel_id: z.string().uuid(),
    genre: z.string().optional(),
    target_chapters: z.number().min(1).optional(),
    themes: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() }
    }, 422);
  }

  const [novel] = await db.select().from(novels).where(and(
    eq(novels.id, parsed.data.novel_id), eq(novels.user_id, userId)
  )).limit(1);

  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  try {
    await initializeProviderBank(userId);
    const ctx = createBaseCtx(parsed.data.novel_id, userId, (novel.total_chapters ?? 0) + 1);
    const result = await plotGeneratorAgent.generateOutline(
      ctx,
      { genre: parsed.data.genre, target_chapters: parsed.data.target_chapters, themes: parsed.data.themes }
    );
    return c.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    return c.json({ success: false, error: { code: 'AGENT_500', message: (err as Error).message } }, 500);
  }
});

agentsApiRoute.post('/plot/expand-chapter', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    novel_id: z.string().uuid(),
    chapter_outline: z.string().optional(),
    chapter_number: z.number().min(1).optional(),
    previous_summary: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() }
    }, 422);
  }

  const [novel] = await db.select().from(novels).where(and(
    eq(novels.id, parsed.data.novel_id), eq(novels.user_id, userId)
  )).limit(1);

  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  try {
    await initializeProviderBank(userId);
    const ctx = createBaseCtx(parsed.data.novel_id, userId, parsed.data.chapter_number ?? (novel.total_chapters ?? 0) + 1);
    const result = await plotGeneratorAgent.expandChapter(
      ctx,
      parsed.data.chapter_number ?? ctx.chapterNumber,
      parsed.data.previous_summary
    );
    return c.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    return c.json({ success: false, error: { code: 'AGENT_500', message: (err as Error).message } }, 500);
  }
});

agentsApiRoute.post('/plot/suggest-twists', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    novel_id: z.string().uuid(),
    chapter_number: z.number().min(1).optional(),
    context: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() }
    }, 422);
  }

  const [novel] = await db.select().from(novels).where(and(
    eq(novels.id, parsed.data.novel_id), eq(novels.user_id, userId)
  )).limit(1);

  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  try {
    await initializeProviderBank(userId);
    const ctx = createBaseCtx(parsed.data.novel_id, userId, parsed.data.chapter_number ?? (novel.total_chapters ?? 0) + 1);
    const result = await plotGeneratorAgent.suggestPlotTwists(
      ctx,
      parsed.data.chapter_number ?? ctx.chapterNumber
    );
    return c.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    return c.json({ success: false, error: { code: 'AGENT_500', message: (err as Error).message } }, 500);
  }
});

agentsApiRoute.post('/worldbuilding/generate-world', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    novel_id: z.string().uuid(),
    genre: z.string().optional(),
    scope: z.enum(['brief', 'standard', 'comprehensive']).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() }
    }, 422);
  }

  const [novel] = await db.select().from(novels).where(and(
    eq(novels.id, parsed.data.novel_id), eq(novels.user_id, userId)
  )).limit(1);

  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  try {
    await initializeProviderBank(userId);
    const ctx = createBaseCtx(parsed.data.novel_id, userId, 1);
    const result = await worldbuildingAgent.generateWorld(ctx, {
      genre: parsed.data.genre,
      scope: parsed.data.scope
    });
    return c.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    return c.json({ success: false, error: { code: 'AGENT_500', message: (err as Error).message } }, 500);
  }
});

agentsApiRoute.post('/character/create', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    novel_id: z.string().uuid(),
    role: z.enum(['protagonist', 'deuteragonist', 'antagonist', 'supporting', 'minor', 'mentor', 'love_interest']).optional(),
    name: z.string().optional(),
    archetype: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() }
    }, 422);
  }

  const [novel] = await db.select().from(novels).where(and(
    eq(novels.id, parsed.data.novel_id), eq(novels.user_id, userId)
  )).limit(1);

  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  try {
    await initializeProviderBank(userId);
    const ctx = createBaseCtx(parsed.data.novel_id, userId, 1);
    const result = await characterGeneratorAgent.createCharacter(ctx, {
      name: parsed.data.name,
      role: parsed.data.role,
      archetype: parsed.data.archetype
    });
    return c.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    return c.json({ success: false, error: { code: 'AGENT_500', message: (err as Error).message } }, 500);
  }
});

agentsApiRoute.post('/character/relationship', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    novel_id: z.string().uuid(),
    character_a: z.string(),
    character_b: z.string(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() }
    }, 422);
  }

  const [novel] = await db.select().from(novels).where(and(
    eq(novels.id, parsed.data.novel_id), eq(novels.user_id, userId)
  )).limit(1);

  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  try {
    await initializeProviderBank(userId);
    const ctx = createBaseCtx(parsed.data.novel_id, userId, 1);
    const result = await characterGeneratorAgent.developRelationship(
      ctx,
      parsed.data.character_a,
      parsed.data.character_b
    );
    return c.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    return c.json({ success: false, error: { code: 'AGENT_500', message: (err as Error).message } }, 500);
  }
});

agentsApiRoute.post('/creative-mentor/guidance', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    novel_id: z.string().uuid(),
    topic: z.string(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() }
    }, 422);
  }

  const [novel] = await db.select().from(novels).where(and(
    eq(novels.id, parsed.data.novel_id), eq(novels.user_id, userId)
  )).limit(1);

  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  try {
    await initializeProviderBank(userId);
    const ctx = createBaseCtx(parsed.data.novel_id, userId, 1);
    const result = await creativeMentorAgent.provideGuidance(ctx, parsed.data.topic);
    return c.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    return c.json({ success: false, error: { code: 'AGENT_500', message: (err as Error).message } }, 500);
  }
});

agentsApiRoute.post('/creative-mentor/review', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    novel_id: z.string().uuid(),
    content: z.string(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() }
    }, 422);
  }

  const [novel] = await db.select().from(novels).where(and(
    eq(novels.id, parsed.data.novel_id), eq(novels.user_id, userId)
  )).limit(1);

  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  try {
    await initializeProviderBank(userId);
    const ctx = createBaseCtx(parsed.data.novel_id, userId, 1);
    const result = await creativeMentorAgent.reviewContent(ctx, parsed.data.content);
    return c.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    return c.json({ success: false, error: { code: 'AGENT_500', message: (err as Error).message } }, 500);
  }
});

agentsApiRoute.post('/style/analyze', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    novel_id: z.string().uuid(),
    reference_text: z.string(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() }
    }, 422);
  }

  const [novel] = await db.select().from(novels).where(and(
    eq(novels.id, parsed.data.novel_id), eq(novels.user_id, userId)
  )).limit(1);

  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  try {
    await initializeProviderBank(userId);
    const ctx = createBaseCtx(parsed.data.novel_id, userId, 1);
    const result = await styleImitationAgent.analyze(ctx, parsed.data.reference_text);
    return c.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    return c.json({ success: false, error: { code: 'AGENT_500', message: (err as Error).message } }, 500);
  }
});

agentsApiRoute.post('/ai/check', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    novel_id: z.string().uuid(),
    content: z.string(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() }
    }, 422);
  }

  const [novel] = await db.select().from(novels).where(and(
    eq(novels.id, parsed.data.novel_id), eq(novels.user_id, userId)
  )).limit(1);

  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  try {
    await initializeProviderBank(userId);
    const ctx = createBaseCtx(parsed.data.novel_id, userId, 1);
    const result = await aiDetectionAgent.detect(ctx, parsed.data.content);
    return c.json({ success: result.success, data: result.data, error: result.error });
  } catch (err) {
    return c.json({ success: false, error: { code: 'AGENT_500', message: (err as Error).message } }, 500);
  }
});

export default agentsApiRoute;
