import { Env } from "./types";
import { handleTelegramWebhook } from "./handlers/telegram";
import { handleCron } from "./handlers/cron";
import { handleSpotifyAuth, handleSpotifyCallback } from "./handlers/oauth";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook/telegram") {
      return handleTelegramWebhook(request, env, url.origin);
    }

    if (request.method === "GET" && url.pathname === "/auth/spotify") {
      return handleSpotifyAuth(request, env);
    }

    if (request.method === "GET" && url.pathname === "/auth/spotify/callback") {
      return handleSpotifyCallback(request, env);
    }

    if (request.method === "GET" && url.pathname === "/cron/trigger") {
      await handleCron(env);
      return new Response("Cron triggered");
    }

    return new Response("Spotify English Bot is running!");
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env));
  },
};
