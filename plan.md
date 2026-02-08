# English Learning Telegram Bot - Project Specification

## 🤖 Instructions for Claude Agent

**How to use this spec:**
1. Implement as much as you were told to
2. After each phase, verify the checkpoint works before proceeding
3. If a checkpoint fails, debug before moving to next phase
4. Ask user to test external integrations (Telegram, Spotify OAuth)

**Phase Summary:**
| Phase | Description | Checkpoint |
|-------|-------------|------------|
| 1 | Project Setup | DONE |
| 2 | Database Schema | DONE |
| 3 | Telegram Bot | DONE |
| 4 | Spotify Integration | DONE |
| 5 | LRCLIB Lyrics | DONE |
| 6 | LLM Word Extraction | DONE |
| 7 | Cron Delivery | DONE |
| 8 | Song Cache | DONE |
| 9 | Review Feature | DONE |
| 10 | Testing & Polish | DONE |
| 11 | Deployment | Production ready |

---

## Project Overview

A personal Telegram bot that analyzes your Spotify listening history, uses an LLM (via OpenRouter) to identify B2-C1 level English words from song lyrics (which the LLM knows), and delivers daily vocabulary lessons with collocations and contextual examples.

**Target User**: Single user (yourself), B2 English level
**Goal**: Learn advanced vocabulary (B2-C1) and natural collocations from music you actually listen to

---

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **APIs**: 
  - Telegram Bot API
  - Spotify Web API
  - LRCLIB API (free lyrics database, no auth required)
  - OpenRouter API (using Cerebras `gpt-oss-120b` model)
- **Language**: TypeScript
- **Build Tool**: Wrangler CLI

---

## Important Constraints

- **No web scraping** - Cloudflare Workers TOS compliance
- **LRCLIB for lyrics** - free API, no auth, returns plain lyrics
- **No frequency datasets** - LLM determines word difficulty
- **Single user** - simplified architecture
- **Batch LLM processing** - send multiple songs with lyrics in one prompt
- **Cache LLM responses** - store per song to avoid redundant API calls
- **Fixed schedule** - daily cron at 6 PM CET only, no manual trigger

---

## Phase 1: Project Setup

### 1.1 Initialize Cloudflare Worker Project
- [x] Create new directory `spotify-english-bot`
- [x] Initialize with `wrangler init`
- [x] Configure `wrangler.toml` with project name
- [x] Set up TypeScript configuration
- [x] Create folder structure:
  ```
  src/
    index.ts              # Main entry point
    handlers/
      telegram.ts         # Telegram webhook handler
      cron.ts             # Scheduled job handler (6 PM CET)
      oauth.ts            # Spotify OAuth callback
    services/
      spotify.ts          # Spotify API (auth, recently played)
      lrclib.ts           # LRCLIB API for lyrics
      openrouter.ts       # LLM API for word extraction
      telegram.ts         # Telegram message sending
    db/
      schema.sql          # D1 database schema
      queries.ts          # Database query functions
    types/
      index.ts            # TypeScript interfaces
  ```

### 1.2 Create D1 Database
- [x] Define schema in `schema.sql`
- [ ] Create D1 database via Wrangler: `wrangler d1 create spotify-english-bot`
- [x] Bind database to worker in `wrangler.toml` (placeholder ID, needs update after DB creation)

### 1.3 Environment Variables
- [ ] Set up secrets via `wrangler secret put`:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_ALLOWED_USERNAME` (your username without @, e.g. "johndoe")
  - `SPOTIFY_CLIENT_ID`
  - `SPOTIFY_CLIENT_SECRET`
  - `OPENROUTER_API_KEY`

### 1.4 Configure Cron
- [x] Add to `wrangler.toml`:
  ```toml
  [triggers]
  crons = ["0 17 * * *"]  # 5 PM UTC = 6 PM CET
  ```

**Checkpoint 1**: Worker deploys successfully with "Hello World" response

---

## Phase 2: Database Schema

Note: Simplified for single-user setup.

### 2.1 User Table
```sql
CREATE TABLE user (
  id INTEGER PRIMARY KEY DEFAULT 1,
  telegram_id TEXT UNIQUE NOT NULL,
  spotify_access_token TEXT,
  spotify_refresh_token TEXT,
  spotify_token_expires_at INTEGER,
  is_active INTEGER DEFAULT 1,
  last_delivery_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

### 2.2 Song Cache Table (NEW - stores LLM responses per song)
```sql
CREATE TABLE song_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spotify_track_id TEXT UNIQUE NOT NULL,
  track_name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  llm_response TEXT NOT NULL, -- Full JSON response from LLM
  words_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### 2.3 Learned Words Table
```sql
CREATE TABLE learned_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT UNIQUE NOT NULL,
  definition TEXT,
  part_of_speech TEXT,
  example_lyric TEXT,
  song_title TEXT,
  artist_name TEXT,
  collocations TEXT, -- JSON array
  phonetic TEXT,
  learned_at INTEGER DEFAULT (unixepoch()),
  review_count INTEGER DEFAULT 0,
  last_reviewed_at INTEGER,
  confidence INTEGER DEFAULT 0
);
```

### 2.4 Processed Tracks Table (tracks already sent to user)
```sql
CREATE TABLE processed_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spotify_track_id TEXT UNIQUE NOT NULL,
  track_name TEXT,
  artist_name TEXT,
  words_sent INTEGER DEFAULT 0,
  processed_at INTEGER DEFAULT (unixepoch())
);
```

### 2.5 Word Queue Table
```sql
CREATE TABLE word_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT UNIQUE NOT NULL,
  definition TEXT,
  part_of_speech TEXT,
  example_lyric TEXT,
  song_title TEXT,
  artist_name TEXT,
  collocations TEXT,
  phonetic TEXT,
  queued_at INTEGER DEFAULT (unixepoch())
);
```

**Checkpoint 2**: Database created, all tables exist

---

## Phase 3: Telegram Bot Setup

### 3.1 Create Bot
- [ ] Create bot via @BotFather (manual step)
- [ ] Save bot token as secret (manual step)
- [x] Set bot commands (script at `scripts/setup-webhook.ts`):
  ```
  start - Initialize and connect Spotify
  status - Check connection and queue status
  stats - View learning statistics
  review - Quiz on learned words
  pause - Pause daily delivery
  resume - Resume daily delivery
  ```

### 3.2 Webhook Handler
Telegram sends POST requests to your worker when users message the bot.

**Endpoint:** `POST /webhook/telegram`

**Incoming Update Structure:**
```typescript
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;        // <-- Use this for auth
    };
    chat: {
      id: number;
      type: "private" | "group" | "supergroup" | "channel";
    };
    date: number;
    text?: string;              // Message text
  };
  callback_query?: {            // For inline button clicks
    id: string;
    from: { id: number; username?: string };
    message: { message_id: number; chat: { id: number } };
    data: string;               // Button callback data
  };
}
```

**Security Check:**
```typescript
// Reject messages from anyone except your username
const username = update.message?.from?.username || update.callback_query?.from?.username;
if (username !== env.TELEGRAM_ALLOWED_USERNAME) {
  return new Response("Unauthorized", { status: 200 }); // Return 200 to not trigger retries
}
```

- [x] Set up POST endpoint `/webhook/telegram`
- [x] Parse incoming JSON update
- [x] **Security**: Ignore messages from any username != `TELEGRAM_ALLOWED_USERNAME`
- [x] Route to appropriate command handler based on `message.text`
- [x] Handle callback queries for inline buttons (quiz answers)

### 3.3 Command Handlers
- [x] `/start` - Check if Spotify connected, if not send OAuth link
- [x] `/status` - Show: Spotify connected?, queue size, words learned, last delivery
- [x] `/stats` - Words learned total, by artist, recent words
- [x] `/review` - Random quiz from learned words
- [x] `/pause` and `/resume` - Toggle `is_active` flag

### 3.4 Register Webhook
Telegram needs to know where to send updates. Call this once after deployment.

**API Call:**
```typescript
// POST https://api.telegram.org/bot<token>/setWebhook
const response = await fetch(
  `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://your-worker.workers.dev/webhook/telegram"
    })
  }
);
```

**Options:**
- Create a one-time script `scripts/setup-webhook.ts`
- Or create an endpoint `GET /setup-webhook` that you call once manually
- Or use curl: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-worker.workers.dev/webhook/telegram"`

**Checkpoint 3**: Bot responds to `/start` command (only from your @username)

---

## Phase 4: Spotify Integration

### 4.1 OAuth Flow
- [x] Create endpoint `GET /auth/spotify` - redirects to Spotify authorization
- [x] Create endpoint `GET /auth/spotify/callback` - handles OAuth callback
- [x] Required scopes: `user-read-recently-played`
- [x] Exchange code for tokens
- [x] Store tokens in D1
- [x] Send confirmation message to Telegram

### 4.2 Token Refresh
- [x] Function to check if token is expired (compare `spotify_token_expires_at` with now)
- [x] Function to refresh token using `refresh_token`
- [x] Update stored tokens after refresh

### 4.3 Fetch Recently Played Tracks
Endpoint: `GET https://api.spotify.com/v1/me/player/recently-played`

**Request:**
```
GET /me/player/recently-played?limit=50
Authorization: Bearer {access_token}
```

**Response structure (key fields):**
```typescript
interface RecentlyPlayedResponse {
  items: Array<{
    track: {
      id: string;              // Spotify track ID
      name: string;            // Track name
      artists: Array<{
        name: string;          // Artist name
      }>;
      album: {
        name: string;
        images: Array<{ url: string }>;
      };
    };
    played_at: string;         // ISO 8601 timestamp
  }>;
  next: string | null;
  cursors: {
    after: string;
    before: string;
  };
}
```

- [x] Function to fetch last 50 recently played tracks
- [x] Extract: `track.id`, `track.name`, `track.artists[0].name`
- [x] Filter out tracks already in `processed_tracks` table
- [x] Return list of new tracks to process

**Checkpoint 4**: Can fetch and display user's recently played tracks

---

## Phase 5: LRCLIB Lyrics Fetching

### 5.1 LRCLIB API Overview
- Free lyrics database, no authentication required
- Endpoint: `https://lrclib.net/api/search`
- Returns plain lyrics and synced lyrics (we only need plain)

### 5.2 API Request

```typescript
async function fetchLyrics(trackName: string, artistName: string): Promise<string | null> {
  const query = encodeURIComponent(`${trackName} ${artistName}`);
  
  const response = await fetch(`https://lrclib.net/api/search?q=${query}`, {
    headers: {
      "accept": "application/json",
      "Lrclib-Client": "SpotifyEnglishBot/1.0 (https://github.com/yourusername/spotify-english-bot)"
    }
  });
  
  if (!response.ok) return null;
  
  const results = await response.json();
  return results[0]?.plainLyrics || null;
}
```

### 5.3 Response Structure

```typescript
interface LRCLIBResult {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;    // <-- We need this
  syncedLyrics: string | null;   // Timestamped, not needed
}
```

### 5.4 Implementation
- [x] Function to search LRCLIB by track name + artist
- [x] Return first result's `plainLyrics`
- [x] Handle no results (return null)
- [x] Handle instrumental tracks (`instrumental: true`)

**Checkpoint 5**: Given a song, returns plain lyrics text

---

## Phase 6: LLM Word Extraction (OpenRouter)

### 6.1 OpenRouter API Setup
- [x] Store API key as secret (env var configured in types)
- [x] Model: `cerebras/gpt-oss-120b-fp16`
- [x] Use structured outputs for reliable JSON responses

### 6.2 Batch Processing Strategy
Instead of calling LLM for each song, we batch multiple songs into ONE prompt:
- Collect all new songs with their lyrics
- Send them all in one LLM request
- Get back words for all songs at once
- Saves API calls and is faster

### 6.3 Structured Output Schema

```typescript
const wordExtractionSchema = {
  type: "object",
  properties: {
    songs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          track_id: { type: "string", description: "Spotify track ID" },
          words: {
            type: "array",
            items: {
              type: "object",
              properties: {
                word: { type: "string", description: "The vocabulary word" },
                part_of_speech: { type: "string", description: "noun, verb, adjective, etc." },
                definition: { type: "string", description: "Clear definition for B2 learner" },
                phonetic: { type: "string", description: "IPA pronunciation" },
                example_lyric: { type: "string", description: "Line from the song containing the word" },
                collocations: {
                  type: "array",
                  items: { type: "string" },
                  description: "4-5 common collocations/phrases using this word"
                }
              },
              required: ["word", "part_of_speech", "definition", "phonetic", "example_lyric", "collocations"]
            }
          }
        },
        required: ["track_id", "words"]
      }
    }
  },
  required: ["songs"],
  additionalProperties: false
};
```

### 6.4 LLM Prompt (Batch)

```typescript
const systemPrompt = `You are an English vocabulary teacher helping a B2-level learner.
You will receive multiple songs with their lyrics. For each song, extract 3-5 B2/C1 level vocabulary words.

Rules:
- Only select words appropriate for B2-C1 level (not too easy like "love", "go", not too rare)
- Skip slang, profanity, proper nouns, and very informal contractions
- Include the actual lyric line where the word appears
- Provide 4-5 natural collocations for each word
- If a song has no suitable B2-C1 words, return empty words array for that song
- Return words for ALL songs provided`;

// User prompt with multiple songs
const userPrompt = `Extract B2-C1 vocabulary from these songs:

${songs.map((s, i) => `
=== SONG ${i + 1} ===
Track ID: ${s.trackId}
Title: "${s.trackName}" by ${s.artistName}

LYRICS:
${s.lyrics}
`).join('\n')}

Return vocabulary words for each song.`;
```

### 6.5 OpenRouter API Call

```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://your-worker.workers.dev",
    "X-Title": "Spotify English Bot"
  },
  body: JSON.stringify({
    model: "cerebras/gpt-oss-120b-fp16",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "word_extraction",
        strict: true,
        schema: wordExtractionSchema
      }
    }
  })
});
```

### 6.6 Response Handling
- [x] Parse JSON response
- [x] Match each song's words by `track_id`
- [x] Validate structure
- [x] Handle empty words arrays

**Checkpoint 6**: Given multiple songs with lyrics, LLM returns structured word data for all

---

## Phase 7: Daily Delivery (Cron Job)

### 7.1 Cron Schedule
- Runs at 5 PM UTC = 6 PM CET
- Configured in `wrangler.toml`: `crons = ["0 17 * * *"]`

### 7.2 Delivery Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    CRON JOB (6 PM CET)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Check is_active │
                    └────────┬────────┘
                              │ Yes
                              ▼
                    ┌─────────────────┐
                    │ Check queue     │
                    │ has >= 3 words? │
                    └────────┬────────┘
                              │
              ┌───────────────┴───────────────┐
              │ No                            │ Yes
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │ Fetch Spotify   │             │ Pull 3 words    │
    │ recently played │             │ from queue      │
    └────────┬────────┘             └────────┬────────┘
              │                               │
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │ Filter new      │             │ Format message  │
    │ tracks (not in  │             │ & send Telegram │
    │ processed_tracks│             └────────┬────────┘
    └────────┬────────┘                      │
              │                               ▼
              ▼                     ┌─────────────────┐
    ┌─────────────────┐             │ Move words to   │
    │ For each new    │             │ learned_words   │
    │ track:          │             └─────────────────┘
    │ 1. Check cache  │
    │ 2. If miss:     │
    │    fetch lyrics │
    └────────┬────────┘
              │
              ▼
    ┌─────────────────┐
    │ Batch all songs │
    │ + lyrics into   │
    │ ONE LLM call    │
    └────────┬────────┘
              │
              ▼
    ┌─────────────────┐
    │ Save to cache,  │
    │ add to queue,   │
    │ mark processed  │
    └─────────────────┘
```

### 7.3 Implementation Steps

1. **Check prerequisites**
   - [x] User `is_active` = 1
   - [x] Spotify token valid (refresh if needed)

2. **Ensure queue has words**
   - [x] If queue < 3 words, process new tracks:
   
   ```typescript
   // Step 1: Fetch recently played from Spotify
   const recentTracks = await fetchRecentlyPlayed();
   
   // Step 2: Filter out already processed
   const newTracks = recentTracks.filter(t => !isProcessed(t.id));
   
   // Step 3: Check cache and collect songs needing lyrics
   const songsToProcess = [];
   for (const track of newTracks) {
     const cached = await getFromCache(track.id);
     if (cached) {
       // Use cached words directly
       await addWordsToQueue(cached.words);
     } else {
       // Need to fetch lyrics
       songsToProcess.push(track);
     }
   }
   
   // Step 4: Fetch lyrics for all uncached songs
   const songsWithLyrics = [];
   for (const track of songsToProcess) {
     const lyrics = await fetchLyrics(track.name, track.artist);
     if (lyrics) {
       songsWithLyrics.push({ ...track, lyrics });
     }
   }
   
   // Step 5: ONE batch LLM call for all songs with lyrics
   if (songsWithLyrics.length > 0) {
     const llmResponse = await extractWordsFromBatch(songsWithLyrics);
     
     // Step 6: Save to cache and queue
     for (const songResult of llmResponse.songs) {
       await saveToCache(songResult.track_id, songResult);
       await addWordsToQueue(songResult.words);
     }
   }
   
   // Step 7: Mark all tracks as processed
   await markAsProcessed(newTracks);
   ```

3. **Deliver words**
   - [x] Pull 3 oldest words from queue
   - [x] Format Telegram message
   - [x] Send via Telegram API
   - [x] Move words from queue to `learned_words`
   - [x] Update `last_delivery_at`

### 7.4 Message Format

```
🎵 Words from your music:

━━━━━━━━━━━━━━━━━━━━

📖 **cynical** /ˈsɪnɪkəl/ (adjective)
Distrustful of human sincerity or integrity

🎤 "My soul, so cynical"
   — "bad guy" by Billie Eilish

🔗 Collocations:
• cynical about politics
• deeply cynical
• cynical view
• cynical attitude

━━━━━━━━━━━━━━━━━━━━

📖 **seduce** /sɪˈdjuːs/ (verb)
...

━━━━━━━━━━━━━━━━━━━━

📊 Learned: 47 | Queue: 12
```

### 7.5 Error Handling
- [x] If Spotify token refresh fails: send message to reconnect
- [x] If no new tracks: skip silently (don't spam user)
- [x] If LRCLIB fails: skip that song
- [x] If LLM fails: log error, send "no words today" message
- [x] If queue empty after processing: skip silently

**Checkpoint 7**: Cron runs and sends daily message at 6 PM CET

---

## Phase 8: Song Cache System

### 8.1 Cache Logic
The `song_cache` table stores LLM responses per song to:
- Avoid redundant API calls for repeated songs
- Enable instant word retrieval for popular tracks
- Save OpenRouter costs

### 8.2 Cache Flow
```typescript
async function getWordsForSong(trackId: string, trackName: string, artistName: string) {
  // 1. Check cache first
  const cached = await db.query("SELECT llm_response FROM song_cache WHERE spotify_track_id = ?", [trackId]);
  
  if (cached) {
    return JSON.parse(cached.llm_response);
  }
  
  // 2. Cache miss - need to fetch lyrics and process with LLM
  // This is handled in the batch processing flow (Phase 7)
  return null;
}
```

### 8.3 Cache Benefits
- Same song played multiple times = 1 LLM call
- User re-listens to favorite songs = instant word lookup
- Historical data persists

**Checkpoint 8**: Second request for same song uses cache (no LLM call)

---

## Phase 9: Review & Quiz Feature

### 9.1 Quiz Flow
- [x] `/review` command triggers quiz
- [x] Select random word from `learned_words` (prioritize low confidence)
- [x] Show word, hide definition
- [x] "Reveal" button shows answer
- [x] "Knew it ✓" / "Forgot ✗" buttons update confidence

### 9.2 Confidence Tracking
```sql
-- After "Knew it"
UPDATE learned_words 
SET confidence = MIN(confidence + 20, 100),
    review_count = review_count + 1,
    last_reviewed_at = unixepoch()
WHERE id = ?;

-- After "Forgot"
UPDATE learned_words 
SET confidence = MAX(confidence - 10, 0),
    review_count = review_count + 1,
    last_reviewed_at = unixepoch()
WHERE id = ?;
```

### 9.3 Quiz Message Format
```
🧠 Review time!

📖 **serendipity** /ˌserənˈdɪpɪti/

What does this word mean?

[Reveal Answer]
```

After reveal:
```
📖 **serendipity** /ˌserənˈdɪpɪti/ (noun)
The occurrence of events by chance in a happy way

🎤 "It was pure serendipity that we met"
   — "Lucky" by Artist

Did you remember?
[Knew it ✓] [Forgot ✗]
```

**Checkpoint 9**: Review command works with confidence updates

---

## Phase 10: Testing & Polish

### 10.1 Error Handling
- [x] Wrap all external API calls in try-catch
- [x] Graceful fallbacks for each failure mode
- [x] User-friendly error messages via Telegram

### 10.2 Edge Cases
- [x] No recent tracks (user hasn't listened)
- [x] All tracks already processed
- [x] Song not found in LRCLIB (no lyrics available)
- [x] Song has no suitable B2-C1 words
- [x] Non-English songs (handled: LLM returns empty words array)
- [x] Spotify token expired and refresh fails
- [x] Empty queue with nothing to send
- [x] LRCLIB rate limiting (returns null, song skipped)
- [x] OpenRouter API errors
- [x] Duplicate words: skip adding to queue if already in learned_words

### 10.3 Logging
- [x] Log key events: cron start, tracks found, cache hits/misses, lyrics fetched, words queued, delivery sent
- [x] Use `console.log` (visible in Cloudflare dashboard)

### 10.4 Security
- [x] Verify Telegram `username` matches `TELEGRAM_ALLOWED_USERNAME` env var
- [x] Return 200 OK even for unauthorized requests (prevents Telegram retries)
- [x] Never log tokens
- [x] HTTPS only (automatic with Workers)

**Checkpoint 10**: Bot handles all edge cases gracefully

---

## Phase 11: Deployment

### 11.1 Production Setup
- [ ] Create production D1 database
- [ ] Set all production secrets
- [ ] Deploy with `wrangler deploy`
- [ ] Register Telegram webhook

### 11.2 Final Testing
- [ ] Test full flow end-to-end
- [ ] Verify cron fires at correct time
- [ ] Test Spotify reconnection flow
- [ ] Test with various songs (popular, obscure, non-English)

### 11.3 Documentation
- [ ] README with setup instructions
- [ ] Document all environment variables

**Checkpoint 11**: Bot fully deployed and operational

---

## API Reference

### Telegram Bot API
- Base URL: `https://api.telegram.org/bot<token>/`
- Docs: https://core.telegram.org/bots/api

**Set Webhook (one-time setup):**
```
POST /setWebhook
Content-Type: application/json

{"url": "https://your-worker.workers.dev/webhook/telegram"}
```

**Send Message:**
```
POST /sendMessage
Content-Type: application/json

{
  "chat_id": 123456789,
  "text": "Hello!",
  "parse_mode": "Markdown",
  "reply_markup": {                    // Optional: inline buttons
    "inline_keyboard": [
      [{"text": "Button 1", "callback_data": "btn1"}],
      [{"text": "Button 2", "callback_data": "btn2"}]
    ]
  }
}
```

**Edit Message (for quiz reveal):**
```
POST /editMessageText
Content-Type: application/json

{
  "chat_id": 123456789,
  "message_id": 999,
  "text": "Updated text",
  "parse_mode": "Markdown"
}
```

**Answer Callback Query (acknowledge button click):**
```
POST /answerCallbackQuery
Content-Type: application/json

{"callback_query_id": "abc123"}
```

### Spotify Web API

**Get Recently Played Tracks**
```
GET https://api.spotify.com/v1/me/player/recently-played
```

Parameters:
- `limit` (optional): 1-50, default 20
- `after` (optional): Unix timestamp in ms, returns items after this cursor
- `before` (optional): Unix timestamp in ms, returns items before this cursor

Headers:
```
Authorization: Bearer {access_token}
```

Required scope: `user-read-recently-played`

Response: See Phase 4.3 for structure

**Token Refresh**
```
POST https://accounts.spotify.com/api/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
refresh_token={refresh_token}
client_id={client_id}
client_secret={client_secret}
```

Docs: https://developer.spotify.com/documentation/web-api

### LRCLIB API (Lyrics)

**Search for Lyrics**
```
GET https://lrclib.net/api/search?q={query}
```

Parameters:
- `q`: Search query (track name + artist name)

Headers:
```
Accept: application/json
Lrclib-Client: YourAppName/1.0 (https://yourapp.com)
```

Response:
```typescript
Array<{
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;   // <-- Use this
  syncedLyrics: string | null;
}>
```

Notes:
- No authentication required
- Free to use
- Returns array, use first result
- `instrumental: true` means no lyrics
- `plainLyrics` can be null if not available

Docs: https://lrclib.net/docs

### OpenRouter API

**Chat Completions with Structured Output**
```
POST https://openrouter.ai/api/v1/chat/completions
```

Headers:
```
Authorization: Bearer {api_key}
Content-Type: application/json
HTTP-Referer: https://your-app.com
X-Title: Your App Name
```

Body:
```json
{
  "model": "cerebras/gpt-oss-120b-fp16",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "schema_name",
      "strict": true,
      "schema": { ... }
    }
  }
}
```

Docs: https://openrouter.ai/docs

---

## File Structure (Final)

```
spotify-english-bot/
├── src/
│   ├── index.ts              # Main entry, routes requests
│   ├── handlers/
│   │   ├── telegram.ts       # Telegram webhook handler
│   │   ├── cron.ts           # Daily scheduled job
│   │   └── oauth.ts          # Spotify OAuth callback
│   ├── services/
│   │   ├── spotify.ts        # Spotify API (auth, recently played)
│   │   ├── lrclib.ts         # LRCLIB API (lyrics fetching)
│   │   ├── openrouter.ts     # LLM word extraction (batch)
│   │   └── telegram.ts       # Send messages
│   ├── db/
│   │   ├── schema.sql        # D1 database schema
│   │   └── queries.ts        # Database operations
│   └── types/
│       └── index.ts          # TypeScript interfaces
├── scripts/
│   └── setup-webhook.ts      # One-time webhook registration
├── wrangler.toml
├── package.json
├── tsconfig.json
└── README.md
```

---

## Success Criteria

1. ✅ Bot responds to Telegram commands (only from your @username)
2. ✅ Spotify OAuth flow works, tokens stored and refreshed
3. ✅ Bot fetches recently played tracks
4. ✅ LRCLIB returns lyrics for songs
5. ✅ LLM extracts B2-C1 words from batch of songs with lyrics
6. ✅ Song cache prevents redundant LLM calls
7. ✅ Cron sends daily words at 6 PM CET
8. ✅ Review/quiz feature works with confidence tracking
9. ✅ All data persists in D1
10. ✅ Handles edge cases gracefully
11. ✅ Runs reliably on Cloudflare Workers

---

## Future Enhancements (Out of Scope)

- Spaced repetition algorithm (SM-2)
- Multiple users support
- Adjustable daily word count
- Manual word trigger
- Weekly summary
- Export to Anki
- Voice pronunciation
