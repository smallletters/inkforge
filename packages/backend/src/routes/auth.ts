import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { users, llmProviders, agentConfigs, userSessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { encrypt, decrypt } from '../lib/crypto';
import { randomBytes } from 'crypto';

type Variables = {
  user_id: string;
  username: string;
};

const auth = new Hono<{ Variables: Variables }>();

async function createDefaultProviderForUser(userId: string) {
  const encryptedKey = encrypt('demo-key');

  await db.insert(llmProviders).values({
    user_id: userId,
    name: 'OpenAI (演示)',
    provider_type: 'openai',
    base_url: 'https://api.openai.com/v1',
    api_key_encrypted: encryptedKey,
    models: ['gpt-4o-mini'],
    is_active: true,
  });

  const agentNames = ['radar', 'planner', 'composer', 'architect', 'writer', 'observer', 'reflector', 'normalizer', 'auditor', 'reviser'];
  for (const agentName of agentNames) {
    await db.insert(agentConfigs).values({
      user_id: userId,
      agent_name: agentName,
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 4096,
      is_active: true,
    });
  }
}

async function generateRefreshToken(userId: string) {
  const refreshToken = randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  await db.insert(userSessions).values({
    user_id: userId,
    refresh_token_hash: await bcrypt.hash(refreshToken, 10),
    expires_at: expiresAt,
  });
  
  return refreshToken;
}

async function verifyRefreshToken(userId: string, token: string) {
  const sessions = await db.select().from(userSessions).where(eq(userSessions.user_id, userId));
  
  for (const session of sessions) {
    if (await bcrypt.compare(token, session.refresh_token_hash)) {
      if (session.expires_at > new Date()) {
        return true;
      } else {
        await db.delete(userSessions).where(eq(userSessions.id, session.id));
      }
    }
  }
  
  return false;
}

auth.post('/register', async (c) => {
  const body = await c.req.json<{ username: string; email: string; password: string }>();
  const schema = z.object({ username: z.string().min(3).max(50), email: z.string().email(), password: z.string().min(8).max(128) });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_422', message: '参数校验失败', details: parsed.error.flatten() } }, 422);

  const existing = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (existing.length) return c.json({ success: false, error: { code: 'VALIDATION_422', message: '邮箱已被注册' } }, 422);

  const hash = await bcrypt.hash(body.password, 12);
  const [user] = await db.insert(users).values({ username: body.username, email: body.email, password_hash: hash }).returning({ id: users.id, username: users.username, email: users.email, subscription_tier: users.subscription_tier, created_at: users.created_at });

  await createDefaultProviderForUser(user.id);

  const accessToken = jwt.sign({ user_id: user.id, sub: user.username }, config.auth.jwt_secret, { expiresIn: `${config.auth.jwt_expire_hours}h` });
  const refreshToken = await generateRefreshToken(user.id);

  return c.json({
    success: true,
    data: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: config.auth.jwt_expire_hours * 3600,
      user: { id: user.id, username: user.username, subscription_tier: user.subscription_tier },
    },
  }, 201);
});

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    return c.json({ success: false, error: { code: 'AUTH_401', message: '邮箱或密码错误' } }, 401);
  }

  const accessToken = jwt.sign({ user_id: user.id, sub: user.username }, config.auth.jwt_secret, { expiresIn: `${config.auth.jwt_expire_hours}h` });
  const refreshToken = await generateRefreshToken(user.id);

  return c.json({
    success: true,
    data: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: config.auth.jwt_expire_hours * 3600,
      user: { id: user.id, username: user.username, subscription_tier: user.subscription_tier },
    },
  });
});

auth.post('/refresh', async (c) => {
  const body = await c.req.json();
  const schema = z.object({ refresh_token: z.string() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_400', message: '参数校验失败' } }, 400);
  }

  try {
    const decoded = jwt.decode(parsed.data.refresh_token) as { user_id?: string } | null;
    const userId = decoded?.user_id;
    
    if (!userId) {
      return c.json({ success: false, error: { code: 'AUTH_401', message: '无效的refresh token' } }, 401);
    }

    const isValid = await verifyRefreshToken(userId, parsed.data.refresh_token);
    if (!isValid) {
      return c.json({ success: false, error: { code: 'AUTH_401', message: 'refresh token已过期或无效' } }, 401);
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return c.json({ success: false, error: { code: 'AUTH_401', message: '用户不存在' } }, 401);
    }

    const newAccessToken = jwt.sign({ user_id: user.id, sub: user.username }, config.auth.jwt_secret, { expiresIn: `${config.auth.jwt_expire_hours}h` });
    const newRefreshToken = await generateRefreshToken(user.id);

    return c.json({
      success: true,
      data: {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in: config.auth.jwt_expire_hours * 3600,
      },
    });
  } catch {
    return c.json({ success: false, error: { code: 'AUTH_401', message: '无效的token' } }, 401);
  }
});

auth.use('/logout', authMiddleware);
auth.post('/logout', async (c) => {
  const userId = c.get('user_id') as string;
  await db.delete(userSessions).where(eq(userSessions.user_id, userId));
  return c.json({ success: true, data: { message: '已登出' } });
});

export default auth;
