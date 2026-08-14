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

/**
 * A hash reduced to `[0, max)` — use this, never `hashString(s) % max`.
 *
 * FNV-1a's multiply only carries entropy upward, so its low bits are close to
 * a linear function of the input: bit 0 of the hash is exactly the XOR parity
 * of the bytes. A bare `% max` therefore collapses related seeds onto a
 * handful of residues — measured concretely on 2026-08-14, when 10,000
 * redemption-code seeds produced 267 distinct codes, and the same pattern
 * biased which pair `dealPair` drew and which side the answer sat on. The
 * murmur3 finaliser below gives every input bit an even chance at every
 * output bit. Still pure, still reproducible from the recorded seed —
 * determinism is the requirement; uniformity is what this adds.
 */
export function hashToRange(s: string, max: number): number {
  let h = hashString(s)
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return (h >>> 0) % max
}
