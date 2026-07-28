import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/**
 * Prisma 7 moved the datasource URL out of schema.prisma. The CLI reads it from
 * here; the runtime client gets it through a driver adapter (src/lib/db.ts).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Migrations need a real session, which a pooled connection cannot give
    // them — PgBouncer in transaction mode breaks the advisory locks and
    // prepared statements the migration engine relies on. Runtime uses the
    // pooled URL (src/lib/db.ts); migrations use the direct one.
    url: env('DIRECT_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
