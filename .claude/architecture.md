# Architecture

Cloudflare Worker + D1 (SQLite) application. Single `src/index.ts` entry point routes HTTP requests and scheduled events.

## Runtime

- **Platform**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Language**: TypeScript
- **Config**: `wrangler.toml`

## Entry Point (`src/index.ts`)

Routes:
- `POST /webhook/telegram` — Telegram bot webhook
- `GET /auth/spotify` — Spotify OAuth redirect (requires `?telegram_id=`)
- `GET /auth/spotify/callback` — Spotify OAuth callback (reads `state` param)
- `GET /cron/trigger` — Manual cron trigger for testing
- `scheduled` — Cron handler (daily at 5 PM UTC / 6 PM CET)

## Directory Structure

```
src/
  index.ts              — HTTP router + cron entry
  types/index.ts        — All TypeScript interfaces
  db/
    schema.sql          — D1 table definitions
    queries.ts          — All database queries (no raw SQL elsewhere)
  handlers/
    telegram.ts         — Telegram command dispatcher + handlers
    cron.ts             — Daily word delivery pipeline
    oauth.ts            — Spotify OAuth flow
  services/
    spotify.ts          — Spotify API (auth, token refresh, recently played)
    telegram.ts         — Telegram API (send/edit messages, callback queries)
    lrclib.ts           — LRCLIB lyrics API
    openrouter.ts       — OpenRouter LLM API (word extraction)
scripts/
    setup-webhook.ts    — One-time Telegram webhook setup
    trigger-cron.ts     — Manual cron trigger via HTTP
    load-env.ts         — .dev.vars loader for scripts
```

## Multi-Tenant

The app supports multiple users. Each user is identified by `telegram_id`. User-scoped tables (`learned_words`, `word_queue`, `processed_tracks`) have a `user_id` column. The `song_cache` table is global — LLM results are shared across users to save API costs.

## Environment Variables

Set via `wrangler secret put` or in `.dev.vars`:
- `TELEGRAM_BOT_TOKEN` — Telegram bot API token
- `TELEGRAM_ALLOWED_USERNAME` — Semicolon-separated whitelist of Telegram usernames
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — Spotify app credentials
- `OPENROUTER_API_KEY` — OpenRouter API key for LLM calls
