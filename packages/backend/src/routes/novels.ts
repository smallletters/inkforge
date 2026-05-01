import { Hono } from 'hono';
import { db } from '../db';
import { novels, chapters, truthFiles } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';

type Variables = {
  user_id: string;
  username: string;
};

const novelsRoute = new Hono<{ Variables: Variables }>();

novelsRoute.get('/', async (c) => {
  const userId = c.get('user_id') as string;
  const status = c.req.query('status');
  const cond = eq(novels.user_id, userId);
  const list = await db.select().from(novels).where(status ? and(cond, eq(novels.status, status)) : cond).orderBy(desc(novels.updated_at));
  return c.json({ success: true, data: list, meta: { total: list.length } });
});

novelsRoute.post('/', async (c) => {
  const userId = c.get('user_id') as string;
  const body = await c.req.json();
  const schema = z.object({ title: z.string().min(1).max(200), genre: z.string() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_400', message: '作品标题不能为空', details: parsed.error.flatten() } }, 400);

  const [novel] = await db.insert(novels).values({ user_id: userId, title: body.title, genre: body.genre, outline: body.outline ?? {}, characters: body.characters ?? [] }).returning();
  return c.json({ success: true, data: novel }, 201);
});

novelsRoute.get('/:id', async (c) => {
  const userId = c.get('user_id') as string;
  const [novel] = await db.select().from(novels).where(and(eq(novels.id, c.req.param('id')), eq(novels.user_id, userId))).limit(1);
  if (!novel) return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  return c.json({ success: true, data: novel });
});

novelsRoute.put('/:id', async (c) => {
  const userId = c.get('user_id') as string;
  const novelId = c.req.param('id');
  const body = await c.req.json();

  const [existing] = await db.select().from(novels).where(and(eq(novels.id, novelId), eq(novels.user_id, userId))).limit(1);
  if (!existing) return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);

  const updateData: Record<string, unknown> = { updated_at: new Date() };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.genre !== undefined) updateData.genre = body.genre;
  if (body.outline !== undefined) updateData.outline = body.outline;
  if (body.characters !== undefined) updateData.characters = body.characters;
  if (body.world_setting !== undefined) updateData.world_setting = body.world_setting;
  if (body.status !== undefined) updateData.status = body.status;

  const [updated] = await db.update(novels).set(updateData).where(eq(novels.id, novelId)).returning();
  return c.json({ success: true, data: updated });
});

novelsRoute.get('/:id/chapters', async (c) => {
  const userId = c.get('user_id') as string;
  const [novel] = await db.select({ id: novels.id }).from(novels).where(and(eq(novels.id, c.req.param('id')), eq(novels.user_id, userId))).limit(1);
  if (!novel) return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);

  const status = c.req.query('status');
  const cond = eq(chapters.novel_id, novel.id);
  const list = await db.selectDistinct({
    chapter_number: chapters.chapter_number, title: chapters.title, status: chapters.status,
    word_count: chapters.word_count, audit_report: chapters.audit_report, updated_at: chapters.updated_at,
  }).from(chapters).where(status ? and(cond, eq(chapters.status, status)) : cond).orderBy(chapters.chapter_number);
  return c.json({ success: true, data: list, meta: { total: list.length } });
});

novelsRoute.get('/:id/chapters/:chapter_number', async (c) => {
  const userId = c.get('user_id') as string;
  const novelId = c.req.param('id');
  const chapterNum = Number(c.req.param('chapter_number'));

  const [novel] = await db.select({ id: novels.id }).from(novels).where(and(
    eq(novels.id, novelId),
    eq(novels.user_id, userId)
  )).limit(1);
  if (!novel) return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);

  const [chapter] = await db.select().from(chapters).where(and(
    eq(chapters.novel_id, novelId),
    eq(chapters.chapter_number, chapterNum)
  )).limit(1);
  if (!chapter) return c.json({ success: false, error: { code: 'CHAPTER_404', message: '章节不存在' } }, 404);
  return c.json({ success: true, data: chapter });
});

novelsRoute.put('/:id/chapters/:chapter_number', async (c) => {
  const body = await c.req.json();
  const [chapter] = await db.update(chapters).set({
    ...(body.title && { title: body.title }),
    ...(body.content && { content: body.content, word_count: body.content.length }),
    updated_at: new Date(),
  }).where(and(
    eq(chapters.novel_id, c.req.param('id')),
    eq(chapters.chapter_number, Number(c.req.param('chapter_number')))
  )).returning();
  if (!chapter) return c.json({ success: false, error: { code: 'CHAPTER_404', message: '章节不存在' } }, 404);
  return c.json({ success: true, data: chapter });
});

novelsRoute.delete('/:id/chapters/:chapter_number', async (c) => {
  const novelId = c.req.param('id');
  const [chapter] = await db.delete(chapters).where(and(
    eq(chapters.novel_id, novelId),
    eq(chapters.chapter_number, Number(c.req.param('chapter_number')))
  )).returning();
  if (!chapter) return c.json({ success: false, error: { code: 'CHAPTER_404', message: '章节不存在' } }, 404);

  const remaining = await db.select({ count: chapters.id }).from(chapters).where(eq(chapters.novel_id, novelId));
  await db.update(novels).set({ total_chapters: remaining.length }).where(eq(novels.id, novelId));

  return c.json({ success: true, data: { message: '章节删除成功' } });
});

novelsRoute.delete('/:id', async (c) => {
  const userId = c.get('user_id') as string;
  const novelId = c.req.param('id');

  const [existing] = await db.select().from(novels).where(and(eq(novels.id, novelId), eq(novels.user_id, userId))).limit(1);
  if (!existing) return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);

  await db.delete(chapters).where(eq(chapters.novel_id, novelId));
  await db.delete(truthFiles).where(eq(truthFiles.novel_id, novelId));
  await db.delete(novels).where(eq(novels.id, novelId));

  return c.json({ success: true, data: { message: '作品删除成功' } });
});

export default novelsRoute;