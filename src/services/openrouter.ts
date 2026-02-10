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
                word: { type: "string", description: "The vocabulary word in its base/dictionary form" },
                part_of_speech: { type: "string", description: "Part of speech: noun, verb, adjective, adverb, etc." },
                definition: {
                  type: "string",
                  description:
                    "Clear, Cambridge-dictionary-style definition with usage context",
                },
                phonetic: { type: "string", description: "IPA pronunciation, e.g. /ˈsɪnɪkəl/" },
                example_lyric: {
                  type: "string",
                  description: "The actual line from the song lyrics where the word appears",
                },
                example_sentence: {
                  type: "string",
                  description:
                    "A natural example sentence showing how the word is used in everyday English, separate from the lyric",
                },
                collocations: {
                  type: "array",
                  items: { type: "string" },
                  description: "4-5 common collocations or fixed phrases using this word",
                },
                synonyms: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-4 synonyms or near-synonyms at a similar register",
                },
              },
              required: [
                "word",
                "part_of_speech",
                "definition",
                "phonetic",
                "example_lyric",
                "example_sentence",
                "collocations",
                "synonyms",
              ],
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
//TODO: add plural form if it's different from 's' / 'es'
//TODO: include a few lines of the song instead of one
//TODO: improve collocations: add meanings of the collocations, and a sentence
//TODO: improve synonyms: add meaning of the collocations, and a sentence
const systemPrompt = `You are an expert English vocabulary teacher preparing a non-native speaker for the Cambridge C1 Advanced (CAE) exam.
You will receive multiple songs with their lyrics. For each song, extract 3-5 C1-level vocabulary words.

Target level: C1 (Cambridge Advanced English). The learner is NOT from an English-speaking country.

Word selection rules:
- Select words appropriate for C1/CAE level — advanced but practically useful vocabulary
- Even though the music is American English, frame definitions and examples in a way useful for CAE preparation
- Pay SPECIAL attention to these often-missed categories for non-native speakers:
  * Onomatopoeia (words representing sounds: buzz, hiss, splash, crackle, rustle)
  * Animal sound words (oink, moo, neigh, growl, purr, chirp)
  * Words describing facial expressions or body language (frown, smirk, grimace, wince, squint, shrug)
  * Sensory/texture words (gritty, velvety, prickly, slimy)
  These words are commonly known by native speakers but often unknown to C1-level non-native learners. Include them when they appear in lyrics.
- Skip slang, profanity, proper nouns, and very informal contractions
- Skip basic words (A1-B1 level) like "love", "go", "happy"

For each word, provide:
1. definition: Write a clear, Cambridge-dictionary-style definition. Start with the core meaning. If helpful, add typical usage context in parentheses, e.g. "to make a continuous low sound (usually of insects or machines)"
2. example_sentence: Write a natural, illustrative sentence showing the word in a real-world context (NOT from the lyrics). Make it vivid and memorable.
3. collocations: 4-5 common collocations or fixed phrases
4. synonyms: 3-4 synonyms or near-synonyms at a similar register/level

Additional rules:
- Include the actual lyric line where the word appears as example_lyric
- If a song has no suitable C1 words, return an empty words array for that song
- Return words for ALL songs provided`;

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
