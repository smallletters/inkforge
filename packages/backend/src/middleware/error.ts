import { createMiddleware } from 'hono/factory';

export const errorMiddleware = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (err) {
    console.error('[ERROR]', err);
    c.status(500);
    return c.json({
      success: false,
      error: { code: 'INTERNAL_500', message: '服务器内部错误' },
    });
  }
});
