import { BRAND } from '@/brand'

/**
 * Every user-facing string in the product. Externalised from the first commit
 * so Hindi is a translation job rather than a refactor (PLATFORM.md §13).
 *
 * Rules for anything added here:
 *  - The brand name comes from BRAND, never a literal.
 *  - Money and counts are interpolated by the caller, already formatted.
 *  - Nothing in the guest copy may imply a draw, a wheel, or a lottery
 *    (PLATFORM.md §7) — the guest wins on skill, or buys at a fixed price.
 */
export const en = {
  common: {
    continue: 'Continue',
    back: 'Back',
    cancel: 'Cancel',
    confirm: 'Confirm',
    retry: 'Try again',
    loading: 'One moment…',
    offline: "You're offline. We'll pick up where you left off.",
    genericError: "Something went wrong at our end. Your table's fine — try again.",
  },

  guest: {
    consent: {
      heading: `${BRAND.name} ${BRAND.tagline}`,
      body: 'A short game while your food is cooking. No account, no app, no email.',
      // DPDP purpose limitation: say what is stored, before anything is stored.
      privacy:
        'We record which table played and what you won, so your server can bring it. Nothing else, and nothing yet.',
      accept: 'Start',
      declineNote: 'Not interested? Just close this — nothing has been recorded.',
    },
    waiting: {
      heading: 'Your food is on its way',
      subheadWithMinutes: (minutes: number) =>
        `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} out. Beat the kitchen.`,
      subheadNoTimer: 'Beat the kitchen before your food lands.',
      start: 'Start the round',
      notFiredYet: "Your order hasn't gone into the kitchen yet. Hang tight — this'll wake up.",
    },
    round: {
      questionCounter: (n: number, total: number) => `${n} of ${total}`,
      timeLeft: (seconds: number) => `${seconds}s`,
      foodArriving: 'Food incoming!',
    },
    outcome: {
      wonHeading: 'You beat the kitchen',
      wonBody: (itemName: string) => `Your ${itemName} is on the house.`,
      wonInstruction: 'Show this screen to your server.',
      lostHeading: 'The kitchen won this one',
      // Never a dead end: a loss still ends in real value (TODO.md wave 1).
      lostBody: (itemName: string) => `Close though — here's ${itemName} at half price anyway.`,
      lostInstruction: 'Show this screen to your server.',
      scoreLine: (score: number, total: number) => `${score} of ${total} right`,
      awaitingConfirm: 'Waiting for your server to confirm…',
      confirmed: 'Confirmed. Enjoy.',
    },
    addOn: {
      heading: 'Add something to the order?',
      subhead: 'One tap and it goes straight to your server.',
      send: 'Send to my server',
      sent: 'Sent to your server.',
      skip: 'No thanks',
    },
    closed: {
      heading: 'Nothing running right now',
      body: "The kitchen's not taking games at the moment. Enjoy your meal.",
    },
  },

  floor: {
    signIn: {
      heading: 'Floor',
      pinLabel: 'Your PIN',
      submit: 'Sign in',
      wrongPin: "That PIN didn't work.",
    },
    tables: {
      heading: 'Tables',
      empty: 'No tables seated yet.',
      tented: 'Tented',
      control: 'Control',
      fireOrder: 'Fire order',
      fired: (time: string) => `Fired ${time}`,
      statusSeated: 'Seated',
      statusFired: 'Order fired',
      statusPlaying: 'Playing',
      statusAddOn: 'Add-on requested',
      statusRedeem: 'Awaiting redemption',
    },
    addOns: {
      heading: 'Add-ons',
      line: (tableLabel: string, qty: number, itemName: string) =>
        `${tableLabel} — ${qty}× ${itemName}`,
      ack: 'Ack',
    },
    redemptions: {
      heading: 'Redemptions',
      lineFree: (tableLabel: string, itemName: string) => `${tableLabel} claims: ${itemName}, free`,
      lineHalf: (tableLabel: string, itemName: string) =>
        `${tableLabel} claims: ${itemName}, half price`,
      lineFixed: (tableLabel: string, itemName: string, price: string) =>
        `${tableLabel} claims: ${itemName} at ${price}`,
      confirm: 'Confirm',
      confirmed: 'Done',
    },
  },

  pass: {
    heading: 'Pass',
    load: {
      label: 'Kitchen load',
      green: 'Green',
      amber: 'Amber',
      red: 'Red',
      greenHelp: 'Everything on',
      amberHelp: 'Low-effort prizes only',
      redHelp: 'No prize that makes you cook',
      setAt: (time: string) => `Set ${time}`,
    },
    pool: {
      heading: "Tonight's pool",
      empty: 'Nothing in the pool right now.',
      vetoed: 'Vetoed',
      veto: 'Veto',
      unveto: 'Allow',
      excludedHeading: 'Not in the pool',
    },
  },

  dash: {
    heading: 'Tonight',
    tier1: {
      headline: 'Net contribution',
      // The honesty caveat is not optional copy — PLATFORM.md §9.
      caveat:
        "Estimated from add-ons sold through the app, minus what the prizes cost you. Assumes the add-on wouldn't have been ordered anyway — upload a bill export to replace this with the measured number.",
      addOnGross: 'Add-ons sold',
      addOnContribution: 'Contribution from add-ons',
      prizeCost: 'Prize cost',
      redemptions: 'Prizes redeemed',
      plays: 'Rounds played',
      scans: 'Tables that scanned',
    },
    tier2: {
      headline: 'Attach-rate delta',
      unit: 'pp',
      comparison: 'Tented tables vs. control, same service',
      pending: 'Upload last night’s bill export to see the measured number.',
      engagedLabel: 'Scanned vs. control',
      engagedCaveat: 'Scanners choose to scan — treat as an upper bound.',
    },
    empty: 'No service running.',
  },
} as const

export type Strings = typeof en
