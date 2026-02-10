# Deployment & Scripts

## Deploy

```bash
npx wrangler deploy
```

Deploys to Cloudflare Workers. Config in `wrangler.toml`.

## Secrets

Set via Wrangler (stored in Cloudflare, not in code):
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_ALLOWED_USERNAME
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler secret put OPENROUTER_API_KEY
```

## Database

Apply schema:
```bash
npx wrangler d1 execute spotify-english-bot --remote --file=src/db/schema.sql
```

Query data:
```bash
npx wrangler d1 execute spotify-english-bot --remote --command="SELECT * FROM user"
```

## Scripts

All scripts read from `.dev.vars` via `scripts/load-env.ts`.

| Script | Command | Purpose |
|--------|---------|---------|
| setup-webhook.ts | `npx tsx scripts/setup-webhook.ts` | Register Telegram webhook URL + bot commands |
| trigger-cron.ts | `npx tsx scripts/trigger-cron.ts` | Manually trigger the daily cron via HTTP |

## Local Development

```bash
npx wrangler dev
```

Uses `.dev.vars` for local secrets and local D1 database.

## Cron Schedule

Defined in `wrangler.toml`: `0 17 * * *` (5 PM UTC = 6 PM CET daily).
Can also be triggered manually via `GET /cron/trigger`.
