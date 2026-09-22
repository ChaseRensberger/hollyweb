FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/auth/package.json ./apps/auth/package.json
COPY apps/bracket/package.json ./apps/bracket/package.json
COPY apps/hollydraft/package.json ./apps/hollydraft/package.json
COPY packages/core/package.json ./packages/core/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN bun run --filter @hollyweb/hollydraft build

FROM oven/bun:1.3.14
WORKDIR /app
COPY --from=build --chown=bun:bun /app /app
RUN mkdir -p /data && chown bun:bun /data
WORKDIR /app/apps/hollydraft
ENV NODE_ENV=production PORT=3000 HOLLYDRAFT_DATABASE=/data/hollydraft.sqlite
USER bun
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD bun -e 'process.exit((await fetch("http://127.0.0.1:" + process.env.PORT + "/health")).ok ? 0 : 1)'
CMD ["sh", "-c", "bun run db:migrate && exec bun dist/index.js"]
