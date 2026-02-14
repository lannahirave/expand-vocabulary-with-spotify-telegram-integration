# Expand Vocabulary with Spotify

A Telegram bot that analyzes your Spotify listening history, extracts C1-level English vocabulary from song lyrics using an LLM, and delivers daily vocabulary lessons with definitions, collocations, and contextual examples.

## How it works

1. You listen to music on Spotify as usual
2. Every day at 6 PM CET, the bot checks your recently played tracks
3. It fetches lyrics from LRCLIB, sends them to an LLM to extract advanced vocabulary
4. You get 3 words delivered via Telegram with definitions, example sentences, collocations, and synonyms
5. Use `/review` to quiz yourself with flashcards that track your confidence

## Example delivery

```
Words from your music:

*cynical* /ˈsɪnɪkəl/ (adjective)
Believing that people are only interested in themselves and are not sincere

"My soul, so cynical"
  -- "bad guy" by Billie Eilish

Example: She's become increasingly cynical about politicians' promises.

Synonyms: sceptical, distrustful, pessimistic
Collocations:
  cynical about politics
  deeply cynical
  cynical view
  cynical attitude

---

Learned: 47 | Queue: 12
```

## Tech stack

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Lyrics**: LRCLIB (free, no auth)
- **LLM**: OpenRouter (`openai/gpt-oss-120b` via Cerebras)
- **Language**: TypeScript

## Bot commands

| Command | Description |
|---------|-------------|
| `/start` | Connect your Spotify account |
| `/status` | Check connection and queue status |
| `/stats` | View learning statistics |
| `/review` | Flashcard quiz on learned words |
| `/nextwords` | Get next batch of words immediately |
| `/pause` | Pause daily delivery |
| `/resume` | Resume daily delivery |

## Setup

### Prerequisites

- Node.js
- A Cloudflare account
- A Telegram bot (create via [@BotFather](https://t.me/BotFather))
- A Spotify app (create at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard))
- An OpenRouter API key ([openrouter.ai/keys](https://openrouter.ai/keys))

### 1. Install dependencies

```bash
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

### 3. Create D1 database

```bash
npx wrangler d1 create spotify-english-bot
```

Copy the `database_id` from the output and paste it into `wrangler.toml`.

### 4. Apply database schema

```bash
npx wrangler d1 execute spotify-english-bot --remote --file=src/db/schema.sql
```

### 5. Set secrets

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_ALLOWED_USERNAME   # your username without @, semicolon-separated for multiple users
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler secret put OPENROUTER_API_KEY
```

### 6. Deploy

```bash
npx wrangler deploy
```

Note the worker URL from the output.

### 7. Update Spotify redirect URI

Go to your Spotify app settings and add this redirect URI:

```
https://<your-worker>.workers.dev/auth/spotify/callback
```

### 8. Register Telegram webhook

Create a `.dev.vars` file (see `.dev.vars.sample`) and run:

```bash
npx tsx scripts/setup-webhook.ts
```

Or set the env vars inline:

```bash
TELEGRAM_BOT_TOKEN=<token> WORKER_URL=<url> npx tsx scripts/setup-webhook.ts
```

### 9. Test

1. Open your bot in Telegram, send `/start`
2. Click the Spotify connect link and authorize
3. Send `/status` to verify the connection
4. Trigger cron manually from the Cloudflare dashboard, or wait for 6 PM CET

## Project structure

```
src/
  index.ts              # HTTP router + cron entry
  types/index.ts        # TypeScript interfaces
  db/
    schema.sql          # D1 table definitions
    queries.ts          # All database queries
  handlers/
    telegram.ts         # Telegram command dispatcher
    cron.ts             # Daily word delivery pipeline
    oauth.ts            # Spotify OAuth flow
  services/
    spotify.ts          # Spotify API (auth, tokens, recently played)
    telegram.ts         # Telegram API (send/edit messages)
    lrclib.ts           # LRCLIB lyrics API
    openrouter.ts       # OpenRouter LLM (word extraction)
scripts/
    setup-webhook.ts    # One-time Telegram webhook setup
    trigger-cron.ts     # Manual cron trigger
```

## Multi-tenant

The bot supports multiple users. Add usernames to `TELEGRAM_ALLOWED_USERNAME` (semicolon-separated). Each user gets their own Spotify connection, word queue, and learning progress. The song cache is shared globally to save LLM API costs.

## License

MIT
