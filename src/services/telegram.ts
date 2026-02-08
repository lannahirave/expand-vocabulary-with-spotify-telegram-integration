import { Env } from "../types";

export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  replyMarkup?: object
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function editMessage(
  env: Env,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: object
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function answerCallbackQuery(env: Env, callbackQueryId: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}
