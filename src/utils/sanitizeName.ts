export const NAME_MAX_LENGTH = 20;

/**
 * Sanitizes a player display name before it is written to the game blob:
 * strips control chars, zero-width/invisible chars, and bidi override marks
 * (which could spoof or corrupt name rendering), collapses whitespace runs,
 * trims, and enforces NAME_MAX_LENGTH. The TextInput `maxLength` is UI-only,
 * so this must run on the value actually persisted.
 */
export function sanitizeName(raw: string): string {
  return raw
    // C0/C1 control characters
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    // zero-width chars, word joiner, BOM, and bidi/directional formatting marks
    .replace(/[\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX_LENGTH)
    .trim();
}
