/**
 * 灵砚 InkForge - 角色生成Agent
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：创建和发展故事角色，包括主角、配角、反派等
 */
import { z } from 'zod';
import { providerBank } from '../../provider-bank';
import { eventBus } from '../../sse/event-bus';
import { db } from '../../db';
import { llmProviders, agentConfigs, truthFiles } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../../lib/crypto';
import type { AgentContext, AgentOutput } from '../base-agent';

const CharacterProfileSchema = z.object({
  basic_info: z.object({
    name: z.string(),
    age: z.union([z.number(), z.string()]),
    gender: z.string().optional(),
    occupation: z.string().optional(),
    role: z.enum(['protagonist', 'deuteragonist', 'supporting', 'minor', 'antagonist', 'mentor', 'love_interest']),
  }),
  appearance: z.object({
    height: z.string().optional(),
    build: z.string().optional(),
    hair: z.string().optional(),
    eyes: z.string().optional(),
    distinguishing_features: z.array(z.string()),
    clothing_style: z.string().optional(),
  }),
  personality: z.object({
    mbti: z.string().optional(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    fears: z.array(z.string()),
    desires: z.array(z.string()),
    habits: z.array(z.string()),
    values: z.array(z.string()),
  }),
  backstory: z.object({
    childhood: z.string(),
    formative_events: z.array(z.object({
      event: z.string(),
      age: z.union([z.number(), z.string()]),
      impact: z.string(),
    })),
    trauma: z.string().optional(),
    turning_points: z.array(z.string()),
  }),
  relationships: z.array(z.object({
    character_name: z.string(),
    relationship_type: z.string(),
    dynamic: z.string(),
    history: z.string(),
  })),
  character_arc: z.object({
    starting_state: z.string(),
    inciting_incident: z.string(),
    major_challenges: z.array(z.string()),
    climax: z.string(),
    ending_state: z.string(),
    growth_category: z.enum(['positive', 'negative', 'flat', 'circular']),
  }),
  voice: z.object({
    speech_patterns: z.array(z.string()),
    vocabulary_level: z.enum(['simple', 'moderate', 'educated', 'scholarly', 'technical']),
    catchphrases: z.array(z.string()),
    mannerisms: z.array(z.string()),
    internal_monologue_style: z.string().optional(),
  }),
  role_in_plot: z.object({
    narrative_function: z.string(),
    contribution_to_themes: z.array(z.string()),
    conflict_providers: z.array(z.string()),
    memorable_moments: z.array(z.string()),
  }),
});

const RelationshipSchema = z.object({
  character_a: z.string(),
  character_b: z.string(),
  relationship_type: z.string(),
  dynamic: z.enum(['ally', 'enemy', 'neutral', 'complex', 'romantic', 'familial']),
  trust_level: z.enum(['complete', 'high', 'moderate', 'low', 'none']),
  power_balance: z.enum(['equal', 'a_dominant', 'b_dominant']),
  history: z.string(),
  current_status: z.string(),
  potential_conflict: z.string(),
});

async function getAdapterForAgent(userId: string, agentName: string) {
  const userProviders = await db.select().from(llmProviders).where(eq(llmProviders.user_id, userId));
  const activeProviders = userProviders.filter((p: any) => p.is_active);
  if (activeProviders.length === 0) throw new Error('未配置LLM服务商');

  const agentConfigList = await db.select().from(agentConfigs).where(
    and(eq(agentConfigs.user_id, userId), eq(agentConfigs.agent_name, agentName))
  );
  const agentConfig = agentConfigList[0];
  const providerType = agentConfig?.provider ?? 'openai';
  const model = agentConfig?.model ?? 'gpt-4o-mini';
  const provider = activeProviders.find((p: any) => p.provider_type === providerType) ?? activeProviders[0];
  if (!provider) throw new Error(`未找到${providerType}服务商配置`);

  let apiKey: string;
  try {
    apiKey = decrypt(provider.api_key_encrypted);
  } catch {
    throw new Error('API Key解密失败');
  }

  const adapterKey = `${userId}-${agentName}`;
  providerBank.register(adapterKey, provider.provider_type, apiKey, provider.base_url);
  return { adapterKey, model, temperature: agentConfig?.temperature ?? 0.7, maxTokens: agentConfig?.max_tokens ?? 4096 };
}

async function getTruthFileContent(novelId: string, fileName: string): Promise<Record<string, any> | null> {
  const [file] = await db.select().from(truthFiles).where(and(
    eq(truthFiles.novel_id, novelId),
    eq(truthFiles.file_name, fileName as any)
  )).limit(1);
  return file?.content_json as Record<string, any> | null;
}

export class CharacterGeneratorAgent {
  name = 'character_generator' as const;

  async createCharacter(ctx: AgentContext, params: {
    name?: string;
    role?: 'protagonist' | 'deuteragonist' | 'supporting' | 'minor' | 'antagonist' | 'mentor' | 'love_interest';
    age?: number | string;
    archetype?: string;
  }): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');
    const currentState = await getTruthFileContent(ctx.novelId, 'current_state');

    const prompt = `你是灵砚InkForge平台的角色设计师，负责创建立体、有深度的角色。

${characterMatrix ? `已有角色库：\n${JSON.stringify(characterMatrix, null, 2)}\n` : ''}
${currentState ? `世界观设定：\n${JSON.stringify(currentState, null, 2)}\n` : ''}

角色参数：
- 名称：${params.name || '待定'}
- 角色定位：${params.role || 'supporting'}
- 年龄：${params.age || '待定'}
- 原型：${params.archetype || '待定'}

请创建完整的角色档案，包含：

1. **基本信息**：姓名、年龄、性别、职业、角色定位
2. **外观**：身高、体型、发型、眼睛、区分特征、穿着风格
3. **性格**：
   - MBTI性格类型（如适用）
   - 优势/劣势
   - 恐惧/欲望
   - 习惯/价值观
4. **背景故事**：童年、形成性事件、创伤、转折点
5. **人际关系**：与主要角色的关系
6. **角色弧线**：起始状态→触发事件→主要挑战→高潮→结局状态
7. **声音特征**：说话模式、词汇水平、口头禅、习惯动作
8. **在剧情中的作用**：叙事功能、主题贡献

输出格式（JSON）：
{
  "basic_info": {
    "name": "姓名",
    "age": "年龄",
    "gender": "性别",
    "occupation": "职业",
    "role": "protagonist|deuteragonist|supporting|minor|antagonist|mentor|love_interest"
  },
  "appearance": {
    "height": "身高",
    "build": "体型",
    "hair": "发型",
    "eyes": "眼睛",
    "distinguishing_features": [],
    "clothing_style": "穿着风格"
  },
  "personality": {
    "mbti": "MBTI",
    "strengths": [],
    "weaknesses": [],
    "fears": [],
    "desires": [],
    "habits": [],
    "values": []
  },
  "backstory": {
    "childhood": "童年描述",
    "formative_events": [{"event": "", "age": "", "impact": ""}],
    "trauma": "创伤（可选）",
    "turning_points": []
  },
  "relationships": [],
  "character_arc": {
    "starting_state": "",
    "inciting_incident": "",
    "major_challenges": [],
    "climax": "",
    "ending_state": "",
    "growth_category": "positive|negative|flat|circular"
  },
  "voice": {
    "speech_patterns": [],
    "vocabulary_level": "simple|moderate|educated|scholarly|technical",
    "catchphrases": [],
    "mannerisms": [],
    "internal_monologue_style": "内心独白风格"
  },
  "role_in_plot": {
    "narrative_function": "",
    "contribution_to_themes": [],
    "conflict_providers": [],
    "memorable_moments": []
  }
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 64000) });
      const content = resp.content;

      let parsedData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: content };
      }

      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.complete', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, duration_ms: durationMs } });
      return { success: true, data: parsedData, durationMs };
    } catch (e) {
      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.error', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, error_type: (e as Error).name } });
      return { success: false, error: (e as Error).message, durationMs };
    }
  }

  async developRelationship(ctx: AgentContext, characterA: string, characterB: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');

    const charA = characterMatrix?.characters?.find((c: any) => c.basic_info?.name === characterA);
    const charB = characterMatrix?.characters?.find((c: any) => c.basic_info?.name === characterB);

    const prompt = `你是灵砚InkForge平台的关系设计师，负责构建两个角色之间的关系动态。

角色A信息：
${charA ? JSON.stringify(charA, null, 2) : `名称：${characterA}`}

角色B信息：
${charB ? JSON.stringify(charB, null, 2) : `名称：${characterB}`}

请分析并创建这两个角色之间的关系档案：

输出格式（JSON）：
{
  "character_a": "${characterA}",
  "character_b": "${characterB}",
  "relationship_type": "关系类型（如：师徒、对手、恋人等）",
  "dynamic": "ally|enemy|neutral|complex|romantic|familial",
  "trust_level": "complete|high|moderate|low|none",
  "power_balance": "equal|a_dominant|b_dominant",
  "history": "关系历史",
  "current_status": "当前状态",
  "potential_conflict": "潜在冲突点"
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 32000) });
      const content = resp.content;

      let parsedData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: content };
      }

      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.complete', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, duration_ms: durationMs } });
      return { success: true, data: parsedData, durationMs };
    } catch (e) {
      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.error', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, error_type: (e as Error).name } });
      return { success: false, error: (e as Error).message, durationMs };
    }
  }

  async generateCharacterArc(ctx: AgentContext, characterName: string, targetChapter?: number): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const characterMatrix = await getTruthFileContent(ctx.novelId, 'character_matrix');
    const chapterSummaries = await getTruthFileContent(ctx.novelId, 'chapter_summaries');

    const character = characterMatrix?.characters?.find((c: any) => c.basic_info?.name === characterName);

    const prompt = `你是灵砚InkForge平台的角色弧线设计师，负责为角色设计成长轨迹。

角色信息：
${character ? JSON.stringify(character, null, 2) : `名称：${characterName}`}

${chapterSummaries ? `章节概要：\n${JSON.stringify(chapterSummaries, null, 2)}\n` : ''}
${targetChapter ? `目标章节：${targetChapter}` : ''}

请设计角色的成长弧线，包括：
1. 当前的心理状态
2. 需要面对的核心矛盾
3. 关键转折点
4. 成长或改变的方向

输出格式（JSON）：
{
  "character_name": "${characterName}",
  "current_state": "当前心理状态",
  "core_contradiction": "核心矛盾",
  "arc_stages": [
    {
      "stage": "阶段名",
      "chapter_range": [开始章, 结束章],
      "trigger_event": "触发事件",
      "internal_change": "内在变化",
      "external_manifestation": "外在表现"
    }
  ],
  "key_moments": [
    {"chapter": 1, "event": "事件", "impact": "影响"}
  ],
  "final_state": "最终状态",
  "themes_explored": ["探索的主题1", "主题2"]
}`;

    try {
      const { adapterKey, model, temperature, maxTokens } = await getAdapterForAgent(ctx.userId, this.name);
      const resp = await providerBank.chat(adapterKey, [{ role: 'user', content: prompt }], { model, temperature, max_tokens: Math.min(maxTokens, 48000) });
      const content = resp.content;

      let parsedData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
          parsedData = JSON.parse(jsonStr);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        parsedData = { raw_response: content };
      }

      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.complete', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, duration_ms: durationMs } });
      return { success: true, data: parsedData, durationMs };
    } catch (e) {
      const durationMs = Date.now() - start;
      eventBus.publish(ctx.userId, { event: 'agent.error', data: { pipeline_id: ctx.pipelineId, agent_name: this.name, error_type: (e as Error).name } });
      return { success: false, error: (e as Error).message, durationMs };
    }
  }
}

export const characterGeneratorAgent = new CharacterGeneratorAgent();