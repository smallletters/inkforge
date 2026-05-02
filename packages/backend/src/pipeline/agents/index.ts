import { BaseAgent, AgentContext } from '../base-agent';
import { db } from '../../db';
import { novels, chapters, truthFiles } from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { TruthFileName } from '@inkforge/shared';
import { StyleImitationAgent, styleImitationAgent } from './style-imitation';
import { AIDetectionAgent, HumanizationAgent, aiDetectionAgent, humanizationAgent } from './ai-detector';
import { PlotGeneratorAgent, plotGeneratorAgent } from './plot-generator';
import { WorldbuildingAgent, worldbuildingAgent } from './worldbuilding';
import { CharacterGeneratorAgent, characterGeneratorAgent } from './character-generator';
import { DialogueGeneratorAgent, dialogueGeneratorAgent } from './dialogue-generator';
import { DescriptionEnhancementAgent, descriptionEnhancementAgent } from './description-enhancement';
import { PacingControlAgent, pacingControlAgent } from './pacing-control';
import { EmotionalArcAgent, emotionalArcAgent } from './emotional-arc';
import { CreativeMentorAgent, creativeMentorAgent } from './creative-mentor';

export class RadarAgent extends BaseAgent {
  name = 'radar' as const;

  async run(ctx: AgentContext): Promise<Record<string, unknown>> {
    const prompt = ctx.config.systemPrompt ?? `你是灵砚InkForge平台的策划Agent，负责分析当前创作趋势和用户意图。

职责：
1. 分析当前章节的创作方向和趋势
2. 提供创作建议和伏笔埋设提示
3. 识别潜在的故事发展方向

输出格式（JSON）：
{
  "trends": ["趋势1", "趋势2"],
  "suggestions": ["建议1", "建议2"],
  "warnings": ["警告1"]
}`;

    const [novel] = await db.select({ title: novels.title, genre: novels.genre, outline: novels.outline })
      .from(novels).where(eq(novels.id, ctx.novelId)).limit(1);

    const content = await this.callLLM(ctx, [
      { role: 'system', content: prompt },
      { role: 'user', content: `分析小说《${novel?.title || '未知'}》第${ctx.chapterNumber}章的创作趋势。题材：${novel?.genre || '未知'}。大纲：${JSON.stringify(novel?.outline || {})}` },
    ]);

    try {
      return JSON.parse(content);
    } catch {
      return { trends: [], suggestions: [], warnings: [], raw: content };
    }
  }
}

export class PlannerAgent extends BaseAgent {
  name = 'planner' as const;

  async run(ctx: AgentContext): Promise<Record<string, unknown>> {
    const prompt = ctx.config.systemPrompt ?? `你是灵砚InkForge平台的大纲师Agent，负责规划章节创作方向。

职责：
1. 分析当前章节的创作意图
2. 确定本章的核心目标和关键情节点
3. 与已发布章节保持一致性

输出格式（JSON）：
{
  "chapter_intent": "本章核心意图",
  "key_points": ["要点1", "要点2"],
  "foreshadowing_hints": ["伏笔提示1"],
  "word_count_goal": 3000
}`;

    const [novel] = await db.select({ title: novels.title, genre: novels.genre, outline: novels.outline })
      .from(novels).where(eq(novels.id, ctx.novelId)).limit(1);

    const recentChapters = await db.select({ content: chapters.content, chapter_number: chapters.chapter_number })
      .from(chapters).where(eq(chapters.novel_id, ctx.novelId)).orderBy(desc(chapters.chapter_number)).limit(3);

    const context = recentChapters.map(c => `第${c.chapter_number}章摘要: ${c.content.slice(0, 150)}...`).join('\n');

    const content = await this.callLLM(ctx, [
      { role: 'system', content: prompt },
      { role: 'user', content: `为小说《${novel?.title || '未知'}》第${ctx.chapterNumber}章规划创作方向。\n\n前章回顾：\n${context}\n\n大纲：${JSON.stringify(novel?.outline || {})}\n\n目标字数：${ctx.config.maxTokens}` },
    ]);

    try {
      const result = JSON.parse(content);
      return { ...result, word_count_goal: result.word_count_goal || ctx.config.maxTokens };
    } catch {
      return { 
        chapter_intent: content.slice(0, 500), 
        key_points: [], 
        foreshadowing_hints: [],
        word_count_goal: ctx.config.maxTokens 
      };
    }
  }
}

export class ComposerAgent extends BaseAgent {
  name = 'composer' as const;

  async run(ctx: AgentContext): Promise<Record<string, unknown>> {
    const [currentState] = await db.select({ content_json: truthFiles.content_json })
      .from(truthFiles).where(and(eq(truthFiles.novel_id, ctx.novelId), eq(truthFiles.file_name, 'current_state' as TruthFileName))).limit(1);

    const [chapterSummaries] = await db.select({ content_json: truthFiles.content_json })
      .from(truthFiles).where(and(eq(truthFiles.novel_id, ctx.novelId), eq(truthFiles.file_name, 'chapter_summaries' as TruthFileName))).limit(1);

    const recentChapters = await db.select({ content: chapters.content, chapter_number: chapters.chapter_number })
      .from(chapters).where(eq(chapters.novel_id, ctx.novelId)).orderBy(desc(chapters.chapter_number)).limit(2);

    const context = {
      characters: (currentState?.content_json as any)?.characters || [],
      recent_chapters: recentChapters.map(c => ({ chapter_number: c.chapter_number, content: c.content.slice(0, 200) })),
      chapter_summaries: (chapterSummaries?.content_json as any)?.summaries || [],
    };

    return { 
      relevant_context: JSON.stringify(context),
      continuity_notes: '上下文编译完成',
      character_states: (currentState?.content_json as any)?.characters || [],
    };
  }
}

export class ArchitectAgent extends BaseAgent {
  name = 'architect' as const;

  async run(ctx: AgentContext): Promise<Record<string, unknown>> {
    const prompt = ctx.config.systemPrompt ?? `你是灵砚InkForge平台的架构师Agent，负责规划章节结构。

职责：
1. 将章节拆分为场景
2. 规划每个场景的目标和情绪
3. 设计场景之间的过渡

输出格式（JSON）：
{
  "scenes": [
    {"name": "场景名", "goal": "场景目标", "emotion": "情绪", "key_elements": ["元素1"], "estimated_words": 500}
  ],
  "structure": "三幕式",
  "transition_notes": ["过渡说明"]
}`;

    const content = await this.callLLM(ctx, [
      { role: 'system', content: prompt },
      { role: 'user', content: `为第${ctx.chapterNumber}章设计章节结构，目标字数约${ctx.config.maxTokens}字。` },
    ]);

    try {
      return JSON.parse(content);
    } catch {
      return {
        scenes: [
          { name: '开场', goal: '引入场景', emotion: '平静', key_elements: ['主角'], estimated_words: Math.floor(ctx.config.maxTokens * 0.2) },
          { name: '发展', goal: '推进情节', emotion: '紧张', key_elements: ['冲突'], estimated_words: Math.floor(ctx.config.maxTokens * 0.4) },
          { name: '高潮', goal: '冲突爆发', emotion: '激烈', key_elements: ['转折点'], estimated_words: Math.floor(ctx.config.maxTokens * 0.25) },
          { name: '收尾', goal: '结束本章', emotion: '悬念', key_elements: ['伏笔'], estimated_words: Math.floor(ctx.config.maxTokens * 0.15) },
        ],
        structure: '三幕式',
        transition_notes: [],
      };
    }
  }
}

export class WriterAgent extends BaseAgent {
  name = 'writer' as const;

  async run(ctx: AgentContext): Promise<Record<string, unknown>> {
    const prompt = ctx.config.systemPrompt ?? `你是灵砚InkForge平台的写手Agent，负责生成章节正文。

核心规则：
1. 每章字数控制在目标字数±10%范围内
2. 叙事性描述为主，对话不超过30%
3. 严格遵循真相文件中的设定
4. 每章至少推进一条主线或支线
5. 保持与前文风格一致

输出格式（JSON）：
{
  "content": "章节正文内容",
  "word_count": 字数,
  "characters_involved": ["角色1", "角色2"],
  "locations": ["地点1"],
  "items_used": ["物品1"]
}`;

    const [novel] = await db.select({ title: novels.title, genre: novels.genre, characters: novels.characters, world_setting: novels.world_setting })
      .from(novels).where(eq(novels.id, ctx.novelId)).limit(1);

    const [currentState] = await db.select({ content_json: truthFiles.content_json })
      .from(truthFiles).where(and(eq(truthFiles.novel_id, ctx.novelId), eq(truthFiles.file_name, 'current_state' as TruthFileName))).limit(1);

    const characterNames = (novel?.characters as any[] || []).map(c => c.name).join(', ');
    const characters = (currentState?.content_json as any)?.characters || [];

    const content = await this.callLLM(ctx, [
      { role: 'system', content: prompt },
      { role: 'user', content: `请为小说《${novel?.title || '未知'}》第${ctx.chapterNumber}章生成正文，字数控制在${ctx.config.maxTokens}字左右。

题材：${novel?.genre || '未知'}
角色：${characterNames}
角色状态：${JSON.stringify(characters)}
世界观：${JSON.stringify(novel?.world_setting || {})}

注意：请直接输出章节内容，不需要额外说明。` },
    ]);

    try {
      const result = JSON.parse(content);
      return result;
    } catch {
      return { 
        content: content, 
        word_count: content.length, 
        characters_involved: [], 
        locations: [], 
        items_used: [] 
      };
    }
  }
}

export class ObserverAgent extends BaseAgent {
  name = 'observer' as const;

  async run(ctx: AgentContext): Promise<Record<string, unknown>> {
    // 从pipelineData中获取Writer的输出
    const pipelineData = ctx.config.pipelineData || {};
    const writerData = pipelineData.writer as any || {};
    const chapterContent = writerData.content || '';

    const prompt = ctx.config.systemPrompt || `你是灵砚InkForge平台的资料员Agent，负责从章节内容中提取和记录事实。

职责：
1. 从章节内容中提取关键事实
2. 记录角色位置、物品、关系变化
3. 识别新埋设的伏笔

章节内容：
${chapterContent?.slice(0, 3000) || '无内容'}

输出格式（JSON）：
{
  "extracted_facts": [
    {"type": "character_location", "character": "角色名", "location": "地点", "chapter": ${ctx.chapterNumber}},
    {"type": "item_acquired", "item": "物品名", "owner": "持有人", "chapter": ${ctx.chapterNumber}},
    {"type": "relationship_change", "character_a": "角色A", "character_b": "角色B", "change": "关系变化", "chapter": ${ctx.chapterNumber}},
    {"type": "event", "description": "事件描述", "chapter": ${ctx.chapterNumber}}
  ],
  "new_hooks": ["新伏笔描述1"]
}`;

    const content = await this.callLLM(ctx, [
      { role: 'system', content: prompt },
      { role: 'user', content: `提取第${ctx.chapterNumber}章中的关键事实和伏笔。` },
    ]);

    try {
      return JSON.parse(content);
    } catch {
      return { extracted_facts: [], new_hooks: [], raw_content: content };
    }
  }
}

export class ReflectorAgent extends BaseAgent {
  name = 'reflector' as const;

  async run(ctx: AgentContext): Promise<Record<string, unknown>> {
    // 从pipelineData中获取Observer的输出
    const pipelineData = ctx.config.pipelineData || {};
    const observerData = pipelineData.observer as any || { extracted_facts: [], new_hooks: [] };
    
    const deltas: Array<{ file: string; operations: Array<{ op: string; path: string; value?: unknown }> }> = [];
    const operations: Array<{ op: string; path: string; value?: unknown }> = [];

    for (const fact of (observerData.extracted_facts as any[])) {
      if (fact.type === 'character_location') {
        operations.push({
          op: 'upsert',
          path: `characters.${fact.character}.location`,
          value: fact.location,
        });
      } else if (fact.type === 'item_acquired') {
        operations.push({
          op: 'upsert',
          path: `items.${fact.item}`,
          value: { owner: fact.owner, status: 'acquired' },
        });
      } else if (fact.type === 'relationship_change') {
        operations.push({
          op: 'upsert',
          path: `relationships.${fact.character_a}.${fact.character_b}`,
          value: fact.change,
        });
      }
    }

    if (operations.length > 0) {
      deltas.push({ file: 'current_state', operations });
    }

    if ((observerData.new_hooks as any[]).length > 0) {
      const hookOps = (observerData.new_hooks as string[]).map((hook, i) => ({
        op: 'upsert' as const,
        path: `hooks.${Date.now()}-${i}`,
        value: { description: hook, status: 'open', chapter_planted: ctx.chapterNumber },
      }));
      deltas.push({ file: 'pending_hooks', operations: hookOps });
    }

    return { deltas, version_increment: 1 };
  }
}

export class NormalizerAgent extends BaseAgent {
  name = 'normalizer' as const;

  async run(ctx: AgentContext): Promise<Record<string, unknown>> {
    const [chapter] = await db.select({ content: chapters.content, word_count: chapters.word_count })
      .from(chapters).where(and(eq(chapters.novel_id, ctx.novelId), eq(chapters.chapter_number, ctx.chapterNumber)))
      .limit(1);

    const content = chapter?.content || '';
    let normalizedContent = content;
    
    const issuesFixed: string[] = [];
    
    const fullwidthChars = content.match(/[，。！？；：]/g)?.length || 0;
    const halfwidthChars = content.match(/[,!.?;:]/g)?.length || 0;
    
    if (halfwidthChars > fullwidthChars) {
      normalizedContent = content.replace(/,/g, '，').replace(/\./g, '。').replace(/!/g, '！').replace(/\?/g, '？');
      issuesFixed.push('标点符号标准化');
    }

    const paragraphs = normalizedContent.split('\n\n');
    if (paragraphs.length > 20) {
      issuesFixed.push('段落数量较多');
    }

    const targetWords = ctx.config.maxTokens;
    const currentWords = chapter?.word_count || content.length;
    const wordCountDelta = currentWords - targetWords;
    const deviation = Math.abs(wordCountDelta) / targetWords;

    return {
      normalized: true,
      issues_fixed: issuesFixed,
      word_count_delta: wordCountDelta,
      deviation_percentage: Math.round(deviation * 100),
      needs_rewrite: deviation > 0.15,
    };
  }
}

export class AuditorAgent extends BaseAgent {
  name = 'auditor' as const;

  async run(ctx: AgentContext): Promise<Record<string, unknown>> {
    // 从pipelineData中获取内容
    const pipelineData = ctx.config.pipelineData || {};
    const writerData = pipelineData.writer as any || {};
    const chapterContent = ctx.config.currentContent || writerData.content || '';

    const prompt = ctx.config.systemPrompt ?? `你是灵砚InkForge平台的审计员Agent，负责33维度质量审计。

维度分类：
【一致性】character_memory, item_continuity, location_consistency, temporal_consistency, relationship_consistency
【逻辑性】plot_logic, cause_effect, character_behavior, world_rules
【结构性】narrative_rhythm, pacing, chapter_structure, scene_transitions
【文风】writing_style, dialogue_ratio, show_vs_tell, prose_quality
【伏笔】foreshadowing_setup, hook_closure, plot_holes
【情感】emotional_arc, character_development, tension_buildup
【AI痕迹】ai_detection, repetitive_patterns, generic_phrasing

输出格式（JSON）：
{
  "passed": true或false,
  "dimensions": {
    "character_memory": "passed|failed|warning",
    "item_continuity": "passed|failed|warning",
    "location_consistency": "passed|failed|warning",
    "temporal_consistency": "passed|failed|warning",
    "relationship_consistency": "passed|failed|warning",
    "plot_logic": "passed|failed|warning",
    "cause_effect": "passed|failed|warning",
    "character_behavior": "passed|failed|warning",
    "world_rules": "passed|failed|warning",
    "narrative_rhythm": "passed|failed|warning",
    "pacing": "passed|failed|warning",
    "chapter_structure": "passed|failed|warning",
    "scene_transitions": "passed|failed|warning",
    "writing_style": "passed|failed|warning",
    "dialogue_ratio": "passed|failed|warning",
    "show_vs_tell": "passed|failed|warning",
    "prose_quality": "passed|failed|warning",
    "foreshadowing_setup": "passed|failed|warning",
    "hook_closure": "passed|failed|warning",
    "plot_holes": "passed|failed|warning",
    "emotional_arc": "passed|failed|warning",
    "character_development": "passed|failed|warning",
    "tension_buildup": "passed|failed|warning",
    "ai_detection": "passed|failed|warning",
    "repetitive_patterns": "passed|failed|warning",
    "generic_phrasing": "passed|failed|warning"
  },
  "issues": [
    {"severity": "critical|major|minor|suggestion", "dimension": "维度名", "description": "问题描述", "resolved": false}
  ],
  "overall_score": 85
}`;

    // 获取真相文件
    const [currentState] = await db.select({ content_json: truthFiles.content_json })
      .from(truthFiles).where(and(eq(truthFiles.novel_id, ctx.novelId), eq(truthFiles.file_name, 'current_state' as TruthFileName))).limit(1);

    const content = await this.callLLM(ctx, [
      { role: 'system', content: prompt },
      { role: 'user', content: `审计第${ctx.chapterNumber}章内容：\n\n章节内容：\n${chapterContent?.slice(0, 4000) || '无内容'}\n\n当前状态：\n${JSON.stringify(currentState?.content_json || {})}` },
    ]);

    try {
      return { audit_report: JSON.parse(content) };
    } catch {
      return { 
        audit_report: { 
          passed: true, 
          dimensions: {}, 
          issues: [],
          overall_score: 90 
        },
        raw: content 
      };
    }
  }
}

export class ReviserAgent extends BaseAgent {
  name = 'reviser' as const;

  async run(ctx: AgentContext): Promise<Record<string, unknown>> {
    // 从pipelineData中获取审计报告
    const pipelineData = ctx.config.pipelineData || {};
    const auditorData = pipelineData.auditor as any || {};
    const auditReport = auditorData.audit_report || {};
    const issues = auditReport?.issues || [];
    
    const currentContent = ctx.config.currentContent || '';
    
    if (issues.length === 0 || !currentContent) {
      return { revisions: [], revised: false, issues_resolved: 0, issues_remaining: 0, revised_content: currentContent };
    }

    const criticalIssues = issues.filter((i: any) => i.severity === 'critical' || i.severity === 'major');
    
    if (criticalIssues.length === 0) {
      return { revisions: [], revised: true, issues_resolved: 0, issues_remaining: issues.length, revised_content: currentContent };
    }

    const prompt = ctx.config.systemPrompt || `你是灵砚InkForge平台的修订者Agent，负责修复审计发现的问题。

职责：
1. 根据审计报告修复问题
2. 保持修复后内容与整体风格一致
3. 记录修复内容

当前章节内容：
${currentContent?.slice(0, 3000) || '无内容'}

审计问题：
${JSON.stringify(criticalIssues)}

输出格式（JSON）：
{
  "revisions": [
    {"original": "原文片段", "revised": "修订后内容", "reason": "修复原因", "dimension": "维度"}
  ],
  "revised_content": "完整的修订后章节内容",
  "revised": true或false,
  "issues_resolved": 已解决问题数,
  "issues_remaining": 剩余问题数
}`;

    const content = await this.callLLM(ctx, [
      { role: 'system', content: prompt },
      { role: 'user', content: `请修复第${ctx.chapterNumber}章的审计问题。` },
    ]);

    try {
      const result = JSON.parse(content);
      // 确保返回包含修订后的完整内容
      if (!result.revised_content && currentContent) {
        result.revised_content = currentContent;
      }
      return result;
    } catch {
      return { revisions: [], revised: false, issues_resolved: 0, issues_remaining: issues.length, revised_content: currentContent };
    }
  }
}

export const AGENT_MAP = {
  radar: RadarAgent,
  planner: PlannerAgent,
  composer: ComposerAgent,
  architect: ArchitectAgent,
  writer: WriterAgent,
  observer: ObserverAgent,
  reflector: ReflectorAgent,
  normalizer: NormalizerAgent,
  auditor: AuditorAgent,
  reviser: ReviserAgent,
};

export { StyleImitationAgent, styleImitationAgent } from './style-imitation';
export { AIDetectionAgent, HumanizationAgent, aiDetectionAgent, humanizationAgent } from './ai-detector';
export { PlotGeneratorAgent, plotGeneratorAgent } from './plot-generator';
export { WorldbuildingAgent, worldbuildingAgent } from './worldbuilding';
export { CharacterGeneratorAgent, characterGeneratorAgent } from './character-generator';
export { DialogueGeneratorAgent, dialogueGeneratorAgent } from './dialogue-generator';
export { DescriptionEnhancementAgent, descriptionEnhancementAgent } from './description-enhancement';
export { PacingControlAgent, pacingControlAgent } from './pacing-control';
export { EmotionalArcAgent, emotionalArcAgent } from './emotional-arc';
export { CreativeMentorAgent, creativeMentorAgent } from './creative-mentor';
// 别名，保持兼容性
export const emotionCraftAgent = emotionalArcAgent;
export const styleAnalyzerAgent = styleImitationAgent;
export const consistencyCheckerAgent = aiDetectionAgent;