import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/**
 * Prisma 7 moved the datasource URL out of schema.prisma. The CLI reads it from
 * here; the runtime client gets it through a driver adapter (src/lib/db.ts).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
