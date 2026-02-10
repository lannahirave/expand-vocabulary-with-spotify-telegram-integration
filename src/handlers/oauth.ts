import { Env } from "../types";
import { getSpotifyAuthUrl, exchangeCodeForTokens } from "../services/spotify";
import { getUserByTelegramId, updateSpotifyTokens } from "../db/queries";
import { sendMessage } from "../services/telegram";

export function handleSpotifyAuth(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const telegramId = url.searchParams.get("telegram_id");

  if (!telegramId) {
    return new Response("Missing telegram_id parameter", { status: 400 });
  }

  const redirectUri = `${url.origin}/auth/spotify/callback`;
  const authUrl = getSpotifyAuthUrl(env, redirectUri, telegramId);
  return Response.redirect(authUrl, 302);
}

export async function handleSpotifyCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const telegramId = url.searchParams.get("state");

  if (error) {
    return new Response(`Authorization denied: ${error}`, { status: 400 });
  }

  if (!code) {
    return new Response("Missing authorization code", { status: 400 });
  }

  if (!telegramId) {
    return new Response("Missing state parameter", { status: 400 });
  }

  try {
    const redirectUri = `${url.origin}/auth/spotify/callback`;
    const tokens = await exchangeCodeForTokens(env, code, redirectUri);

    const user = await getUserByTelegramId(env.DB, telegramId);
    if (!user) {
      return new Response("User not found. Please use /start in Telegram first.", { status: 404 });
    }

    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
    await updateSpotifyTokens(env.DB, user.id, tokens.access_token, tokens.refresh_token, expiresAt);

    // Notify user via Telegram
    await sendMessage(
      env,
      parseInt(user.telegram_id, 10),
      "Spotify connected successfully! You'll start receiving daily vocabulary from your music at 6 PM CET."
    );

    return new Response(
      "<html><body><h1>Spotify Connected!</h1><p>You can close this window and return to Telegram.</p></body></html>",
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return new Response("Failed to connect Spotify. Please try again.", { status: 500 });
  }
}
