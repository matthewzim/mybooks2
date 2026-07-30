/**
 * Book Text Normalization
 *
 * Spine OCR reads what is printed on the book, and a great many spines are
 * printed in block capitals — "THE FELLOWSHIP OF THE RING", "J.R.R. TOLKIEN".
 * ISBNdb records carry the same habit for some editions. Storing that verbatim
 * makes the shelf shout, and it is also the string the cover-image search then
 * queries with, so the shouting propagates.
 *
 * These helpers convert SHOUTED text to title case and leave everything else
 * exactly as written: a value with any lowercase letter in it was cased
 * deliberately (by the user, or by ISBNdb) and must survive untouched, so
 * "The FBI Story" and "danah boyd" are never rewritten.
 *
 * Usage:
 * import { normalizeBookTitle, normalizeAuthorName } from '@/utils/bookText';
 * normalizeBookTitle('THE HANDMAID’S TALE');  // "The Handmaid's Tale"
 * normalizeAuthorName('URSULA K. LE GUIN');        // "Ursula K. Le Guin"
 */

/**
 * Letters, expressed as explicit ranges rather than `\p{L}`: Hermes (React
 * Native's engine) does not reliably support Unicode property escapes, and
 * plain `[a-z]` would drop the accents off "JOSÉ SARAMAGO".
 * Covers Latin-1 Supplement, Latin Extended-A/B, Greek and Cyrillic.
 */
const LETTERS = 'a-z\\u00c0-\\u024f\\u0370-\\u03ff\\u0400-\\u04ff';

const LETTER_RUN = new RegExp(`[${LETTERS}]+`, 'gi');
const TRAILING_LETTERS = new RegExp(`[${LETTERS}]+$`, 'i');
const NON_LETTERS = new RegExp(`[^${LETTERS}]`, 'gi');
const MC_NAME = new RegExp(`^mc([${LETTERS}]{2,})$`, 'i');

/** Straight and typographic apostrophes, as they arrive from OCR. */
const APOSTROPHES = ["'", '’', 'ʼ'];

/**
 * Roman numerals I–XXXIX ("Henry IV", "Part III"), deliberately limited to
 * I/V/X/L. Allowing M, C and D would swallow ordinary words: "MIX" is a
 * well-formed Roman numeral, and "MIX" as a title word is far more likely.
 */
const ROMAN_NUMERAL = /^(xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

/**
 * Words kept lowercase inside a title unless they open or close it (or open a
 * subtitle). Standard title-case practice: "The Sound and the Fury", not
 * "The Sound And The Fury".
 */
const TITLE_SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'if', 'in', 'into',
  'nor', 'of', 'off', 'on', 'onto', 'or', 'over', 'per', 'the', 'to', 'up',
  'via', 'vs', 'with', 'yet',
]);

/**
 * Name particles kept lowercase in the middle of a name — "Simone de
 * Beauvoir", "Ludwig van Beethoven". "Le" and "La" are deliberately absent:
 * they are capitalized about as often as not ("Ursula K. Le Guin"), and
 * leaving a particle capitalized reads far better than lowercasing a surname.
 */
const NAME_PARTICLES = new Set([
  'af', 'av', 'bin', 'da', 'de', 'del', 'della', 'den', 'der', 'des', 'di',
  'dos', 'du', 'ibn', 'van', 'von', 'zu',
]);

/** Punctuation that ends a segment, so the next word starts a fresh one. */
const SEGMENT_END = /[:;.!?–—]$/;

/**
 * Punctuation that opens a segment. It can sit on either side of the space —
 * "Fourth Wing (The Empyrean, 1)" attaches it to the word it opens, a spaced
 * quote attaches it to the word before.
 */
const SEGMENT_START_TRAILING = /[([{"“]$/;
const SEGMENT_START_LEADING = /^[([{"“]/;

function upperFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Collapse runs of whitespace and trim — OCR text is full of both. */
function collapseWhitespace(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Whether a string is written entirely in capitals. Uses case conversion
 * rather than a character class so it holds for accented and non-Latin text,
 * and so strings with no letters at all ("1984"?) answer false.
 */
export function isAllCaps(value: string | null | undefined): boolean {
  const text = value || '';
  return text === text.toUpperCase() && text !== text.toLowerCase();
}

/** Whether a word is a Roman numeral that should stay in capitals. */
function isRomanNumeral(word: string): boolean {
  const letters = word.replace(NON_LETTERS, '');
  return letters.length >= 2 && ROMAN_NUMERAL.test(letters);
}

/**
 * Capitalize one word, respecting the punctuation inside it.
 *
 * Each run of letters is capitalized independently, which gets hyphenated
 * names ("JEAN-LUC" → "Jean-Luc") and initials ("J.R.R." → "J.R.R.") right
 * for free. Two runs need special handling:
 *   - after an apostrophe, a run is a new name part only when the piece
 *     before the apostrophe is an O'/D'/L'-style prefix, so "O'BRIEN" becomes
 *     "O'Brien" while "DON'T" stays "Don't" rather than "Don'T";
 *   - "MC" prefixes a capital: "MCDONALD" → "McDonald".
 */
function capitalizeWord(word: string): string {
  const lower = word.toLowerCase();

  return lower.replace(LETTER_RUN, (run: string, offset: number) => {
    const previousChar = offset > 0 ? lower[offset - 1] : '';
    if (APOSTROPHES.includes(previousChar)) {
      const prefix = TRAILING_LETTERS.exec(lower.slice(0, offset - 1))?.[0] ?? '';
      // "don't", "rosie's" — a contraction/possessive suffix, not a name part.
      if (prefix.length > 1) return run;
    }

    const mcName = MC_NAME.exec(run);
    if (mcName) return `Mc${upperFirst(mcName[1])}`;

    return upperFirst(run);
  });
}

/**
 * Re-case a whole string word by word.
 *
 * @param value - Whitespace-collapsed text
 * @param keepLowercase - Given a word reduced to its letters, whether it may
 *   stay lowercase when it sits inside (not at either end of) a segment
 */
function recase(value: string, keepLowercase: (bareWord: string) => boolean): string {
  const words = value.split(' ');

  return words
    .map((word, index) => {
      if (!word) return word;
      if (isRomanNumeral(word)) return word.toUpperCase();

      const previousWord = index > 0 ? words[index - 1] : '';
      const opensSegment =
        index === 0 ||
        SEGMENT_START_LEADING.test(word) ||
        SEGMENT_END.test(previousWord) ||
        SEGMENT_START_TRAILING.test(previousWord);
      const closesSegment = index === words.length - 1;

      if (!opensSegment && !closesSegment) {
        const bareWord = word.replace(NON_LETTERS, '').toLowerCase();
        if (bareWord && keepLowercase(bareWord)) return word.toLowerCase();
      }

      return capitalizeWord(word);
    })
    .join(' ');
}

/** Title-case a string unconditionally: "THE HOBBIT" → "The Hobbit". */
export function toTitleCase(value: string | null | undefined): string {
  return recase(collapseWhitespace(value), (word) => TITLE_SMALL_WORDS.has(word));
}

/** Name-case a string unconditionally: "URSULA K. LE GUIN" → "Ursula K. Le Guin". */
export function toNameCase(value: string | null | undefined): string {
  return recase(collapseWhitespace(value), (word) => NAME_PARTICLES.has(word));
}

/**
 * Normalize a book title for storage, display and API lookups: whitespace is
 * always tidied, and an all-capitals title is converted to title case. Titles
 * with any lowercase letter are left as the author of the value wrote them.
 */
export function normalizeBookTitle(value: string | null | undefined): string {
  const cleaned = collapseWhitespace(value);
  return isAllCaps(cleaned) ? toTitleCase(cleaned) : cleaned;
}

/**
 * Normalize an author name the same way, using name conventions instead of
 * title conventions (no small-word rule, but middle particles like "de" and
 * "van" stay lowercase).
 */
export function normalizeAuthorName(value: string | null | undefined): string {
  const cleaned = collapseWhitespace(value);
  return isAllCaps(cleaned) ? toNameCase(cleaned) : cleaned;
}
