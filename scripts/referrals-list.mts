/**
 * Print what the "Refer a Restaurant" form has collected, newest first.
 *
 *     npx tsx scripts/referrals-list.mts [limit]
 *
 * Read-only: the operational way to see the day's leads without opening Studio.
 */
import 'dotenv/config'

import { Pool } from 'pg'

const limit = Math.max(1, Number(process.argv[2] ?? '20') || 20)

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

try {
  const result = await pool.query(
    `SELECT id, "restaurantName", location, "pocName", "pocPhone",
            "pocRoleTitle", "referrerName", "referrerContact", "createdAt"
       FROM "Referral"
      ORDER BY "createdAt" DESC
      LIMIT $1`,
    [limit]
  )

  console.log(`${result.rowCount} referral(s), newest first:\n`)
  for (const r of result.rows) {
    console.log(`— ${r.restaurantName} · ${r.location}`)
    console.log(`  POC: ${r.pocName} (${r.pocRoleTitle}) — ${r.pocPhone}`)
    console.log(`  Referred by: ${r.referrerName} — ${r.referrerContact}`)
    console.log(`  At: ${r.createdAt?.toISOString?.() ?? r.createdAt}\n`)
  }
} finally {
  await pool.end()
}
