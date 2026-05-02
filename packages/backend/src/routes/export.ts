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
      content = generateEpub(novel.title, chaptersList);
      c.header('Content-Type', 'application/epub+zip; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="${novel.title}.epub"`);
      return c.body(content);

    case 'docx':
      content = generateDocx(novel.title, chaptersList);
      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      c.header('Content-Disposition', `attachment; filename="${novel.title}.docx"`);
      return c.body(content);

    case 'pdf':
      content = generatePdf(novel.title, chaptersList);
      c.header('Content-Type', 'text/html; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="${novel.title}.pdf.html"`);
      return c.body(content);

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateEpub(title: string, chapters: any[]): string {
  const uuid = 'urn:uuid:' + crypto.randomUUID();
  const now = new Date().toISOString();
  const chaptersXml = chapters.map((ch, i) => `
    <item id="chapter${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>
  `).join('');

  const spineXml = chapters.map((_, i) => `
    <itemref idref="chapter${i + 1}"/>
  `).join('');

  const contentXml = chapters.map((ch, i) => `
    <div class="chapter">
      <h2>第${ch.chapter_number}章 ${escapeHtml(ch.title || '')}</h2>
      <p>${escapeHtml(ch.content || '').replace(/\n\n/g, '</p><p>')}</p>
    </div>
  `).join('\n');

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeHtml(title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="BookId">${uuid}</dc:identifier>
    <meta property="dcterms:modified">${now.split('.')[0]}Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    ${chaptersXml}
  </manifest>
  <spine>
    <itemref idref="nav"/>
    ${spineXml}
  </spine>
</package>`;

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>目录</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav epub:type="toc">
    <h1>目录</h1>
    <ol>
      ${chapters.map(ch => `<li><a href="chapter${ch.chapter_number}.xhtml">第${ch.chapter_number}章 ${escapeHtml(ch.title || '')}</a></li>`).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;

  const chaptersXhtml = chapters.map(ch => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>第${ch.chapter_number}章 ${escapeHtml(ch.title || '')}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  ${contentXml}
</body>
</html>`);

  const css = `body { font-family: "SimSun", serif; line-height: 1.8; padding: 20px; }
.chapter { margin-bottom: 2em; }
h2 { text-align: center; margin-bottom: 1em; }
p { text-indent: 2em; }`;

  const zipParts: string[] = [];
  zipParts.push(`mimetype`);
  zipParts.push(`META-INF/container.xml`);
  zipParts.push(`OEBPS/content.opf`);
  zipParts.push(`OEBPS/nav.xhtml`);
  zipParts.push(`OEBPS/styles.css`);
  chapters.forEach((_, i) => zipParts.push(`OEBPS/chapter${i + 1}.xhtml`));

  const combinedContent = [
    'application/epub+zip',
    container,
    content,
    nav,
    css,
    ...chaptersXhtml
  ].join('\n|||---|||\n');

  return combinedContent;
}

function generateDocx(title: string, chapters: any[]): string {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Title"/></w:pPr>
      <w:r><w:t>${escapeHtml(title)}</w:t></w:r>
    </w:p>
    ${chapters.map(ch => `
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>第${ch.chapter_number}章 ${escapeHtml(ch.title || '')}</w:t></w:r>
    </w:p>
    ${(ch.content || '').split('\n\n').map((para: string) => `
    <w:p>
      <w:r><w:t xml:space="preserve">${escapeHtml(para)}</w:t></w:r>
    </w:p>`).join('')}
    `).join('')}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>
  </w:body>
</w:document>`;

  return docXml;
}

function generatePdf(title: string, chapters: any[]): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 2cm; }
    body { font-family: "Noto Serif SC", "Source Han Serif SC", "SimSun", serif; font-size: 14px; line-height: 1.8; color: #333; }
    h1 { font-size: 24px; text-align: center; margin: 2em 0 1em; }
    h2 { font-size: 18px; margin: 1.5em 0 0.8em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    p { text-indent: 2em; margin: 0.5em 0; }
    .chapter { page-break-after: always; margin-bottom: 3em; }
    .chapter:last-child { page-break-after: auto; }
    @media print { .chapter { page-break-after: always; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${chapters.map(ch => `
  <div class="chapter">
    <h2>第${ch.chapter_number}章 ${escapeHtml(ch.title || '')}</h2>
    ${(ch.content || '').split('\n\n').map((para: string) => `<p>${escapeHtml(para)}</p>`).join('\n')}
  </div>`).join('')}
</body>
</html>`;
}