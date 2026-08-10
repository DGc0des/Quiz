/** Characters allowed in game codes (no 0/O, 1/I/L ambiguity). */
export const GAME_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Draw `count` unbiased random indices in [0, range) using a CSPRNG.
 *
 * `crypto.getRandomValues` is provided by `react-native-get-random-values`
 * (imported once in `App.tsx`) on device and natively by the test runtime.
 * Plain `Math.random()` is not cryptographically secure and made codes
 * guessable; with the table readable by the anon key (see PROJECT_STATUS.md §1)
 * that enabled enumeration. Rejection sampling avoids the modulo bias a naive
 * `byte % range` would introduce when 256 is not a multiple of `range`.
 */
function randomIndices(count: number, range: number): number[] {
  const max = Math.floor(256 / range) * range; // largest unbiased byte boundary
  const out: number[] = [];
  const buf = new Uint8Array(count * 2);
  while (out.length < count) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < count; i++) {
      if (buf[i] < max) out.push(buf[i] % range);
    }
  }
  return out;
}

export function generateGameId(): string {
  return randomIndices(6, GAME_CODE_ALPHABET.length)
    .map((i) => GAME_CODE_ALPHABET[i])
    .join('');
}

/**
 * Parse a scanned QR payload into a 6-char game code.
 * Accepts full deep link `quizapp://join/CODE` or a raw `CODE` (mini QR encodes raw only).
 */
export function parseGameCodeFromScanPayload(data: string): string | null {
  const t = data.trim();
  const joinRe = new RegExp(`^quizapp:\\/\\/join\\/([${GAME_CODE_ALPHABET}]{6})$`, 'i');
  const mJoin = t.match(joinRe);
  if (mJoin) return mJoin[1].toUpperCase();
  const rawRe = new RegExp(`^([${GAME_CODE_ALPHABET}]{6})$`, 'i');
  const mRaw = t.match(rawRe);
  if (mRaw) return mRaw[1].toUpperCase();
  return null;
}
