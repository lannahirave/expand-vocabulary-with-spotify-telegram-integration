import { Env, SongWithLyrics, LLMResponse } from "../types";
import { systemPrompt, wordExtractionSchema } from "./prompts";

export async function extractWordsFromBatch(
  env: Env,
  songs: SongWithLyrics[]
): Promise<LLMResponse> {
  const userPrompt = `Extract C1/CAE-level vocabulary from these songs:

${songs
  .map(
    (s, i) => `
=== SONG ${i + 1} ===
Track ID: ${s.trackId}
Title: "${s.trackName}" by ${s.artistName}

LYRICS:
${s.lyrics}
`
  )
  .join("\n")}

Return vocabulary words for each song.`;

  const requestBody = {
    model: "openai/gpt-oss-120b",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "word_extraction",
        strict: true,
        schema: wordExtractionSchema,
      },
    },
    provider: {
      allow_fallbacks: true,
      order: ["Cerebras"],
      only: ["Cerebras"],
      quantizations: ["fp16"],
    },
  };

  console.log("[LLM Request] Model:", requestBody.model);
  console.log("[LLM Request] Songs:", songs.map((s) => `${s.trackName} by ${s.artistName}`).join(", "));
  console.log("[LLM Request] System prompt:", systemPrompt);
  console.log("[LLM Request] User prompt:", userPrompt);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Spotify English Bot",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[LLM Error]", response.status, errorText);
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const rawResponse = await response.text();
  console.log("[LLM Raw Response]", rawResponse);

  const data: { choices: Array<{ message: { content: string } }> } = JSON.parse(rawResponse);
  const content = data.choices[0]?.message?.content;

  if (!content) {
    console.error("[LLM Error] Empty content in response");
    throw new Error("Empty response from OpenRouter");
  }

  console.log("[LLM Content]", content);

  const parsed: LLMResponse = JSON.parse(content);

  console.log("[LLM Parsed] Total songs:", parsed.songs.length);
  for (const s of parsed.songs) {
    console.log("[LLM Parsed] Track:", s.track_id, "- words:", s.words.length, "-", s.words.map((w) => w.word).join(", "));
  }

  return parsed;
}
