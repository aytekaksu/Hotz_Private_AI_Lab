ARG APP_SRC=apps/web

FROM oven/bun:1.3.2-alpine AS deps
ARG APP_SRC
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    RUN_ENV=bun

COPY ${APP_SRC}/package.json ./package.json
# Use the workspace-level lockfile to keep container installs in sync with local hoisted deps.
COPY bun.lock ./bun.lock

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --no-save

FROM oven/bun:1.3.2-alpine AS builder
ARG APP_SRC
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    RUN_ENV=bun \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048"

COPY --from=deps /app/node_modules ./node_modules
COPY ${APP_SRC}/ ./

# Ensure public directory exists (Next.js standalone build may not create it if empty)
RUN mkdir -p ./public

RUN --mount=type=cache,target=/app/.next/cache \
    bun run build

FROM oven/bun:1.3.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    RUN_ENV=bun \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nextjs -g 1001 && adduser -S nextjs -u 1001

# Copy public directory (will exist after build)
COPY --chown=nextjs:nextjs --from=builder /app/public ./public
COPY --chown=nextjs:nextjs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nextjs --from=builder /app/.next/static ./.next/static

RUN mkdir -p /data/uploads && chown -R nextjs:nextjs /data

USER nextjs

EXPOSE 3000

CMD ["bun", "server.js"]
