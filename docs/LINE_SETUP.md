# LINE OA Setup & Webhook Reference

This document covers everything you need to wire the LINE Messaging API into
the `lava-app` backend (`@lava/api`). It assumes you have already created a
LINE Official Account and a Messaging API channel in the [LINE Developers
Console](https://developers.line.biz/console/).

---

## 1. Required environment variables

All variables live in `app/api/.env` (loaded automatically by Bun in dev).
Copy `.env.example` at the repo root to get the canonical list.

| Variable | Where to get it | Purpose |
|---|---|---|
| `DATABASE_URL` | Neon / Supabase connection string | Postgres for Drizzle ORM |
| `LINE_CHANNEL_SECRET` | LINE Developers Console → your channel → **Basic settings** → *Channel secret* | Used to HMAC-verify every incoming webhook payload |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console → your channel → **Messaging API** → *Channel access token (long-lived)* — click **Issue** | Bearer token for outgoing `reply` and `push` API calls |
| `DASHBOARD_URL` | The public URL of the Next.js dashboard (e.g. `https://lava.example.com`) | Embedded in approval-notification messages so managers can click through |
| `PORT` | Optional, defaults to `3000` | Local dev port |

**Never commit the real `.env` file.** It is already in `.gitignore`. Only
`.env.example` (with placeholder values) is committed.

---

## 2. Configuring the channel in the LINE console

In the **Messaging API** tab of your channel:

1. **Webhook URL** — set this to the public URL of your API plus `/webhook`,
   e.g. `https://<your-tunnel>.ngrok-free.app/webhook` for local dev, or
   `https://api.your-domain.com/webhook` in production.
2. **Use webhook** — turn this **ON**.
3. **Auto-reply messages** — turn **OFF** (otherwise LINE's default replies
   interfere with our bot's replies).
4. **Greeting messages** — your call; the bot itself does not depend on it.

After saving, click **Verify** next to the webhook URL. LINE will POST an
empty event array with a valid signature; the API should respond `200 OK`.

---

## 3. Webhook endpoint structure

Implementation lives in two files:

- `app/api/src/routes/webhook.ts` — the Hono route + event dispatcher.
- `app/api/src/lib/line.ts` — signature verification, reply/push helpers, and
  the `LineEvent` / `LineMessage` types.

### Route

```
POST /webhook
```

Mounted in `app/api/src/index.ts` via `app.route('/webhook', webhook)`. The
full path the LINE console must point at is therefore
`https://<host>/webhook`.

### Request lifecycle

1. **Read raw body.** `await c.req.text()` — the raw bytes are needed for
   HMAC verification; parsing first would re-stringify and break the digest.
2. **Verify signature.** `validateLineSignature(rawBody, signature)` computes
   `base64(HMAC-SHA256(channelSecret, rawBody))` and compares against the
   `x-line-signature` header. Mismatches return `401`.
3. **Parse JSON** into `LineWebhookBody`.
4. **Fan out events.** Each event in `body.events` is handled in parallel via
   `Promise.allSettled` — one bad event cannot fail the others or the
   response to LINE.
5. **Always respond `200 OK`** quickly. LINE retries on non-200 responses,
   so any long work must be fire-and-forget (which is why
   `pushMessage`/`notifyManager` swallow their errors and return `void`).

### Event types handled today

| Event | Action |
|---|---|
| `message` of `type: 'text'` | Logged as structured JSON (`tag: "line.message.text"`); no auto-reply yet. This is the hook point where future natural-language commands (e.g. typing `"แจ้งลา"`) will be parsed. |
| `postback` with `data` containing `action=submit_leave&...` | Creates a `PENDING` leave request, finds free same-department teachers, replies to the requester, and pushes a notification to the requester's manager. |
| Anything else | Logged but otherwise ignored. |

### Postback contract

`submit_leave` postbacks must encode their payload as URL-form parameters:

```
action=submit_leave&type=SICK&startDate=2026-05-20&endDate=2026-05-21&reason=Flu
```

Fields:

- `type` — `SICK` | `PERSONAL` | `ANNUAL`
- `startDate`, `endDate` — ISO `YYYY-MM-DD`
- `reason` — free text (URL-encoded)

---

## 4. Testing the webhook locally with ngrok

LINE only sends webhooks to public HTTPS URLs, so during local development
you need a tunnel from a public address to your `localhost:3000`.

### Option A: ngrok (most common)

1. Install: `brew install ngrok` (macOS) or download from
   [ngrok.com/download](https://ngrok.com/download).
2. Authenticate once: `ngrok config add-authtoken <your-token>` (token from
   the ngrok dashboard).
3. Start your API: from the repo root, `bun --filter @lava/api dev`. It will
   listen on `http://localhost:3000`.
4. In a second terminal, start the tunnel: `ngrok http 3000`. ngrok prints
   a `Forwarding` URL like `https://abcd-1-2-3-4.ngrok-free.app`.
5. Copy that URL, append `/webhook`, and paste it into **LINE Developers
   Console → Messaging API → Webhook URL**. Click **Verify** — you should
   see `Success` and your API logs should show
   `{"tag":"line.event","type":"...","userId":null,...}`.
6. Send any message to your LINE OA from the LINE app. You should see
   `{"tag":"line.message.text","userId":"U…","text":"…"}` in the API logs.

> ngrok URLs change every time you restart the free tier. Each restart
> requires re-pasting the URL into the LINE console.

### Option B: cloudflared (free, stable URL with an account)

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

Same flow — copy the printed `https://<random>.trycloudflare.com` URL into
the LINE console with `/webhook` appended.

### Smoke-testing without LINE

You can simulate a valid LINE request locally to confirm signature
verification works:

```bash
CHANNEL_SECRET="<your LINE_CHANNEL_SECRET>"
BODY='{"destination":"U123","events":[]}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$CHANNEL_SECRET" -binary | base64)

curl -i http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "x-line-signature: $SIG" \
  --data "$BODY"
```

Expected response: `200 OK` with body `{"status":"ok"}`. Sending the same
request with any other `x-line-signature` value returns `401`.

To simulate a text-message event:

```bash
BODY='{"destination":"U1","events":[{"type":"message","timestamp":1700000000000,"source":{"type":"user","userId":"Uabc"},"message":{"id":"m1","type":"text","text":"hello"}}]}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$CHANNEL_SECRET" -binary | base64)
curl -i http://localhost:3000/webhook -H "x-line-signature: $SIG" --data "$BODY"
```

The API will log a `line.message.text` line containing the text.

---

## 5. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `401 Invalid signature` from your own curl call | The body was modified after signing (extra newline, content-type translation). Use `--data` not `--data-raw`, and ensure no trailing newline. |
| LINE console **Verify** fails with `An error occurred` | Webhook URL is wrong, API is not running, or `LINE_CHANNEL_SECRET` mismatch between console and `.env`. |
| Messages reach your bot but no logs appear | The request is being delivered to a stale ngrok URL from a previous session. Restart ngrok and update the console. |
| Webhook fires but `userId` is `null` in logs | The user has not added the bot as a friend yet, or the event came from a group source — `userId` is only present for 1-on-1 chats with friends. |
| Replies/pushes silently fail | `LINE_CHANNEL_ACCESS_TOKEN` is wrong or expired. Re-issue from the console and update `.env`. |

---

## 6. Related files

- `app/api/src/index.ts` — Hono app entrypoint, mounts `/webhook` and `/leave`.
- `app/api/src/routes/webhook.ts` — webhook handler + event dispatcher.
- `app/api/src/lib/line.ts` — `validateLineSignature`, `replyMessage`,
  `pushMessage`, and event types.
- `.env.example` — full list of required environment variables.
