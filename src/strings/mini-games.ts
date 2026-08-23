/**
 * Guest-facing copy for the two V1 mini-games.
 *
 * Kept apart from `en.ts` so the game surfaces ship without touching the main
 * ladder's strings. Beat the Kitchen keeps its own copy; the shared spine
 * (consent, claim, won screen) speaks `en.guest.*`.
 */
export const miniGames = {
  common: {
    loading: 'Loading…',
    error: 'Something went wrong. Please try again.',
    back: 'Back',
  },

  selector: {
    heading: 'PLAY WHILE YOU WAIT',
  },

  secretRecipe: {
    title: 'Secret Recipe',
    heading: 'Find the secret combination',
    howTo: 'Tap up to 4 things you think belong together. Discover something real from our menu.',
    pickGroupLabel: 'Ingredients',
    tryCta: (n: number) => `Try these ${n}`,
    pickFirst: 'Pick a few ingredients first',
    missLine: (n: number) => `Not a match this time — try another mix. Attempt ${n}.`,
    solvedEyebrow: 'You found it',
    solvedNote: 'Discovery only — tonight’s order stays exactly as it is. Ask for it next visit.',
    claimCta: 'Claim reward',
    claimNote: 'One reward per table, served tonight.',
  },

  mysteryCustomer: {
    title: 'Mystery Customer',
    heading: 'Serve our mystery customer',
    howTo: 'Read the brief, pick one dish for each course, and see how close you get.',
    budgetLabel: 'Budget',
    serveCta: 'Serve the meal',
    change: 'Change',
    resultEyebrow: 'The verdict',
    winHeadline: 'They loved it',
    loseHeadline: 'Not quite their taste',
    scoreLine: (pct: number, total: string) => `${pct}% match · ${total}`,
    noProblems: 'A clean read — every course landed.',
    claimCta: 'Claim reward',
    claimNote: 'One reward per table, served tonight.',
  },
} as const
