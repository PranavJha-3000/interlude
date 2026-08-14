/**
 * A redemption code (§7.4).
 *
 * Bound to table and service by construction — it is generated from neither,
 * so the binding is the row it sits on, but it is short enough to read aloud
 * across a noisy room, which is how it will actually be used. Ambiguous
 * characters are left out: nobody should have to decide whether that was a
 * zero or an O while holding three plates.
 *
 * Pure: the caller supplies the picker, seeded however it likes. The picker
 * receives the position as well as the bound, and that is the whole fix for a
 * real defect — the previous contract took only `max`, the caller passed a
 * closure over one hash, and all five characters came out identical: a
 * 26-code keyspace against a globally unique column, failing the insert at
 * the table on the second collision. Position-aware derivation restores the
 * full 26⁵ space while staying deterministic per seed.
 */
const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679'

export function newRedemptionCode(random: (max: number, position: number) => number): string {
  let code = ''
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[random(CODE_ALPHABET.length, i)]
  return code
}
