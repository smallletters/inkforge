/**
 * 灵砚 InkForge - 可观测性模块
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 *
 * 功能描述：统一日志记录和追踪接口，支持后续集成OpenTelemetry
 * 当前版本使用控制台日志，生产环境可替换为真实遥测
 */
import { providerBank } from '../provider-bank';

const SERVICE_NAME = 'inkforge-backend';

interface SpanAttributes {
  [key: string]: string | number | boolean;
}

interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const defaultConfig: TelemetryConfig = {
  enabled: process.env.OTEL_ENABLED === 'true',
  serviceName: SERVICE_NAME,
  logLevel: (process.env.LOG_LEVEL as TelemetryConfig['logLevel']) || 'info',
};

class ConsoleSpan {
  private attributes: SpanAttributes = {};
  private events: { name: string; attributes?: SpanAttributes }[] = [];
  private startTime: number;
  private endTime?: number;
  private status: 'ok' | 'error' = 'ok';

  constructor(
    private name: string,
    private kind: string
  ) {
    this.startTime = Date.now();
    console.log(`[Span] Started: ${name} (${kind})`);
  }

  setAttributes(attributes: SpanAttributes): void {
    this.attributes = { ...this.attributes, ...attributes };
    console.log(`[Span] ${this.name} attributes:`, this.attributes);
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    this.events.push({ name, attributes });
    console.log(`[Span] ${this.name} event: ${name}`, attributes);
  }

  setStatus(status: { code: 'OK' | 'ERROR'; message?: string }): void {
    if (status.code === 'ERROR') {
      this.status = 'error';
    }
  }

  recordException(error: Error): void {
    console.error(`[Span] ${this.name} exception:`, error.message);
  }

  end(): void {
    this.endTime = Date.now();
    const duration = this.endTime - this.startTime;
    console.log(`[Span] Ended: ${this.name} (${this.kind}) - ${duration}ms, status: ${this.status}`);
  }
}

export class Telemetry {
  private config: TelemetryConfig;
  private static instance: Telemetry;

  private constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  static getInstance(config?: Partial<TelemetryConfig>): Telemetry {
    if (!Telemetry.instance) {
      Telemetry.instance = new Telemetry(config);
    }
    return Telemetry.instance;
  }

  async initialize(): Promise<void> {
    if (this.config.enabled) {
      console.log('[Telemetry] Enabled - OpenTelemetry integration ready');
      console.log('[Telemetry] Set OTEL_ENABLED=false to disable');
    } else {
      console.log('[Telemetry] Disabled - using console logging');
    }
  }

  async shutdown(): Promise<void> {
    console.log('[Telemetry] Shutdown');
  }

  createSpan(name: string, kind: string = 'INTERNAL'): ConsoleSpan {
    return new ConsoleSpan(name, kind);
  }

  async withSpan<T>(
    name: string,
    fn: (span: ConsoleSpan) => Promise<T>,
    kind: string = 'INTERNAL'
  ): Promise<T> {
    const span = this.createSpan(name, kind);

    span.setAttributes({
      'service.name': this.config.serviceName,
      'deployment.environment': process.env.NODE_ENV || 'development',
    });

    try {
      const result = await fn(span);
      span.setStatus({ code: 'OK' });
      return result;
    } catch (error) {
      span.setStatus({ code: 'ERROR', message: error instanceof Error ? error.message : 'Unknown error' });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  recordProviderMetrics(serviceName: string): void {
    const metrics_data = providerBank.getMetrics(serviceName);
    console.log(`[Metrics] Provider ${serviceName}:`, {
      totalRequests: metrics_data.totalRequests,
      failedRequests: metrics_data.failedRequests,
      avgLatency: metrics_data.totalRequests > 0 ? metrics_data.totalLatency / metrics_data.totalRequests : 0,
    });
  }

  recordPipelineMetrics(
    pipelineId: string,
    agentName: string,
    durationMs: number,
    success: boolean
  ): void {
    console.log(`[Metrics] Pipeline ${pipelineId} - Agent ${agentName}:`, {
      duration: `${durationMs}ms`,
      success,
    });
  }

  addSpanEvent(name: string, attributes?: SpanAttributes): void {
    console.log(`[Event] ${name}`, attributes);
  }

  setSpanAttributes(attributes: SpanAttributes): void {
    console.log('[Span] Attributes set:', attributes);
  }
}

export const telemetry = Telemetry.getInstance();

export function traceProviderCall(
  providerType: string,
  model: string,
  operation: 'chat' | 'listModels' | 'testConnection'
) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const span = telemetry.createSpan(`provider.${operation}`, 'CLIENT');

      span.setAttributes({
        'provider.type': providerType,
        'provider.model': model,
        'provider.operation': operation,
      });

      const startTime = Date.now();

      try {
        const result = await originalMethod.apply(this, args);
        span.setStatus({ code: 'OK' });
        span.setAttributes({ 'provider.latency_ms': Date.now() - startTime });
        return result;
      } catch (error) {
        span.setStatus({ code: 'ERROR', message: error instanceof Error ? error.message : 'Unknown error' });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    };

    return descriptor;
  };
}

export function tracePipelineAgent(agentName: string) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const span = telemetry.createSpan(`pipeline.agent.${agentName}`, 'INTERNAL');

      const firstArg = args[0] as { pipelineId?: string } | undefined;
      const pipelineId = firstArg?.pipelineId || 'unknown';
      span.setAttributes({
        'pipeline.id': pipelineId,
        'agent.name': agentName,
      });

      const startTime = Date.now();

      try {
        const result = await originalMethod.apply(this, args);
        const durationMs = Date.now() - startTime;

        span.setStatus({ code: 'OK' });
        span.setAttributes({ 'agent.duration_ms': durationMs, 'agent.success': true });

        telemetry.recordPipelineMetrics(pipelineId, agentName, durationMs, true);

        return result;
      } catch (error) {
        const durationMs = Date.now() - startTime;

        span.setStatus({ code: 'ERROR', message: error instanceof Error ? error.message : 'Unknown error' });
        span.recordException(error as Error);
        span.setAttributes({ 'agent.duration_ms': durationMs, 'agent.success': false });

        telemetry.recordPipelineMetrics(pipelineId, agentName, durationMs, false);

        throw error;
      } finally {
        span.end();
      }
    };

    return descriptor;
  };
}