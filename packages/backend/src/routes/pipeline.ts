import { Hono } from 'hono';
import { db } from '../db';
import { pipelineRuns, chapters, novels, truthFiles } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { v4 } from 'uuid';
import { executePipeline } from '../pipeline/orchestrator';
import { z } from 'zod';

type Variables = {
  user_id: string;
  username: string;
};

const pipelineRoute = new Hono<{ Variables: Variables }>();

pipelineRoute.post('/novels/:id/chapters/write-next', async (c) => {
  const userId = c.get('user_id') as string;
  const novelId = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { word_count_target?: number; focus?: string };

  const activePipeline = await db.select({ id: pipelineRuns.id, started_at: pipelineRuns.started_at }).from(pipelineRuns)
    .where(and(eq(pipelineRuns.novel_id, novelId), eq(pipelineRuns.status, 'running'))).limit(1);
  if (activePipeline.length > 0) {
    return c.json({ success: false, error: { code: 'PIPELINE_409', message: '该作品已有管线正在执行中', details: { active_pipeline_id: activePipeline[0].id, started_at: activePipeline[0]?.started_at } } }, 409);
  }

  const [novel] = await db.select().from(novels).where(eq(novels.id, novelId)).limit(1);
  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  const existingChapters = await db.select({ chapter_number: chapters.chapter_number })
    .from(chapters).where(eq(chapters.novel_id, novelId)).orderBy(desc(chapters.chapter_number)).limit(1);
  const maxChapterNumber = existingChapters.length > 0 ? existingChapters[0].chapter_number : 0;
  const chapterNumber = maxChapterNumber + 1;

  const pipelineId = v4();

  const [draftChapter] = await db.insert(chapters).values({
    novel_id: novelId,
    chapter_number: chapterNumber,
    title: `第${chapterNumber}章`,
    content: '',
    word_count: 0,
    status: 'draft',
  }).returning();

  await db.update(novels).set({ total_chapters: chapterNumber }).where(eq(novels.id, novelId));

  await db.insert(pipelineRuns).values({
    id: pipelineId,
    novel_id: novelId,
    user_id: userId,
    status: 'running',
    started_at: new Date(),
    agents_progress: [
      { agent_name: 'radar', status: 'pending' as const },
      { agent_name: 'planner', status: 'pending' as const },
      { agent_name: 'composer', status: 'pending' as const },
      { agent_name: 'architect', status: 'pending' as const },
      { agent_name: 'writer', status: 'pending' as const },
      { agent_name: 'observer', status: 'pending' as const },
      { agent_name: 'reflector', status: 'pending' as const },
      { agent_name: 'normalizer', status: 'pending' as const },
      { agent_name: 'auditor', status: 'pending' as const },
      { agent_name: 'reviser', status: 'pending' as const },
    ],
  });

  executePipeline(pipelineId, novelId, userId, body.word_count_target ?? 3000).catch(async (error) => {
    console.error(`Pipeline ${pipelineId} failed:`, error);
    await db.update(pipelineRuns).set({ 
      status: 'failed', 
      error_message: error.message, 
      completed_at: new Date() 
    }).where(eq(pipelineRuns.id, pipelineId));
  });

  return c.json({
    success: true,
    data: { 
      pipeline_id: pipelineId, 
      status: 'started' as const, 
      chapter_number: chapterNumber,
      estimated_completion: new Date(Date.now() + 120000).toISOString(),
    },
  }, 202);
});

pipelineRoute.get('/pipeline/:id/status', async (c) => {
  const userId = c.get('user_id') as string;
  const pipelineId = c.req.param('id');

  const [pipeline] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, pipelineId)).limit(1);
  if (!pipeline) {
    return c.json({ success: false, error: { code: 'PIPELINE_500', message: '管线不存在' } }, 500);
  }

  const agentsProgress = pipeline.agents_progress as Array<{ agent_name: string; status: string; duration_ms?: number }>;
  const completed = agentsProgress.filter(a => a.status === 'completed').length;
  const total = agentsProgress.length;
  const currentAgent = agentsProgress.find(a => a.status === 'running')?.agent_name ?? null;

  return c.json({
    success: true,
    data: {
      pipeline_id: pipeline.id,
      status: pipeline.status,
      current_agent: currentAgent,
      progress: { completed, total, percentage: Math.round((completed / total) * 100) },
      agents: agentsProgress.map(a => ({
        name: a.agent_name,
        status: a.status,
        duration_ms: a.duration_ms,
      })),
      started_at: pipeline.started_at,
      completed_at: pipeline.completed_at,
      total_duration_ms: pipeline.total_duration_ms,
      failed_agent: pipeline.failed_agent,
      error_message: pipeline.error_message,
    },
  });
});

pipelineRoute.get('/pipeline/novel/:novelId/active', async (c) => {
  const userId = c.get('user_id') as string;
  const novelId = c.req.param('novelId');

  const [active] = await db.select().from(pipelineRuns)
    .where(and(eq(pipelineRuns.novel_id, novelId), eq(pipelineRuns.status, 'running')))
    .limit(1);

  if (!active) {
    return c.json({ success: true, data: null });
  }

  return c.json({
    success: true,
    data: {
      pipeline_id: active.id,
      status: active.status,
      started_at: active.started_at,
    },
  });
});

pipelineRoute.post('/pipeline/:id/cancel', async (c) => {
  const userId = c.get('user_id') as string;
  const pipelineId = c.req.param('id');

  const [pipeline] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, pipelineId)).limit(1);
  if (!pipeline) {
    return c.json({ success: false, error: { code: 'PIPELINE_500', message: '管线不存在' } }, 500);
  }

  if (pipeline.status !== 'running') {
    return c.json({ success: false, error: { code: 'PIPELINE_409', message: '管线当前状态不允许取消', details: { current_status: pipeline.status } } }, 409);
  }

  await db.update(pipelineRuns).set({ status: 'cancelled', completed_at: new Date() }).where(eq(pipelineRuns.id, pipelineId));

  return c.json({ success: true, data: { message: '管线已取消' } });
});

export default pipelineRoute;