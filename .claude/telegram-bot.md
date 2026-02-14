# Telegram Bot

Webhook-based bot. Webhook URL set via `scripts/setup-webhook.ts`. All handler logic in `src/handlers/telegram.ts`, Telegram API calls in `src/services/telegram.ts`.

## Commands

| Command   | Handler         | Description                          |
|-----------|-----------------|--------------------------------------|
| /start    | handleStart     | Creates user, sends Spotify auth URL |
| /status   | handleStatus    | Shows Spotify connection, queue size, learned count |
| /stats    | handleStats     | Shows learning statistics            |
| /review   | handleReview    | Flashcard quiz on a learned word     |
| /nextwords| handleNextWords | Delivers next 3 words on demand      |
| /pause    | handlePause     | Stops daily word delivery            |
| /resume   | handleResume    | Restarts daily word delivery         |

## Auth Flow

1. User sends `/start`
2. Bot creates user row (INSERT OR IGNORE by telegram_id)
3. If no Spotify token: bot sends auth URL with `state=telegramId`
4. User clicks link → Spotify OAuth → callback reads `state` → links tokens to correct user
5. Bot confirms connection via Telegram message

## Review Flow

1. User sends `/review`
2. Bot picks a random low-confidence word (`ORDER BY confidence ASC, RANDOM()`)
3. Shows word + phonetic with "Reveal Answer" button
4. User clicks reveal → bot edits message to show full card (definition, lyric, collocations, synonyms)
5. User clicks "Knew it" (+20 confidence) or "Forgot" (-10 confidence)

## Access Control

`TELEGRAM_ALLOWED_USERNAME` env var contains semicolon-separated Telegram usernames. Checked on every message and callback query via `isAllowedUser()`. Users not on the list are silently ignored.

## User Resolution

All commands (except /start) resolve the user from `telegram_id` before dispatching. If user doesn't exist, bot responds with "Please use /start first."

## Telegram API

`src/services/telegram.ts` exposes three functions:
- `sendMessage(env, chatId, text, replyMarkup?)` — send with Markdown parsing
- `editMessage(env, chatId, messageId, text, replyMarkup?)` — edit in-place (used for review flow)
- `answerCallbackQuery(env, callbackQueryId)` — acknowledge button press
