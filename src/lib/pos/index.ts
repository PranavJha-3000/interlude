import 'server-only'

import { manualPosAdapter } from './manual'
import type { PosAdapter } from './types'

export type {
  BillImportingPosAdapter,
  FireOrderCommand,
  OrderFireRecord,
  PosAdapter,
  PosAdapterName,
} from './types'

/**
 * Which POS a venue is on.
 *
 * One adapter today, and resolving it through a function anyway — because the
 * point of the port is that the call sites never name a vendor. When a venue
 * genuinely has a till we can talk to, this reads a column and the guest and
 * floor surfaces do not change.
 *
 * `CsvImport` (wave 2) lands here as a second case, and Petpooja/Restroworks
 * only ever as interface-conforming stubs unless T3 actually runs.
 */
// The parameter is the point of the function: call sites must already be
// passing a venue by the time a second adapter exists, or adding one becomes a
// refactor of every surface instead of a case in this switch.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolvePosAdapter(venueId: string): PosAdapter {
  return manualPosAdapter
}
