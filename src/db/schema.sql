CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  user_id INTEGER NOT NULL,
  word TEXT NOT NULL,
  definition TEXT,
  part_of_speech TEXT,
  example_lyric TEXT,
  example_sentence TEXT,
  song_title TEXT,
  artist_name TEXT,
  collocations TEXT,
  synonyms TEXT,
  phonetic TEXT,
  learned_at INTEGER DEFAULT (unixepoch()),
  review_count INTEGER DEFAULT 0,
  last_reviewed_at INTEGER,
  confidence INTEGER DEFAULT 0,
  UNIQUE(user_id, word),
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS processed_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  spotify_track_id TEXT NOT NULL,
  track_name TEXT,
  artist_name TEXT,
  words_sent INTEGER DEFAULT 0,
  processed_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, spotify_track_id),
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS word_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  word TEXT NOT NULL,
  definition TEXT,
  part_of_speech TEXT,
  example_lyric TEXT,
  example_sentence TEXT,
  song_title TEXT,
  artist_name TEXT,
  collocations TEXT,
  synonyms TEXT,
  phonetic TEXT,
  queued_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, word),
  FOREIGN KEY (user_id) REFERENCES user(id)
);
