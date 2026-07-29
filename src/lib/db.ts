// If a client component ever imports this file, the build fails rather than
// bundling the connection string into JavaScript a guest downloads.
// This is the single most important line in the file — see SECURITY.md §1.
import 'server-only'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and fill it in — see SECURITY.md.'
  )
}

/**
 * Prisma 7 reaches Postgres through a driver adapter rather than a URL in the
 * schema. In serverless the module is re-evaluated per cold start, so the
 * client is cached on globalThis to avoid opening a new pool each time.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
