/**
 * Username Generator
 *
 * Generates usernames in the format: Adjective + Bookish Noun + Number
 * Example: MidnightBookworm63, CozyLibrarian42, SilentScribe17
 *
 * Used for auto-assigning profile names and public usernames to new anonymous users.
 */

const ADJECTIVES = [
  'Midnight',
  'Cozy',
  'Silent',
  'Clever',
  'Curious',
  'Dreamy',
  'Gentle',
  'Hidden',
  'Hushed',
  'Keen',
  'Leafy',
  'Misty',
  'Noble',
  'Quiet',
  'Rustic',
  'Secret',
  'Steady',
  'Tender',
  'Velvet',
  'Wandering',
  'Whispering',
  'Wistful',
  'Amber',
  'Bright',
  'Crimson',
  'Dusk',
  'Faded',
  'Golden',
  'Ivory',
  'Lunar',
  'Mossy',
  'Olive',
  'Pale',
  'Rosy',
  'Silver',
  'Twilight',
  'Vintage',
  'Willow',
  'Starlit',
  'Frosted',
  'Ember',
];

const BOOKISH_NOUNS = [
  'Bookworm',
  'Librarian',
  'Scribe',
  'Reader',
  'Scholar',
  'Novelist',
  'Bibliophile',
  'Storyteller',
  'Narrator',
  'Chronicler',
  'Poet',
  'Penman',
  'Wordsmith',
  'Bookseller',
  'Quill',
  'Bookmark',
  'Chapter',
  'Manuscript',
  'Inkwell',
  'Parchment',
  'Tome',
  'Almanac',
  'Fable',
  'Lexicon',
  'Sonnet',
  'Verse',
  'Scroll',
  'Folio',
  'Gazette',
  'Opus',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(): number {
  return Math.floor(Math.random() * 100);
}

/**
 * Generate a bookish username (PascalCase, no separators).
 * Example: "MidnightBookworm63"
 */
export function generateBookishName(): string {
  return `${pickRandom(ADJECTIVES)}${pickRandom(BOOKISH_NOUNS)}${randomNumber()}`;
}

/**
 * Generate a lowercase bookish username suitable for `public_username`.
 * Example: "midnightbookworm63"
 */
export function generateBookishUsername(): string {
  return generateBookishName().toLowerCase();
}
