import { Env, TelegramUpdate } from "../types";
import { sendMessage, editMessage, answerCallbackQuery } from "../services/telegram";
import { getSpotifyAuthUrl } from "../services/spotify";
import {
  getUser,
  createUser,
  setUserActive,
  getQueueCount,
  getLearnedWordsCount,
  getRandomLearnedWord,
  getLearnedWordById,
  updateWordConfidence,
} from "../db/queries";

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  try {
    const update: TelegramUpdate = await request.json();

    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const username = update.callback_query.from.username;
      if (username !== env.TELEGRAM_ALLOWED_USERNAME) {
        return new Response("OK", { status: 200 });
      }
      await handleCallbackQuery(env, update);
      return new Response("OK", { status: 200 });
    }

    // Handle text messages
    if (!update.message?.text) {
      return new Response("OK", { status: 200 });
    }

    const username = update.message.from.username;
    if (username !== env.TELEGRAM_ALLOWED_USERNAME) {
      return new Response("OK", { status: 200 });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();

    switch (text) {
      case "/start":
        await handleStart(env, chatId, update.message.from.id.toString());
        break;
      case "/status":
        await handleStatus(env, chatId);
        break;
      case "/stats":
        await handleStats(env, chatId);
        break;
      case "/review":
        await handleReview(env, chatId);
        break;
      case "/pause":
        await handlePause(env, chatId);
        break;
      case "/resume":
        await handleResume(env, chatId);
        break;
      default:
        await sendMessage(env, chatId, "Unknown command. Use /start, /status, /stats, /review, /pause, or /resume.");
    }
  } catch (error) {
    console.error("Telegram webhook error:", error);
  }

  return new Response("OK", { status: 200 });
}

async function handleStart(env: Env, chatId: number, telegramId: string): Promise<void> {
  await createUser(env.DB, telegramId);
  const user = await getUser(env.DB);

  if (user?.spotify_access_token) {
    await sendMessage(env, chatId, "Welcome back! Spotify is connected. You'll receive daily vocabulary at 6 PM CET.");
  } else {
    const url = new URL("/auth/spotify", "https://spotify-english-bot.workers.dev");
    const authUrl = getSpotifyAuthUrl(env, url.origin + "/auth/spotify/callback");
    await sendMessage(
      env,
      chatId,
      `Welcome! Let's connect your Spotify account to start learning vocabulary from your music.\n\n[Connect Spotify](${authUrl})`
    );
  }
}

async function handleStatus(env: Env, chatId: number): Promise<void> {
  const user = await getUser(env.DB);
  const queueCount = await getQueueCount(env.DB);
  const learnedCount = await getLearnedWordsCount(env.DB);

  const spotifyStatus = user?.spotify_access_token ? "Connected" : "Not connected";
  const activeStatus = user?.is_active ? "Active" : "Paused";
  const lastDelivery = user?.last_delivery_at
    ? new Date(user.last_delivery_at * 1000).toISOString().split("T")[0]
    : "Never";

  await sendMessage(
    env,
    chatId,
    `*Status*\n\nSpotify: ${spotifyStatus}\nDelivery: ${activeStatus}\nQueue: ${queueCount} words\nLearned: ${learnedCount} words\nLast delivery: ${lastDelivery}`
  );
}

async function handleStats(env: Env, chatId: number): Promise<void> {
  const learnedCount = await getLearnedWordsCount(env.DB);
  const queueCount = await getQueueCount(env.DB);

  await sendMessage(
    env,
    chatId,
    `*Learning Statistics*\n\nTotal words learned: ${learnedCount}\nWords in queue: ${queueCount}`
  );
}

async function handleReview(env: Env, chatId: number): Promise<void> {
  const word = await getRandomLearnedWord(env.DB);

  if (!word) {
    await sendMessage(env, chatId, "No words to review yet! Wait for your first daily delivery.");
    return;
  }

  const text = `*Review time!*\n\n*${word.word}* ${word.phonetic}\n\nWhat does this word mean?`;

  await sendMessage(env, chatId, text, {
    inline_keyboard: [[{ text: "Reveal Answer", callback_data: `reveal_${word.id}` }]],
  });
}

async function handlePause(env: Env, chatId: number): Promise<void> {
  await setUserActive(env.DB, false);
  await sendMessage(env, chatId, "Daily delivery paused. Use /resume to restart.");
}

async function handleResume(env: Env, chatId: number): Promise<void> {
  await setUserActive(env.DB, true);
  await sendMessage(env, chatId, "Daily delivery resumed! You'll receive words at 6 PM CET.");
}

async function handleCallbackQuery(env: Env, update: TelegramUpdate): Promise<void> {
  const query = update.callback_query!;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  await answerCallbackQuery(env, query.id);

  if (data.startsWith("reveal_")) {
    const wordId = parseInt(data.replace("reveal_", ""), 10);
    const word = await getLearnedWordById(env.DB, wordId);

    if (!word) {
      await editMessage(env, chatId, messageId, "Word not found.");
      return;
    }

    const collocations = JSON.parse(word.collocations || "[]") as string[];
    const collocationsText = collocations.map((c) => `  ${c}`).join("\n");

    const text = `*${word.word}* ${word.phonetic} (${word.part_of_speech})\n${word.definition}\n\n_"${word.example_lyric}"_\n  -- "${word.song_title}" by ${word.artist_name}\n\nCollocations:\n${collocationsText}\n\nDid you remember?`;

    await editMessage(env, chatId, messageId, text, {
      inline_keyboard: [
        [
          { text: "Knew it \u2713", callback_data: `knew_${word.id}` },
          { text: "Forgot \u2717", callback_data: `forgot_${word.id}` },
        ],
      ],
    });
  } else if (data.startsWith("knew_")) {
    const wordId = parseInt(data.replace("knew_", ""), 10);
    await updateWordConfidence(env.DB, wordId, true);
    await editMessage(env, chatId, messageId, "Great! Confidence updated. Use /review for another word.");
  } else if (data.startsWith("forgot_")) {
    const wordId = parseInt(data.replace("forgot_", ""), 10);
    await updateWordConfidence(env.DB, wordId, false);
    await editMessage(env, chatId, messageId, "No worries! Keep reviewing. Use /review for another word.");
  }
}
