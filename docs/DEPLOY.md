# Deployment & Local Development Guide

This document covers:
- Running the full stack locally with Docker Compose
- Running migrations manually
- Building and deploying individual services

---

## Services overview

| Service | Image | Default host port | Description |
|---|---|---|---|
| `api` | `Dockerfile` (repo root) | `3100` | Hono API — assessment & patient endpoints |
| `web` | `Dockerfile.web` (repo root) | `3101` | Next.js app — risk assessment form & monitoring dashboard |

### External networks

`api` connects to 3 external networks belonging to the infrastructure stack that runs separately:

| Network name in compose | Actual Docker network | Used to reach |
|---|---|---|
| `db_net` | `api_smart-restaurant-network` | PostgreSQL |
| `redis_net` | `redis_redis-network` | Redis |
| `minio_net` | `minio_default` | MinIO object storage |

`web` is on the `default` network only (the browser calls the API directly via its host port).

---

## Quick start (Docker Compose)

### 1. Copy and fill in the env file

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Connection string pointing at the Postgres container in `db_net` |
| `NEXT_PUBLIC_API_URL` | Public URL of the API the browser will call |

> **`NEXT_PUBLIC_*` are baked into the JS bundle at build time.**
> If you change them after building you must run `docker compose build web` again.

### 2. Build images

```bash
docker compose build
```

To build only one service:

```bash
docker compose build api
docker compose build web
```

### 3. Start everything

```bash
docker compose up -d
```

On first start the `api` container will:
1. Verify `DATABASE_URL` is set (exits immediately if missing)
2. Run all pending Drizzle migrations automatically via `entrypoint.sh`
3. Start the Hono API on port 3000 (mapped to host `3100`)

> **Prerequisite**: external networks (`api_smart-restaurant-network`, `redis_redis-network`, `minio_default`) must exist before running `docker compose up`. These are created by the infrastructure stacks. If they don't exist yet: `docker network create api_smart-restaurant-network` (or start the relevant stack first).

The `web` container starts the Next.js server on port 3000 (mapped to host `3101`).

| URL | What |
|---|---|
| `http://localhost:3100` | API health check (`{"status":"ok"}`) |
| `http://localhost:3100/api/patients` | List assessed patients |
| `http://localhost:3101/assessment` | Risk assessment form |
| `http://localhost:3101/dashboard` | Monitoring dashboard |

### 4. Stop

```bash
docker compose down          # stop and remove containers (keeps the DB volume)
docker compose down -v       # also wipe the DB volume (full reset)
```

---

## Running migrations

### Automatic (default)

Migrations run automatically every time the `api` container starts.
The `docker/entrypoint.sh` script calls `bunx drizzle-kit migrate` before
starting the API server. Running it multiple times is safe — Drizzle tracks
applied migrations and skips already-applied ones.

### Manual (standalone)

```bash
# From your local machine (bun must be installed)
DATABASE_URL="postgresql://..." bun db:migrate

# Drizzle Studio (visual DB browser)
bun db:studio
```

### Generating a new migration

After editing `packages/db/schema.ts`:

```bash
bun db:generate          # creates a new .sql file in packages/db/migrations/
bun db:migrate           # applies it
```

Commit both the `.sql` file and the updated `meta/_journal.json`.

---

## Local development (without Docker)

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.2
- PostgreSQL instance (only needed for the real DB-backed flow; the API ships
  with an in-memory mock store so the web app runs without a database)

### Setup

```bash
# Install all workspace dependencies
bun install

# Copy env files
cp .env.example .env                 # root — used by docker-compose and drizzle scripts
cp app/web/.env.example app/web/.env.local
```

### Run each service

```bash
# Terminal 1 — API (port 3000)
bun api:dev

# Terminal 2 — Web (port 3001)
bun web:dev
```

The API hot-reloads on file save via `bun --hot`. The web app uses Next.js fast refresh.

---

## Building individual images

### API

```bash
# Build
docker build -t pediasafe-api:latest .

# Run standalone
docker run --rm -p 3100:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/pediasafe" \
  pediasafe-api:latest
```

### Web

```bash
# Build (NEXT_PUBLIC_* must be provided at build time)
docker build -f Dockerfile.web \
  --build-arg NEXT_PUBLIC_API_URL="https://your-api.example.com" \
  -t pediasafe-web:latest .

# Run standalone
docker run --rm -p 3101:3000 pediasafe-web:latest
```

---

## Deploying to Vercel (recommended for web)

The Next.js web app deploys naturally to Vercel:

1. Import the repo in [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `app/web`
3. Add environment variables in the Vercel dashboard:
   - `NEXT_PUBLIC_API_URL` (your production API URL)
4. Deploy — Vercel detects Next.js and builds automatically

The Hono API can also deploy to Vercel as a serverless function. See the
[Hono Vercel adapter docs](https://hono.dev/docs/getting-started/vercel).

---

## Pushing images to a registry

```bash
# GHCR example
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <username> --password-stdin

SHA=$(git rev-parse --short HEAD)

docker build -t ghcr.io/<org>/pediasafe-api:$SHA .
docker push ghcr.io/<org>/pediasafe-api:$SHA

docker build -f Dockerfile.web \
  --build-arg NEXT_PUBLIC_API_URL="..." \
  -t ghcr.io/<org>/pediasafe-web:$SHA .
docker push ghcr.io/<org>/pediasafe-web:$SHA
```

---

## Environment variable reference

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ (DB-backed flow) | API | Postgres connection string |
| `PORT` | — | API, Web | Internal container port, defaults to `3000` |
| `CORS_ORIGIN` | — | API | Comma-separated allowlist, defaults to `*` |
| `NEXT_PUBLIC_API_URL` | ✅ | Web (build) | Public API URL — baked into the JS bundle |
| `API_HOST_PORT` | — | docker-compose | Host port for API, defaults to `3100` |
| `WEB_HOST_PORT` | — | docker-compose | Host port for Web, defaults to `3101` |

---

## Common issues

| Symptom | Fix |
|---|---|
| `entrypoint.sh: not found` or `^M: bad interpreter` | CRLF line endings. Add `* text=auto eol=lf` to `.gitattributes` or run `git config core.autocrlf input`. |
| `FATAL: DATABASE_URL is not set` | Pass `-e DATABASE_URL=...` or use `--env-file`. |
| `network api_smart-restaurant-network not found` | Infrastructure stack not started, or the network was not created. Start that stack first or run `docker network create api_smart-restaurant-network`. |
| `bind: address already in use` | Another process is using the host port. Override via `API_HOST_PORT` or `WEB_HOST_PORT` in `.env`. |
| Web shows wrong API URL after changing `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_*` are baked at build time. Run `docker compose build web` then `docker compose up -d web`. |
| `Cannot find module '@pedia/db'` | Workspace symlink not set up. Run `bun install` from the repo root. |
