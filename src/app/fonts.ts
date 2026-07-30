import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google'

/**
 * The operator's three faces, in one module.
 *
 * **Nothing under `(guest)` may import this.** Next preloads font files per
 * route, so an import there would put ~30KB of webfont on a phone whose entire
 * discretionary budget is 15KB over the framework floor.
 *
 * They are exposed as CSS variables rather than classNames so the guest route
 * can use the same `font-display` and `font-mono` utilities and silently fall
 * back to the system stack — see the note in `globals.css`. Two operator-facing
 * entry points consume this: the `(operator)` layout and the landing page,
 * which sits at the root rather than inside the group because it is `/`.
 */

export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-sans',
  display: 'swap',
})

/** Every figure the operator reads. Tabular by default is the point. */
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

/** Display only, 28px and up. Four places, listed in UI-SPEC.md §4. */
export const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument',
  display: 'swap',
})

/** Apply to the outermost element of an operator-facing surface. */
export const operatorFontVars = `${plexSans.variable} ${plexMono.variable} ${instrument.variable}`
