import { Env, SpotifyTokens, SpotifyTrack, RecentlyPlayedResponse } from "../types";
import { updateSpotifyTokens, getUser } from "../db/queries";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export function getSpotifyAuthUrl(env: Env, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "user-read-recently-played",
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  env: Env,
  code: string,
  redirectUri: string
): Promise<SpotifyTokens> {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token exchange failed: ${response.status}`);
  }

  return response.json();
}

export async function refreshAccessToken(env: Env, refreshToken: string): Promise<SpotifyTokens> {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed: ${response.status}`);
  }

  return response.json();
}

export async function getValidAccessToken(env: Env): Promise<string | null> {
  const user = await getUser(env.DB);
  if (!user?.spotify_access_token || !user?.spotify_refresh_token) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (user.spotify_token_expires_at && user.spotify_token_expires_at > now + 60) {
    return user.spotify_access_token;
  }

  // Token expired or about to expire, refresh it
  const tokens = await refreshAccessToken(env, user.spotify_refresh_token);
  const expiresAt = now + tokens.expires_in;
  await updateSpotifyTokens(
    env.DB,
    tokens.access_token,
    tokens.refresh_token || user.spotify_refresh_token,
    expiresAt
  );

  return tokens.access_token;
}

export async function fetchRecentlyPlayed(accessToken: string): Promise<SpotifyTrack[]> {
  const response = await fetch(`${SPOTIFY_API_BASE}/me/player/recently-played?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status}`);
  }

  const data: RecentlyPlayedResponse = await response.json();

  // Deduplicate by track ID
  const seen = new Set<string>();
  const tracks: SpotifyTrack[] = [];
  for (const item of data.items) {
    if (!seen.has(item.track.id)) {
      seen.add(item.track.id);
      tracks.push({
        id: item.track.id,
        name: item.track.name,
        artist: item.track.artists[0]?.name || "Unknown",
      });
    }
  }

  return tracks;
}
