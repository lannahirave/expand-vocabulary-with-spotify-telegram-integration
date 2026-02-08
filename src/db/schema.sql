CREATE TABLE IF NOT EXISTS user (
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

CREATE TABLE IF NOT EXISTS song_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spotify_track_id TEXT UNIQUE NOT NULL,
  track_name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  llm_response TEXT NOT NULL,
  words_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS learned_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT UNIQUE NOT NULL,
  definition TEXT,
  part_of_speech TEXT,
  example_lyric TEXT,
  song_title TEXT,
  artist_name TEXT,
  collocations TEXT,
  phonetic TEXT,
  learned_at INTEGER DEFAULT (unixepoch()),
  review_count INTEGER DEFAULT 0,
  last_reviewed_at INTEGER,
  confidence INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS processed_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spotify_track_id TEXT UNIQUE NOT NULL,
  track_name TEXT,
  artist_name TEXT,
  words_sent INTEGER DEFAULT 0,
  processed_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS word_queue (
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
