# External APIs

## Spotify (`src/services/spotify.ts`)

- **Auth**: OAuth 2.0 Authorization Code flow. Scope: `user-read-recently-played`
- **Token refresh**: `getValidAccessToken(env, user)` checks expiry (with 60s buffer), refreshes automatically
- **Recently played**: `GET /v1/me/player/recently-played?limit=50` — returns up to 50 tracks, deduplicated by track ID
- **OAuth state param**: carries `telegramId` to link callback to the correct user

## LRCLIB (`src/services/lrclib.ts`)

Free lyrics API. No auth required.
- **Endpoint**: `GET https://lrclib.net/api/search?q={trackName} {artistName}`
- **Client header**: `Lrclib-Client: SpotifyEnglishBot/1.0`
- Picks first non-instrumental result with `plainLyrics`
- Returns null if no lyrics found (track is skipped)

## OpenRouter (`src/services/openrouter.ts`)

LLM API for vocabulary extraction.
- **Endpoint**: `POST https://openrouter.ai/api/v1/chat/completions`
- **Model**: `openai/gpt-oss-120b` via Cerebras provider (fp16 quantization)
- **Structured output**: JSON schema enforced via `response_format.json_schema`
- **Batching**: All uncached songs sent in a single LLM call per cron run per user
- System prompt targets C1/CAE level vocabulary with special attention to onomatopoeia, body language, and sensory words

## Telegram (`src/services/telegram.ts`)

- **Webhook**: `POST /webhook/telegram` receives updates
- **API calls**: `sendMessage`, `editMessageText`, `answerCallbackQuery`
- **Parse mode**: Markdown
- **Setup**: `scripts/setup-webhook.ts` registers webhook URL and bot commands
