import { z } from 'zod';
import { TruthFileName, TruthFileDelta } from '@inkforge/shared';
import { db } from '../db';
import { truthFiles } from '../db/schema';
import { eq, and } from 'drizzle-orm';

const truthFileSchemas: Record<TruthFileName, z.ZodType> = {
  current_state: z.object({
    characters: z.array(z.object({
      name: z.string(),
      location: z.string().optional(),
      status: z.string().optional(),
      relationships: z.record(z.string()).optional()
    })).default([]),
    world_state: z.object({
      time: z.string().optional(),
      known_events: z.array(z.string()).optional()
    }).optional(),
  }).passthrough(),

  particle_ledger: z.object({
    items: z.array(z.object({
      name: z.string(),
      quantity: z.number().default(1),
      owner: z.string().optional(),
      status: z.string().optional()
    })).default([])
  }).passthrough(),

  pending_hooks: z.object({
    hooks: z.array(z.object({
      id: z.string(),
      description: z.string(),
      status: z.enum(['open', 'progressing', 'deferred', 'resolved']).default('open'),
      chapter_planted: z.number(),
      last_advanced_chapter: z.number().optional()
    })).default([])
  }).passthrough(),

  chapter_summaries: z.object({
    summaries: z.array(z.object({
      chapter_number: z.number(),
      summary: z.string(),
      characters: z.array(z.string()).optional(),
      key_events: z.array(z.string()).optional()
    })).default([])
  }).passthrough(),

  subplot_board: z.object({
    subplots: z.array(z.object({
      name: z.string(),
      status: z.enum(['active', 'stalled', 'resolved']).default('active'),
      related_characters: z.array(z.string()).optional(),
      last_update_chapter: z.number()
    })).default([])
  }).passthrough(),

  emotional_arcs: z.object({
    arcs: z.array(z.object({
      character: z.string(),
      arc: z.array(z.object({
        chapter: z.number(),
        emotion: z.string(),
        intensity: z.number().min(0).max(10).default(5)
      }))
    })).default([])
  }).passthrough(),

  character_matrix: z.object({
    matrix: z.array(z.object({
      character_a: z.string(),
      character_b: z.string(),
      relationship: z.string(),
      first_meeting_chapter: z.number().optional(),
      last_interaction_chapter: z.number().optional()
    })).default([])
  }).passthrough(),
};

export class TruthFileManager {
  async initializeForNovel(novelId: string): Promise<void> {
    const fileNames: TruthFileName[] = ['current_state', 'particle_ledger', 'pending_hooks', 'chapter_summaries', 'subplot_board', 'emotional_arcs', 'character_matrix'];

    for (const fileName of fileNames) {
      const existing = await db.select().from(truthFiles).where(
        and(eq(truthFiles.novel_id, novelId), eq(truthFiles.file_name, fileName))
      ).limit(1);

      if (existing.length === 0) {
        const defaultContent = this.createDefaultContent(fileName);
        await db.insert(truthFiles).values({
          novel_id: novelId,
          file_name: fileName,
          content_json: defaultContent,
          version: 1,
        });
      }
    }
  }

  async update(novelId: string, fileName: TruthFileName, data: Record<string, unknown>): Promise<void> {
    const validation = this.validate(fileName, data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors?.join(', ')}`);
    }

    const existing = await db.select().from(truthFiles).where(
      and(eq(truthFiles.novel_id, novelId), eq(truthFiles.file_name, fileName))
    ).limit(1);

    if (existing.length > 0) {
      await db.update(truthFiles).set({
        content_json: data,
        version: existing[0].version + 1,
        updated_at: new Date(),
      }).where(eq(truthFiles.id, existing[0].id));
    } else {
      await db.insert(truthFiles).values({
        novel_id: novelId,
        file_name: fileName,
        content_json: data,
        version: 1,
      });
    }
  }

  validate(fileName: TruthFileName, data: unknown): { valid: boolean; errors?: string[] } {
    const schema = truthFileSchemas[fileName];
    if (!schema) return { valid: false, errors: [`未知真相文件: ${fileName}`] };

    const result = schema.safeParse(data);
    if (result.success) {
      return { valid: true };
    }

    const errors = result.error.issues.map(i => {
      const path = i.path.length > 0 ? `[${i.path.join('.')}]` : '';
      return `${fileName}${path}: ${i.message}`;
    });
    return { valid: false, errors };
  }

  applyDelta(current: Record<string, unknown>, delta: TruthFileDelta): Record<string, unknown> {
    const result = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;

    for (const op of delta.operations as Array<{ op: 'upsert' | 'delete'; path: string; value?: unknown }>) {
      const parts = op.path.split('.').filter(p => p.length > 0);
      if (parts.length === 0) continue;

      let target: any = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];

        if (typeof target !== 'object' || target === null) {
          target = {};
        }

        if (!target[key]) {
          const nextKey = parts[i + 1];
          target[key] = /^\d+$/.test(nextKey) ? [] : {};
        }
        target = target[key];
      }

      const lastKey = parts[parts.length - 1];

      if (op.op === 'upsert') {
        if (Array.isArray(target)) {
          const index = parseInt(lastKey, 10);
          if (!isNaN(index)) {
            target[index] = op.value;
          } else {
            target.push(op.value);
          }
        } else {
          target[lastKey] = op.value;
        }
      } else if (op.op === 'delete') {
        if (Array.isArray(target)) {
          const index = parseInt(lastKey, 10);
          if (!isNaN(index)) {
            target.splice(index, 1);
          }
        } else if (typeof target === 'object' && target !== null) {
          delete target[lastKey];
        }
      }
    }

    return result;
  }

  generateMarkdown(fileName: TruthFileName, content: Record<string, unknown>): string {
    const titleMap: Record<TruthFileName, string> = {
      current_state: '世界状态',
      particle_ledger: '资源账本',
      pending_hooks: '未闭合伏笔',
      chapter_summaries: '各章摘要',
      subplot_board: '支线进度板',
      emotional_arcs: '情感弧线',
      character_matrix: '角色交互矩阵',
    };

    let md = `# ${titleMap[fileName]}\n\n`;

    switch (fileName) {
      case 'current_state': {
        const data = content as { characters?: Array<{ name: string; location?: string; status?: string; relationships?: Record<string, string> }>; world_state?: { time?: string; known_events?: string[] } };
        md += '## 角色状态\n\n';
        if (data.characters?.length) {
          md += data.characters.map(c => {
            const loc = c.location ? `\n- 位置: ${c.location}` : '';
            const stat = c.status ? `\n- 状态: ${c.status}` : '';
            const rels = c.relationships ? `\n- 关系: ${Object.entries(c.relationships).map(([k, v]) => `${k}: ${v}`).join(', ')}` : '';
            return `### ${c.name}${loc}${stat}${rels}\n`;
          }).join('\n');
        } else {
          md += '暂无角色\n';
        }
        if (data.world_state) {
          md += '\n## 世界状态\n\n';
          md += data.world_state.time ? `- 当前时间: ${data.world_state.time}\n` : '';
          md += data.world_state.known_events?.length ? `- 已知事件:\n${data.world_state.known_events.map(e => `  - ${e}`).join('\n')}` : '';
        }
        break;
      }

      case 'particle_ledger': {
        const data = content as { items?: Array<{ name: string; quantity?: number; owner?: string; status?: string }> };
        md += '## 物品列表\n\n';
        if (data.items?.length) {
          md += '| 物品名称 | 数量 | 持有者 | 状态 |\n';
          md += '|----------|------|--------|------|\n';
          md += data.items.map(item =>
            `| ${item.name} | ${item.quantity || 1} | ${item.owner || '-'} | ${item.status || '-'} |`
          ).join('\n');
        } else {
          md += '暂无物品\n';
        }
        break;
      }

      case 'pending_hooks': {
        const data = content as { hooks?: Array<{ id: string; description: string; status: string; chapter_planted: number; last_advanced_chapter?: number }> };
        md += '## 伏笔列表\n\n';
        if (data.hooks?.length) {
          const statusColors: Record<string, string> = {
            open: '🔵', progressing: '🟡', deferred: '⚪', resolved: '🟢'
          };
          md += data.hooks.map(h =>
            `### ${statusColors[h.status] || '⚪'} 第${h.chapter_planted}章埋下\n${h.description}\n\n状态: ${h.status}\n${h.last_advanced_chapter ? `最近推进: 第${h.last_advanced_chapter}章` : ''}\n`
          ).join('\n');
        } else {
          md += '暂无伏笔\n';
        }
        break;
      }

      case 'chapter_summaries': {
        const data = content as { summaries?: Array<{ chapter_number: number; summary: string; characters?: string[]; key_events?: string[] }> };
        md += '## 章节摘要\n\n';
        if (data.summaries?.length) {
          md += data.summaries.map(s => {
            const chars = s.characters?.length ? `\n- 出场角色: ${s.characters.join(', ')}` : '';
            const events = s.key_events?.length ? `\n- 关键事件:\n  ${s.key_events.map(e => `- ${e}`).join('\n  ')}` : '';
            return `### 第${s.chapter_number}章\n${s.summary}${chars}${events}\n`;
          }).join('\n');
        } else {
          md += '暂无章节摘要\n';
        }
        break;
      }

      case 'subplot_board': {
        const data = content as { subplots?: Array<{ name: string; status: string; related_characters?: string[]; last_update_chapter: number }> };
        md += '## 支线进度\n\n';
        if (data.subplots?.length) {
          const statusColors: Record<string, string> = {
            active: '🟢', stalled: '🟠', resolved: '✅'
          };
          md += data.subplots.map(s =>
            `### ${statusColors[s.status]} ${s.name}\n状态: ${s.status}\n最近更新: 第${s.last_update_chapter}章\n${s.related_characters?.length ? `涉及角色: ${s.related_characters.join(', ')}` : ''}\n`
          ).join('\n');
        } else {
          md += '暂无支线\n';
        }
        break;
      }

      case 'emotional_arcs': {
        const data = content as { arcs?: Array<{ character: string; arc: Array<{ chapter: number; emotion: string; intensity: number }> }> };
        md += '## 情感弧线\n\n';
        if (data.arcs?.length) {
          md += data.arcs.map(a => {
            const arcPoints = a.arc.map(p => `第${p.chapter}章: ${p.emotion} (强度: ${p.intensity}/10)`).join('\n');
            return `### ${a.character}\n${arcPoints}\n`;
          }).join('\n');
        } else {
          md += '暂无情感弧线记录\n';
        }
        break;
      }

      case 'character_matrix': {
        const data = content as { matrix?: Array<{ character_a: string; character_b: string; relationship: string; first_meeting_chapter?: number; last_interaction_chapter?: number }> };
        md += '## 角色关系矩阵\n\n';
        if (data.matrix?.length) {
          md += '| 角色A | 角色B | 关系 | 首次相遇 | 最近互动 |\n';
          md += '|-------|-------|------|----------|----------|\n';
          md += data.matrix.map(m =>
            `| ${m.character_a} | ${m.character_b} | ${m.relationship} | ${m.first_meeting_chapter || '-'} | ${m.last_interaction_chapter || '-'} |`
          ).join('\n');
        } else {
          md += '暂无角色关系记录\n';
        }
        break;
      }
    }

    return md;
  }

  createDefaultContent(fileName: TruthFileName): Record<string, unknown> {
    const defaults: Record<TruthFileName, Record<string, unknown>> = {
      current_state: {
        characters: [],
        world_state: { time: new Date().toISOString().split('T')[0], known_events: [] }
      },
      particle_ledger: { items: [] },
      pending_hooks: { hooks: [] },
      chapter_summaries: { summaries: [] },
      subplot_board: { subplots: [] },
      emotional_arcs: { arcs: [] },
      character_matrix: { matrix: [] },
    };
    return defaults[fileName];
  }
}

export const truthFileManager = new TruthFileManager();
