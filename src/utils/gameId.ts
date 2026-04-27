const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateGameId(): string {
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return id;
}
