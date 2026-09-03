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
    notFoundHeading: "We couldn't find that page.",
    notFoundBody: 'It may have been moved, or the link may be expired.',
  },
  /**
   * The signed-in operator nav (desktop strip and mobile drawer share these).
   * Group labels only — the destination labels are the existing `dash.*Nav`
   * strings, so a link reads the same wherever it renders.
   */
  nav: {
    manage: 'Manage',
    insights: 'Insights',
    /** No dedicated performance page exists; the metrics live on the command center. */
    performance: 'Performance',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
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
        submitLoading: 'Reading my menu…',
        csvHint: 'CSV columns: name, category, price — and optionally cost. Prices in rupees.',
        // The generic catch-all, kept for the case every specific check missed.
        // Every other key in this block is a more useful version of the same
        // sentence — the action maps specific reasons to specific keys, and the
        // page renders the most helpful one.
        failed: 'That file could not be read. Try another photo, a CSV, or add items by hand.',
        empty: 'That file looks empty. Pick a photo, a PDF, or a CSV with at least one row.',
        tooLarge: 'That file is too large. The photo upload is capped at 8 MB — try a smaller one.',
        unsupported:
          'That file type isn’t supported. A photo (JPG/PNG), a PDF, or a CSV will all work.',
        csvHeader:
          'The CSV needs a header row. The first row must include at least "name" and "price".',
        csvEmpty:
          'No menu rows could be read from that CSV. Check the header and that the data is below it.',
        aiUnavailable:
          'Photo and PDF reading is not available right now. A CSV, or typing items in by hand, will still get you going.',
        aiAuth:
          'The menu reader rejected the API key (HTTP 401/403). Check GEMINI_API_KEY in your Vercel project’s environment variables, or use a CSV / add items by hand.',
        aiQuota:
          'The menu reader is rate-limited right now (HTTP 429). Wait a minute and try again, or use a CSV / add items by hand.',
        aiNotMenu:
          'This doesn’t look like a restaurant menu. Try a photo of a single page that has dish names and prices, or upload a CSV.',
        aiPartial:
          'The menu reader could not find any items on this page after a second pass. Try a clearer, well-lit photo, or a single page rather than a folded booklet.',
        aiFailed: 'The menu reader could not read this file. Try a clearer photo, a CSV, or add items by hand.',
        noItems: 'The menu reader didn’t find any items on that page. Try a different photo, or add items by hand.',
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
    notFound: {
      heading: "That link isn't working here.",
      body: 'It may have expired or been replaced. Ask your server to scan the table code again.',
    },
    error: {
      heading: 'The phone lost its thread.',
      body: 'Nothing is lost — your table knows where you were. Try again.',
    },
  },

  /**
   * The printed tent (REVAMP-BRIEF.md Part 6). Exists to get scanned; the
   * scripted line is the one the staff briefing uses, on the tent because the
   * tent is the only part guaranteed to reach the table.
   */
  tents: {
    heading: 'Table tents',
    intro: (n: number) =>
      `${n} ${n === 1 ? 'table' : 'tables'}. Print to A4 — four tents a sheet — cut along the solid lines, fold at the dashed one. Only tented tables can play: the tents are how the treatment arm is created, so put them out deliberately.`,
    print: 'Print',
    pitch: 'Scan it while you wait — you might win dessert',
    meta: 'No app, no signup',
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
    /**
     * The one list (REVAMP-BRIEF.md Part 6): what is waiting, oldest first.
     * A server holding three plates reads the top row and acts.
     */
    now: {
      heading: 'Now',
      empty: 'Nothing waiting.',
      fireAction: 'Fire order',
      fireDetail: 'Guests are waiting on the clock.',
      confirmAction: 'Confirm',
      ackAction: 'Ack',
      // The one-glance task type. A server scanning the list should know what
      // kind of row it is before reading the detail.
      typeOrder: 'Order',
      typeAddOn: 'Add-on',
      typePrize: 'Prize',
    },
    service: {
      none: 'No service running.',
      start: 'Start service',
      swap: 'Swap tented / control',
      end: 'End service',
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
    },
    addOns: {
      heading: 'Add-ons',
      hint: 'The guest asks out loud. Write it down here — the ticket and their extra go land together.',
      addTo: (tableLabel: string) => `Add to table ${tableLabel}`,
      line: (tableLabel: string, qty: number, itemName: string) =>
        `${tableLabel} — ${qty}× ${itemName}`,
      ack: 'Ack',
    },
    redemptions: {
      lineFree: (itemName: string) => `${itemName}, free`,
      // The percentage comes off the award row, so the server reads the number
      // the guest was actually shown rather than one we assumed.
      linePercent: (itemName: string, percent: number) => `${itemName}, ${percent}% off`,
      lineFixed: (itemName: string, price: string) => `${itemName} at ${price}`,
      confirm: 'Confirm',
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
      // Spelled out inside the control itself — the chef reads the state and
      // its meaning in the same glance, mid-service, three metres away.
      greenHelp: 'Everything on',
      amberHelp: 'Low-effort prizes only',
      redHelp: 'No prize that makes you cook',
    },
    pool: {
      heading: "Tonight's pool",
      hint: 'Tap to veto. Tap again to restore.',
      empty: 'Nothing in the pool right now.',
      inPool: 'In pool',
      vetoed: 'Vetoed',
      vetoedCount: (n: number) => `${n} vetoed`,
      fireMinutes: (m: number) => `${m} min fire`,
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
      time: 'Time',
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

    /**
     * The command center's service card and compact metric row. The metrics
     * are relabels of figures the dashboard already computed — nothing here
     * invents a number (PLATFORM.md §10).
     */
    service: {
      running: (time: string) => `Running since ${time}`,
      last: 'Last service',
      viewTonight: 'View tonight',
      end: 'End service',
      endConfirm: 'End tonight? Tables can still scan, but the dashboard stops being live.',
      gamesLabel: 'Games on',
      noGames: 'No games on.',
      tablesEngaged: 'Tables engaged',
      stopped: 'Prizes are stopped for tonight — the kitchen’s emergency stop is on.',
    },
    metrics: {
      tablesEngaged: 'Tables engaged',
      rewardsClaimed: 'Rewards claimed',
      addOns: 'Add-ons',
    },
    quickActions: {
      heading: 'Quick actions',
    },
    recent: {
      heading: 'Recent activity',
      empty: 'Nothing recorded yet tonight.',
      budgetLabel: 'Prize budget',
      budgetNote: 'Conceded so far tonight, against the per-service prize cap.',
      /** The event log, named for a reader who has never seen the schema. */
      eventLabels: {
        TENT_PRESENT: 'Tent recorded',
        SESSION_OPEN: 'Table scanned',
        CONSENT_GIVEN: 'Consent given',
        RUN_START: 'Round started',
        RUNG_REACHED: 'Rung reached',
        RUN_END: 'Round ended',
        DEVICE_SPENT: 'Second phone joined',
        LIFE_EARNED: 'Extra life earned',
        PRIZE_TAKEN: 'Prize taken',
        AWARD_REDEEMED: 'Prize confirmed',
        ADDON_REQUESTED: 'Add-on requested',
        ADDON_CONFIRMED: 'Add-on confirmed',
        ADDON_CANCELLED: 'Add-on cancelled',
        REVIEW_SHOWN: 'Review offered',
        REVIEW_OPENED: 'Review opened',
        REVIEW_HANDED_OFF: 'Review handed to Google',
      } as Record<string, string>,
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
      // ── Granular activity (Insights) ────────────────────────────────────
      summaryHeading: 'Summary',
      timelineHeading: 'Scans this service',
      timelineEmpty: 'No scans yet — the chart fills in as guests tap a QR.',
      timelineAxis: (start: string, end: string) => `${start} – ${end}`,
      mechanicHeading: 'What they played',
      mechanicNone: 'No rounds played yet.',
      addOnHeading: 'Add-ons',
      addOnLine: (requested: number, confirmed: number) =>
        `${confirmed} confirmed of ${requested} asked for`,
      addOnTotal: (formatted: string) => `${formatted} worth`,
      noAddOns: 'No add-ons asked for yet.',
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
        finderUrl: 'https://developers.google.com/maps/documentation/places/web-service/place-id',
        linked: 'Linked. The review screen hands guests off to your page.',
        notLinked:
          'Not linked yet. Guests still see the review screen; it just can’t send them anywhere.',
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
      columnsBody:
        'Every point-of-sale names them differently. Set these once to match your export’s header row.',
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
      failed:
        'That file could not be read as a bill export. Check the column names against the header row.',
      noService:
        'No service overlaps those bills. Open a service first, or check the close-time column.',
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
        rewardMaxRupeesHelp: 'On top of your per-item and per-service caps, never instead of them.',
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

    /**
     * The AI Assist areas (PLATFORM.md §6a). Everything the model produces is
     * a draft: labelled as one, editable, and live only once the operator
     * approves it. The copy never says the AI decided anything, because it
     * never did.
     */
    aiAssist: {
      heading: 'AI Assist',
      body: 'Drafts from the menu reader. Nothing here is live until you approve it.',
      draftBadge: 'AI DRAFT',
      approve: 'Approve',
      edit: 'Edit',
      reject: 'Reject',
      save: 'Save',
      cancel: 'Cancel',
      unavailable:
        'The AI reader is not configured on this deployment — CSV and typed entry still work.',
      failed: 'The AI reader could not finish that. Try again in a moment.',
      nothing: 'That draft is gone — it may have been decided from another screen.',
      menuChanged: 'The menu changed since that draft was written. Generate again.',
      generic: 'That draft could not be saved. Try again.',
      decided: (n: number) =>
        n === 1 ? '1 draft ready to review.' : `${n} drafts ready to review.`,

      menuBody:
        'One playful line per dish, drafted from your active menu. Approve the ones you want on the card.',
      menuGenerate: 'Generate descriptions',
      approvedLabel: 'On the card:',
      noItems: 'Add menu items first — descriptions are drafted from the active list.',

      gamesBody:
        'Candidate combinations, personas and game copy, built only from your active menu. Approving a combination adds it to the game; approving a persona adds its budget and cravings.',
      gamesSecretCta: 'Draft Secret Recipe combinations',
      gamesMysteryCta: 'Draft mystery customers',
      copySecretCta: 'Draft Secret Recipe copy',
      copyMysteryCta: 'Draft Mystery Customer copy',
      secretHeading: 'Secret Recipe candidates',
      mysteryHeading: 'Mystery customer candidates',
      copyHeading: 'Game copy',
      noGameCopy: 'No copy drafted yet.',
      noSecretsYet: 'No combinations drafted yet.',
      noPersonasYet: 'No personas drafted yet.',
      copyFor: (game: string) =>
        game === 'SECRET_RECIPE' ? 'Secret Recipe copy' : 'Mystery Customer copy',
      discoveryName: 'Discovery name',
      revealCopy: 'Reveal line',
      items: 'Items',
      reveals: 'Reveals',
      budget: 'Budget',
      craving: 'Cravings',
      appetite: 'Dishes',
      scenario: 'Scenario',
      intro: 'Intro',
      prompt: 'Prompt',
      discovery: 'Discovery',

      narrationHeading: 'Weekly narration',
      narrationBody:
        'Three sentences on this week’s own numbers. The AI may repeat them but never change them — anything it invents is refused before you see it.',
      narrationGenerate: 'Narrate this week',
      sentencesHint: 'One sentence per line, at most three.',
      noServices: 'No services in the last week to narrate.',
    },
  },

  /**
   * The /refer route — where "Refer a Restaurant" lands. The copy stays as
   * plain-spoken as the rest of the operator surfaces: nothing here promises
   * money or timelines we do not control, and every label names the thing it
   * labels. Error copy follows UI-SPEC's honesty rule — say what was wrong,
   * never tease.
   */
  refer: {
    eyebrow: 'Refer a restaurant',
    heading: 'Know a kitchen that should run this?',
    body: 'Send us a restaurant you think belongs on this platform. We call them ourselves — no drip campaign, no pitch deck — and your name goes down as the one who sent us.',
    fields: {
      restaurantLabel: 'Restaurant name',
      restaurantPlaceholder: 'e.g. Dilli Junction',
      locationLabel: 'Location',
      locationPlaceholder: 'City or locality',
      pocNameLabel: 'Who should we ask for?',
      pocNamePlaceholder: 'Full name',
      pocPhoneLabel: 'Their phone',
      pocPhoneHelp: 'The number our team actually calls. Include the country code if you have it.',
      pocRoleLabel: 'Their role / title',
      pocRolePlaceholder: 'Owner, GM, floor manager…',
      referrerNameLabel: 'Your name',
      referrerNamePlaceholder: 'So we know who to thank.',
      referrerContactLabel: 'Your contact',
      referrerContactHelp: 'Phone or email — only ever used to credit you or ask you one question.',
      submit: 'Send the referral',
      requiredNote: '* All fields are required.',
    },
    honeypotLabel: 'Leave this field empty',
    errorHeading: 'Almost there',
    errors: {
      RESTAURANT_NAME: 'Give the restaurant its name — two characters or more.',
      LOCATION: 'Where is it? A city or a locality is plenty.',
      POC_NAME: 'Tell us who to ask for by name.',
      POC_PHONE:
        'That phone number does not look dialable. Digits, spaces and a leading + are fine — for example +91 98765 43210.',
      POC_ROLE_TITLE: 'A role or title helps us open the right door.',
      REFERRER_NAME: 'Your name, however you like to be credited.',
      REFERRER_CONTACT: 'How do we reach you? A phone number or an email address.',
      RATE_LIMITED:
        'Too many referrals from this connection today. Try again tomorrow, or write to us directly.',
      GENERIC: 'Something went wrong at our end. Nothing was sent — please try again.',
    } as Record<string, string>,
    success: {
      heading: 'Thank you — the referral is ours now.',
      body: 'We will ring them within two working days. If they come aboard, the record already shows you sent them.',
      backHome: 'Back to the site',
    },
  },
} as const

export type Strings = typeof en
