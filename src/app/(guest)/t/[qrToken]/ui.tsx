import { BRAND } from '@/brand'

/** Shared shell for every guest screen. Server-rendered, no client JS. */
export function Screen({ children, venueName }: { children: React.ReactNode; venueName?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
      <header className="mb-8">
        <p className="text-xs tracking-widest text-muted uppercase">{venueName ?? BRAND.name}</p>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </main>
  )
}

export function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="text-3xl leading-tight font-semibold text-balance">{children}</h1>
}

export function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-lg leading-relaxed text-muted text-pretty">{children}</p>
}

/** Minimum 56px tall — this is tapped one-handed, often while holding a drink. */
export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-semibold text-paper active:bg-accent"
    >
      {children}
    </button>
  )
}

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line bg-warm p-5">{children}</div>
}
