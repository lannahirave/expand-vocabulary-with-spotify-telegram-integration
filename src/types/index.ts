export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ALLOWED_USERNAME: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  OPENROUTER_API_KEY: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: "private" | "group" | "supergroup" | "channel";
    };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    message: { message_id: number; chat: { id: number } };
    data: string;
  };
}

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
}

export interface RecentlyPlayedResponse {
  items: Array<{
    track: {
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      album: {
        name: string;
        images: Array<{ url: string }>;
      };
    };
    played_at: string;
  }>;
  next: string | null;
  cursors: {
    after: string;
    before: string;
  };
}

export interface LRCLIBResult {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface ExtractedWord {
  word: string;
  part_of_speech: string;
  definition: string;
  phonetic: string;
  example_lyric: string;
  example_sentence: string;
  collocations: string[];
  synonyms: string[];
}

export interface SongWordResult {
  track_id: string;
  words: ExtractedWord[];
}

export interface LLMResponse {
  songs: SongWordResult[];
}

export interface SongWithLyrics {
  trackId: string;
  trackName: string;
  artistName: string;
  lyrics: string;
}

export interface LearnedWord {
  id: number;
  user_id: number;
  word: string;
  definition: string;
  part_of_speech: string;
  example_lyric: string;
  example_sentence: string;
  song_title: string;
  artist_name: string;
  collocations: string;
  synonyms: string;
  phonetic: string;
  learned_at: number;
  review_count: number;
  last_reviewed_at: number | null;
  confidence: number;
}

export interface QueuedWord {
  id: number;
  user_id: number;
  word: string;
  definition: string;
  part_of_speech: string;
  example_lyric: string;
  example_sentence: string;
  song_title: string;
  artist_name: string;
  collocations: string;
  synonyms: string;
  phonetic: string;
  queued_at: number;
}

export interface UserRow {
  id: number;
  telegram_id: string;
  spotify_access_token: string | null;
  spotify_refresh_token: string | null;
  spotify_token_expires_at: number | null;
  is_active: number;
  last_delivery_at: number | null;
  created_at: number;
  updated_at: number;
}
