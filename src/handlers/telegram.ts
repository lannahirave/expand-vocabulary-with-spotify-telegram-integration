import { Env, TelegramUpdate, UserRow } from "../types";
import { sendMessage, editMessage, answerCallbackQuery } from "../services/telegram";
import { getSpotifyAuthUrl } from "../services/spotify";
import { deliverWordsToUser, formatWordMessage } from "./cron";
import {
  getUserByTelegramId,
  createUser,
  setUserActive,
  getQueueCount,
  getLearnedWordsCount,
  getRandomLearnedWord,
  getLearnedWordById,
  updateWordConfidence,
} from "../db/queries";

function isAllowedUser(username: string | undefined, env: Env): boolean {
  if (!username) return false;
  const allowed = env.TELEGRAM_ALLOWED_USERNAME.split(";");
  return allowed.includes(username);
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  workerOrigin: string
): Promise<Response> {
  try {
    const update: TelegramUpdate = await request.json();

    // Handle callback queries (button clicks)
    if (update.callback_query) {
      if (!isAllowedUser(update.callback_query.from.username, env)) {
        return new Response("OK", { status: 200 });
      }
      const telegramId = update.callback_query.from.id.toString();
      const user = await getUserByTelegramId(env.DB, telegramId);
      if (!user) return new Response("OK", { status: 200 });
      await handleCallbackQuery(env, update, user);
      return new Response("OK", { status: 200 });
    }

    // Handle text messages
    if (!update.message?.text) {
      return new Response("OK", { status: 200 });
    }

    if (!isAllowedUser(update.message.from.username, env)) {
      return new Response("OK", { status: 200 });
    }

    const chatId = update.message.chat.id;
    const telegramId = update.message.from.id.toString();
    const text = update.message.text.trim();

    switch (text) {
      case "/start":
        await handleStart(env, chatId, telegramId, workerOrigin);
        break;
      default: {
        const user = await getUserByTelegramId(env.DB, telegramId);
        if (!user) {
          await sendMessage(env, chatId, "Please use /start first to set up your account.");
          break;
        }
        switch (text) {
          case "/status":
            await handleStatus(env, chatId, user);
            break;
          case "/stats":
            await handleStats(env, chatId, user);
            break;
          case "/review":
            await handleReview(env, chatId, user);
            break;
          case "/pause":
            await handlePause(env, chatId, user);
            break;
          case "/resume":
            await handleResume(env, chatId, user);
            break;
          case "/nextwords":
            await handleNextWords(env, chatId, user);
            break;
          default:
            await sendMessage(
              env,
              chatId,
              "Unknown command. Use /start, /status, /stats, /review, /nextwords, /pause, or /resume."
            );
        }
      }
    }
  } catch (error) {
    console.error("Telegram webhook error:", error);
  }

  return new Response("OK", { status: 200 });
}

async function handleStart(
  env: Env,
  chatId: number,
  telegramId: string,
  workerOrigin: string
): Promise<void> {
  const user = await createUser(env.DB, telegramId);

  if (user.spotify_access_token) {
    await sendMessage(
      env,
      chatId,
      "Welcome back! Spotify is connected. You'll receive daily vocabulary at 6 PM CET."
    );
  } else {
    const authUrl = getSpotifyAuthUrl(env, `${workerOrigin}/auth/spotify/callback`, telegramId);
    await sendMessage(
      env,
      chatId,
      `Welcome! Let's connect your Spotify account to start learning vocabulary from your music.\n\n[Connect Spotify](${authUrl})`
    );
  }
}

async function handleStatus(env: Env, chatId: number, user: UserRow): Promise<void> {
  const queueCount = await getQueueCount(env.DB, user.id);
  const learnedCount = await getLearnedWordsCount(env.DB, user.id);

  const spotifyStatus = user.spotify_access_token ? "Connected" : "Not connected";
  const activeStatus = user.is_active ? "Active" : "Paused";
  const lastDelivery = user.last_delivery_at
    ? new Date(user.last_delivery_at * 1000).toISOString().split("T")[0]
    : "Never";

  await sendMessage(
    env,
    chatId,
    `*Status*\n\nSpotify: ${spotifyStatus}\nDelivery: ${activeStatus}\nQueue: ${queueCount} words\nLearned: ${learnedCount} words\nLast delivery: ${lastDelivery}`
  );
}

async function handleStats(env: Env, chatId: number, user: UserRow): Promise<void> {
  const learnedCount = await getLearnedWordsCount(env.DB, user.id);
  const queueCount = await getQueueCount(env.DB, user.id);

  await sendMessage(
    env,
    chatId,
    `*Learning Statistics*\n\nTotal words learned: ${learnedCount}\nWords in queue: ${queueCount}`
  );
}

async function handleReview(env: Env, chatId: number, user: UserRow): Promise<void> {
  const word = await getRandomLearnedWord(env.DB, user.id);

  if (!word) {
    await sendMessage(env, chatId, "No words to review yet! Wait for your first daily delivery.");
    return;
  }

  const text = `*Review time!*\n\n*${word.word}* ${word.phonetic}\n\nWhat does this word mean?`;

  await sendMessage(env, chatId, text, {
    inline_keyboard: [[{ text: "Reveal Answer", callback_data: `reveal_${word.id}` }]],
  });
}

async function handlePause(env: Env, chatId: number, user: UserRow): Promise<void> {
  await setUserActive(env.DB, user.id, false);
  await sendMessage(env, chatId, "Daily delivery paused. Use /resume to restart.");
}

async function handleResume(env: Env, chatId: number, user: UserRow): Promise<void> {
  await setUserActive(env.DB, user.id, true);
  await sendMessage(env, chatId, "Daily delivery resumed! You'll receive words at 6 PM CET.");
}

async function handleNextWords(env: Env, chatId: number, user: UserRow): Promise<void> {
  if (!user.spotify_access_token) {
    await sendMessage(
      env,
      chatId,
      "Spotify is not connected. Please use /start to connect your Spotify account first."
    );
    return;
  }
  await deliverWordsToUser(env, user);
}

async function handleCallbackQuery(env: Env, update: TelegramUpdate, _user: UserRow): Promise<void> {
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

    const text = formatWordMessage(word) + "\n\nDid you remember?";

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
    await editMessage(
      env,
      chatId,
      messageId,
      "Great! Confidence updated. Use /review for another word."
    );
  } else if (data.startsWith("forgot_")) {
    const wordId = parseInt(data.replace("forgot_", ""), 10);
    await updateWordConfidence(env.DB, wordId, false);
    await editMessage(
      env,
      chatId,
      messageId,
      "No worries! Keep reviewing. Use /review for another word."
    );
  }
}
