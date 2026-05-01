import jwt from 'jsonwebtoken';
import { createMiddleware } from 'hono/factory';
import { config } from '../config';

export const authMiddleware = createMiddleware(async (c, next) => {
  let token: string | undefined;

  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    token = auth.slice(7);
  } else {
    token = c.req.query('token');
  }

  if (!token) {
    return c.json({ success: false, error: { code: 'AUTH_401', message: '需要认证' } }, 401);
  }
  try {
    const payload = jwt.verify(token, config.auth.jwt_secret) as { user_id: string; sub: string };
    c.set('user_id', payload.user_id);
    c.set('username', payload.sub);
    await next();
  } catch {
    return c.json({ success: false, error: { code: 'AUTH_401', message: '认证令牌已过期' } }, 401);
  }
});
