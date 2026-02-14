# Daily Word Delivery Pipeline

Triggered by cron (`0 17 * * *` = 5 PM UTC / 6 PM CET), manually via `GET /cron/trigger`, or on demand via the `/nextwords` Telegram command. Core delivery logic is in `deliverWordsToUser()` in `src/handlers/cron.ts`.

## Flow

```
handleCron(env)
  |
  +-- getAllActiveUsers(db)
  |
  +-- for each user:
        |
        +-- getQueueCount(db, user.id)
        |     if < 3 words: replenishQueue()
        |
        +-- pullWordsFromQueue(db, user.id, 3)
        |
        +-- Format Telegram message with word cards
        |
        +-- sendMessage() to user's Telegram chat
        |
        +-- moveWordToLearned() for each word
        +-- removeFromQueue()
        +-- updateLastDelivery()
```

## Queue Replenishment (`replenishQueue`)

Called when user's queue has fewer than 3 words.

```
replenishQueue(env, user)
  |
  +-- getValidAccessToken(env, user)
  |     Checks token expiry, refreshes if needed
  |
  +-- fetchRecentlyPlayed(accessToken)
  |     Gets up to 50 recent Spotify tracks, deduplicates
  |
  +-- Filter out already-processed tracks (isTrackProcessed per user)
  |
  +-- For each new track:
  |     |
  |     +-- Check song_cache (global)
  |     |     Hit: add cached words to user's queue
  |     |     Miss: fetch lyrics from LRCLIB
  |     |
  |     +-- Collect uncached songs with lyrics
  |
  +-- extractWordsFromBatch(env, songs)
  |     Single LLM call for all uncached songs
  |     Model: openai/gpt-oss-120b via OpenRouter (Cerebras provider)
  |     Uses JSON schema for structured output
  |
  +-- Save results to song_cache (global)
  +-- addWordToQueue(db, user.id, word, ...) for each word
  +-- markTrackProcessed(db, user.id, ...) for each track
```

## Word Selection

The LLM extracts 3-5 C1/CAE-level vocabulary words per song. See `src/services/openrouter.ts` for the full system prompt. Key criteria:
- C1 Cambridge Advanced level (not basic, not slang)
- Special attention to onomatopoeia, body language words, sensory words
- Each word includes: definition, IPA phonetic, example lyric, example sentence, collocations, synonyms

## Error Handling

- Per-user try/catch in cron loop — one user's failure doesn't block others
- If Spotify token is expired and can't refresh, user gets a message to re-authenticate
- LLM errors are caught per replenishment — user just gets fewer words
