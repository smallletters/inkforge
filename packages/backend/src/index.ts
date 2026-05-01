import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config';
import { errorMiddleware } from './middleware/error';
import { authMiddleware } from './middleware/auth';
import authRoute from './routes/auth';
import novelsRoute from './routes/novels';
import agentsRoute from './routes/agents';
import providersRoute from './routes/providers';
import pipelineRoute from './routes/pipeline';
import truthRoute from './routes/truth-files';
import exportRoute from './routes/export';
import chatRoute from './routes/chat';
import importRoute from './routes/import';
import subscriptionRoute from './routes/subscription';
import { eventBus } from './sse/event-bus';
import { executePipeline } from './pipeline/orchestrator';

type Variables = {
  user_id: string;
  username: string;
};

const app = new Hono<{ Variables: Variables }>();

app.use(logger());
app.use(cors({ origin: '*', credentials: true }));
app.use(errorMiddleware);

// Health
app.get('/health', (c) => c.json({ status: 'ok', app: config.app.name }));
app.get('/health/ready', (c) => c.json({ status: 'ready' }));

// Auth (public)
app.route('/api/v1/auth', authRoute);

// Protected routes
app.use('/api/v1/*', authMiddleware);

app.route('/api/v1/novels', novelsRoute);
app.route('/api/v1/agents', agentsRoute);
app.route('/api/v1/providers', providersRoute);
app.route('/api/v1', pipelineRoute);
app.route('/api/v1', truthRoute);
app.route('/api/v1', exportRoute);
app.route('/api/v1/novels', chatRoute);
app.route('/api/v1/novels', importRoute);
app.route('/api/v1/subscription', subscriptionRoute);



// SSE endpoint
app.get('/events', authMiddleware, async (c) => {
  const userId = c.get('user_id') as string;
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = eventBus.subscribe(userId, (event) => {
        controller.enqueue(`id: ${Date.now()}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
      });

      c.req.raw.signal.addEventListener('abort', () => {
        unsubscribe();
        eventBus.removeUser(userId);
        controller.close();
      });
    },
  });

  return c.body(stream);
});

export default app;
