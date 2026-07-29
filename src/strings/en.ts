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
    /** Nothing to show in this cell. An em dash, never an empty cell. */
    none: '—',
    offline: "You're offline. We'll pick up where you left off.",
    genericError: "Something went wrong at our end. Your table's fine — try again.",
  },

  landing: {
    eyebrow: BRAND.name,
    heading: 'The wait between ordering and eating is unsold inventory.',
    body: 'A short skill game on the guest’s own phone while their food cooks. You set which items can be won and how deep the discount goes; the engine picks inside your fences and shows you why. No app for the guest, no signup, no account.',
    forGuests:
      'Your guest scans a code on the table, plays for 60–90 seconds, and wins a named item off your menu.',
    forYou:
      'You control the menu, the prizes, the discount depth, and a kill switch for when the kitchen is slammed.',
    honesty:
      'On night one the dashboard shows an app-side estimate of net contribution. Upload a bill export and it is replaced by the measured attach-rate delta against same-night control tables.',
    cta: 'Get started',
  },

  signin: {
    heading: 'Sign in',
    body: 'We’ll email you a link. No password to remember or lose.',
    emailLabel: 'Your email',
    submit: 'Email me a link',
    // Identical whether or not the address is known — a different message here
    // would tell anyone who asks which restaurants are customers.
    sent: 'Check your email. The link works once and expires in 15 minutes.',
    sentAgain: 'Didn’t arrive? Check spam, or request another.',
    invalidEmail: 'That doesn’t look like an email address.',
    linkExpired: 'That link has expired. Request another and it’ll be sent straight away.',
    linkUsed: 'That link has already been used. Request another.',
    linkUnknown: 'That link isn’t valid. Request another.',
    signOut: 'Sign out',
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
    // Which table are you at? Shown after a venue QR scan, before consent.
    // Nothing is recorded on this screen — it is a list of links.
    tablePicker: {
      heading: 'Which table are you at?',
      body: "It's on the little card or the edge of the table.",
      tableLabel: (label: string) => `Table ${label}`,
      noTables: 'Nothing set up here yet. Enjoy your meal.',
    },
    // Which stake, not which game — the eight questions are the same either
    // way. Nothing here may imply a draw or a wheel: the mystery plate is a
    // fixed-price dish the guest wins the *right to buy* (PLATFORM.md §7).
    gamePicker: {
      heading: 'Pick your stake',
      body: 'Same questions either way. Different thing riding on them.',
      kitchenRound: 'Beat the kitchen',
      kitchenRoundBlurb: 'Win something off tonight’s menu before your food lands.',
      mysteryPlate: 'Tonight’s chef’s plate',
      mysteryPlateBlurb: (price: string) =>
        `Beat the kitchen and you can have the chef’s pick for ${price}.`,
    },
    outcome: {
      wonHeading: 'You beat the kitchen',
      wonInstruction: 'Show this screen to your server.',
      lostHeading: 'The kitchen won this one',
      lostInstruction: 'Show this screen to your server.',
      // What the guest actually gets. The depth is whichever rule the venue
      // wrote, so the copy takes it as an argument rather than assuming a half.
      // Never a dead end: a loss still ends in real value.
      wonFree: (itemName: string) => `Your ${itemName} is on the house.`,
      wonPercent: (itemName: string, percent: number) => `${percent}% off your ${itemName}.`,
      wonFixed: (itemName: string, price: string) => `${itemName}, yours for ${price}.`,
      lostFree: (itemName: string) => `Close though — have a ${itemName} on us anyway.`,
      lostPercent: (itemName: string, percent: number) =>
        `Close though — here's ${percent}% off a ${itemName} anyway.`,
      lostFixed: (itemName: string, price: string) =>
        `Close though — you can still have a ${itemName} for ${price}.`,
      nothingOffered: 'Nothing to give away right now, but thanks for playing.',
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
      // The percentage comes off the award row, so the server reads the number
      // the guest was actually shown rather than one we assumed.
      linePercent: (tableLabel: string, itemName: string, percent: number) =>
        `${tableLabel} claims: ${itemName}, ${percent}% off`,
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
    tents: 'Tents',
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
    activity: {
      heading: 'Activity',
      empty: 'No scans yet this service.',
      colTable: 'Table',
      colScanned: 'Scanned',
      colGame: 'Game',
      colResult: 'Result',
      colClaimed: 'Claimed',
      controlNote: 'Control table — cannot play',
      pending: 'Pending',
      /** The award depth when the guest pays nothing. */
      free: 'free',
      /** Marks a prize a member of staff actually handed over. */
      claimedMark: '✓',
      claimedAt: (time: string) => `✓ ${time}`,
      notPlayed: 'Scanned, did not play',
      inProgress: 'Playing now',
      gameKitchenRound: 'Kitchen round',
      gameMysteryPlate: 'Mystery plate',
      scoreLine: (score: number, total: number) => `${score}/${total}`,
      funnel: (f: {
        tentedTables: number
        scannedTables: number
        played: number
        claimed: number
      }) =>
        `${f.tentedTables} tented · ${f.scannedTables} scanned · ${f.played} played · ${f.claimed} claimed`,
    },
    games: {
      heading: 'Games',
      body: 'Turn a game off and new rounds stop offering it. A round already in progress finishes normally.',
      on: 'On',
      off: 'Off',
      turnOn: 'Turn on',
      turnOff: 'Turn off',
      kitchenRound: 'Kitchen round',
      kitchenRoundBlurb: 'The guest races the kitchen and wins something off your menu.',
      mysteryPlate: 'Mystery plate',
      mysteryPlateBlurb:
        'Same questions, different stake — the guest wins the right to buy tonight’s chef’s pick at your fixed price.',
      allOffWarning: 'Every game is off. Guests see the same screen a closed venue shows.',
    },
    empty: 'No service running.',
    gamesNav: 'Games',
  },
} as const

export type Strings = typeof en
