/**
 * 灵砚 InkForge - 订阅付费系统
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-30
 * 
 * 功能描述：管理用户订阅层级、用量追踪和付费转化
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

type Variables = {
  user_id: string;
};

const subscriptionRoute = new Hono<{ Variables: Variables }>();

const PLANS = {
  free: {
    id: 'free',
    name: '免费版',
    price: 0,
    period: null,
    features: [
      '基础Agent管线',
      '每月10万字限制',
      '社区模型支持',
      '基础导出(TXT/MD)',
    ],
    limits: {
      monthly_word_limit: 100000,
      pipeline_concurrent: 1,
      provider_count: 2,
      custom_prompt: false,
      multi_model_routing: false,
      export_formats: ['txt', 'md'],
    },
  },
  pro: {
    id: 'pro',
    name: '专业版',
    price: 29,
    period: 'month',
    annual_price: 199,
    features: [
      '完整Agent管线（10个Agent）',
      '无限字数',
      '自定义提示词',
      '多模型路由',
      '高级导出(EPUB/PDF/DOCX)',
      '33维度审计',
      '优先客服支持',
    ],
    limits: {
      monthly_word_limit: -1,
      pipeline_concurrent: 3,
      provider_count: -1,
      custom_prompt: true,
      multi_model_routing: true,
      export_formats: ['txt', 'md', 'epub', 'pdf', 'docx'],
    },
  },
  enterprise: {
    id: 'enterprise',
    name: '企业版',
    price: -1,
    period: null,
    features: [
      '私有化部署',
      '专属Agent定制',
      'SLA保障',
      'API接入',
      '团队协作',
      '专属客服',
    ],
    limits: {
      monthly_word_limit: -1,
      pipeline_concurrent: 10,
      provider_count: -1,
      custom_prompt: true,
      multi_model_routing: true,
      export_formats: ['txt', 'md', 'epub', 'pdf', 'docx'],
    },
  },
};

subscriptionRoute.get('/plans', async (c) => {
  return c.json({
    success: true,
    data: {
      plans: Object.values(PLANS).map(plan => ({
        ...plan,
        price_display: plan.price === 0 ? '免费' : plan.price === -1 ? '定制报价' : `¥${plan.price}${plan.period ? `/${plan.period === 'month' ? '月' : '年'}` : ''}`,
      })),
    },
  });
});

subscriptionRoute.get('/current', async (c) => {
  const userId = c.get('user_id');
  
  const [user] = await db.select({
    subscription_tier: users.subscription_tier,
    preferences: users.preferences,
  }).from(users).where(eq(users.id, userId)).limit(1);

  const currentPlan = PLANS[user?.subscription_tier as keyof typeof PLANS] || PLANS.free;
  
  return c.json({
    success: true,
    data: {
      current_plan: {
        ...currentPlan,
        price_display: currentPlan.price === 0 ? '免费' : `¥${currentPlan.price}/${currentPlan.period === 'month' ? '月' : '年'}`,
      },
      usage: {
        monthly_words_used: 0,
        monthly_word_limit: currentPlan.limits.monthly_word_limit,
        unlimited: currentPlan.limits.monthly_word_limit === -1,
      },
      features_enabled: currentPlan.limits,
    },
  });
});

subscriptionRoute.post('/upgrade', async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();
  
  const schema = z.object({
    plan_id: z.enum(['free', 'pro', 'enterprise']),
    period: z.enum(['month', 'year']).optional(),
    payment_method: z.string().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_400', message: '参数校验失败', details: parsed.error.flatten() }
    }, 400);
  }

  const targetPlan = PLANS[parsed.data.plan_id as keyof typeof PLANS];
  if (!targetPlan) {
    return c.json({
      success: false,
      error: { code: 'SUBSCRIPTION_400', message: '不存在的订阅计划' }
    }, 400);
  }

  await db.update(users).set({
    subscription_tier: targetPlan.id,
    updated_at: new Date(),
  }).where(eq(users.id, userId));

  return c.json({
    success: true,
    data: {
      plan_id: targetPlan.id,
      plan_name: targetPlan.name,
      activated_at: new Date().toISOString(),
    },
  });
});

subscriptionRoute.post('/cancel', async (c) => {
  const userId = c.get('user_id');
  
  await db.update(users).set({
    subscription_tier: 'free',
    updated_at: new Date(),
  }).where(eq(users.id, userId));

  return c.json({
    success: true,
    data: {
      message: '订阅已取消',
      effective_date: new Date().toISOString(),
      will_expire: null,
    },
  });
});

subscriptionRoute.get('/usage', async (c) => {
  const userId = c.get('user_id');

  const [user] = await db.select({
    subscription_tier: users.subscription_tier,
  }).from(users).where(eq(users.id, userId)).limit(1);

  const currentPlan = PLANS[user?.subscription_tier as keyof typeof PLANS] || PLANS.free;

  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  return c.json({
    success: true,
    data: {
      period: {
        start: currentMonth.toISOString(),
        end: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString(),
      },
      usage: {
        words_generated: 0,
        words_limit: currentPlan.limits.monthly_word_limit,
        unlimited: currentPlan.limits.monthly_word_limit === -1,
        percentage: currentPlan.limits.monthly_word_limit === -1 ? 0 : 0,
      },
      features: currentPlan.limits,
    },
  });
});

subscriptionRoute.get('/features', async (c) => {
  const userId = c.get('user_id');
  
  const [user] = await db.select({
    subscription_tier: users.subscription_tier,
  }).from(users).where(eq(users.id, userId)).limit(1);

  const currentPlan = PLANS[user?.subscription_tier as keyof typeof PLANS] || PLANS.free;

  return c.json({
    success: true,
    data: {
      tier: currentPlan.id,
      features: {
        basic_pipeline: true,
        advanced_pipeline: currentPlan.id !== 'free',
        custom_prompt: currentPlan.limits.custom_prompt,
        multi_model_routing: currentPlan.limits.multi_model_routing,
        export_txt: true,
        export_md: true,
        export_epub: currentPlan.limits.export_formats.includes('epub'),
        export_pdf: currentPlan.limits.export_formats.includes('pdf'),
        export_docx: currentPlan.limits.export_formats.includes('docx'),
        priority_support: currentPlan.id === 'pro' || currentPlan.id === 'enterprise',
        api_access: currentPlan.id === 'enterprise',
        team_collaboration: currentPlan.id === 'enterprise',
        private_deployment: currentPlan.id === 'enterprise',
      },
    },
  });
});

export { PLANS };
export default subscriptionRoute;
