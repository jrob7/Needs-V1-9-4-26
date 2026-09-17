// scripts/patchGoodToKnow.js
// Patches goodToKnow tips for all 10 restaurants
// Run: node scripts/patchGoodToKnow.js
const NODE_API = 'https://needs-v1-9-4-26-production.up.railway.app';

const RESTAURANTS = [
  {
    email: 'elsol.mexican@needsapp.io',
    password: 'ElSol@2024!',
    restaurantId: '6aab405a82318581b0404c0b',
    goodToKnow: [
      'Tortillas are made fresh in-house daily',
      'Vegetarian and vegan substitutions available on all items',
      'Happy hour margaritas Mon–Fri 3–6PM',
      'Street parking available on Atlantic Ave',
      'Large group reservations accepted for parties of 8+',
    ],
  },
  {
    email: 'thelocal.american@needsapp.io',
    password: 'TheLocal@2024!',
    restaurantId: '6aab405c82318581b0404c0d',
    goodToKnow: [
      'All burgers made with 100% Angus beef, never frozen',
      'Gluten-free buns available upon request',
      'Full bar with 20+ craft beers on tap',
      'Dog-friendly patio seating available',
      'Brunch served Saturday and Sunday 10AM–2PM',
    ],
  },
  {
    email: 'lucas.italian@needsapp.io',
    password: 'LucasPizza@2024!',
    restaurantId: '6aab405e82318581b0404c0f',
    goodToKnow: [
      'Wood-fired oven imported from Naples, Italy',
      'Dough is slow-fermented for 48 hours for authentic flavor',
      'Extensive Italian wine list — ask your server for pairings',
      'Reservations strongly recommended on weekends',
      'Private dining room available for events up to 20 guests',
    ],
  },
  {
    email: 'dragonwok.chinese@needsapp.io',
    password: 'DragonWok@2024!',
    restaurantId: '6aab405f82318581b0404c11',
    goodToKnow: [
      'MSG-free cooking available — just ask when ordering',
      'Dim sum served weekends 10AM–2PM only',
      'Dishes can be adjusted for spice level (mild to extra hot)',
      'Family-style platters available for groups of 4+',
      'Online ordering available for pickup — skip the wait',
    ],
  },
  {
    email: 'sora.japanese@needsapp.io',
    password: 'SoraJapan@2024!',
    restaurantId: '6aab406082318581b0404c13',
    goodToKnow: [
      'Fish is delivered fresh daily from the LA fish market',
      'Omakase (chef\'s selection) available with 24-hour advance notice',
      'Gluten-free soy sauce available for those with sensitivities',
      'Sake and Japanese whisky selection curated in-house',
      'Seats fill fast on Friday and Saturday — reservations recommended',
    ],
  },
  {
    email: 'sunrise.cafe@needsapp.io',
    password: 'Sunrise@2024!',
    restaurantId: '6aab406182318581b0404c15',
    goodToKnow: [
      'All eggs are locally sourced and cage-free',
      'Oat milk, almond milk, and soy milk available at no extra charge',
      'Avocado toast can be topped with poached egg or smoked salmon',
      'Wait times can be 20–30 min on weekend mornings — worth it!',
      'Loyalty card — buy 9 coffees, get the 10th free',
    ],
  },
  {
    email: 'burgerexpress@needsapp.io',
    password: 'BurgerExp@2024!',
    restaurantId: '6aab406282318581b0404c17',
    goodToKnow: [
      'Drive-through open until midnight Sunday through Thursday',
      'Kids meal includes toy and juice box',
      'Secret menu available — ask the cashier what\'s on it',
      'All meals can be made with plant-based patty substitute',
      'Combo meals save up to 20% vs ordering items separately',
    ],
  },
  {
    email: 'cluckhouse@needsapp.io',
    password: 'CluckHouse@2024!',
    restaurantId: '6aab406382318581b0404c19',
    goodToKnow: [
      'Chicken is marinated for 24 hours before frying',
      'Nashville hot and honey butter glazed options available',
      'Bone-in and boneless wings available in 6, 12, and 24 packs',
      'Grilled options available for calorie-conscious diners',
      'Family packs (feeds 4–6) available — great value for groups',
    ],
  },
  {
    email: 'thedock.seafood@needsapp.io',
    password: 'TheDock@2024!',
    restaurantId: '6aab406482318581b0404c1b',
    goodToKnow: [
      'Seafood sourced daily from local Long Beach docks',
      'Oyster happy hour Tue–Fri 4–6PM — $1.50 per oyster',
      'Waterfront patio with views of the harbor',
      'Live Maine lobster flown in fresh on Fridays',
      'Allergen menu available — ask your server for details',
    ],
  },
  {
    email: 'smokeoak.bbq@needsapp.io',
    password: 'SmokeOak@2024!',
    restaurantId: '6aab406582318581b0404c1d',
    goodToKnow: [
      'Meats are smoked low and slow for 12–16 hours over oak wood',
      'Brisket and ribs sell out early — arrive before 7PM to guarantee availability',
      'All sauces made in-house: sweet, tangy, and Carolina vinegar',
      'Catering available for events and office parties',
      'Wednesday is All-You-Can-Eat Ribs Night starting at 5PM',
    ],
  },
];

async function login(email, password) {
  const res = await fetch(`${NODE_API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed ${res.status}`);
  return (await res.json()).token;
}

async function run() {
  console.log('🍽️  Patching Good to Know sections...\n');

  for (const r of RESTAURANTS) {
    try {
      const token = await login(r.email, r.password);
      const res = await fetch(`${NODE_API}/restaurants/${r.restaurantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goodToKnow: r.goodToKnow }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      console.log(`  ✅ ${r.email.split('@')[0]}`);
      r.goodToKnow.forEach(tip => console.log(`       • ${tip}`));
      console.log('');
    } catch (e) {
      console.error(`  ❌ ${r.email}: ${e.message}`);
    }
  }

  console.log('✅ All Good to Know sections updated');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
