import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { hashPin } from '../src/lib/pin'
import { createMenuItems, createStaff, createTables, createVenue } from '../src/lib/venue-setup'

/**
 * Seeds one realistic Delhi casual-dining venue.
 *
 * Every number here is an *estimate to be edited in /dash*, not a constant
 * (PLATFORM.md §10). Prices and food costs are plausible for a mid-market
 * Delhi restaurant; the owner corrects them in twenty minutes on day one, and
 * nothing in the code changes when they do.
 */

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set — see .env.example')

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

type Seed = {
  name: string
  category: string
  price: number // rupees
  cost: number // rupees
  tier: 'HIGH' | 'MID' | 'LOW'
  prep: 'LOW' | 'MEDIUM' | 'HIGH'
  kitchen?: boolean
  hero?: boolean
}

/** ~40 items. The six marked `hero` are what actually sells and is never discounted. */
const MENU: Seed[] = [
  // Hero sellers — never discounted (PLATFORM.md §12)
  {
    name: 'Hyderabadi Chicken Biryani',
    category: 'mains',
    price: 449,
    cost: 190,
    tier: 'MID',
    prep: 'HIGH',
    hero: true,
  },
  {
    name: 'Butter Chicken',
    category: 'mains',
    price: 429,
    cost: 175,
    tier: 'MID',
    prep: 'MEDIUM',
    hero: true,
  },
  {
    name: 'Dal Makhani',
    category: 'mains',
    price: 329,
    cost: 95,
    tier: 'HIGH',
    prep: 'MEDIUM',
    hero: true,
  },
  {
    name: 'Paneer Tikka',
    category: 'starters',
    price: 349,
    cost: 130,
    tier: 'MID',
    prep: 'MEDIUM',
    hero: true,
  },
  {
    name: 'Garlic Naan',
    category: 'breads',
    price: 89,
    cost: 22,
    tier: 'HIGH',
    prep: 'LOW',
    hero: true,
  },
  {
    name: 'Masala Chai',
    category: 'beverages',
    price: 99,
    cost: 18,
    tier: 'HIGH',
    prep: 'LOW',
    hero: true,
  },

  // Starters
  {
    name: 'Korean Fried Chicken',
    category: 'starters',
    price: 389,
    cost: 145,
    tier: 'MID',
    prep: 'HIGH',
  },
  {
    name: 'Chilli Paneer',
    category: 'starters',
    price: 329,
    cost: 110,
    tier: 'MID',
    prep: 'MEDIUM',
  },
  {
    name: 'Tandoori Mushroom',
    category: 'starters',
    price: 299,
    cost: 88,
    tier: 'HIGH',
    prep: 'MEDIUM',
  },
  {
    name: 'Amritsari Fish Fry',
    category: 'starters',
    price: 419,
    cost: 195,
    tier: 'LOW',
    prep: 'HIGH',
  },
  {
    name: 'Hara Bhara Kebab',
    category: 'starters',
    price: 279,
    cost: 72,
    tier: 'HIGH',
    prep: 'MEDIUM',
  },
  {
    name: 'Chicken Malai Tikka',
    category: 'starters',
    price: 379,
    cost: 160,
    tier: 'MID',
    prep: 'HIGH',
  },
  { name: 'Papdi Chaat', category: 'starters', price: 199, cost: 42, tier: 'HIGH', prep: 'LOW' },
  { name: 'Masala Papad', category: 'starters', price: 129, cost: 24, tier: 'HIGH', prep: 'LOW' },

  // Mains
  { name: 'Rogan Josh', category: 'mains', price: 489, cost: 225, tier: 'LOW', prep: 'HIGH' },
  { name: 'Kadhai Paneer', category: 'mains', price: 359, cost: 128, tier: 'MID', prep: 'MEDIUM' },
  {
    name: 'Chicken Chettinad',
    category: 'mains',
    price: 439,
    cost: 185,
    tier: 'MID',
    prep: 'HIGH',
  },
  { name: 'Malai Kofta', category: 'mains', price: 339, cost: 105, tier: 'HIGH', prep: 'MEDIUM' },
  { name: 'Veg Pulao', category: 'mains', price: 279, cost: 68, tier: 'HIGH', prep: 'MEDIUM' },
  { name: 'Egg Curry', category: 'mains', price: 289, cost: 82, tier: 'HIGH', prep: 'MEDIUM' },
  { name: 'Mutton Keema Pav', category: 'mains', price: 459, cost: 210, tier: 'LOW', prep: 'HIGH' },

  // Breads and sides
  { name: 'Butter Roti', category: 'breads', price: 59, cost: 14, tier: 'HIGH', prep: 'LOW' },
  { name: 'Laccha Paratha', category: 'breads', price: 99, cost: 28, tier: 'HIGH', prep: 'LOW' },
  { name: 'Cheese Kulcha', category: 'breads', price: 129, cost: 44, tier: 'MID', prep: 'MEDIUM' },
  { name: 'Jeera Rice', category: 'sides', price: 189, cost: 42, tier: 'HIGH', prep: 'LOW' },
  { name: 'Boondi Raita', category: 'sides', price: 129, cost: 32, tier: 'HIGH', prep: 'LOW' },
  { name: 'Green Salad', category: 'sides', price: 149, cost: 38, tier: 'HIGH', prep: 'LOW' },

  // Desserts — the prize engine's natural hunting ground
  {
    name: 'Tiramisu',
    category: 'desserts',
    price: 299,
    cost: 86,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
  {
    name: 'Gulab Jamun',
    category: 'desserts',
    price: 179,
    cost: 44,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
  {
    name: 'Rasmalai',
    category: 'desserts',
    price: 199,
    cost: 58,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
  {
    name: 'Kulfi Falooda',
    category: 'desserts',
    price: 219,
    cost: 62,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
  {
    name: 'Gajar Ka Halwa',
    category: 'desserts',
    price: 189,
    cost: 55,
    tier: 'HIGH',
    prep: 'MEDIUM',
  },
  {
    name: 'Chocolate Brownie',
    category: 'desserts',
    price: 249,
    cost: 72,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
  {
    name: 'Baked Cheesecake',
    category: 'desserts',
    price: 329,
    cost: 105,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },

  // Beverages
  {
    name: 'Sweet Lassi',
    category: 'beverages',
    price: 149,
    cost: 38,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
  {
    name: 'Fresh Lime Soda',
    category: 'beverages',
    price: 119,
    cost: 22,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
  {
    name: 'Cold Coffee',
    category: 'beverages',
    price: 189,
    cost: 48,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
  {
    name: 'Aam Panna',
    category: 'beverages',
    price: 159,
    cost: 34,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
  {
    name: 'Filter Coffee',
    category: 'beverages',
    price: 109,
    cost: 20,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
  {
    name: 'Buttermilk',
    category: 'beverages',
    price: 89,
    cost: 18,
    tier: 'HIGH',
    prep: 'LOW',
    kitchen: false,
  },
]

/** Food-native questions. Nothing licensed, nothing that needs a rights holder. */
const QUESTIONS: Array<{ prompt: string; options: string[]; answer: number }> = [
  {
    prompt: 'Which spice gives biryani its yellow colour?',
    options: ['Saffron', 'Paprika', 'Cumin', 'Fennel'],
    answer: 0,
  },
  {
    prompt: 'Paneer is made by curdling milk with what?',
    options: ['Sugar', 'Lemon juice', 'Salt', 'Yeast'],
    answer: 1,
  },
  {
    prompt: 'Which of these is a leavened bread?',
    options: ['Roti', 'Naan', 'Papad', 'Puri'],
    answer: 1,
  },
  {
    prompt: 'Dal makhani is traditionally made with which lentil?',
    options: ['Toor', 'Moong', 'Urad', 'Masoor'],
    answer: 2,
  },
  {
    prompt: 'What does "tandoori" refer to?',
    options: ['A spice blend', 'A clay oven', 'A region', 'A cutting style'],
    answer: 1,
  },
  {
    prompt: 'Which is the hottest by Scoville rating?',
    options: ['Kashmiri chilli', 'Bhut jolokia', 'Guntur chilli', 'Byadgi chilli'],
    answer: 1,
  },
  {
    prompt: 'Rogan josh originates from which region?',
    options: ['Kerala', 'Kashmir', 'Gujarat', 'Bengal'],
    answer: 1,
  },
  {
    prompt: 'Garam masala literally means what?',
    options: ['Hot spice', 'Mixed spice', 'Ground spice', 'Sweet spice'],
    answer: 0,
  },
  {
    prompt: 'Which ingredient makes gulab jamun spongy?',
    options: ['Semolina', 'Khoya', 'Coconut', 'Rice flour'],
    answer: 1,
  },
  {
    prompt: 'Tiramisu is soaked in what?',
    options: ['Rum', 'Espresso', 'Orange juice', 'Milk'],
    answer: 1,
  },
  {
    prompt: 'Which is not a South Indian dish?',
    options: ['Dosa', 'Idli', 'Litti chokha', 'Uttapam'],
    answer: 2,
  },
  {
    prompt: 'Asafoetida is better known in Hindi as what?',
    options: ['Hing', 'Ajwain', 'Methi', 'Kalonji'],
    answer: 0,
  },
  {
    prompt: 'What gives butter chicken its orange colour?',
    options: ['Turmeric', 'Tomato and paprika', 'Saffron', 'Food colour only'],
    answer: 1,
  },
  {
    prompt: 'Which lentil cooks fastest?',
    options: ['Chana dal', 'Rajma', 'Moong dal', 'Urad whole'],
    answer: 2,
  },
  {
    prompt: 'Kulfi differs from ice cream because it is what?',
    options: ['Churned less', 'Frozen faster', 'Made with eggs', 'Always vegan'],
    answer: 0,
  },
  {
    prompt: 'Which is a fermented batter dish?',
    options: ['Paratha', 'Dhokla', 'Samosa', 'Pakora'],
    answer: 1,
  },
  {
    prompt: 'Cardamom belongs to which plant family?',
    options: ['Ginger', 'Pepper', 'Mint', 'Citrus'],
    answer: 0,
  },
  {
    prompt: 'What is "chaat masala" primarily flavoured with?',
    options: ['Black salt', 'Cinnamon', 'Clove', 'Nutmeg'],
    answer: 0,
  },
  {
    prompt: 'Which cut of bread is used for keema pav?',
    options: ['Baguette', 'Ladi pav', 'Focaccia', 'Brioche'],
    answer: 1,
  },
  {
    prompt: 'Ghee is what, exactly?',
    options: ['Whipped butter', 'Clarified butter', 'Butter substitute', 'Cultured cream'],
    answer: 1,
  },
]

async function main() {
  console.log('Seeding…')

  // A wipe is safe here because this only ever runs against a dev database.
  await db.$transaction([
    db.reviewPrompt.deleteMany(),
    db.addOnRequest.deleteMany(),
    db.award.deleteMany(),
    db.play.deleteMany(),
    db.guestSession.deleteMany(),
    db.orderFire.deleteMany(),
    db.ticket.deleteMany(),
    db.tableArmAssignment.deleteMany(),
    db.prizePool.deleteMany(),
    db.kitchenLoad.deleteMany(),
    db.chefVeto.deleteMany(),
    db.quizQuestion.deleteMany(),
    db.quizPack.deleteMany(),
    db.service.deleteMany(),
    db.table.deleteMany(),
    db.menuItem.deleteMany(),
    db.guestIdentity.deleteMany(),
    db.staffUser.deleteMany(),
    db.prizeRule.deleteMany(),
    db.magicLinkToken.deleteMany(),
    db.operatorUser.deleteMany(),
    db.venueConfig.deleteMany(),
    db.venue.deleteMany(),
  ])

  // The same function self-serve onboarding calls. If these two ever diverge,
  // the venue every test runs against stops resembling the ones real operators
  // create — so there is exactly one path, and a test asserts it.
  const venue = await createVenue(db, {
    name: 'The Pilot Kitchen',
    slug: 'pilot',
    timezone: 'Asia/Kolkata',
  })
  await db.venue.update({ where: { id: venue.id }, data: { onboardingStep: 'DONE' } })
  console.log(`  venue: ${venue.name}`)
  console.log('  prize rules: starting policy written, editable in /dash/prizes')

  await createMenuItems(
    db,
    venue.id,
    MENU.map((m) => ({
      name: m.name,
      category: m.category,
      pricePaise: m.price * 100,
      foodCostPaise: m.cost * 100,
      marginTier: m.tier,
      prepBurden: m.prep,
      requiresKitchenWork: m.kitchen ?? true,
      isHero: m.hero ?? false,
      // Deliberately varied so the prize engine has something to reason about:
      // heroes move, desserts do not. Replaced by real CSV data later.
      trailingSales: m.hero ? 40 : m.category === 'desserts' ? 1 : 8,
    }))
  )
  console.log(`  menu: ${MENU.length} items (${MENU.filter((m) => m.hero).length} heroes)`)

  await createTables(db, venue.id, 30, (i) => (i < 20 ? 4 : 2))
  console.log('  tables: 30, each with a unique QR token')

  const operatorEmail = process.env.SEED_OPERATOR_EMAIL ?? 'owner@example.com'
  await db.operatorUser.create({ data: { email: operatorEmail, venueId: venue.id, name: 'Owner' } })
  console.log(`  operator: ${operatorEmail} — sign in at /signin, link prints to this console`)

  const pack = await db.quizPack.create({
    data: { venueId: venue.id, name: 'Food basics', active: true },
  })
  await db.quizQuestion.createMany({
    data: QUESTIONS.map((q, i) => ({
      packId: pack.id,
      prompt: q.prompt,
      options: q.options,
      answerIndex: q.answer,
      difficulty: 1,
      orderHint: i,
    })),
  })
  console.log(`  quiz: ${QUESTIONS.length} questions`)

  // Dev PINs, scrypt-hashed like real ones. The venue sets its own before the
  // pilot; these exist so the floor and pass consoles are reachable today.
  await createStaff(db, venue.id, [
    { name: 'Floor', role: 'SERVER', pinHash: hashPin('1234') },
    { name: 'Kitchen', role: 'KITCHEN', pinHash: hashPin('5678') },
  ])
  console.log('  staff: floor PIN 1234, kitchen PIN 5678 (dev only — change before the pilot)')

  const tokens = await db.table.findMany({
    where: { venueId: venue.id },
    select: { label: true, qrToken: true },
    orderBy: { label: 'asc' },
    take: 3,
  })
  console.log('\nTry these:')
  console.log(`  venue QR:  /v/${venue.qrToken}   (pick a table, then play)`)
  for (const t of tokens) {
    console.log(`  table ${t.label}: /t/${t.qrToken}`)
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
