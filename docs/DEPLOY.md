# Deployment & Local Development Guide

This document covers:
- Running the full stack locally with Docker Compose
- Running migrations manually
- Building and deploying individual services

---

## Services overview

| Service | Image | Default host port | Description |
|---|---|---|---|
| `api` | `Dockerfile` (repo root) | `3100` | Hono API — LINE webhook, leave management |
| `web` | `Dockerfile.web` (repo root) | `3101` | Next.js LIFF app — teacher registration |

### External networks

`api` เชื่อมต่อกับ 3 external network ของ infrastructure stack ที่รันแยกอยู่:

| Network name ใน compose | Docker network จริง | ใช้เข้าถึง |
|---|---|---|
| `db_net` | `api_smart-restaurant-network` | PostgreSQL |
| `redis_net` | `redis_redis-network` | Redis |
| `minio_net` | `minio_default` | MinIO object storage |

`web` อยู่บน `default` network เท่านั้น (browser เรียก API ผ่าน host port โดยตรง)

---

## Quick start (Docker Compose)

### 1. Copy and fill in the env file

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Connection string ชี้ไปที่ Postgres container ใน `db_net` |
| `LINE_CHANNEL_SECRET` | LINE Developers Console → channel → Basic settings |
| `LINE_CHANNEL_ACCESS_TOKEN` | Same page, under Messaging API |
| `NEXT_PUBLIC_LIFF_ID` | LINE Developers Console → channel → LIFF tab |

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

> **Prerequisite**: external networks (`api_smart-restaurant-network`, `redis_redis-network`, `minio_default`) must exist before running `docker compose up`. These are created by the infrastructure stacks (smart-restaurant, redis, minio). If they don't exist yet: `docker network create api_smart-restaurant-network` (or start the relevant stack first).

The `web` container starts the Next.js server on port 3000 (mapped to host `3101`).

| URL | What |
|---|---|
| `http://localhost:3100` | API health check (`{"status":"ok"}`) |
| `http://localhost:3100/webhook` | LINE webhook endpoint |
| `http://localhost:3101/register` | LIFF teacher registration page |

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
applied migrations in a `__drizzle_migrations` table and skips already-applied
ones.

### Manual (standalone)

Run migrations against any `DATABASE_URL` without starting the server:

```bash
# Against the local docker-compose Postgres
docker compose run --rm api sh -c "cd packages/db && bunx drizzle-kit migrate"

# Or from your local machine (bun must be installed)
DATABASE_URL="postgresql://..." bun db:migrate

# Drizzle Studio (visual DB browser — only works locally with bun installed)
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
- PostgreSQL instance (local or managed)

### Setup

```bash
# Install all workspace dependencies
bun install

# Copy env files
cp .env.example .env           # root — used by docker-compose and drizzle scripts
cp app/api/.env.example app/api/.env  # API local dev env (if it exists)
cp app/web/.env.example app/web/.env.local

# Edit .env and app/web/.env.local with real values
```

### Run each service

```bash
# Terminal 1 — API (port 3000)
bun api:dev

# Terminal 2 — Web (port 3001)
bun web:dev
```

The API hot-reloads on file save via `bun --hot`. The web app uses Next.js fast refresh.

### Expose the API to LINE (ngrok)

LINE webhooks require a public HTTPS URL. During local development use ngrok:

```bash
ngrok http 3000
```

Copy the `https://<id>.ngrok.io` URL and set it in LINE Developers Console →
Messaging API → Webhook URL: `https://<id>.ngrok.io/webhook`.

See [LINE_SETUP.md](./LINE_SETUP.md) for the full setup walkthrough.

---

## Building individual images

### API

```bash
# Build
docker build -t lava-api:latest .

# Run standalone
docker run --rm -p 3100:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/lava_db" \
  -e LINE_CHANNEL_SECRET="..." \
  -e LINE_CHANNEL_ACCESS_TOKEN="..." \
  -e DASHBOARD_URL="https://your-web.example.com" \
  lava-api:latest
```

### Web

```bash
# Build (NEXT_PUBLIC_* must be provided at build time)
docker build -f Dockerfile.web \
  --build-arg NEXT_PUBLIC_LIFF_ID="1234567890-xxxxxxxx" \
  --build-arg NEXT_PUBLIC_API_URL="https://your-api.example.com" \
  -t lava-web:latest .

# Run standalone
docker run --rm -p 3101:3000 lava-web:latest
```

---

## Deploying to Vercel (recommended for web)

The Next.js web app deploys naturally to Vercel:

1. Import the repo in [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `app/web`
3. Add environment variables in the Vercel dashboard:
   - `NEXT_PUBLIC_LIFF_ID`
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

docker build -t ghcr.io/<org>/lava-api:$SHA .
docker push ghcr.io/<org>/lava-api:$SHA

docker build -f Dockerfile.web \
  --build-arg NEXT_PUBLIC_LIFF_ID="..." \
  --build-arg NEXT_PUBLIC_API_URL="..." \
  -t ghcr.io/<org>/lava-web:$SHA .
docker push ghcr.io/<org>/lava-web:$SHA
```

---

## Environment variable reference

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ | API | Postgres connection string |
| `LINE_CHANNEL_SECRET` | ✅ | API | Webhook signature verification |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | API | Sending messages via LINE API |
| `DASHBOARD_URL` | ✅ | API | Base URL of the web app (for approval links) |
| `NEXT_PUBLIC_LIFF_ID` | ✅ | Web (build) | LIFF ID — baked into JS bundle |
| `NEXT_PUBLIC_API_URL` | ✅ | Web (build) | Public API URL — baked into JS bundle |
| `PORT` | — | API, Web | Internal container port, defaults to `3000` |
| `API_HOST_PORT` | — | docker-compose | Host port for API, defaults to `3100` |
| `WEB_HOST_PORT` | — | docker-compose | Host port for Web, defaults to `3101` |
| `DB_HOST_PORT` | — | docker-compose | Host port for Postgres, defaults to `5432` |
| `POSTGRES_DB` | — | db service | Database name, defaults to `lava_db` |
| `POSTGRES_USER` | — | db service | DB user, defaults to `postgres` |
| `DATABASE_URL` hostname | — | — | ใช้ชื่อ container จาก `db_net` เป็น hostname เช่น `smart-restaurant-db:5432` |

---

## Common issues

| Symptom | Fix |
|---|---|
| `entrypoint.sh: not found` or `^M: bad interpreter` | CRLF line endings. Add `* text=auto eol=lf` to `.gitattributes` or run `git config core.autocrlf input`. |
| `FATAL: DATABASE_URL is not set` | Pass `-e DATABASE_URL=...` or use `--env-file`. |
| `network api_smart-restaurant-network not found` | Infrastructure stack ยังไม่ได้ start หรือ network ยังไม่ได้ถูกสร้าง start stack นั้นก่อน หรือ `docker network create api_smart-restaurant-network` |
| `bind: address already in use` | Another process is using the host port. Override via `API_HOST_PORT`, `WEB_HOST_PORT`, or `DB_HOST_PORT` in `.env`. |
| LIFF shows wrong API URL after changing `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_*` are baked at build time. Run `docker compose build web` then `docker compose up -d web`. |
| Migrations hang | Network issue between `api` container and Postgres. Check `DATABASE_URL` hostname is reachable from inside the container. For docker-compose use `db` as the hostname. |
| `Cannot find module '@lava/db'` | Workspace symlink not set up. Run `bun install` from the repo root. |
