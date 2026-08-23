import { notFound } from 'next/navigation'
import { MysteryCustomerGame } from '../../MysteryCustomerGame'
import { SecretRecipeGame } from '../../SecretRecipeGame'

/**
 * A mini-game launch route.
 *
 * The game selector links here as `/t/[qrToken]/play/[game]`, and the selected
 * game mounts immediately — no intermediate screen, because the whole point of
 * these two is a 10–30 second interaction. Each component loads its own
 * venue-configured data through server actions, so the route itself stays a
 * thin switch: an unknown slug is a 404, not a blank screen.
 */
export default async function PlayGamePage({
  params,
}: {
  params: Promise<{ qrToken: string; game: string }>
}) {
  const { qrToken, game } = await params

  if (game === 'secret-recipe') {
    return <SecretRecipeGame qrToken={qrToken} />
  }
  if (game === 'mystery-customer') {
    return <MysteryCustomerGame qrToken={qrToken} />
  }

  notFound()
}
