#!/bin/bash
set -e
echo "✦ 构建 InkForge..."
cd "$(dirname "$0")/.."
pnpm install
pnpm --filter @inkforge/shared build
pnpm --filter @inkforge/backend build
pnpm --filter @inkforge/frontend build
echo "✦ 构建完成"
echo "✦ 后端: packages/backend/dist"
echo "✦ 前端: packages/frontend/dist"
