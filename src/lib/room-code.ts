/**
 * Generate a 6-character room code.
 * Excludes ambiguous characters (0/O, 1/I/L).
 */
export function generateRoomCode(length = 6) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
