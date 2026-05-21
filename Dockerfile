# syntax=docker/dockerfile:1

# -----------------------------
# 安装开发依赖
# -----------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

# -----------------------------
# 安装生产依赖
# -----------------------------
FROM node:20-bookworm-slim AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# -----------------------------
# 构建阶段（针对每个平台重新安装依赖）
# -----------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=production

# 针对当前架构重新安装依赖，避免跨平台 node_modules 问题
COPY package*.json ./
RUN npm install

# 复制源码
COPY . .

# 构建
RUN npm run build

# -----------------------------
# 最终运行镜像
# -----------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# 复制生产依赖
COPY --from=prod-deps /app/node_modules ./node_modules

# 复制构建产物
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/server.js ./custom-server.js

USER nextjs
EXPOSE 3000

CMD ["node", "custom-server.js", "--prod"]
