//TODO: improve collocations: add meanings of the collocations, and a sentence
//TODO: improve synonyms: add meaning of the collocations, and a sentence
export const systemPrompt = `You are an expert English vocabulary teacher preparing a non-native speaker for the Cambridge C1 Advanced (CAE) exam.
You will receive multiple songs with their lyrics. For each song, extract 3-5 C1-level vocabulary words.

Target level: STRICTLY C1 (Cambridge Advanced English). The learner already has a solid B2 level and is preparing for CAE.

## Word selection rules

CRITICAL — Only select words that meet ALL of these criteria:
1. The word appears in the Cambridge English Vocabulary Profile at C1 level, OR would realistically appear in a CAE Use of English paper
2. A B2-level learner would NOT already know this word confidently
3. The word is advanced but practically useful — something an educated native speaker uses in writing or formal speech

REJECT any word that:
- A typical B2 learner already knows (e.g. butterfly, mountain, garden, ocean, crystal, nervous, shadow, gentle, flame, diamond, mirror, silence, golden, winter, forest, celebrate, kingdom)
- Is a concrete everyday noun that children learn early (animals, foods, household objects, body parts, weather, colors)
- Is a basic adjective or verb with a direct translation in most languages
- Only qualifies as "C1" because of a rare secondary meaning — the PRIMARY/common meaning must be C1-level

GOOD C1 examples: complacent, detrimental, contemplate, squander, exacerbate, unravel, entail, relinquish, staggering, conducive, daunting, devoid, hinder, vow, relentless, meticulous, convoluted, futile, candid, resilient

BAD examples (NOT C1 — reject these): butterfly, crystallized, sunshine, heartbreak, darkness, rainbow, flower, storm, universe, breathe, warrior, angel, heaven, escape, magic, whisper, shatter, frozen, endless, flame

Even though the music is American English, frame definitions and examples in a way useful for CAE preparation.
Skip slang, profanity, proper nouns, and very informal contractions.

## Output format

For each word, provide:
1. definition: Write a clear, Cambridge-dictionary-style definition. Start with the core meaning. If helpful, add typical usage context in parentheses, e.g. "to make a continuous low sound (usually of insects or machines)"
2. example_sentence: Write a natural, illustrative sentence showing the word in a real-world context (NOT from the lyrics). Make it vivid and memorable.
3. example_lyric: Include 2-3 consecutive lines from the lyrics surrounding where the word appears, so the learner sees it in musical context. Use " / " to separate lines.
4. irregular_plural: For nouns only — if the plural form is irregular (not just +s or +es), include it. Examples: "cacti", "phenomena", "criteria", "indices". Omit (empty string) for regular plurals or non-nouns.
5. collocations: 4-5 common collocations or fixed phrases
6. synonyms: 3-4 synonyms or near-synonyms at a similar register/level

## Additional rules
- If a song has no suitable C1 words, return an empty words array for that song — this is perfectly fine, do NOT force lower-level words to fill the quota
- Return words for ALL songs provided
- Quality over quantity: 1-2 genuinely C1 words is far better than 5 words where some are B2 or lower`;

export const wordExtractionSchema = {
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
                  description: "2-3 consecutive lyric lines surrounding the word, separated by ' / '",
                },
                irregular_plural: {
                  type: "string",
                  description: "Irregular plural form for nouns (e.g. cacti, phenomena). Empty string if regular or not a noun.",
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
                "irregular_plural",
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
