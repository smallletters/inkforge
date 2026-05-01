FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @inkforge/shared build
RUN pnpm --filter @inkforge/backend build
RUN pnpm --filter @inkforge/frontend build

FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /app
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/frontend/dist ./dist/public
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/index.js"]
