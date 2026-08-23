import 'server-only'

import { db } from '@/lib/db'
import { estimateReadyAtMs, type PrepMinutes } from '@/core/mechanics/prep-estimate'
import { getVenueConfig } from '@/lib/service'
import type { FireOrderCommand, OrderFireRecord, PosAdapter } from './types'

/**
 * The Manual adapter: a human at the pass taps a button when food goes in.
 *
 * This is not a placeholder for a real integration — it is the adapter that
 * ships and the one the pilot runs on. It exists because the alternative is
 * blocking the entire product on a vendor API nobody has tested (PLATFORM.md
 * §6).
 *
 * The only judgement it makes is the ready estimate, and that is delegated to a
 * pure function in `core/` so the rule can be tested without a database.
 */
export const manualPosAdapter: PosAdapter = {
  name: 'MANUAL',

  async recordFire(command: FireOrderCommand): Promise<OrderFireRecord> {
    // Idempotent per (service, table) — see the note on PosAdapter.recordFire.
    const existing = await this.latestFire(command.serviceId, command.tableId)
    if (existing) return existing

    const config = await getVenueConfig(command.venueId)
    const prepMinutes = config.prepMinutesByCategory as PrepMinutes

    const estReadyAtMs = estimateReadyAtMs(
      command.firedAtMs,
      command.courses,
      prepMinutes,
      config.defaultPrepMinutes
    )

    return db.orderFire.create({
      data: {
        tableId: command.tableId,
        serviceId: command.serviceId,
        firedAt: new Date(command.firedAtMs),
        estReadyAt: new Date(estReadyAtMs),
        courses: [...command.courses],
        firedById: command.firedByStaffId,
      },
      select: SELECT,
    })
  },

  async latestFire(serviceId: string, tableId: string): Promise<OrderFireRecord | null> {
    return db.orderFire.findFirst({
      where: { serviceId, tableId },
      orderBy: { firedAt: 'desc' },
      select: SELECT,
    })
  },
}

const SELECT = {
  id: true,
  tableId: true,
  serviceId: true,
  firedAt: true,
  estReadyAt: true,
  courses: true,
} as const
