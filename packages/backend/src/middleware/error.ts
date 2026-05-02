/**
 * 灵砚 InkForge - 错误处理中间件
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-04-30
 *
 * 功能描述：统一错误处理，支持降级策略和错误恢复
 * 包含：错误分类、优雅降级、错误日志、错误代码规范
 */
import { createMiddleware } from 'hono/factory';
import { ZodError } from 'zod';
import { HTTPException } from 'hono/http-exception';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    retryAfter?: number;
    fallbackAvailable?: boolean;
  };
}

type ErrorCode =
  | 'VALIDATION_400'
  | 'VALIDATION_422'
  | 'AUTH_401'
  | 'FORBIDDEN_403'
  | 'NOT_FOUND_404'
  | 'CONFLICT_409'
  | 'RATE_LIMIT_429'
  | 'SERVICE_503'
  | 'CIRCUIT_OPEN_503'
  | 'TIMEOUT_504'
  | 'CONFIG_400'
  | 'INTERNAL_500'
  | 'PROVIDER_ERROR_502';

const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_400: '请求参数错误',
  VALIDATION_422: '参数校验失败',
  AUTH_401: '认证已过期，请重新登录',
  FORBIDDEN_403: '权限不足',
  NOT_FOUND_404: '资源不存在',
  CONFLICT_409: '资源冲突',
  RATE_LIMIT_429: '请求过于频繁，请稍后重试',
  SERVICE_503: '服务暂时不可用',
  CIRCUIT_OPEN_503: '服务商熔断器已打开，请稍后重试',
  TIMEOUT_504: '请求超时',
  CONFIG_400: '配置错误',
  INTERNAL_500: '服务器内部错误',
  PROVIDER_ERROR_502: 'AI服务商响应异常',
};

function getErrorCode(error: Error): ErrorCode {
  if (error instanceof ZodError) return 'VALIDATION_422';
  if (error instanceof HTTPException) return `HTTP_${error.status}` as ErrorCode;
  if (error.message.includes('未配置') || error.message.includes('缺少')) return 'CONFIG_400';
  if (error.message.includes('不存在') || error.message.includes('未找到') || error.message.includes('404')) return 'NOT_FOUND_404';
  if (error.message.includes('权限') || error.message.includes('Forbidden') || error.message.includes('403')) return 'FORBIDDEN_403';
  if (error.message.includes('认证') || error.message.includes('token') || error.message.includes('401')) return 'AUTH_401';
  if (error.message.includes('熔断器')) return 'CIRCUIT_OPEN_503';
  if (error.message.includes('熔断') || error.message.includes('503')) return 'SERVICE_503';
  if (error.message.includes('超时') || error.message.includes('timeout') || error.message.includes('TIMEOUT')) return 'TIMEOUT_504';
  if (error.message.includes('rate limit') || error.message.includes('请求过于频繁')) return 'RATE_LIMIT_429';
  if (error.message.includes('冲突') || error.message.includes('conflict')) return 'CONFLICT_409';
  if (error.message.includes('provider') || error.message.includes('Provider') || error.message.includes('AI服务商')) return 'PROVIDER_ERROR_502';
  return 'INTERNAL_500';
}

function getErrorStatus(error: Error): number {
  if (error instanceof ZodError) return 422;
  if (error instanceof HTTPException) return error.status;
  const message = error.message;
  if (message.includes('不存在') || message.includes('未找到')) return 404;
  if (message.includes('权限') || message.includes('Forbidden')) return 403;
  if (message.includes('认证')) return 401;
  if (message.includes('熔断器')) return 503;
  if (message.includes('熔断') || message.includes('503')) return 503;
  if (message.includes('超时')) return 504;
  if (message.includes('rate limit')) return 429;
  if (message.includes('冲突')) return 409;
  if (message.includes('参数校验')) return 422;
  return 500;
}

function extractRetryAfter(error: Error): number | undefined {
  const match = error.message.match(/(\d+)\s*秒/);
  if (match) return parseInt(match[1], 10);
  if (error.message.includes('熔断')) return 30;
  if (error.message.includes('rate limit')) return 60;
  return undefined;
}

function shouldSuggestFallback(error: Error): boolean {
  const fallbackErrors = ['PROVIDER_ERROR_502', 'SERVICE_503', 'CIRCUIT_OPEN_503', 'TIMEOUT_504'];
  const code = getErrorCode(error);
  return fallbackErrors.includes(code);
}

function isRetryable(error: Error): boolean {
  const retryableCodes = ['RATE_LIMIT_429', 'SERVICE_503', 'TIMEOUT_504', 'CIRCUIT_OPEN_503'];
  const code = getErrorCode(error);
  return retryableCodes.includes(code);
}

export const errorMiddleware = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (err) {
    const error = err as Error & { status?: number };

    const errorLog = {
      timestamp: new Date().toISOString(),
      name: error.name,
      message: error.message,
      stack: error.stack,
      path: c.req.path,
      method: c.req.method,
      requestId: c.get('requestId'),
      userId: c.get('user_id'),
    };

    const isExpectedError = error instanceof ZodError || error instanceof HTTPException;
    if (!isExpectedError) {
      console.error('[ERROR]', JSON.stringify(errorLog, null, 2));
    } else {
      console.warn('[WARN]', errorLog.message, { path: errorLog.path, method: errorLog.method });
    }

    const code = getErrorCode(error);
    const status = getErrorStatus(error);
    let message = ERROR_MESSAGES[code] || error.message;

    if (error instanceof ZodError) {
      message = ERROR_MESSAGES.VALIDATION_422;
    }

    const retryAfter = extractRetryAfter(error);
    const fallbackAvailable = shouldSuggestFallback(error);
    const retryable = isRetryable(error);

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

    if (retryAfter !== undefined) {
      response.error.retryAfter = retryAfter;
    }

    if (fallbackAvailable) {
      response.error.fallbackAvailable = true;
    }

    c.status(status as any);
    c.header('X-Error-Code', code);
    if (retryAfter !== undefined) {
      c.header('Retry-After', String(retryAfter));
    }

    return c.json(response);
  }
});

export function createGracefulDegradation<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  fallbackValue?: T
): (error?: Error) => Promise<T> {
  return async (error?: Error) => {
    if (error) {
      console.warn('[Degradation] Primary function failed, attempting fallback:', error.message);
    }
    try {
      return await fallbackFn();
    } catch (fallbackError) {
      console.error('[Degradation] Fallback also failed:', fallbackError);
      if (fallbackValue !== undefined) {
        return fallbackValue;
      }
      throw error ?? fallbackError;
    }
  };
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly retryAfter: number = 5000,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}
