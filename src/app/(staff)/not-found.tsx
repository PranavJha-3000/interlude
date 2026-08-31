import { en } from '@/strings/en'

/** Staff/floor 404 — an unknown venue slug at sign-in beats a bare 404. */
export default function StaffNotFound() {
  return (
    <main className="surface-staff flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <h1 className="text-2xl font-semibold">{en.common.notFoundHeading}</h1>
        <p className="mt-4 text-lg text-staff-muted">{en.common.notFoundBody}</p>
      </div>
    </main>
  )
}
