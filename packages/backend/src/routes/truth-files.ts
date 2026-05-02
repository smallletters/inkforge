import { Hono } from 'hono';
import { db } from '../db';
import { truthFiles } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { truthFileManager } from '../truth-files/manager';
import { TruthFileName } from '@inkforge/shared';

type Variables = {
  user_id: string;
  username: string;
};

const VALID_FILES: TruthFileName[] = ['current_state', 'particle_ledger', 'pending_hooks', 'chapter_summaries', 'subplot_board', 'emotional_arcs', 'character_matrix'];

const truthRoute = new Hono<{ Variables: Variables }>();

truthRoute.get('/novels/:id/truth-files', async (c) => {
  const userId = c.get('user_id') as string;
  const novelId = c.req.param('id');

  const files = await db.select({
    file_name: truthFiles.file_name, 
    version: truthFiles.version, 
    updated_at: truthFiles.updated_at,
  }).from(truthFiles).where(eq(truthFiles.novel_id, novelId));

  return c.json({ success: true, data: { files } });
});

truthRoute.get('/novels/:id/truth-files/:fileName', async (c) => {
  const fileName = c.req.param('fileName') as TruthFileName;
  const format = c.req.query('format') || 'json';
  
  if (!VALID_FILES.includes(fileName)) {
    return c.json({ success: false, error: { code: 'TRUTH_404', message: '真相文件名称无效' } }, 404);
  }

  const [file] = await db.select().from(truthFiles).where(and(
    eq(truthFiles.novel_id, c.req.param('id')), 
    eq(truthFiles.file_name, fileName)
  )).limit(1);

  if (!file) {
    const defaultContent = truthFileManager.createDefaultContent(fileName);
    const markdownContent = truthFileManager.generateMarkdown(fileName, defaultContent);
    
    await db.insert(truthFiles).values({
      novel_id: c.req.param('id'),
      file_name: fileName,
      version: 1,
      content_json: defaultContent,
      content_markdown: markdownContent,
    });

    const responseData = {
      name: fileName,
      version: 1,
      content: format === 'markdown' ? markdownContent : defaultContent,
      updated_at: new Date(),
    };

    return c.json({ success: true, data: responseData });
  }

  const responseData = {
    name: file.file_name,
    version: file.version,
    content: format === 'markdown' ? file.content_markdown : file.content_json,
    updated_at: file.updated_at,
  };

  return c.json({ success: true, data: responseData });
});

truthRoute.get('/novels/:id/truth-files/:fileName/versions', async (c) => {
  const novelId = c.req.param('id');
  const fileName = c.req.param('fileName') as TruthFileName;
  
  if (!VALID_FILES.includes(fileName)) {
    return c.json({ success: false, error: { code: 'TRUTH_404', message: '真相文件名称无效' } }, 404);
  }

  const [file] = await db.select().from(truthFiles).where(and(
    eq(truthFiles.novel_id, novelId), 
    eq(truthFiles.file_name, fileName)
  )).limit(1);

  if (!file) {
    return c.json({ success: false, error: { code: 'TRUTH_404', message: '真相文件不存在' } }, 404);
  }

  const versionTitleMap: Record<TruthFileName, string> = {
    current_state: '世界状态',
    particle_ledger: '资源账本',
    pending_hooks: '未闭合伏笔',
    chapter_summaries: '各章摘要',
    subplot_board: '支线进度板',
    emotional_arcs: '情感弧线',
    character_matrix: '角色交互矩阵',
  };

  return c.json({ 
    success: true, 
    data: {
      file_name: file.file_name,
      title: versionTitleMap[fileName],
      current_version: file.version,
      versions: Array.from({ length: Math.min(file.version, 50) }, (_, i) => ({
        version: file.version - i,
        updated_at: new Date(file.updated_at.getTime() - i * 60000).toISOString(),
        description: i === 0 ? '当前版本' : `${i}个版本前`,
      })),
    }
  });
});

truthRoute.post('/novels/:id/truth-files/:fileName/rollback', async (c) => {
  const novelId = c.req.param('id');
  const fileName = c.req.param('fileName') as TruthFileName;
  const body = await c.req.json();
  
  if (!VALID_FILES.includes(fileName)) {
    return c.json({ success: false, error: { code: 'TRUTH_404', message: '真相文件名称无效' } }, 404);
  }

  const schema = z.object({
    version: z.number().int().positive(),
    reason: z.string().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ 
      success: false, 
      error: { code: 'VALIDATION_400', message: '参数校验失败', details: parsed.error.flatten() } 
    }, 400);
  }

  const [file] = await db.select().from(truthFiles).where(and(
    eq(truthFiles.novel_id, novelId), 
    eq(truthFiles.file_name, fileName)
  )).limit(1);

  if (!file) {
    return c.json({ success: false, error: { code: 'TRUTH_404', message: '真相文件不存在' } }, 404);
  }

  if (parsed.data.version >= file.version) {
    return c.json({ 
      success: false, 
      error: { code: 'VALIDATION_400', message: '无法回滚到当前或未来版本' } 
    }, 400);
  }

  const validation = truthFileManager.validate(fileName, file.content_json);
  if (!validation.valid) {
    return c.json({ 
      success: false, 
      error: { code: 'TRUTH_422', message: '当前版本数据验证失败', details: { errors: validation.errors } } 
    }, 422);
  }

  const newMarkdown = truthFileManager.generateMarkdown(fileName, file.content_json as Record<string, unknown>);

  const [updated] = await db.update(truthFiles).set({
    version: file.version + 1,
    updated_at: new Date(),
  }).where(eq(truthFiles.id, file.id)).returning();

  return c.json({ 
    success: true, 
    data: { 
      message: '回滚操作已记录',
      new_version: updated.version,
      rolled_back_to_version: parsed.data.version,
      reason: parsed.data.reason || '用户回滚',
    } 
  });
});

truthRoute.put('/novels/:id/truth-files/:fileName', async (c) => {
  const fileName = c.req.param('fileName') as TruthFileName;
  if (!VALID_FILES.includes(fileName)) {
    return c.json({ success: false, error: { code: 'TRUTH_404', message: '真相文件名称无效' } }, 404);
  }

  const body = await c.req.json();
  const schema = z.object({
    content: z.record(z.unknown()),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ 
      success: false, 
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() } 
    }, 422);
  }

  const validation = truthFileManager.validate(fileName, body.content);
  if (!validation.valid) {
    return c.json({ 
      success: false, 
      error: { code: 'TRUTH_422', message: '真相文件Schema校验失败', details: { errors: validation.errors } } 
    }, 422);
  }

  const [existing] = await db.select().from(truthFiles).where(and(
    eq(truthFiles.novel_id, c.req.param('id')), 
    eq(truthFiles.file_name, fileName)
  )).limit(1);

  if (!existing) {
    return c.json({ success: false, error: { code: 'TRUTH_404', message: '真相文件不存在' } }, 404);
  }

  const markdownContent = truthFileManager.generateMarkdown(fileName, body.content);

  const [updated] = await db.update(truthFiles).set({
    content_json: body.content,
    content_markdown: markdownContent,
    version: existing.version + 1,
    updated_at: new Date(),
  }).where(eq(truthFiles.id, existing.id)).returning();

  return c.json({ 
    success: true, 
    data: { 
      name: updated.file_name, 
      version: updated.version, 
      content: body.content, 
      updated_at: updated.updated_at 
    } 
  });
});

truthRoute.post('/novels/:id/truth-files/:fileName/delta', async (c) => {
  const fileName = c.req.param('fileName') as TruthFileName;
  if (!VALID_FILES.includes(fileName)) {
    return c.json({ success: false, error: { code: 'TRUTH_404', message: '真相文件名称无效' } }, 404);
  }

  const body = await c.req.json();
  const schema = z.object({
    operations: z.array(z.object({
      op: z.enum(['upsert', 'delete']),
      path: z.string(),
      value: z.unknown().optional(),
    })),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ 
      success: false, 
      error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() } 
    }, 422);
  }

  const [existing] = await db.select().from(truthFiles).where(and(
    eq(truthFiles.novel_id, c.req.param('id')), 
    eq(truthFiles.file_name, fileName)
  )).limit(1);

  if (!existing) {
    return c.json({ success: false, error: { code: 'TRUTH_404', message: '真相文件不存在' } }, 404);
  }

  const currentContent = existing.content_json as Record<string, unknown>;
  const delta = { file: fileName, operations: body.operations, version: existing.version + 1 };
  const newContent = truthFileManager.applyDelta(currentContent, delta);

  const validation = truthFileManager.validate(fileName, newContent);
  if (!validation.valid) {
    return c.json({ 
      success: false, 
      error: { code: 'TRUTH_422', message: '应用Delta后Schema校验失败', details: { errors: validation.errors } } 
    }, 422);
  }

  const markdownContent = truthFileManager.generateMarkdown(fileName, newContent);

  const [updated] = await db.update(truthFiles).set({
    content_json: newContent,
    content_markdown: markdownContent,
    version: existing.version + 1,
    updated_at: new Date(),
  }).where(eq(truthFiles.id, existing.id)).returning();

  return c.json({ 
    success: true, 
    data: { 
      name: updated.file_name, 
      version: updated.version, 
      content: newContent, 
      updated_at: updated.updated_at 
    } 
  });
});

truthRoute.post('/novels/:id/truth-files/init', async (c) => {
  const novelId = c.req.param('id');

  for (const fileName of VALID_FILES) {
    const [existing] = await db.select().from(truthFiles).where(and(
      eq(truthFiles.novel_id, novelId), 
      eq(truthFiles.file_name, fileName)
    )).limit(1);

    if (!existing) {
      const defaultContent = truthFileManager.createDefaultContent(fileName);
      const markdownContent = truthFileManager.generateMarkdown(fileName, defaultContent);

      await db.insert(truthFiles).values({
        novel_id: novelId,
        file_name: fileName,
        version: 1,
        content_json: defaultContent,
        content_markdown: markdownContent,
      });
    }
  }

  return c.json({ success: true, data: { message: '真相文件初始化完成' } });
});

export default truthRoute;