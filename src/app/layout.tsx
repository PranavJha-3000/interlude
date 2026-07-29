import type { Metadata, Viewport } from 'next'
import { BRAND } from '@/brand'
import './globals.css'

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name} — ${BRAND.tagline}`,
  // A guest reaches this by scanning a tent on a table. Nothing here is for a
  // crawler, and a venue's live prize state should not be indexed.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Guests hold the phone one-handed and will pinch. Never disable that.
  maximumScale: 5,
  themeColor: '#fbf7f0',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
