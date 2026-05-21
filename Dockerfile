# syntax=docker/dockerfile:1

# -----------------------------
# 构建阶段
# -----------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

ENV NODE_ENV=production

# 先复制依赖文件
COPY package*.json ./

# 安装依赖（每个平台独立安装）
RUN npm install

# 复制源码
COPY . .

# 构建 Next.js
RUN npm run build

# -----------------------------
# 运行阶段
# -----------------------------
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制整个项目（包含 custom-server.js）
COPY --from=builder /app ./

USER nextjs

EXPOSE 3000

CMD ["node", "custom-server.js", "--prod"]
