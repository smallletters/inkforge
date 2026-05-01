/**
 * 灵砚 InkForge - 作品导入
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-30
 * 
 * 功能描述：导入已有作品（TXT/MD/EPUB格式），自动解析章节结构
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { novels, chapters, truthFiles } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { truthFileManager } from '../truth-files/manager';

type Variables = {
  user_id: string;
};

const importRoute = new Hono<{ Variables: Variables }>();

function parseTextContent(content: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  const lines = content.split('\n');
  let currentChapter = { title: '', content: '' };
  let inChapter = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    const chapterMatch = trimmedLine.match(/^(第[一二三四五六七八九十百千万\d]+章|第[一二三四五六七八九十百千万\d]+节|第[一二三四五六七八九十百千万\d]+篇)(.+?)(?:\s|$)/);
    if (chapterMatch) {
      if (currentChapter.content) {
        sections.push(currentChapter);
      }
      currentChapter = { title: chapterMatch[0], content: '' };
      inChapter = true;
    } else if (inChapter && trimmedLine) {
      currentChapter.content += line + '\n';
    }
  }

  if (currentChapter.content) {
    sections.push(currentChapter);
  }

  if (sections.length === 0) {
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
    let chapterNum = 1;
    for (const para of paragraphs) {
      sections.push({
        title: `第${chapterNum}章`,
        content: para.trim(),
      });
      chapterNum++;
    }
  }

  return sections;
}

function parseMarkdownContent(content: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let lastIndex = 0;
  let match;
  const headings: { level: number; title: string; start: number; end: number }[] = [];

  while ((match = headingRegex.exec(content)) !== null) {
    if (match[1].length <= 3) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    const nextStart = i + 1 < headings.length ? headings[i + 1].start : content.length;
    const sectionContent = content.slice(current.end, nextStart).trim();
    
    if (sectionContent) {
      sections.push({
        title: current.title,
        content: sectionContent,
      });
    }
  }

  return sections;
}

function calculateWordCount(text: string): number {
  return text.replace(/\s/g, '').length;
}

importRoute.post('/novels/import', async (c) => {
  const userId = c.get('user_id');
  const contentType = c.req.header('content-type') || '';
  
  let body: any;
  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    body = {
      title: formData.get('title') as string,
      genre: formData.get('genre') as string,
      file_content: formData.get('file_content') as string || formData.get('file') as string,
      file_type: formData.get('file_type') as string || 'txt',
    };
  } else {
    body = await c.req.json();
  }

  const schema = z.object({
    title: z.string().min(1).max(200),
    genre: z.string(),
    file_content: z.string(),
    file_type: z.enum(['txt', 'md', 'epub']).default('txt'),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_400', message: '参数校验失败', details: parsed.error.flatten() }
    }, 400);
  }

  const { title, genre, file_content, file_type } = parsed.data;
  
  let chapters_data: { title: string; content: string }[] = [];
  
  switch (file_type) {
    case 'txt':
      chapters_data = parseTextContent(file_content);
      break;
    case 'md':
      chapters_data = parseMarkdownContent(file_content);
      break;
    case 'epub':
      return c.json({
        success: false,
        error: { code: 'IMPORT_400', message: 'EPUB格式暂不支持，请使用TXT或Markdown格式' }
      }, 400);
    default:
      chapters_data = parseTextContent(file_content);
  }

  const [novel] = await db.insert(novels).values({
    user_id: userId,
    title,
    genre,
    status: 'draft',
    total_chapters: chapters_data.length,
    word_count: chapters_data.reduce((sum, ch) => sum + calculateWordCount(ch.content), 0),
  }).returning();

  for (let i = 0; i < chapters_data.length; i++) {
    const ch = chapters_data[i];
    await db.insert(chapters).values({
      novel_id: novel.id,
      chapter_number: i + 1,
      title: ch.title,
      content: ch.content,
      word_count: calculateWordCount(ch.content),
      status: 'draft',
    });
  }

  try {
    await truthFileManager.initializeForNovel(novel.id);
    
    const chapterSummaries = chapters_data.map((ch, i) => ({
      chapter_number: i + 1,
      title: ch.title,
      summary: ch.content.slice(0, 200) + (ch.content.length > 200 ? '...' : ''),
    }));

    await truthFileManager.update(novel.id, 'chapter_summaries', {
      chapters: chapterSummaries,
    });
  } catch (error) {
    console.error('Failed to initialize truth files:', error);
  }

  return c.json({
    success: true,
    data: {
      novel_id: novel.id,
      title: novel.title,
      chapters_imported: chapters_data.length,
      total_words: chapters_data.reduce((sum, ch) => sum + calculateWordCount(ch.content), 0),
    }
  }, 201);
});

importRoute.get('/novels/import/formats', async (c) => {
  return c.json({
    success: true,
    data: {
      formats: [
        { id: 'txt', name: '纯文本', description: '自动识别章节结构', extensions: ['.txt'] },
        { id: 'md', name: 'Markdown', description: '支持标题分级', extensions: ['.md', '.markdown'] },
        { id: 'epub', name: 'EPUB', description: '即将支持', extensions: ['.epub'], disabled: true },
      ],
      max_file_size: '10MB',
      encoding: 'UTF-8',
    },
  });
});

export default importRoute;
