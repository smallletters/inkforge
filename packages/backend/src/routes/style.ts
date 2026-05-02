/**
 * 灵砚 InkForge - 文风仿写路由
 * 作者：&lt;smallletters@sina.com&gt;
 * 创建日期：2026-05-01
 *
 * 功能描述：分析文本风格、模仿指定风格改写内容
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { StyleImitationAgent } from '../pipeline/agents/style-imitation';

type Variables = {
  user_id: string;
};

const styleRoute = new Hono<{ Variables: Variables }>();

const analyzeSchema = z.object({
  text: z.string().min(100),
});

const imitateSchema = z.object({
  content: z.string().min(50),
  styleProfile: z.any(),
});

styleRoute.post('/analyze', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const parsed = analyzeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_400', message: '参数校验失败', details: parsed.error.flatten() }
    }, 400);
  }

  try {
    const agent = new StyleImitationAgent();
    const result = await agent.analyze({ userId, pipelineId: 'style-analyze' }, parsed.data.text);

    return c.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('Style analysis error:', error);
    return c.json({
      success: false,
      error: { code: 'STYLE_ANALYSIS_FAILED', message: '文风分析失败' }
    }, 500);
  }
});

styleRoute.post('/imitate', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  const parsed = imitateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_400', message: '参数校验失败', details: parsed.error.flatten() }
    }, 400);
  }

  try {
    const agent = new StyleImitationAgent();
    const result = await agent.imitate({ userId, pipelineId: 'style-imitate' }, parsed.data.content, parsed.data.styleProfile);

    return c.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('Style imitation error:', error);
    return c.json({
      success: false,
      error: { code: 'STYLE_IMITATION_FAILED', message: '文风仿写失败' }
    }, 500);
  }
});

export default styleRoute;
