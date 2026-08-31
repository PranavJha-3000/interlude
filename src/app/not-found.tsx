import Link from 'next/link'
import { BRAND } from '@/brand'
import { en } from '@/strings/en'

/**
 * Global 404 fallback. The root layout offers no themed boundary, so this is
 * the operator/neutral tone — a stray guest link should still be able to get
 * back out.
 */
export default function GlobalNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-xs tracking-widest text-muted uppercase">{BRAND.name}</p>
      <h1 className="mt-4 text-3xl font-semibold">{en.common.notFoundHeading}</h1>
      <p className="mt-3 max-w-sm text-lg text-muted">{en.common.notFoundBody}</p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-14 items-center rounded-xl bg-ink px-6 text-lg font-semibold text-paper"
      >
        {en.common.back} to the site
      </Link>
    </main>
  )
}
