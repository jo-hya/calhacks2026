// Bandwidth free trial accounts accept only plain ASCII texts of at most 129 characters
// (sendSMS in bandwidth.mjs enforces this). Claude's replies are adapted to fit.
export const SMS_MAX_CHARS = Number(process.env.POCKET_SMS_MAX_CHARS) || 129;

const REPLACEMENTS = [[/[‘’‚′]/g, "'"], [/[“”„″]/g, '"'], [/[–—]/g, '-'], [/…/g, '...'], [/[•·]/g, '-'], [/ /g, ' ']];

export function toSmsAscii(text) {
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  return out.normalize('NFKD').replace(/[^\x20-\x7E\n]/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

// Splits into texts of at most `max` characters, keeping whole lines together where
// possible, then whole words. Newlines become spaces because sendSMS allows only printable ASCII.
export function splitSms(text, max = SMS_MAX_CHARS) {
  const parts = [];
  let current = '';
  const add = piece => {
    if (current && current.length + 1 + piece.length > max) { parts.push(current); current = ''; }
    current = current ? `${current} ${piece}` : piece;
  };
  for (const line of toSmsAscii(text).split('\n').map(l => l.trim()).filter(Boolean)) {
    if (line.length <= max) {
      // Start a fresh text for a line that won't fit alongside the previous one.
      if (current && current.length + 1 + line.length > max) { parts.push(current); current = ''; }
      add(line);
      continue;
    }
    for (const word of line.split(/\s+/)) {
      for (let piece = word; piece; piece = piece.slice(max)) add(piece.slice(0, max));
    }
  }
  if (current) parts.push(current);
  return parts;
}
