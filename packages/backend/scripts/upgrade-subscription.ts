/**
 * 灵砚 InkForge - 订阅升级脚本
 * 作者：<smallletters@sina.com>
 * 创建日期：2026-05-02
 * 
 * 功能描述：直接在数据库中更新用户订阅状态
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { config } from '../src/config';

async function upgradeUserSubscription(email: string, tier: 'free' | 'pro' | 'enterprise') {
  const queryClient = postgres(config.database.url);
  const db = drizzle(queryClient, { logger: true });

  try {
    console.log(`🔍 查找用户: ${email}`);
    
    const [user] = await db.select({ id: users.id, subscription_tier: users.subscription_tier })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      console.error(`❌ 用户不存在: ${email}`);
      process.exit(1);
    }

    console.log(`📋 当前订阅状态: ${user.subscription_tier}`);
    console.log(`🔄 升级到: ${tier}`);

    const result = await db.update(users)
      .set({ subscription_tier: tier, updated_at: new Date() })
      .where(eq(users.id, user.id))
      .returning({ subscription_tier: users.subscription_tier });

    console.log(`✅ 升级成功! 新状态: ${result[0].subscription_tier}`);
    
  } catch (error) {
    console.error('❌ 更新失败:', error);
    process.exit(1);
  } finally {
    await queryClient.end();
  }
}

const email = process.argv[2] || 'smallletters@sina.com';
const tier = (process.argv[3] as 'free' | 'pro' | 'enterprise') || 'pro';

console.log(`🚀 开始升级订阅...`);
console.log(`📧 用户邮箱: ${email}`);
console.log(`🎯 目标订阅: ${tier}`);
console.log('');

upgradeUserSubscription(email, tier);
