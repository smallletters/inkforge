import { serve } from '@hono/node-server';
import app from './index';
import { config } from './config';
import { initCrypto } from './lib/crypto';

initCrypto(config.encryption.key);

serve({ fetch: app.fetch, port: config.app.port, hostname: config.app.host }, (info) => {
  console.log(`✦ ${config.app.name} v0.1.0`);
  console.log(`✦ 地址: http://${info.address}:${info.port}`);
  console.log(`✦ 环境: ${config.node_env}`);
});
