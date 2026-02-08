import { Env } from "../types";
import { getSpotifyAuthUrl, exchangeCodeForTokens } from "../services/spotify";
import { getUser, updateSpotifyTokens } from "../db/queries";
import { sendMessage } from "../services/telegram";

export function handleSpotifyAuth(env: Env): Response {
  const redirectUri = "https://spotify-english-bot.workers.dev/auth/spotify/callback";
  const authUrl = getSpotifyAuthUrl(env, redirectUri);
  return Response.redirect(authUrl, 302);
}

export async function handleSpotifyCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`Authorization denied: ${error}`, { status: 400 });
  }

  if (!code) {
    return new Response("Missing authorization code", { status: 400 });
  }

  try {
    const redirectUri = `${url.origin}/auth/spotify/callback`;
    const tokens = await exchangeCodeForTokens(env, code, redirectUri);

    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
    await updateSpotifyTokens(env.DB, tokens.access_token, tokens.refresh_token, expiresAt);

    // Notify user via Telegram
    const user = await getUser(env.DB);
    if (user?.telegram_id) {
      await sendMessage(
        env,
        parseInt(user.telegram_id, 10),
        "Spotify connected successfully! You'll start receiving daily vocabulary from your music at 6 PM CET."
      );
    }

    return new Response(
      "<html><body><h1>Spotify Connected!</h1><p>You can close this window and return to Telegram.</p></body></html>",
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return new Response("Failed to connect Spotify. Please try again.", { status: 500 });
  }
}
