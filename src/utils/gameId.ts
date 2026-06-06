/** Characters allowed in game codes (no 0/O, 1/I/L ambiguity). */
export const GAME_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateGameId(): string {
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += GAME_CODE_ALPHABET[Math.floor(Math.random() * GAME_CODE_ALPHABET.length)];
  }
  return id;
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
