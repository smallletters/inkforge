/**
 * 灵砚 InkForge - 对话式建书
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-30
 *
 * 功能描述：通过多轮对话帮助用户创建作品，降低新用户创作门槛
 * 支持SSE流式输出，提供更流畅的对话体验
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { providerBank } from '../provider-bank';
import { truthFileManager } from '../truth-files/manager';
import { eventBus } from '../sse/event-bus';
import { db } from '../db';
import { novels, llmProviders } from '../db/schema';
import { decrypt } from '../lib/crypto';

type Variables = {
  user_id: string;
};

const chatRoute = new Hono<{ Variables: Variables }>();

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const ChatSessionSchema = z.object({
  novel_id: z.string().uuid().optional(),
  messages: z.array(MessageSchema),
  extracted_info: z.object({
    genre: z.string().optional(),
    title: z.string().optional(),
    outline: z.string().optional(),
    characters: z.string().optional(),
    world_setting: z.string().optional(),
  }).optional(),
});

const genreSelectionPrompt = `请为以下题材类型提供详细信息：
- xuanhuan (玄幻): 修真、世界观设定、境界体系
- xianxia (仙侠): 仙魔纷争、功法神器
- dushi (都市): 现代都市、爱恨情仇
- kehuan (科幻): 星际文明、，未来科技
- yanqing (言情): 情感纠葛、甜宠虐恋
- xuanyi (悬疑): 推理破案、惊悚悬疑
- lishi (历史): 历史背景、传奇人物
- qihuan (奇幻): 魔法异世界、种族纷争`;

const systemPrompt = `你是灵砚InkForge平台的对话式建书助手，帮助用户通过轻松愉快的对话创建小说作品。

你的职责：
1. 引导用户完成作品创建（题材→标题→大纲→角色→世界观）
2. 提供专业的创作建议
3. 始终保持友好、鼓励的语气
4. 不要一次性询问太多信息，每次只问1-2个问题

对话流程：
1. 首先问候用户，询问想要创作的类型
2. 根据用户选择的题材，提供该类型的关键要素建议
3. 引导用户确定作品标题和核心设定
4. 协助构建主角和重要角色
5. 确认世界观和故事背景
6. 最后确认并生成作品

输出格式（JSON）：
{
  "reply": "你的回复内容（自然语言）",
  "current_step": "当前步骤",
  "extracted_info": {
    "genre": "用户选择的题材",
    "title": "用户想要的标题（如果已确定）",
    "outline": "用户描述的大纲（如果已提供）",
    "characters": "用户描述的角色（如果已提供）",
    "world_setting": "用户描述的世界观（如果已提供）"
  },
  "suggestions": ["建议1", "建议2"],
  "is_complete": false,
  "ready_to_create": false
}`;

chatRoute.post('/chat', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const parsed = ChatSessionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_400', message: '参数校验失败', details: parsed.error.flatten() }
    }, 400);
  }

  const { messages, extracted_info } = parsed.data;
  const info = extracted_info || {};
  const conversationHistory = messages.map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n');

  const prompt = `对话历史：
${conversationHistory}

当前信息：
- 题材: ${info.genre || '未选择'}
- 标题: ${info.title || '未确定'}
- 大纲: ${info.outline || '未提供'}
- 角色: ${info.characters || '未提供'}
- 世界观: ${info.world_setting || '未提供'}

${genreSelectionPrompt}

请根据对话历史和当前状态，作为建书助手回复用户。`;

  try {
    const adapterKey = `${userId}-chat`;
    const [userProvider] = await db.select().from(llmProviders).where(eq(llmProviders.user_id, userId)).limit(1);
    if (userProvider) {
      const apiKey = decrypt(userProvider.api_key_encrypted);
      providerBank.register(adapterKey, userProvider.provider_type, apiKey, userProvider.base_url);
    } else {
      providerBank.register(adapterKey, 'openai', 'demo-key', 'https://api.openai.com/v1');
    }

    const response = await providerBank.chat(adapterKey, [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], { model: 'gpt-4o-mini' });

    let replyContent = '';
    if (typeof response === 'object' && 'content' in response) {
      replyContent = (response as { content: string }).content || '';
    } else if (typeof response === 'string') {
      replyContent = response;
    }

    let parsedResponse = {
      reply: replyContent,
      current_step: 'genre',
      extracted_info: info,
      suggestions: [] as string[],
      is_complete: false,
      ready_to_create: false,
    };

    try {
      const jsonMatch = replyContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        parsedResponse = { ...parsedResponse, ...parsed };
      }
    } catch {
      // Keep default response if JSON parsing fails
    }

    return c.json({ success: true, data: parsedResponse });
  } catch (error) {
    console.error('Chat creation error:', error);
    return c.json({
      success: false,
      error: { code: 'CHAT_500', message: '对话生成失败' }
    }, 500);
  }
});

chatRoute.post('/chat/create', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    genre: z.string(),
    title: z.string().min(1).max(200),
    outline: z.string().optional(),
    characters: z.array(z.object({
      name: z.string(),
      role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor']),
      description: z.string(),
    })).optional(),
    world_setting: z.object({
      world_name: z.string(),
      rules: z.array(z.string()),
      background: z.string(),
    }).optional(),
    author_intent: z.string().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_400', message: '参数校验失败', details: parsed.error.flatten() }
    }, 400);
  }

  const [novel] = await db.insert(novels).values({
    user_id: userId,
    title: parsed.data.title,
    genre: parsed.data.genre,
    outline: parsed.data.outline ? JSON.stringify({ main_arc: parsed.data.outline }) : '{}',
    characters: JSON.stringify(parsed.data.characters || []),
    world_setting: JSON.stringify(parsed.data.world_setting || {}),
    author_intent: parsed.data.author_intent,
    status: 'draft',
  }).returning();

  if (novel) {
    try {
      await truthFileManager.initializeForNovel(novel.id);
    } catch (error) {
      console.error('Failed to initialize truth files:', error);
    }
  }

  return c.json({ success: true, data: novel }, 201);
});

chatRoute.post('/chat/stream', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const schema = z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })),
    extracted_info: z.object({
      genre: z.string().optional(),
      title: z.string().optional(),
      outline: z.string().optional(),
      characters: z.string().optional(),
      world_setting: z.string().optional(),
    }).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_400', message: '参数校验失败', details: parsed.error.flatten() }
    }, 400);
  }

  const { messages, extracted_info } = parsed.data;
  const info = extracted_info || {};
  const conversationHistory = messages.map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n');

  const prompt = `对话历史：
${conversationHistory}

当前信息：
- 题材: ${info.genre || '未选择'}
- 标题: ${info.title || '未确定'}
- 大纲: ${info.outline || '未提供'}
- 角色: ${info.characters || '未提供'}
- 世界观: ${info.world_setting || '未提供'}

${genreSelectionPrompt}

请根据对话历史和当前状态，作为建书助手回复用户。`;

  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const adapterKey = `${userId}-chat-stream`;
        const [userProvider] = await db.select().from(llmProviders).where(eq(llmProviders.user_id, userId)).limit(1);
        if (userProvider) {
          const apiKey = decrypt(userProvider.api_key_encrypted);
          providerBank.register(adapterKey, userProvider.provider_type, apiKey, userProvider.base_url);
        } else {
          providerBank.register(adapterKey, 'openai', 'demo-key', 'https://api.openai.com/v1');
        }

        const response = await providerBank.chat(adapterKey, [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], { model: 'gpt-4o-mini' });

        let replyContent = '';
        if (typeof response === 'object' && 'content' in response) {
          replyContent = (response as { content: string }).content || '';
        } else if (typeof response === 'string') {
          replyContent = response;
        }

        const parsedResponse = {
          reply: replyContent,
          current_step: 'genre',
          extracted_info: info,
          suggestions: [] as string[],
          is_complete: false,
          ready_to_create: false,
        };

        try {
          const jsonMatch = replyContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonStr = jsonMatch[0].replace(/```json\n?|```\n?/g, '').trim();
            const parsed = JSON.parse(jsonStr);
            Object.assign(parsedResponse, parsed);
          }
        } catch {
          // Keep default response if JSON parsing fails
        }

        controller.enqueue(`data: ${JSON.stringify(parsedResponse)}\n\n`);

        (eventBus as unknown as { publish(userId: string, event: { event: string; data: unknown }): void }).publish(userId, {
          event: 'chat.update',
          data: { ...parsedResponse }
        });

        controller.enqueue(`event: done\ndata: ${JSON.stringify({ done: true })}\n\n`);
      } catch (error) {
        console.error('Chat stream error:', error);
        controller.enqueue(`event: error\ndata: ${JSON.stringify({ error: '对话生成失败' })}\n\n`);
      } finally {
        controller.close();
      }
    },
  });

  return c.body(stream);
});

export default chatRoute;
