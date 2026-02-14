import { Env, UserRow, QueuedWord, LearnedWord, ExtractedWord } from "../types";

export async function getUserByTelegramId(db: D1Database, telegramId: string): Promise<UserRow | null> {
  const result = await db
    .prepare("SELECT * FROM user WHERE telegram_id = ?")
    .bind(telegramId)
    .first<UserRow>();
  return result || null;
}

export async function getAllActiveUsers(db: D1Database): Promise<UserRow[]> {
  const result = await db
    .prepare("SELECT * FROM user WHERE is_active = 1 AND spotify_access_token IS NOT NULL")
    .all<UserRow>();
  return result.results || [];
}

export async function createUser(db: D1Database, telegramId: string): Promise<UserRow> {
  await db
    .prepare("INSERT OR IGNORE INTO user (telegram_id) VALUES (?)")
    .bind(telegramId)
    .run();
  const user = await getUserByTelegramId(db, telegramId);
  return user!;
}

export async function updateSpotifyTokens(
  db: D1Database,
  userId: number,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  await db
    .prepare(
      "UPDATE user SET spotify_access_token = ?, spotify_refresh_token = ?, spotify_token_expires_at = ?, updated_at = unixepoch() WHERE id = ?"
    )
    .bind(accessToken, refreshToken, expiresAt, userId)
    .run();
}

export async function setUserActive(db: D1Database, userId: number, active: boolean): Promise<void> {
  await db
    .prepare("UPDATE user SET is_active = ?, updated_at = unixepoch() WHERE id = ?")
    .bind(active ? 1 : 0, userId)
    .run();
}

export async function updateLastDelivery(db: D1Database, userId: number): Promise<void> {
  await db
    .prepare("UPDATE user SET last_delivery_at = unixepoch(), updated_at = unixepoch() WHERE id = ?")
    .bind(userId)
    .run();
}

export async function isTrackProcessed(db: D1Database, userId: number, trackId: string): Promise<boolean> {
  const result = await db
    .prepare("SELECT 1 FROM processed_tracks WHERE user_id = ? AND spotify_track_id = ?")
    .bind(userId, trackId)
    .first();
  return !!result;
}

export async function markTrackProcessed(
  db: D1Database,
  userId: number,
  trackId: string,
  trackName: string,
  artistName: string,
  wordsSent: number
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO processed_tracks (user_id, spotify_track_id, track_name, artist_name, words_sent) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(userId, trackId, trackName, artistName, wordsSent)
    .run();
}

export async function getCachedSong(db: D1Database, trackId: string): Promise<string | null> {
  const result = await db
    .prepare("SELECT llm_response FROM song_cache WHERE spotify_track_id = ?")
    .bind(trackId)
    .first<{ llm_response: string }>();
  return result?.llm_response || null;
}

export async function saveSongCache(
  db: D1Database,
  trackId: string,
  trackName: string,
  artistName: string,
  llmResponse: string,
  wordsCount: number
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO song_cache (spotify_track_id, track_name, artist_name, llm_response, words_count) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(trackId, trackName, artistName, llmResponse, wordsCount)
    .run();
}

export async function addWordToQueue(
  db: D1Database,
  userId: number,
  word: ExtractedWord,
  songTitle: string,
  artistName: string
): Promise<void> {
  // Skip if already learned by this user
  const alreadyLearned = await db
    .prepare("SELECT 1 FROM learned_words WHERE user_id = ? AND word = ?")
    .bind(userId, word.word)
    .first();
  if (alreadyLearned) return;

  await db
    .prepare(
      "INSERT OR IGNORE INTO word_queue (user_id, word, definition, part_of_speech, example_lyric, irregular_plural, example_sentence, song_title, artist_name, collocations, synonyms, phonetic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      userId,
      word.word,
      word.definition,
      word.part_of_speech,
      word.example_lyric,
      word.irregular_plural || null,
      word.example_sentence || null,
      songTitle,
      artistName,
      JSON.stringify(word.collocations),
      JSON.stringify(word.synonyms || []),
      word.phonetic
    )
    .run();
}

export async function getQueueCount(db: D1Database, userId: number): Promise<number> {
  const result = await db
    .prepare("SELECT COUNT(*) as count FROM word_queue WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();
  return result?.count || 0;
}

export async function pullWordsFromQueue(db: D1Database, userId: number, count: number): Promise<QueuedWord[]> {
  const results = await db
    .prepare("SELECT * FROM word_queue WHERE user_id = ? ORDER BY queued_at ASC LIMIT ?")
    .bind(userId, count)
    .all<QueuedWord>();
  return results.results || [];
}

export async function removeFromQueue(db: D1Database, ids: number[]): Promise<void> {
  for (const id of ids) {
    await db.prepare("DELETE FROM word_queue WHERE id = ?").bind(id).run();
  }
}

export async function moveWordToLearned(db: D1Database, userId: number, word: QueuedWord): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO learned_words (user_id, word, definition, part_of_speech, example_lyric, irregular_plural, example_sentence, song_title, artist_name, collocations, synonyms, phonetic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      userId,
      word.word,
      word.definition,
      word.part_of_speech,
      word.example_lyric,
      word.irregular_plural || null,
      word.example_sentence,
      word.song_title,
      word.artist_name,
      word.collocations,
      word.synonyms,
      word.phonetic
    )
    .run();
}

export async function getLearnedWordsCount(db: D1Database, userId: number): Promise<number> {
  const result = await db
    .prepare("SELECT COUNT(*) as count FROM learned_words WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();
  return result?.count || 0;
}

export async function getRandomLearnedWord(db: D1Database, userId: number): Promise<LearnedWord | null> {
  // Prioritize low-confidence words
  const result = await db
    .prepare("SELECT * FROM learned_words WHERE user_id = ? ORDER BY confidence ASC, RANDOM() LIMIT 1")
    .bind(userId)
    .first<LearnedWord>();
  return result || null;
}

export async function updateWordConfidence(
  db: D1Database,
  wordId: number,
  knew: boolean
): Promise<void> {
  if (knew) {
    await db
      .prepare(
        "UPDATE learned_words SET confidence = MIN(confidence + 20, 100), review_count = review_count + 1, last_reviewed_at = unixepoch() WHERE id = ?"
      )
      .bind(wordId)
      .run();
  } else {
    await db
      .prepare(
        "UPDATE learned_words SET confidence = MAX(confidence - 10, 0), review_count = review_count + 1, last_reviewed_at = unixepoch() WHERE id = ?"
      )
      .bind(wordId)
      .run();
  }
}

export async function getLearnedWordById(db: D1Database, id: number): Promise<LearnedWord | null> {
  const result = await db
    .prepare("SELECT * FROM learned_words WHERE id = ?")
    .bind(id)
    .first<LearnedWord>();
  return result || null;
}
