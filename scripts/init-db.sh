#!/bin/bash
echo "✦ 正在初始化 InkForge 数据库..."
psql -U inkforge -d inkforge -c "
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS inkforge;
"
echo "✦ 数据库初始化完成"
echo "✦ 运行迁移: pnpm --filter @inkforge/backend db:push"
