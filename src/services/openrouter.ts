import { Env, SongWithLyrics, LLMResponse } from "../types";

const wordExtractionSchema = {
  type: "object",
  properties: {
    songs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          track_id: { type: "string", description: "Spotify track ID" },
          words: {
            type: "array",
            items: {
              type: "object",
              properties: {
                word: { type: "string", description: "The vocabulary word" },
                part_of_speech: { type: "string", description: "noun, verb, adjective, etc." },
                definition: { type: "string", description: "Clear definition for B2 learner" },
                phonetic: { type: "string", description: "IPA pronunciation" },
                example_lyric: {
                  type: "string",
                  description: "Line from the song containing the word",
                },
                collocations: {
                  type: "array",
                  items: { type: "string" },
                  description: "4-5 common collocations/phrases using this word",
                },
              },
              required: ["word", "part_of_speech", "definition", "phonetic", "example_lyric", "collocations"],
              additionalProperties: false,
            },
          },
        },
        required: ["track_id", "words"],
        additionalProperties: false,
      },
    },
  },
  required: ["songs"],
  additionalProperties: false,
};

const systemPrompt = `You are an English vocabulary teacher helping a B2-level learner.
You will receive multiple songs with their lyrics. For each song, extract 3-5 B2/C1 level vocabulary words.

Rules:
- Only select words appropriate for B2-C1 level (not too easy like "love", "go", not too rare)
- Skip slang, profanity, proper nouns, and very informal contractions
- Include the actual lyric line where the word appears
- Provide 4-5 natural collocations for each word
- If a song has no suitable B2-C1 words, return empty words array for that song
- Return words for ALL songs provided`;

export async function extractWordsFromBatch(
  env: Env,
  songs: SongWithLyrics[]
): Promise<LLMResponse> {
  const userPrompt = `Extract B2-C1 vocabulary from these songs:

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

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Spotify English Bot",
    },
    body: JSON.stringify({
      model: "cerebras/gpt-oss-120b-fp16",
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
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data: { choices: Array<{ message: { content: string } }> } = await response.json();
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from OpenRouter");
  }

  return JSON.parse(content);
}
