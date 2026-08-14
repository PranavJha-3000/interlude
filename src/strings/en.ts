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
    body: 'A skill game on the guest’s own phone, lasting exactly as long as their food does. You set which items can be won and how deep the discount goes; the engine picks inside your fences and shows you why. No app for the guest, no signup, no account.',
    forGuests:
      'Your guest scans a code on the table and plays for as long as their food takes — a slow kitchen is a longer game, not a worse wait. They climb a ladder of dishes off your own menu, and keep the rung they reach.',
    forYou:
      'You control the menu, the prizes, the discount depth, and a kill switch for when the kitchen is slammed.',
    honesty:
      'On night one the dashboard shows an app-side estimate of net contribution. Upload a bill export and it is replaced by the measured attach-rate delta against same-night control tables.',
    cta: 'Get started',

    /**
     * The signature element (UI-SPEC.md §6): a rendered fragment of the
     * engine's own audit trail. The refusal column is the pitch, so it is
     * listed second and its reasons are set in full ink while the item names
     * are struck and softened — the eye lands on *why it said no*.
     *
     * These rows are an illustration, not a customer's data. Two things are
     * deliberately absent: a venue name and a location. There are no customers
     * yet, and inventing one on the front door of a product whose whole
     * promise is honest measurement is the single most expensive lie
     * available. `stamp` says so on the card itself.
     */
    decisionCard: {
      stamp: 'Example',
      title: 'Tonight’s pool, decided at 6:40pm',
      clearedHeading: 'Cleared',
      clearedNote: 'Winnable tonight',
      refusedHeading: 'Refused',
      refusedNote: 'And the reason, in writing',
      cleared: [
        { item: 'Gulab jamun ×2', why: 'Plated cold. No fire time.' },
        { item: 'Masala chai', why: '₹9 food cost against a ₹90 line.' },
        { item: 'Veg momos, 20% off', why: 'Margin holds at 41% after the cut.' },
      ],
      refused: [
        { item: 'Butter chicken', why: 'Your hero item. Never discounted.' },
        { item: 'Tandoori chicken', why: 'Chef set load to red at 6:32pm.' },
        { item: 'Paneer tikka, 40% off', why: 'Depth cap is 25%. Offered at 25%.' },
        { item: 'Kulfi', why: 'Pool spend already at ₹1,200 of ₹1,200.' },
      ],
      footnote:
        'Every line above is a row the engine wrote before service, with the reason attached. You can read it back the next morning and argue with it.',
    },

    /** Four steps, because the fifth would be the one they abandon. */
    stepsHeading: 'What setup actually looks like',
    steps: [
      { n: '01', title: 'Tell us the venue', body: 'Name, city, how many tables. Two minutes.' },
      {
        n: '02',
        title: 'Load your menu',
        body: 'Price, food cost, and whether the kitchen has to touch it.',
      },
      {
        n: '03',
        title: 'Set your fences',
        body: 'Deepest discount, spend per service, items that are never on the table.',
      },
      {
        n: '04',
        title: 'Print the tents',
        body: 'One QR per table. Half of them stay blank — that is the control group, and it is how the number stays honest.',
      },
    ],
  },

  signin: {
    heading: 'Sign in',
    body: 'Your email and password.',
    emailLabel: 'Your email',
    passwordLabel: 'Password',
    submit: 'Sign in',
    noAccount: 'No account yet? Create one.',
    // One message for a wrong password, an address we have never seen, and an
    // operator who only ever used a link. Naming which one it was would tell
    // anyone who asks which restaurants are customers.
    badCredentials: 'Email or password is incorrect.',
    rateLimited: 'Too many attempts. Wait a few minutes and try again.',
    invalidEmail: 'That doesn’t look like an email address.',
    // The magic link is dormant rather than gone: no page offers to send one
    // while there is no verified sending domain, but a link already issued
    // still works, so the messages it can produce still have to exist.
    linkExpired: 'That link has expired.',
    linkUsed: 'That link has already been used.',
    linkUnknown: 'That link isn’t valid.',
    signOut: 'Sign out',
  },

  signup: {
    heading: 'Create your account',
    body: 'Your email and a password. Nothing is sent to you to confirm it.',
    emailLabel: 'Your email',
    passwordLabel: 'Choose a password',
    submit: 'Create account',
    haveAccount: 'Already have an account? Sign in.',
    // Unlike sign-in, this one has to admit the address is known — there is no
    // other way for someone who forgot they had signed up to act on it.
    emailTaken: 'That email already has an account. Sign in instead.',
    // A function, not a literal with the number baked in — and deliberately
    // NOT an import of PASSWORD_MIN_LENGTH. This module is imported by guest
    // client components, so anything it imports lands in the guest bundle;
    // pulling in `lib/password` put `node:crypto` on a phone and broke the
    // climb. The caller passes the number in (PLATFORM.md §11 budget).
    weakPassword: (minLength: number) =>
      `Use at least ${minLength} characters. Length is the only rule.`,
    invalidEmail: 'That doesn’t look like an email address.',
    rateLimited: 'Too many attempts. Wait a few minutes and try again.',
  },

  onboarding: {
    // The wizard is resumable, so every screen says where it is. Nobody sets a
    // restaurant up in one sitting.
    progress: (step: number, total: number) => `Step ${step} of ${total}`,
    back: 'Back',

    details: {
      heading: 'Tell us about the venue',
      body: 'This is what your guests see when they scan.',
      nameLabel: 'Venue name',
      namePlaceholder: 'The Pilot Kitchen',
      cityLabel: 'City',
      cityPlaceholder: 'Bengaluru',
      submit: 'Continue',
      nameRequired: 'Your venue needs a name.',
      nameTaken: 'A venue with that name is already set up. Try adding the area.',
    },

    tables: {
      heading: 'How many tables?',
      body: 'We make a QR code for each one. You can add more later.',
      countLabel: 'Number of tables',
      submit: 'Continue',
      countInvalid: 'Enter a number between 1 and 500.',
    },

    menu: {
      heading: 'Add your menu',
      // Said plainly, because this is the step people want to skip and it is
      // the one the whole product runs on.
      body: 'The game is built from your menu, and prizes come off it. Add the items you would be happy to give away or discount — you can add the rest later.',
      nameLabel: 'Item',
      priceLabel: 'Price ₹',
      costLabel: 'Food cost ₹',
      costHelp:
        'What it costs you to make. This is what stops the engine discounting past your margin.',
      categoryLabel: 'Category',
      add: 'Add item',
      added: (count: number) => `${count} ${count === 1 ? 'item' : 'items'} so far`,
      submit: 'Done adding',
      empty: 'Nothing added yet.',
      needOne: 'Add at least one item before continuing.',
      invalid: 'Give the item a name, a price, and what it costs you.',
      costOverPrice: 'Food cost is higher than the price. Check the numbers.',
      remove: 'Remove',
      upload: {
        heading: 'Or upload it',
        body: 'A photo of the menu, a PDF, or a CSV. You check every line before anything is saved.',
        fileLabel: 'Menu file',
        submit: 'Read my menu',
        csvHint: 'CSV columns: name, category, price — and optionally cost. Prices in rupees.',
        failed: 'That file could not be read. Try another photo, a CSV, or add items by hand.',
        draftHeading: 'Check what we read',
        draftBody:
          'Untick anything wrong, fix names and prices in place. Nothing is saved until you confirm.',
        draftFrom: (source: string, count: number) =>
          `${count} ${count === 1 ? 'item' : 'items'} read from your ${source}.`,
        includeLabel: 'Keep',
        costPctHeading: 'Roughly, what do ingredients cost you?',
        costPctBody:
          'One percentage per category is enough — it sets the margin fence the prize engine respects. You can refine per item later in the dashboard.',
        costPctLabel: (category: string) => `${category} — cost as % of price`,
        confirm: 'Save these items',
        discard: 'Discard draft',
        nothingSelected: 'Keep at least one row, or discard the draft.',
        missingCostPct: 'Give every category a rough cost percentage.',
      },
    },

    staff: {
      heading: 'Your staff PINs',
      body: 'We made these for you. Your floor and kitchen staff sign in with them — write them down or change them later in the dashboard.',
      floor: 'Floor',
      kitchen: 'Kitchen',
      generate: 'Generate staff PINs',
      warning:
        'Written down? These are shown once. Generate again if you lose them — the old ones stop working.',
      submit: 'Got them',
    },

    qr: {
      heading: 'Your venue QR',
      body: 'Print it for the counter, or put it on the table tents. A guest scans it, picks their table, and plays while their food cooks.',
      print: 'Print table tents',
      share: 'Share link',
      shared: 'Link copied.',
      submit: 'Continue',
    },

    games: {
      heading: 'Which games?',
      body: 'Both are on. Turn one off any time — this is not a decision you are stuck with.',
      submit: 'Finish setup',
    },

    done: {
      heading: 'You are set up',
      body: 'Print your tents, put them on the tables, and open a service.',
    },
  },

  guest: {
    /**
     * Beat the Kitchen (§9.1). Short, plain, never chirpy, never exclamatory.
     *
     * The question copy has two forms on purpose. When the ranking comes from
     * the venue's own sales export it is a fact and is stated as one; when it
     * falls back to the chef's ordering it is an opinion and says so. §4.2 is
     * explicit that a guess must never be presented as data — a guest who loses
     * a dessert to "the chef reckons" has been told the truth, and one who
     * loses it to a fake statistic has not.
     */
    game: {
      heading: 'Beat the kitchen',
      question: 'Which one do more people order here?',
      questionChef: 'Which one does the chef reckon sells more?',
      streak: (n: number) => `Streak ${n}`,
      rung: (n: number, of: number) => `Rung ${n}/${of}`,
      untimed: 'No timer',
      fired: (time: string) => `Kitchen fired your order at ${time}`,
      lostHeading: 'The kitchen won this one.',
      // No consolation, no discount, no second chance offered here (§9.1). A
      // rung already banked is not consolation — it was earned before the miss.
      lostBody: 'That one went the other way.',
      lostCost: (n: number) => (n === 1 ? 'The push cost a rung.' : `The push cost ${n} rungs.`),
      enjoy: 'Your food is on its way. Enjoy your meal.',
      claim: 'Claim it',
      outOfPairs: 'That is every question we can ask you tonight.',
    },

    /**
     * The rung gate — the one staged moment in the product (REVAMP-BRIEF.md
     * Part 5). The choice is stated with its downside and without softening.
     */
    rung: {
      heading: (n: number) => `Rung ${n}.`,
      banked: (n: number) => `Rung ${n} is banked.`,
      take: 'Take it',
      push: (next: number) => `Push for rung ${next}`,
      pushDownside: (penalty: number) =>
        penalty === 1 ? 'A wrong answer costs a rung.' : `A wrong answer costs ${penalty} rungs.`,
    },

    /**
     * The food landing is the designed ending, not a failure (§4.6). The run
     * is bounded by the kitchen; when the kitchen finishes first, the table
     * keeps whatever it banked and is told so plainly.
     */
    arrived: {
      heading: 'Your food is here.',
      body: 'The game runs while the kitchen cooks, and the kitchen is done. Enjoy your meal.',
      bodyHeld: 'The kitchen is done — and your rung is still banked. Take it before you eat.',
    },

    /**
     * The won screen (§9.1) — read from the award row, so it survives a
     * reload and a dead battery. The server confirms against the code; the
     * guest just shows the screen.
     */
    won: {
      heading: 'You beat the kitchen.',
      instruction: 'Show this screen to your server.',
      timeToSpare: (time: string) => `Claimed with ${time} still on the clock.`,
      tonightOnly: 'Valid tonight only.',
      awaiting: 'Waiting for your server…',
      confirmed: 'Confirmed. Enjoy.',
      free: 'On the house',
      percentOff: (percent: number) => `${percent}% off`,
      yourPrice: 'Your price',
    },

    start: {
      fresh: (rungs: number) =>
        `${rungs} rungs. Each one is a dish off this menu, and you keep the rung you stop on.`,
      // A second guest picking up a phone must see what they are inheriting
      // rather than being dropped mid-ladder with no explanation.
      inherited: (rung: number, of: number) =>
        `Your table is on rung ${rung} of ${of}. Carry on from there, or stop and take it.`,
      lives: (n: number) => (n === 1 ? '1 go left at this table' : `${n} goes left at this table`),
      begin: 'Start',
      // Claiming an inherited rung must not cost a life — starting does.
      takeInstead: (rung: number) => `Take rung ${rung} instead`,
    },

    /**
     * The spent-device screen (§4.5) — the most frequently seen state on night
     * one. It must read as an instruction with a bit of theatre, never as a
     * wall: the game-show register the venue's guests already know. A flat
     * rejection is where people put the phone down.
     *
     * Two bodies because two truths: a spent phone can be handed over and the
     * run carries on; a table out of goes cannot be rescued by another phone,
     * only by earning a go — telling that table to pass the phone would be
     * false advice.
     */
    spent: {
      heading: 'Lifelines used.',
      body: 'This phone has had its go. Hand it to someone else at the table — they carry on from your rung, not from zero.',
      tableBody: 'This table has used its goes for now.',
      standingLabel: 'Your table',
      earnHeading: 'Earn another go',
      actions: {
        // The strongest one, and it is the exact behaviour the product exists
        // to cause. The life lands on staff confirmation, never on the request.
        ADDON_CONFIRMED: 'Add something to your order — the go lands when your server confirms it.',
        PHONE_SUBMITTED: 'Leave a phone number.',
        FEEDBACK_SUBMITTED: 'Tell the restaurant how tonight went.',
      },
      standing: (rung: number) => `Rung ${rung} is still yours to claim.`,
    },
    phone: {
      heading: 'Leave a number',
      body: 'It earns this table another go, and this restaurant will know you when you come back.',
      // DPDP purpose limitation: say what is stored, and what is not, before
      // anything is stored. The guest is reading this to decide.
      privacy:
        'We store a scrambled version of your number, not the number itself — this restaurant only. No messages, no marketing, and no other restaurant can ever see it.',
      label: 'Your mobile number',
      placeholder: '98765 43210',
      submit: 'Leave it',
      skip: 'No thanks',
      erase: 'Remove a number I left before',
      done: 'Thank you — that is another go for the table.',
      rewardHeading: 'And you have earned something',
      errWrongLength: 'An Indian mobile number is ten digits. Check that one again.',
      errNotAMobile: 'That looks like a landline. We need a mobile.',
      errNotNumeric: 'That has letters in it — just the digits, please.',
      errNotIndian: 'We can only take an Indian mobile number.',
    },
    /** Back to the table's own screen, from any of the side routes. */
    back: 'Back to the game',
    feedback: {
      heading: 'How was tonight?',
      // Deliberately different words from the Google prompt, and a deliberately
      // different promise. This one goes to the restaurant and nowhere else.
      body: 'This goes straight to the restaurant — not to Google, not anywhere public. Say what you actually thought.',
      label: 'Your words',
      placeholder: 'What was good, what wasn’t…',
      ratingLabel: 'Out of five, if you like',
      submit: 'Send it to the restaurant',
      done: 'Thank you — the restaurant will see that.',
      doneLife: 'Thank you. That is another go for the table, too.',
      empty: 'Write something first.',
    },
    erase: {
      heading: 'Remove your number',
      body: 'Type the number you left and it goes, along with the visits counted against it.',
      label: 'The number to remove',
      submit: 'Remove it',
      // Deliberately identical whether or not anything was found. Two different
      // answers would make this screen a way to ask "does this person eat here".
      done: 'Done. If that number was here, it and its visits are gone.',
    },
    consent: {
      heading: `${BRAND.name} ${BRAND.tagline}`,
      body: 'A game while your food cooks, and it lasts as long as the food does. No account, no app, no email.',
      // DPDP purpose limitation: say what is stored, before anything is stored.
      privacy:
        'We record which table played and what you won, so your server can bring it. Nothing else, and nothing yet.',
      accept: 'Start',
    },
    /**
     * Before the fire (§9.1). The clock starts when the kitchen starts the
     * order, so there is genuinely nothing to do yet — and the copy says that
     * plainly rather than offering a disabled mystery. It also promises the
     * page wakes itself, because the alternative is a table staring at a screen
     * wondering whether it has broken.
     */
    waiting: {
      heading: 'Your food hasn’t hit the fire yet.',
      body: 'A clock starts the moment the kitchen starts your order. Beat it and you win something off this menu. Keep this page open — it wakes up on its own.',
      notYet: 'Nothing to do yet',
    },
    // Which table are you at? Shown after a venue QR scan, before consent.
    // Nothing is recorded on this screen — it is a list of links.
    tablePicker: {
      heading: 'Which table are you at?',
      body: "It's on the little card or the edge of the table.",
      tableLabel: (label: string) => `Table ${label}`,
      noTables: 'Nothing set up here yet. Enjoy your meal.',
    },
    review: {
      heading: 'How was it?',
      body: 'Say it in your own words — good, bad, or complicated. It goes to Google in your name, not through us.',
      draftLabel: 'Your words',
      draftPlaceholder: 'What you ate, how it felt, whether you’d come back…',
      copyHint: 'Copy your words first — Google opens in a new page and you paste them there.',
      handOff: 'Open Google reviews',
      decline: 'No thanks',
      noPlaceId: 'This venue hasn’t linked its Google profile yet — tell them in person instead.',
      entry: 'On your way out — tell people how it went',
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
      // No venue picker here, deliberately: a list of venues is a list of every
      // restaurant that is a customer.
      needsVenueLink: 'Open your venue’s own floor link to sign in. Your manager has it.',
      venueHeading: (venueName: string) => `Sign in — ${venueName}`,
    },
    tables: {
      heading: 'Tables',
      empty: 'No tables seated yet.',
      tented: 'Tented',
      control: 'Control',
      fireOrder: 'Fire order',
      fired: (time: string) => `Fired ${time}`,
      // Optional refinement, collapsed by default. The estimate takes the
      // quickest course fired, because that is the plate that interrupts the
      // guest — so naming the courses only ever makes the run shorter and
      // safer, never longer.
      partySize: 'How many people?',
      coursesToggle: 'Courses',
      coursesHint: 'Optional — sharpens the timing',
      course: (category: string) => category.charAt(0).toUpperCase() + category.slice(1),
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

    /**
     * The kill switch (§7.4). Deliberately not a fourth load state — RED is a
     * kitchen condition, this is an operator decision. The copy says what
     * carries on, because a chef who thinks this stops the pilot will not use
     * it until it is too late to matter.
     */
    kill: {
      off: 'Stop all prizes',
      on: 'Prizes stopped — tap to resume',
      offNote: 'Stops every offer and award at once. The game and tonight’s numbers carry on.',
      onNote: 'No prizes are being offered. Guests still play, and tonight still gets measured.',
    },

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
      // A pool per game the venue is running. The two genuinely differ — a
      // mystery plate is a fixed price, so different items qualify — and the
      // chef is the one person who has to know what is actually being given
      // away. Only shown when there is more than one, so a venue running a
      // single game keeps the plain list it had.
      gameKitchenRound: 'Kitchen round',
      gameMysteryPlate: 'Mystery plate',
      noGames: 'No game is on. Nothing is being offered.',
    },
  },

  dash: {
    /**
     * The two tiers (§6.4). Told apart by label and a dashed underline, never
     * by colour, and never averaged into one figure — an average of a measured
     * number and an estimated one has no defensible meaning, and defensible is
     * the entire pitch.
     */
    tier: {
      appEstimate: 'App estimate',
      posBacked: 'Point-of-sale backed',
      appCaveat:
        "Spend above each table's own baseline, minus prize cost at cost price. Blind to cash tips, to walk-ins with no history, and to what these tables would have ordered anyway.",
      posCaveat:
        'Measured from your own bill export against the same-weekday baseline. Prize cost is at cost price.',
      billsCounted: (n: number) =>
        n === 1 ? '1 bill imported for this service.' : `${n} bills imported for this service.`,
      editAssumption: 'Edit that assumption',
    },

    ledger: {
      heading: 'Tonight, table by table',
      table: 'Table',
      result: 'Result',
      prize: 'Prize',
      prizeCost: 'Prize cost',
      extraSpend: 'Extra spend',
      net: 'Net',
      totals: 'Totals',
    },

    /**
     * The refusal log. Listed second and set louder than the cleared column —
     * what the engine refused is the product, and the operator can read it back
     * the next morning and argue with it.
     */
    refusals: {
      clearedHeading: 'Cleared tonight',
      refusedHeading: 'Refused, and why',
      none: 'Nothing recorded for this service.',
      link: 'See what the engine refused',
    },

    engagement: {
      heading: 'Engagement',
      runs: 'Table runs',
      tented: 'Tables tented',
      scanRate: 'Scan rate',
      completion: 'Completion',
      devicesPerRun: 'Phones per table',
      foodArrived: 'Ended: food arrived',
    },
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
        playedSessions: number
        claimedSessions: number
      }) =>
        `${f.tentedTables} tented · ${f.scannedTables} scanned · ${f.playedSessions} played · ${f.claimedSessions} claimed`,
    },
    games: {
      heading: 'Games',
      body: 'Turn a game off and new rounds stop offering it. A round already in progress finishes normally.',
      on: 'On',
      off: 'Off',
      turnOn: 'Turn on',
      turnOff: 'Turn off',
      beatTheKitchen: 'Beat the Kitchen',
      beatTheKitchenBlurb:
        'Higher or lower on your own menu, against the kitchen’s clock. The one game the pilot runs.',
      kitchenRound: 'Kitchen round',
      kitchenRoundBlurb: 'The guest races the kitchen and wins something off your menu.',
      mysteryPlate: 'Mystery plate',
      mysteryPlateBlurb:
        'Same questions, different stake — the guest wins the right to buy tonight’s chef’s pick at your fixed price.',
      allOffWarning: 'Every game is off. Guests see the same screen a closed venue shows.',
    },
    empty: 'No service running.',
    gamesNav: 'Games',
    menuNav: 'Menu',
    prizesNav: 'Prizes',
    importNav: 'Bills',
    settingsNav: 'Settings',
    feedbackNav: 'Feedback',
    reviewFunnel: {
      heading: 'Google review prompt',
      body: 'Every table that reaches the end of its visit is offered this — whether they played, won, lost, or never scanned at all. There is no reward for it and no way to switch it off for an unhappy table.',
      shown: 'Offered',
      opened: 'Opened',
      handedOff: 'Sent to Google',
      openRate: 'Opened',
      handOffRate: 'Sent on',
      // The limit is stated rather than implied. Counting hand-offs as reviews
      // would be the flattering lie, and the one a buyer would catch.
      caveat:
        'We can’t see whether they posted — nobody can, without reading reviews, and we don’t. This is how many guests we sent, not how many reviews you got.',
    },
    feedback: {
      heading: 'What guests told you',
      // The distinction is the product, so it is said on the screen rather than
      // only in a doc: this is private, and it is not the Google prompt.
      body: 'Sent straight to you, not to Google. Nobody else sees it, and nothing here decides whether a guest was asked to leave a public review.',
      empty: 'Nothing yet tonight.',
      table: (label: string) => `Table ${label}`,
      noTable: 'No table',
      rating: (n: number) => `${n} out of 5`,
      noRating: 'No rating given',
      count: (n: number) => (n === 1 ? '1 note' : `${n} notes`),
    },
    settings: {
      heading: 'Venue settings',
      body: 'The details that aren’t your menu and aren’t your fences.',
      saved: 'Saved.',
      save: 'Save',
      review: {
        heading: 'Google reviews',
        body: 'At the end of every visit we offer the guest a screen to write a review in their own words, and hand them off to your Google page. Without this, that hand-off has nowhere to go and the screen tells them to say it in person instead.',
        label: 'Your Google Place ID',
        placeholder: 'ChIJ…',
        help: 'Find it with Google’s Place ID Finder — search your restaurant’s name and copy the ID it shows. You can also paste a link that already has the ID in it.',
        finderLink: 'Open the Place ID Finder',
        finderUrl:
          'https://developers.google.com/maps/documentation/places/web-service/place-id',
        linked: 'Linked. The review screen hands guests off to your page.',
        notLinked: 'Not linked yet. Guests still see the review screen; it just can’t send them anywhere.',
        clearHint: 'Clear the field and save to unlink.',
        preview: 'Where guests are sent',
        errShortLink:
          'That looks like a Google short link, which doesn’t contain a Place ID. The “ask for reviews” link from your Business Profile won’t work here — use the Place ID Finder below to get the ID itself.',
        errNotPlaceId:
          'That isn’t a Place ID. It should be one unbroken string of letters, digits, dashes and underscores.',
      },
    },
    import: {
      heading: 'Bill import',
      body: 'Your end-of-day export is the measured truth. The moment it lands, the dashboard headline stops being an estimate.',
      fileLabel: 'End-of-day export (CSV)',
      submit: 'Import bills',
      columnsHeading: 'Which column is which',
      columnsBody: 'Every point-of-sale names them differently. Set these once to match your export’s header row.',
      colExternalRef: 'Bill number column',
      colPosRef: 'Table column',
      colClosedAt: 'Close time column',
      colTotal: 'Total column',
      colCovers: 'Covers column (optional)',
      colItemName: 'Item name column (optional)',
      colItemQty: 'Item qty column (optional)',
      colItemPrice: 'Item price column (optional)',
      result: (imported: number, duplicate: number, rejected: number, unattributed: number) =>
        `${imported} imported · ${duplicate} already imported · ${rejected} rejected rows · ${unattributed} outside any service`,
      failed: 'That file could not be read as a bill export. Check the column names against the header row.',
      noService: 'No service overlaps those bills. Open a service first, or check the close-time column.',
      unjoinedHeading: 'Bills with no table yet',
      unjoinedBody:
        'These imported, but their table reference isn’t mapped. Map each reference once and every bill carrying it joins — nothing is ever dropped.',
      unjoinedCount: (n: number) => (n === 1 ? '1 bill unmapped' : `${n} bills unmapped`),
      mapLabel: (posRef: string) => `“${posRef}” is table`,
      mapSubmit: 'Map',
      mappingsHeading: 'Table mappings',
      mappingsNone: 'No mappings yet. They build up as you map unjoined bills.',
      historyHeading: 'Historical baseline',
      historyBody:
        'Pre-launch nights from your own records, so Saturday compares to Saturday. Columns: date, covers, tables, total, attached — dates day-first.',
      historyFile: 'Baseline CSV',
      historySubmit: 'Import baseline',
      historyResult: (n: number) => `${n} nights imported.`,
      historyFailed: 'That baseline file could not be read.',
      ticketsSoFar: (n: number) => (n === 1 ? '1 bill on record' : `${n} bills on record`),
    },
    prizes: {
      heading: 'Prizes and fences',
      body: 'Every number here is yours. The engine optimises inside these fences and never past them — change one and the next round plays by it, no redeploy.',
      saved: 'Saved.',
      invalid: 'One of those numbers could not be read. Nothing was changed.',
      save: 'Save',
      round: {
        heading: 'Round shape',
        ladderRungs: 'Rungs on the ladder',
        ladderRungsHelp: 'Also the most prizes a single run can put in play.',
        startingLives: 'Lives a table starts with',
        gamblePenaltyRungs: 'Rungs lost on a wrong answer',
        pairGapRatio: 'Pairing gap ratio',
        pairGapRatioHelp:
          'A question is only asked when one dish outsells the other by at least this multiple. Higher means easier, more defensible questions.',
        velocityWindowDays: 'Sales window (days)',
        velocityWindowDaysHelp: 'How far back "which sells more" looks.',
        countdownBufferSec: 'Countdown buffer (seconds)',
        countdownBufferSecHelp: 'The round ends this long before the food is due.',
        untimedAfterSec: 'Run untimed after (seconds)',
        untimedAfterSecHelp:
          'If the floor never fires the order, the game runs untimed rather than not at all.',
        livesHeading: 'Extra lives',
        lifeForAddOn: 'An add-on earns a life',
        lifeForPhone: 'Leaving a phone number earns a life',
        lifeForFeedback: 'Private feedback earns a life',
      },
      fences: {
        heading: 'Prize fences',
        depthCapPerItemPct: 'Deepest discount on any item (%)',
        depthCapPerItemPctHelp: '100 allows a free item. 40 means nothing deeper than 40% off.',
        depthCapPerServiceRupees: 'Most conceded in one service (₹)',
        depthCapPerServiceRupeesHelp: 'Prize cost across the whole night stops here.',
        mysteryPlateRupees: 'Mystery plate price (₹)',
        fallbackItem: 'Zero-kitchen fallback prize',
        fallbackItemHelp:
          'Something the bar pours or the counter hands over. Offered when the fences empty the pool — a guest must never win nothing.',
        fallbackNone: 'None set',
      },
      prep: {
        heading: 'Prep minutes by category',
        body: 'What the countdown runs on when the floor fires an order. Your own numbers, not ours.',
        defaultLabel: 'When no course is named (minutes)',
        categoryLabel: (category: string) => `${category} (minutes)`,
      },
      peak: {
        heading: 'Peak window',
        start: 'Peak starts',
        end: 'Peak ends',
        help: 'Rules can differ inside the window — the engine reads it, you define it.',
      },
      loyalty: {
        heading: 'Returning guests',
        body: 'A guest can leave a phone number after their go. It earns the table another go, and after enough visits it earns them something off your menu — chosen by the same engine and held behind the same fences as a game prize. We store a scrambled version of the number, for your restaurant only.',
        enabled: 'Run a stamp card',
        enabledHelp:
          'Off by default. It changes who comes back, so a venue measuring an arm split should turn it on deliberately rather than find it running.',
        visitsRequired: 'Visits that earn a reward',
        visitsRequiredHelp:
          'Counted from the last reward, not from their first visit — so changing this never hands out a round of prizes to your regulars.',
        rewardMaxRupees: 'Most one reward may give away (₹)',
        rewardMaxRupeesHelp:
          'On top of your per-item and per-service caps, never instead of them.',
        expiryDays: 'Forget a guest after (days)',
        expiryDaysHelp:
          'A number nobody has used in this long is deleted on the Monday sweep. There is no reason to keep it.',
      },
      gates: {
        heading: 'Pilot gates',
        body: 'The thresholds the pilot is judged against. Editable because they are yours to set — not editable mid-argument.',
        attachDeltaGatePp: 'Attach-rate delta to proceed (pp)',
        ticketDeltaKillPct: 'Ticket delta kill line (%)',
        ticketDeltaProceedPct: 'Ticket delta proceed line (%)',
        scanRateKillPct: 'Scan rate kill line (%)',
        scanRateGoodPct: 'Scan rate good line (%)',
        completionRateGatePct: 'Completion rate gate (%)',
        reviewVelocityGateX: 'Review velocity gate (×)',
      },
      weights: {
        heading: 'Pool ranking weights',
        body: 'How tonight’s pool is ordered. Positive pushes an item up, negative down. The thresholds decide when a weight fires.',
        notSelling: 'Not selling at all',
        slowMover: 'Slow mover',
        fastMoverPenalty: 'Fast mover (penalty)',
        stale: 'Sitting since days ago',
        lowPrepBonus: 'Low prep burden (bonus)',
        highPrepPenalty: 'High prep burden (penalty)',
        slowMoverMaxUnits: 'Slow means at most (units)',
        fastMoverMinUnits: 'Fast means at least (units)',
        staleMinDays: 'Stale means at least (days)',
      },
      vetoes: {
        heading: 'Chef vetoes',
        body: 'What the pass has vetoed tonight. Clearable here too — but the chef wins arguments about the kitchen.',
        none: 'Nothing vetoed.',
        clear: 'Clear veto',
      },
      pool: {
        heading: 'Tonight’s pool',
        body: 'The same decision the pass sees and the next guest gets — every entry and every refusal with its reason.',
        noService: 'No service open, so this is the pool the next service would start with.',
        inLabel: 'IN',
        outLabel: 'OUT',
        empty: 'Nothing clears the fences right now.',
      },
    },
    menu: {
      heading: 'Menu',
      body: 'Everything the game deals and every prize the engine considers comes off this list. Edits show on the pass on its next refresh.',
      addHeading: 'Add an item',
      empty: 'No menu items yet.',
      emptyHint: 'Add your first item, or import a CSV.',
      count: (n: number) => (n === 1 ? '1 item' : `${n} items`),
      inactiveCount: (n: number) => `${n} deactivated`,
      nameLabel: 'Item',
      categoryLabel: 'Category',
      priceLabel: 'Price ₹',
      costLabel: 'Food cost ₹',
      contribution: 'Contribution',
      contributionHelp: 'Price minus food cost — the number the engine protects.',
      marginLabel: 'Margin tier',
      prepLabel: 'Prep burden',
      kitchenWorkLabel: 'Needs the kitchen',
      kitchenWorkHelp: 'Suppressed as a prize while the pass shows RED.',
      heroLabel: 'Hero item',
      heroHelp: 'Never discounted, never a prize. Your signatures live here.',
      save: 'Save',
      add: 'Add item',
      deactivate: 'Deactivate',
      reactivate: 'Reactivate',
      deactivateNote: (name: string) =>
        `Deactivate ${name}? It stops being offered as a prize. Past awards keep their record.`,
      inactiveHeading: 'Deactivated',
      invalid: 'Give the item a name, a price, and what it costs you.',
      costOverPrice: 'Food cost is higher than the price. Check the numbers.',
      saved: 'Saved.',
    },
  },
} as const

export type Strings = typeof en
