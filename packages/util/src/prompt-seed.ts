// Hidden instruction seeding for the first user message of an AI-authoring
// session (e.g. the in-page skill-writer). The device merges multiple text
// parts of one user message into a single part and drops the `synthetic` flag,
// so a hidden instruction must live INSIDE the user message text to be obeyed by
// the model. To keep the chat bubble showing only the user's own words, we
// separate the (hidden) instruction from the user's text with a unique sentinel
// and strip everything up to and including the sentinel at the UI leaf.

// Unique, ASCII-safe, model-readable separator. Extremely unlikely to appear in
// normal user input.
export const PROMPT_SEED_SENTINEL = "\n\n<<<COSTRICT_USER_REQUEST>>>\n\n"

// Concatenate: the (hidden) instruction first, the sentinel, then the user text.
export function withPromptSeed(seed: string, userText: string): string {
  return `${seed}${PROMPT_SEED_SENTINEL}${userText}`
}

// Strip: if the text contains the sentinel, return only the part after it (the
// user's own content); otherwise return the text unchanged.
export function stripPromptSeed(text: string): string {
  const i = text.indexOf(PROMPT_SEED_SENTINEL)
  return i >= 0 ? text.slice(i + PROMPT_SEED_SENTINEL.length) : text
}
