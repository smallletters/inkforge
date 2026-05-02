import { createMiddleware } from 'hono/factory';
import { ZodError } from 'zod';
import { HTTPException } from 'hono/http-exception';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function getErrorCode(error: Error): string {
  if (error instanceof ZodError) return 'VALIDATION_422';
  if (error instanceof HTTPException) return `HTTP_${error.status}`;
  if (error.message.includes('未配置')) return 'CONFIG_400';
  if (error.message.includes('不存在') || error.message.includes('未找到')) return 'NOT_FOUND_404';
  if (error.message.includes('权限') || error.message.includes('认证') || error.message.includes('token')) return 'AUTH_401';
  if (error.message.includes('熔断')) return 'SERVICE_503';
  return 'INTERNAL_500';
}

function getErrorStatus(error: Error): number {
  if (error instanceof ZodError) return 422;
  if (error instanceof HTTPException) return error.status;
  const message = error.message;
  if (message.includes('不存在') || message.includes('未找到')) return 404;
  if (message.includes('权限') || message.includes('认证')) return 401;
  if (message.includes('熔断')) return 503;
  if (message.includes('参数校验')) return 422;
  return 500;
}

export const errorMiddleware = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (err) {
    const error = err as Error;
    console.error('[ERROR]', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      path: c.req.path,
      method: c.req.method,
    });

    const code = getErrorCode(error);
    const status = getErrorStatus(error);
    let message = error.message;

    if (error instanceof ZodError) {
      message = '参数校验失败';
    }

    const response: ErrorResponse = {
      success: false,
      error: {
        code,
        message,
      },
    };

    if (error instanceof ZodError) {
      response.error.details = error.flatten();
    }

    c.status(status as any);
    return c.json(response);
  }
});
