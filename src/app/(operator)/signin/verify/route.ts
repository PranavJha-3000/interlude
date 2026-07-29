import { NextResponse, type NextRequest } from 'next/server'
import { consumeMagicLink } from '@/lib/operator-auth'

/**
 * Consume a sign-in link.
 *
 * A route handler rather than a page because `consumeMagicLink` sets the session
 * cookie, and Next forbids `cookies().set()` inside a server component. Cookies
 * set through `next/headers` are carried on the redirect response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/signin?error=missing', request.url))
  }

  const result = await consumeMagicLink(token, Date.now())
  if (!result.ok) {
    return NextResponse.redirect(
      new URL(`/signin?error=${result.reason.toLowerCase()}`, request.url)
    )
  }

  // Onboarding does not exist yet, so an operator with no venue lands on the
  // dashboard's empty state rather than a 404.
  return NextResponse.redirect(new URL('/dash', request.url))
}
