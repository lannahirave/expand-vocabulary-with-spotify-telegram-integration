import { Env, SongWithLyrics, ExtractedWord } from "../types";
import {
  getUser,
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
  console.log("Cron job started");

  const user = await getUser(env.DB);
  if (!user) {
    console.log("No user found, skipping");
    return;
  }

  if (!user.is_active) {
    console.log("User is paused, skipping");
    return;
  }

  const chatId = parseInt(user.telegram_id, 10);

  try {
    // Ensure queue has enough words
    let queueCount = await getQueueCount(env.DB);
    console.log(`Queue has ${queueCount} words`);

    if (queueCount < 3) {
      await replenishQueue(env, chatId);
      queueCount = await getQueueCount(env.DB);
    }

    if (queueCount === 0) {
      console.log("No words available to send");
      return;
    }

    // Pull words and deliver
    const words = await pullWordsFromQueue(env.DB, 3);
    if (words.length === 0) return;

    // Format message
    const learnedCount = await getLearnedWordsCount(env.DB);
    const remainingQueue = queueCount - words.length;

    let message = "Words from your music:\n\n";

    for (const word of words) {
      const collocations = JSON.parse(word.collocations || "[]") as string[];
      const collocationsText = collocations.map((c) => `  ${c}`).join("\n");

      message += `*${word.word}* ${word.phonetic} (${word.part_of_speech})\n`;
      message += `${word.definition}\n\n`;
      message += `_"${word.example_lyric}"_\n`;
      message += `  -- "${word.song_title}" by ${word.artist_name}\n\n`;
      message += `Collocations:\n${collocationsText}\n\n`;
      message += `---\n\n`;
    }

    message += `Learned: ${learnedCount + words.length} | Queue: ${remainingQueue}`;

    await sendMessage(env, chatId, message);

    // Move words to learned and clean up queue
    for (const word of words) {
      await moveWordToLearned(env.DB, word);
    }
    await removeFromQueue(
      env.DB,
      words.map((w) => w.id)
    );
    await updateLastDelivery(env.DB);

    console.log(`Delivered ${words.length} words`);
  } catch (error) {
    console.error("Cron job error:", error);
    await sendMessage(env, chatId, "Something went wrong with today's delivery. I'll try again tomorrow.");
  }
}

async function replenishQueue(env: Env, chatId: number): Promise<void> {
  console.log("Replenishing queue...");

  const accessToken = await getValidAccessToken(env);
  if (!accessToken) {
    await sendMessage(
      env,
      chatId,
      "Your Spotify connection has expired. Please use /start to reconnect."
    );
    return;
  }

  // Fetch recently played tracks
  const recentTracks = await fetchRecentlyPlayed(accessToken);
  console.log(`Fetched ${recentTracks.length} recent tracks`);

  // Filter out already processed tracks
  const newTracks = [];
  for (const track of recentTracks) {
    const processed = await isTrackProcessed(env.DB, track.id);
    if (!processed) {
      newTracks.push(track);
    }
  }
  console.log(`${newTracks.length} new tracks to process`);

  if (newTracks.length === 0) return;

  // Check cache and collect songs needing LLM processing
  const songsToProcess: SongWithLyrics[] = [];

  for (const track of newTracks) {
    const cached = await getCachedSong(env.DB, track.id);
    if (cached) {
      console.log(`Cache hit for: ${track.name}`);
      const songResult = JSON.parse(cached);
      const words: ExtractedWord[] = songResult.words || [];
      for (const word of words) {
        await addWordToQueue(env.DB, word, track.name, track.artist);
      }
    } else {
      // Fetch lyrics
      const lyrics = await fetchLyrics(track.name, track.artist);
      if (lyrics) {
        songsToProcess.push({
          trackId: track.id,
          trackName: track.name,
          artistName: track.artist,
          lyrics,
        });
      } else {
        console.log(`No lyrics found for: ${track.name}`);
      }
    }
  }

  // Batch LLM call for all uncached songs
  if (songsToProcess.length > 0) {
    console.log(`Sending ${songsToProcess.length} songs to LLM`);
    try {
      const llmResponse = await extractWordsFromBatch(env, songsToProcess);

      for (const songResult of llmResponse.songs) {
        const song = songsToProcess.find((s) => s.trackId === songResult.track_id);
        if (!song) continue;

        // Save to cache
        await saveSongCache(
          env.DB,
          songResult.track_id,
          song.trackName,
          song.artistName,
          JSON.stringify(songResult),
          songResult.words.length
        );

        // Add words to queue
        for (const word of songResult.words) {
          await addWordToQueue(env.DB, word, song.trackName, song.artistName);
        }
      }
    } catch (error) {
      console.error("LLM processing error:", error);
    }
  }

  // Mark all new tracks as processed
  for (const track of newTracks) {
    await markTrackProcessed(env.DB, track.id, track.name, track.artist, 0);
  }
}
