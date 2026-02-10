import { LRCLIBResult } from "../types";

export async function fetchLyrics(trackName: string, artistName: string): Promise<string | null> {
  //TODO: if artist name or trackname is empty, do not query
  const query = encodeURIComponent(`${trackName} ${artistName}`);
  const url = `https://lrclib.net/api/search?q=${query}`;

  console.log("[LRCLIB] Searching lyrics for:", trackName, "by", artistName);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "Lrclib-Client": "SpotifyEnglishBot/1.0",
    },
  });

  if (!response.ok) {
    console.error("[LRCLIB] API error:", response.status, await response.text());
    return null;
  }

  const results: LRCLIBResult[] = await response.json();
  console.log("[LRCLIB] Got", results.length, "results for:", trackName);

  // Skip instrumental tracks
  const match = results.find((r) => !r.instrumental && r.plainLyrics);

  if (match) {
    const lyricsPreview = match.plainLyrics!.slice(0, 100).replace(/\n/g, " ");
    console.log("[LRCLIB] Found lyrics for:", trackName, "- preview:", lyricsPreview + "...");
  } else {
    console.log("[LRCLIB] No suitable lyrics found for:", trackName, "(results were instrumental or empty)");
  }

  return match?.plainLyrics || null;
}
