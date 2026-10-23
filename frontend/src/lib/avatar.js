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
