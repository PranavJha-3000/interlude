/**
 * FNV-1a. Small, stable across runs and platforms, and not a security hash.
 *
 * It lives in its own module because two mechanics need the same one and they
 * must agree: this is the only source of variation in `core/mechanics`, where
 * `Math.random` and `crypto.getRandomValues` are banned by ESLint. Every "which
 * question" and "which dish" decision is a pure function of a seed, which is
 * what makes a round reproducible from its recorded inputs — and reproducible
 * is what "no chance, anywhere" means in practice (PLATFORM.md §7).
 */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
