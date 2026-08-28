/**
 * Route-level loading shell for the whole (operator) group. Every page here is
 * `force-dynamic` and the layout touches the session store, so a client-side
 * navigation from the landing (Get Started / Log In) can sit on a frozen frame
 * for seconds while the server round-trips — especially on a cold dev compile.
 * This paints the form-shaped shell instantly so the click never feels dead.
 */
export default function OperatorLoading() {
  return (
    <div aria-busy="true" className="min-h-dvh p-6">
      <div className="mx-auto w-full max-w-md animate-pulse space-y-4 pt-16">
        <div className="h-8 w-2/3 rounded bg-line" />
        <div className="h-4 w-1/2 rounded bg-line" />
        <div className="h-12 w-full rounded bg-line" />
        <div className="h-12 w-full rounded bg-line" />
        <div className="h-12 w-full rounded bg-line" />
      </div>
    </div>
  )
}
