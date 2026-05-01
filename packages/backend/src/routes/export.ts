import { Hono } from 'hono';
import { db } from '../db';
import { novels, chapters } from '../db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

type Variables = {
  user_id: string;
  username: string;
};

const exportRoute = new Hono<{ Variables: Variables }>();

exportRoute.post('/novels/:id/export', async (c) => {
  const novelId = c.req.param('id');
  const body = await c.req.json();

  const schema = z.object({
    format: z.enum(['txt', 'md', 'epub', 'pdf', 'docx']),
    chapters: z.enum(['all', 'published', 'custom']).default('all'),
    chapter_range: z.object({ start: z.number(), end: z.number() }).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ 
      success: false, 
      error: { code: 'EXPORT_400', message: '参数校验失败', details: parsed.error.flatten() } 
    }, 400);
  }

  const [novel] = await db.select({ title: novels.title }).from(novels).where(eq(novels.id, novelId)).limit(1);
  if (!novel) {
    return c.json({ success: false, error: { code: 'NOVEL_404', message: '作品不存在' } }, 404);
  }

  const baseCondition = eq(chapters.novel_id, novelId);
  let chaptersList;

  if (parsed.data.chapters === 'custom' && parsed.data.chapter_range) {
    chaptersList = await db.select().from(chapters).where(
      and(
        baseCondition,
        gte(chapters.chapter_number, parsed.data.chapter_range.start),
        lte(chapters.chapter_number, parsed.data.chapter_range.end)
      )
    );
  } else if (parsed.data.chapters === 'published') {
    chaptersList = await db.select().from(chapters).where(
      and(baseCondition, eq(chapters.status, 'published'))
    );
  } else {
    chaptersList = await db.select().from(chapters).where(baseCondition);
  }

  if (chaptersList.length === 0) {
    return c.json({ success: false, error: { code: 'EXPORT_400', message: '没有符合条件的章节可导出' } }, 400);
  }

  let content = '';
  const format = parsed.data.format;

  switch (format) {
    case 'txt':
      content = chaptersList.map(ch => `第${ch.chapter_number}章 ${ch.title}\n\n${ch.content}\n\n---\n`).join('\n');
      c.header('Content-Type', 'text/plain; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="${novel.title}.txt"`);
      break;

    case 'md':
      content = `# ${novel.title}\n\n`;
      content += chaptersList.map(ch => `## 第${ch.chapter_number}章 ${ch.title}\n\n${ch.content}\n\n`).join('\n');
      c.header('Content-Type', 'text/markdown; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="${novel.title}.md"`);
      break;

    case 'epub':
    case 'pdf':
    case 'docx':
    default:
      content = `标题: ${novel.title}\n\n`;
      content += chaptersList.map(ch => `第${ch.chapter_number}章 ${ch.title}\n\n${ch.content}\n\n`).join('\n');
      c.header('Content-Type', 'text/plain; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="${novel.title}.txt"`);
      break;
  }

  return c.body(content);
});

exportRoute.get('/novels/:id/export/formats', async (c) => {
  return c.json({
    success: true,
    data: {
      formats: [
        { id: 'txt', name: '纯文本', description: '适合复制粘贴到其他平台' },
        { id: 'md', name: 'Markdown', description: '保留格式，便于二次编辑' },
        { id: 'epub', name: 'EPUB', description: '电子书格式，适合阅读器' },
        { id: 'pdf', name: 'PDF', description: '适合打印和分享' },
        { id: 'docx', name: 'Word', description: 'Microsoft Word文档' },
      ],
      chapter_options: [
        { id: 'all', name: '全部章节' },
        { id: 'published', name: '已发布章节' },
        { id: 'custom', name: '自定义范围' },
      ],
    },
  });
});

export default exportRoute;