/**
 * 灵砚 InkForge - 世界观构建Agent
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：构建完整的世界观设定，包括地理、历史、社会、文化等维度
 */
import { z } from 'zod';
import { providerBank } from '../../provider-bank';
import { eventBus } from '../../sse/event-bus';
import { db } from '../../db';
import { llmProviders, agentConfigs, truthFiles } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../../lib/crypto';
import type { AgentContext, AgentOutput } from '../base-agent';

const WorldbuildingSchema = z.object({
  overview: z.object({
    name: z.string(),
    type: z.string(),
    era: z.string(),
    technology_level: z.enum(['prehistoric', 'ancient', 'medieval', 'renaissance', 'industrial', 'modern', 'future', 'alternate']),
    magic_level: z.enum(['none', 'low', 'moderate', 'high', 'omnipotent']),
    tone: z.array(z.string()),
  }),
  geography: z.object({
    continents: z.array(z.object({
      name: z.string(),
      climate: z.string(),
      terrain: z.array(z.string()),
      natural_resources: z.array(z.string()),
      major_cities: z.array(z.object({
        name: z.string(),
        population: z.string(),
        description: z.string(),
      })),
    })),
    oceans: z.array(z.string()),
    notable_landmarks: z.array(z.object({
      name: z.string(),
      location: z.string(),
      significance: z.string(),
    })),
  }),
  history: z.array(z.object({
    era_name: z.string(),
    time_period: z.string(),
    major_events: z.array(z.object({
      event_name: z.string(),
      description: z.string(),
      impact: z.string(),
    })),
    key_figures: z.array(z.string()),
  })),
  societies: z.array(z.object({
    civilization_name: z.string(),
    government_type: z.string(),
    culture: z.object({
      values: z.array(z.string()),
      customs: z.array(z.string()),
      taboos: z.array(z.string()),
      arts: z.array(z.string()),
    }),
    social_structure: z.object({
      classes: z.array(z.string()),
      castes: z.array(z.string()).optional(),
    }),
    religion: z.object({
      name: z.string(),
      beliefs: z.array(z.string()),
      practices: z.array(z.string()),
      religious_texts: z.array(z.string()).optional(),
    }).optional(),
  })),
  economics: z.object({
    currencies: z.array(z.string()),
    trade_routes: z.array(z.object({
      route_name: z.string(),
      connected_regions: z.array(z.string()),
      major_goods: z.array(z.string()),
    })),
    economic_systems: z.array(z.string()),
  }),
  conflicts: z.array(z.object({
    conflict_name: z.string(),
    parties_involved: z.array(z.string()),
    cause: z.string(),
    current_status: z.enum(['active', 'dormant', 'resolved', 'escalating']),
    impact_on_world: z.string(),
  })),
  supernatural: z.object({
    magic_systems: z.array(z.object({
      name: z.string(),
      source: z.string(),
      rules: z.array(z.string()),
      limitations: z.array(z.string()),
      practitioners: z.array(z.string()),
    })).optional(),
    mythical_creatures: z.array(z.object({
      name: z.string(),
      habitat: z.string(),
      description: z.string(),
      threat_level: z.enum(['harmless', 'minor', 'moderate', 'dangerous', 'catastrophic']),
    })).optional(),
  }).optional(),
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

export class WorldbuildingAgent {
  name = 'worldbuilding' as const;

  async generateWorld(ctx: AgentContext, params: {
    genre?: string;
    theme?: string[];
    scope?: 'brief' | 'standard' | 'comprehensive';
  }): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const existingWorld = await getTruthFileContent(ctx.novelId, 'current_state');

    const prompt = `你是灵砚InkForge平台的世界架构师，负责构建完整且独特的世界观设定。

${existingWorld ? `已有世界观设定：\n${JSON.stringify(existingWorld, null, 2)}\n` : ''}

用户指定参数：
- 类型：${params.genre || '奇幻'}
- 主题：${params.theme?.join(', ') || '冒险、成长'}
- 详细程度：${params.scope || 'standard'}

请构建一个完整且自洽的世界观，包含以下维度：

1. **概览**：世界名称、类型、时代、科技水平、魔法水平、基调
2. **地理**：大陆/地区、气候、地形、资源、重要城市、地标
3. **历史**：时代划分、重大事件、关键人物
4. **社会**：文明类型、政府、文化（价值观、习俗、禁忌、艺术）、社会结构、宗教
5. **经济**：货币、贸易路线、经济体系
6. **冲突**：主要矛盾和争端
7. **超自然**（如适用）：魔法系统、神话生物

输出格式（JSON）：
{
  "overview": {
    "name": "世界名称",
    "type": "世界类型",
    "era": "时代背景",
    "technology_level": "prehistoric|ancient|medieval|renaissance|industrial|modern|future|alternate",
    "magic_level": "none|low|moderate|high|omnipotent",
    "tone": ["基调1", "基调2"]
  },
  "geography": {
    "continents": [{"name": "", "climate": "", "terrain": [], "natural_resources": [], "major_cities": []}],
    "oceans": [],
    "notable_landmarks": [{"name": "", "location": "", "significance": ""}]
  },
  "history": [
    {"era_name": "", "time_period": "", "major_events": [], "key_figures": []}
  ],
  "societies": [
    {
      "civilization_name": "",
      "government_type": "",
      "culture": {"values": [], "customs": [], "taboos": [], "arts": []},
      "social_structure": {"classes": [], "castes": []},
      "religion": {"name": "", "beliefs": [], "practices": []}
    }
  ],
  "economics": {
    "currencies": [],
    "trade_routes": [],
    "economic_systems": []
  },
  "conflicts": [],
  "supernatural": {
    "magic_systems": [],
    "mythical_creatures": []
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

  async expandLocation(ctx: AgentContext, locationName: string): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const currentState = await getTruthFileContent(ctx.novelId, 'current_state');

    const prompt = `你是灵砚InkForge平台的世界架构师，负责深度扩展特定地点的细节。

世界设定：
${currentState ? JSON.stringify(currentState, null, 2) : '暂无'}

需要扩展的地点：${locationName}

请提供该地点的详细信息：
1. 外观描述（视觉、听觉、嗅觉等感官细节）
2. 历史背景
3. 重要建筑或区域
4. 居住的居民或生物
5. 当地规则或潜规则
6. 隐藏的秘密或传说
7. 与其他地区的联系

输出格式（JSON）：
{
  "name": "${locationName}",
  "visual_description": "外观描述",
  "atmosphere": "氛围",
  "history": "历史背景",
  "key_locations": [
    {"name": "地点名", "description": "描述", "significance": "意义"}
  ],
  "inhabitants": [
    {"type": "类型", "description": "描述", "count": "数量"}
  ],
  "rules": ["规则1", "规则2"],
  "secrets": ["秘密1", "秘密2"],
  "connections": ["联系1", "联系2"]
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

  async generateFaction(ctx: AgentContext, params: {
    name?: string;
    type?: 'political' | 'religious' | 'economic' | 'criminal' | 'scientific' | 'military' | 'cultural';
  }): Promise<AgentOutput> {
    const start = Date.now();
    eventBus.publish(ctx.userId, { event: 'agent.start', data: { pipeline_id: ctx.pipelineId, agent_name: this.name } });

    const currentState = await getTruthFileContent(ctx.novelId, 'current_state');

    const prompt = `你是灵砚InkForge平台的世界架构师，负责创建新的势力组织。

世界设定：
${currentState ? JSON.stringify(currentState, null, 2) : '暂无'}

势力参数：
- 名称：${params.name || '待定'}
- 类型：${params.type || 'political'}

请为该势力创建详细信息：
1. 基本信息（名称、领袖、总部、成立时间）
2. 目标与动机
3. 组织结构
4. 核心成员（2-3个关键人物）
5. 资源与能力
6. 与其他势力的关系
7. 秘密议程或隐藏目的
8. 标志性符号或仪式

输出格式（JSON）：
{
  "name": "势力名称",
  "type": "势力类型",
  "leader": "领袖名",
  "headquarters": "总部位置",
  "founded": "成立时间",
  "goals": ["目标1", "目标2"],
  "structure": {
    "ranks": ["层级1", "层级2"],
    "departments": ["部门1", "部门2"]
  },
  "key_members": [
    {"name": "成员名", "role": "角色", "description": "描述"}
  ],
  "resources": ["资源1", "资源2"],
  "relationships": [
    {"faction": "其他势力", "type": "友好|敌对|中立|复杂", "description": "关系描述"}
  ],
  "secret_agenda": "秘密议程",
  "symbols": "标志性符号",
  "rituals": ["仪式1", "仪式2"]
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
}

export const worldbuildingAgent = new WorldbuildingAgent();