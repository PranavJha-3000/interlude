import 'server-only'

import { db } from '@/lib/db'
import type { EventType, ServiceArm } from '@/generated/prisma/enums'

/**
 * The append-only funnel log (§6.2).
 *
 * Every §6.3 metric is computed from this table alone, which is why `arm` and
 * `serviceId` are written onto each row rather than joined at read time: a
 * metric that needs a join to know which arm it belongs to will eventually be
 * computed against the wrong one.
 *
 * **Logging never fails a request.** A guest tapping a dish must not see an
 * error because the event insert timed out — the measurement matters, but not
 * more than the thing being measured. Failures are swallowed here and the
 * absence shows up as a gap in the funnel, which is visible, rather than as a
 * broken screen, which is worse.
 */

export interface EventContext {
  serviceId: string
  arm: ServiceArm
  tableRunId?: string | null
  deviceSessionId?: string | null
}

export async function recordEvent(
  type: EventType,
  context: EventContext,
  detail: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.event.create({
      data: {
        type,
        serviceId: context.serviceId,
        arm: context.arm,
        tableRunId: context.tableRunId ?? null,
        deviceSessionId: context.deviceSessionId ?? null,
        detail: detail as object,
      },
    })
  } catch {
    // Deliberately silent. See the note above: a dropped event is a gap in a
    // funnel; a thrown one is a guest staring at an error mid-meal.
  }
}

/** Several events at once, in one round trip. Same swallow-on-failure rule. */
export async function recordEvents(
  events: Array<{ type: EventType; detail?: Record<string, unknown> }>,
  context: EventContext
): Promise<void> {
  if (events.length === 0) return

  try {
    await db.event.createMany({
      data: events.map((e) => ({
        type: e.type,
        serviceId: context.serviceId,
        arm: context.arm,
        tableRunId: context.tableRunId ?? null,
        deviceSessionId: context.deviceSessionId ?? null,
        detail: (e.detail ?? {}) as object,
      })),
    })
  } catch {
    // As above.
  }
}
