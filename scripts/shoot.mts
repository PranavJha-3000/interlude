/**
 * Screenshot harness for the UI revamp (REVAMP-BRIEF.md Part 10: render each
 * screen, look at it, critique it in writing, revise). Not a test — a loupe.
 *
 * Each shot is captured three ways: as-is, greyscale (Part 4: nothing may
 * become ambiguous without colour), and at simulated 20% brightness (Part 5:
 * the venue's dining room, not a desk monitor — a real-device check is still
 * owed before launch). Output lands in screenshots/, which is gitignored.
 *
 *   npx tsx scripts/shoot.mts /t/<token> spent --viewport=guest
 *   npx tsx scripts/shoot.mts /pass pass-green --viewport=pass --base=http://localhost:3000
 *
 * Some states need arranging, not just visiting. `--flow=` does the arranging
 * against the same database the dev server reads:
 *   consent — tap Start on the consent screen first, then shoot what follows
 *   spent   — consent, then mark this device's session spent and reload
 *   round   — consent, fire the order, begin the run
 *   rung    — round, then answer correctly into the rung gate
 *   won     — rung, then Take it (the award screen)
 *   lost    — round, then answer wrongly
 *   arrived — consent, then a fire whose clock has already run out
 *   review  — consent, then the review prompt
 *
 * Run `npx tsx scripts/open-service.mts pilot` first for a fresh service —
 * flows spend lives and devices on the table they touch.
 */
import 'dotenv/config'
import { chromium, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const VIEWPORTS = {
  // 390×844 — the brief's guest phone. deviceScaleFactor 2 so type is judged
  // at the sharpness a phone actually has.
  guest: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // A wall tablet at the pass, landscape.
  pass: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
  // The server's phone.
  floor: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // The owner's laptop.
  dash: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
} as const

type ViewportName = keyof typeof VIEWPORTS

const [, , route, name, ...flags] = process.argv
if (!route || !name) {
  console.error('usage: npx tsx scripts/shoot.mts <route> <name> [--viewport=guest|pass|floor|dash] [--base=url] [--full]')
  process.exit(1)
}

const flag = (k: string) => flags.find((f) => f.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const viewportName = (flag('viewport') ?? 'guest') as ViewportName
const base = flag('base') ?? process.env.SHOOT_BASE_URL ?? 'http://localhost:3000'
const fullPage = flags.includes('--full')

const outDir = path.join(process.cwd(), 'screenshots')
mkdirSync(outDir, { recursive: true })

const flow = flag('flow')

async function consentIfAsked(page: Page) {
  const start = page.getByRole('button', { name: 'Start' })
  if (await start.isVisible().catch(() => false)) {
    await start.click()
    await page.waitForLoadState('networkidle')
  }
}

/** Mark the device that just consented on this table as spent, like the E2E does. */
async function spendThisDevice(qrToken: string, standing?: { rung: number; streak: number }) {
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const { PrismaClient } = await import('../src/generated/prisma/client')
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  })
  const table = await db.table.findUniqueOrThrow({ where: { qrToken } })
  const device = await db.deviceSession.findFirstOrThrow({
    where: { tableRun: { tableId: table.id, service: { endedAt: null } } },
    orderBy: { startedAt: 'desc' },
  })
  await db.deviceSession.update({ where: { id: device.id }, data: { spentAt: new Date() } })
  if (standing) {
    await db.tableRun.update({
      where: { id: device.tableRunId },
      data: { currentRung: standing.rung, streak: standing.streak },
    })
  }
  await db.$disconnect()
}

async function openDb() {
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const { PrismaClient } = await import('../src/generated/prisma/client')
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  })
}

/** Fire the table's order so the run is bounded by food. Negative = already due. */
async function fireFor(qrToken: string, minutesOut: number) {
  const db = await openDb()
  const table = await db.table.findUniqueOrThrow({ where: { qrToken } })
  const service = await db.service.findFirstOrThrow({
    where: { venueId: table.venueId, endedAt: null },
  })
  await db.orderFire.create({
    data: {
      tableId: table.id,
      serviceId: service.id,
      estReadyAt: new Date(Date.now() + minutesOut * 60_000),
      partySize: 4,
    },
  })
  await db.$disconnect()
}

/** The dish name to tap — right or wrong — read from the run's last dealt pair. */
async function dishNameFor(qrToken: string, which: 'higher' | 'lower'): Promise<string> {
  const db = await openDb()
  const table = await db.table.findUniqueOrThrow({ where: { qrToken } })
  const run = await db.tableRun.findFirstOrThrow({
    where: { tableId: table.id, service: { endedAt: null } },
  })
  const ids = run.pairsShown[run.pairsShown.length - 1]!.split(':')
  const items = await db.menuItem.findMany({
    where: { id: { in: ids } },
    select: { name: true, trailingSales: true },
  })
  const sorted = [...items].sort((a, b) => b.trailingSales - a.trailingSales)
  await db.$disconnect()
  return which === 'higher' ? sorted[0]!.name : sorted[sorted.length - 1]!.name
}

const browser = await chromium.launch()
const context = await browser.newContext(VIEWPORTS[viewportName])
const page = await context.newPage()
await page.goto(new URL(route, base).toString(), { waitUntil: 'networkidle' })

const token = route.split('/')[2]!

if (flow === 'consent' || flow === 'spent' || flow === 'review') {
  await consentIfAsked(page)
  if (flow === 'spent') {
    // --standing=3,4 arranges a table on rung 3 with streak 4 before shooting.
    const s = flag('standing')?.split(',').map(Number)
    await spendThisDevice(token, s && s.length === 2 ? { rung: s[0]!, streak: s[1]! } : undefined)
    await page.reload({ waitUntil: 'networkidle' })
  }
  if (flow === 'review') {
    await page.goto(new URL(`${route}/review`, base).toString(), { waitUntil: 'networkidle' })
  }
}

if (flow === 'arrived') {
  await consentIfAsked(page)
  await fireFor(token, -2)
  await page.reload({ waitUntil: 'networkidle' })
}

// Operator surfaces: the seeded owner's password sign-in, then `route`.
if (flow === 'owner') {
  await page.goto(new URL('/signin', base).toString(), { waitUntil: 'networkidle' })
  await page.getByLabel('Your email').fill(process.env.SEED_OPERATOR_EMAIL ?? 'owner@example.com')
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.SEED_OPERATOR_PASSWORD ?? 'pilot-owner-dev')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dash', { timeout: 15000 })
  await page.goto(new URL(route, base).toString(), { waitUntil: 'networkidle' })
}

// Staff surfaces: sign in with the seeded venue PIN, then land wherever the
// role lands (kitchen → /pass, server → /floor) and finally open `route`.
if (flow === 'kitchen' || flow === 'server') {
  const pin = flow === 'kitchen' ? '5678' : '1234'
  await page.goto(new URL('/floor/pilot', base).toString(), { waitUntil: 'networkidle' })
  await page.getByLabel('Your PIN').fill(pin)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // The role decides the landing: kitchen → /pass, server → /floor.
  await page.waitForURL(flow === 'kitchen' ? '**/pass' : '**/floor', { timeout: 15000 })
  await page.goto(new URL(route, base).toString(), { waitUntil: 'networkidle' })
}

if (flow === 'round' || flow === 'rung' || flow === 'won' || flow === 'lost') {
  try {
    await consentIfAsked(page)
    await fireFor(token, 20)
    await page.reload({ waitUntil: 'networkidle' })

    // Consent and StartRun both offer a button reading "Start" — keep tapping
    // whichever is up until the question is.
    for (let i = 0; i < 4; i++) {
      if (await page.getByText(/Which one/).first().isVisible().catch(() => false)) break
      const start = page.getByRole('button', { name: 'Start' }).first()
      if (await start.isVisible().catch(() => false)) {
        await start.click()
        await page.waitForLoadState('networkidle')
      } else {
        await page.waitForTimeout(400)
      }
    }
    await page.getByText(/Which one/).first().waitFor()

    if (flow !== 'round') {
      const name = await dishNameFor(token, flow === 'lost' ? 'lower' : 'higher')
      await page.getByRole('button', { name }).first().click()

      if (flow === 'lost') {
        await page.getByText('The kitchen won this one.').first().waitFor()
      } else {
        await page.getByText(/^Rung 1\./).first().waitFor()
        if (flow === 'won') {
          await page.getByRole('button', { name: 'Take it' }).first().click()
          await page.getByText('You beat the kitchen.').first().waitFor()
        }
      }
    }
  } catch (e) {
    // Dump what the page actually showed — flow authoring is blind otherwise.
    await page.screenshot({ path: path.join(outDir, `${name}.FAILED.png`) })
    console.error('flow stalled; page text was:\n', await page.locator('body').innerText())
    throw e
  }
}

const shoot = (suffix: string) =>
  page.screenshot({ path: path.join(outDir, `${name}${suffix}.png`), fullPage })

await shoot('')
await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' })
await shoot('.grey')
await page.addStyleTag({ content: 'html { filter: brightness(0.2) !important; }' })
await shoot('.dim')

await browser.close()
console.log(`captured ${name} (+ .grey, .dim) from ${base}${route} at ${viewportName}`)
