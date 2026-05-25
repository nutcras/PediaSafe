# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the @pedia/api Hono server.
# The build context is the monorepo root because @pedia/api depends on the
# workspace package @pedia/db.
#
# Build:
#   docker build -t pediasafe-api .
#
# Run (example — see docs/DEPLOY.md):
#   docker run --rm -p 3100:3000 \
#     -e DATABASE_URL=... \
#     pediasafe-api
#
# (Host port 3100 is just an example — the container always listens on 3000
# internally. Remap to any free host port if 3100 is taken too.)

# ─── Stage 1: install workspace dependencies ────────────────────────────────
FROM oven/bun:1.2-slim AS deps

WORKDIR /app

# Copy only manifests first so the layer cache stays warm across code edits.
COPY package.json bun.lock tsconfig.base.json ./
COPY app/api/package.json ./app/api/package.json
COPY packages/db/package.json ./packages/db/package.json

# Workspace install (hoists into /app/node_modules + per-package symlinks).
# --frozen-lockfile fails the build if bun.lock would have to change.
RUN bun install

# ─── Stage 2: runtime ───────────────────────────────────────────────────────
FROM oven/bun:1.2-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# Bring deps over from the install stage. Bun workspaces hoist *everything*
# into the root node_modules (with @pedia/* as symlinks back to packages/* and
# app/*), so a single COPY is enough — there are no per-package node_modules
# directories on Linux.
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace source.
COPY package.json bun.lock tsconfig.base.json ./
COPY app/api ./app/api
COPY packages/db ./packages/db

# Entrypoint runs drizzle migrations against DATABASE_URL, then starts the API.
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Drop privileges. The oven/bun image ships with a non-root bun user (uid 1000).
USER bun

EXPOSE 3000

# Lightweight liveness probe — hits the root status endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bun", "run", "--cwd", "app/api", "start"]
