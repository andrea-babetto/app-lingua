// A soft colour for an avatar without a photo, always the same for the same name.
// FNV-1a hash, so that similar names do not end up on the same colour.
export function avatarClass(name = "") {
  let h = 2166136261;
  for (const ch of String(name).trim().toLowerCase()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return `av-${(((h >>> 0) ^ (h >>> 16)) >>> 0) % 6}`;
}

// The letters on an avatar without a photo: first and last word ("Giulia Rossi" → "GR", "Hamad" → "HA").
export function initials(name = "") {
  const w = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (w.length > 1) return (w[0][0] + w[w.length - 1][0]).toUpperCase();
  return (w[0] || "?").slice(0, 2).toUpperCase();
}
