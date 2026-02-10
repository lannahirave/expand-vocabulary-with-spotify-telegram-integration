# Database

Cloudflare D1 (SQLite). Schema defined in `src/db/schema.sql`. All queries in `src/db/queries.ts`.

## Tables

### `user`
One row per Telegram user. Stores Spotify OAuth tokens and delivery preferences.
- `id` (AUTOINCREMENT) — internal user ID, used as foreign key everywhere
- `telegram_id` (UNIQUE) — Telegram user ID string, used for lookups
- `spotify_access_token`, `spotify_refresh_token`, `spotify_token_expires_at` — OAuth tokens
- `is_active` — whether daily delivery is enabled (toggled by /pause, /resume)
- `last_delivery_at` — timestamp of last word delivery

### `song_cache` (global, no user_id)
Caches LLM word extraction results per Spotify track. Shared across all users — if two users listen to the same song, the LLM is called only once.
- `spotify_track_id` (UNIQUE) — cache key
- `llm_response` — full JSON response from the LLM

### `learned_words` (per-user)
Words that have been delivered to a user. Tracks review confidence.
- `user_id` + `word` (UNIQUE together)
- `confidence` (0-100) — incremented by +20 on "Knew it", decremented by -10 on "Forgot"
- `review_count`, `last_reviewed_at` — review stats

### `processed_tracks` (per-user)
Tracks which Spotify tracks have already been processed for a user, preventing re-processing.
- `user_id` + `spotify_track_id` (UNIQUE together)

### `word_queue` (per-user)
Words waiting to be delivered. Pulled in FIFO order (by `queued_at`).
- `user_id` + `word` (UNIQUE together)
- Same word fields as `learned_words` (definition, phonetic, collocations, etc.)

## Key Query Patterns

- User lookup: always by `telegram_id` via `getUserByTelegramId()`
- Cron fetches all active users: `getAllActiveUsers()` (WHERE `is_active = 1 AND spotify_access_token IS NOT NULL`)
- Word dedup: `addWordToQueue()` checks `learned_words` first (skip if already learned), then INSERT OR IGNORE handles queue duplicates
- Review prioritization: `getRandomLearnedWord()` orders by `confidence ASC, RANDOM()` — low-confidence words surface first

## Schema Changes

To apply schema changes: drop tables and re-create with `wrangler d1 execute spotify-english-bot --remote --file=src/db/schema.sql`. No migration system — this is acceptable for a personal project.
