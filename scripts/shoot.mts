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
 */
import { chromium } from '@playwright/test'
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

const browser = await chromium.launch()
const context = await browser.newContext(VIEWPORTS[viewportName])
const page = await context.newPage()
await page.goto(new URL(route, base).toString(), { waitUntil: 'networkidle' })

const shoot = (suffix: string) =>
  page.screenshot({ path: path.join(outDir, `${name}${suffix}.png`), fullPage })

await shoot('')
await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' })
await shoot('.grey')
await page.addStyleTag({ content: 'html { filter: brightness(0.2) !important; }' })
await shoot('.dim')

await browser.close()
console.log(`captured ${name} (+ .grey, .dim) from ${base}${route} at ${viewportName}`)
