import { Env, UserRow, SongWithLyrics, ExtractedWord } from "../types";
import {
  getAllActiveUsers,
  getQueueCount,
  pullWordsFromQueue,
  removeFromQueue,
  moveWordToLearned,
  updateLastDelivery,
  isTrackProcessed,
  markTrackProcessed,
  getCachedSong,
  saveSongCache,
  addWordToQueue,
  getLearnedWordsCount,
} from "../db/queries";
import { getValidAccessToken, fetchRecentlyPlayed } from "../services/spotify";
import { fetchLyrics } from "../services/lrclib";
import { extractWordsFromBatch } from "../services/openrouter";
import { sendMessage } from "../services/telegram";

export async function handleCron(env: Env): Promise<void> {
  console.log("[Cron] === Job started ===");

  const users = await getAllActiveUsers(env.DB);
  console.log("[Cron] Found", users.length, "active user(s)");

  if (users.length === 0) {
    console.log("[Cron] No active users, skipping");
    return;
  }

  for (const user of users) {
    try {
      await deliverWordsToUser(env, user);
    } catch (error) {
      console.error(
        `[Cron] Error processing user ${user.id} (telegram_id=${user.telegram_id}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log("[Cron] === Job completed ===");
}

export async function deliverWordsToUser(env: Env, user: UserRow): Promise<void> {
  console.log("[Cron] Processing user", user.id, "telegram_id =", user.telegram_id);

  const chatId = parseInt(user.telegram_id, 10);

  try {
    // Ensure queue has enough words
    let queueCount = await getQueueCount(env.DB, user.id);
    console.log("[Cron] User", user.id, "- queue has", queueCount, "words");

    if (queueCount < 3) {
      console.log("[Cron] User", user.id, "- queue too small, replenishing...");
      await replenishQueue(env, user);
      queueCount = await getQueueCount(env.DB, user.id);
      console.log("[Cron] User", user.id, "- queue after replenish:", queueCount, "words");
    }

    if (queueCount === 0) {
      console.log("[Cron] User", user.id, "- no words available after replenish");
      return;
    }

    // Pull words and deliver
    const words = await pullWordsFromQueue(env.DB, user.id, 3);
    console.log("[Cron] User", user.id, "- pulled", words.length, "words:", words.map((w) => w.word).join(", "));
    if (words.length === 0) return;

    // Format message
    const learnedCount = await getLearnedWordsCount(env.DB, user.id);
    const remainingQueue = queueCount - words.length;

    let message = "Words from your music:\n\n";

    for (const word of words) {
      const collocations = JSON.parse(word.collocations || "[]") as string[];
      const synonyms = JSON.parse(word.synonyms || "[]") as string[];
      const collocationsText = collocations.map((c) => `  ${c}`).join("\n");

      message += `*${word.word}* ${word.phonetic} (${word.part_of_speech})\n`;
      message += `${word.definition}\n\n`;
      message += `_"${word.example_lyric}"_\n`;
      message += `  -- "${word.song_title}" by ${word.artist_name}\n\n`;
      if (word.example_sentence) {
        message += `Example: _${word.example_sentence}_\n\n`;
      }
      if (synonyms.length > 0) {
        message += `Synonyms: ${synonyms.join(", ")}\n`;
      }
      message += `Collocations:\n${collocationsText}\n\n`;
      message += `---\n\n`;
    }

    message += `Learned: ${learnedCount + words.length} | Queue: ${remainingQueue}`;

    console.log("[Cron] User", user.id, "- sending delivery message, length:", message.length);
    await sendMessage(env, chatId, message);

    // Move words to learned and clean up queue
    for (const word of words) {
      await moveWordToLearned(env.DB, user.id, word);
    }
    await removeFromQueue(
      env.DB,
      words.map((w) => w.id)
    );
    await updateLastDelivery(env.DB, user.id);

    console.log("[Cron] User", user.id, "- delivered", words.length, "words successfully");
  } catch (error) {
    console.error("[Cron] User", user.id, "- error:", error instanceof Error ? error.message : error);
    await sendMessage(env, chatId, "Something went wrong with the delivery. Please try again later.");
  }
}

async function replenishQueue(env: Env, user: UserRow): Promise<void> {
  console.log("[Cron:Replenish] Starting for user", user.id);

  const chatId = parseInt(user.telegram_id, 10);

  const accessToken = await getValidAccessToken(env, user);
  if (!accessToken) {
    console.log("[Cron:Replenish] No valid Spotify token for user", user.id);
    await sendMessage(
      env,
      chatId,
      "Your Spotify connection has expired. Please use /start to reconnect."
    );
    return;
  }

  // Fetch recently played tracks
  const recentTracks = await fetchRecentlyPlayed(accessToken);
  console.log("[Cron:Replenish] User", user.id, "- fetched", recentTracks.length, "recent tracks");

  // Filter out already processed tracks
  const newTracks = [];
  for (const track of recentTracks) {
    const processed = await isTrackProcessed(env.DB, user.id, track.id);
    if (!processed) {
      newTracks.push(track);
    }
  }
  console.log("[Cron:Replenish] User", user.id, "-", newTracks.length, "new tracks");

  if (newTracks.length === 0) {
    console.log("[Cron:Replenish] User", user.id, "- no new tracks to process");
    return;
  }

  // Check cache and collect songs needing LLM processing
  const songsToProcess: SongWithLyrics[] = [];

  for (const track of newTracks) {
    const cached = await getCachedSong(env.DB, track.id);
    if (cached) {
      console.log("[Cron:Replenish] Cache hit for:", track.name, "by", track.artist);
      const songResult = JSON.parse(cached);
      const words: ExtractedWord[] = songResult.words || [];
      for (const word of words) {
        await addWordToQueue(env.DB, user.id, word, track.name, track.artist);
      }
    } else {
      // Fetch lyrics
      const lyrics = await fetchLyrics(track.name, track.artist);
      if (lyrics) {
        console.log("[Cron:Replenish] Got lyrics for:", track.name, "- length:", lyrics.length, "chars");
        songsToProcess.push({
          trackId: track.id,
          trackName: track.name,
          artistName: track.artist,
          lyrics,
        });
      } else {
        console.log("[Cron:Replenish] No lyrics found for:", track.name, "by", track.artist, "- skipping");
      }
    }
  }

  // Batch LLM call for all uncached songs
  if (songsToProcess.length > 0) {
    console.log("[Cron:Replenish] Sending", songsToProcess.length, "songs to LLM");
    try {
      const llmResponse = await extractWordsFromBatch(env, songsToProcess);

      console.log("[Cron:Replenish] LLM returned", llmResponse.songs.length, "song results");

      for (const songResult of llmResponse.songs) {
        const song = songsToProcess.find((s) => s.trackId === songResult.track_id);
        if (!song) continue;

        // Save to global cache (no user_id)
        await saveSongCache(
          env.DB,
          songResult.track_id,
          song.trackName,
          song.artistName,
          JSON.stringify(songResult),
          songResult.words.length
        );

        // Add words to this user's queue
        for (const word of songResult.words) {
          await addWordToQueue(env.DB, user.id, word, song.trackName, song.artistName);
        }
      }
    } catch (error) {
      console.error("[Cron:Replenish] LLM error for user", user.id, ":", error instanceof Error ? error.message : error);
    }
  }

  // Mark all new tracks as processed for this user
  for (const track of newTracks) {
    await markTrackProcessed(env.DB, user.id, track.id, track.name, track.artist, 0);
  }
  console.log("[Cron:Replenish] User", user.id, "- marked", newTracks.length, "tracks as processed");
}
