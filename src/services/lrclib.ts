import { LRCLIBResult } from "../types";

export async function fetchLyrics(trackName: string, artistName: string): Promise<string | null> {
  const query = encodeURIComponent(`${trackName} ${artistName}`);

  const response = await fetch(`https://lrclib.net/api/search?q=${query}`, {
    headers: {
      accept: "application/json",
      "Lrclib-Client": "SpotifyEnglishBot/1.0",
    },
  });

  if (!response.ok) return null;

  const results: LRCLIBResult[] = await response.json();

  // Skip instrumental tracks
  const match = results.find((r) => !r.instrumental && r.plainLyrics);
  return match?.plainLyrics || null;
}
