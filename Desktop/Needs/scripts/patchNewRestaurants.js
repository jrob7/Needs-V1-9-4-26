// scripts/patchNewRestaurants.js
// Patches the 4 new restaurants with tagline, description, priceRange, goodToKnow
// Run: node scripts/patchNewRestaurants.js
const NODE_API = 'https://needs-v1-9-4-26-production.up.railway.app';

const PATCHES = [
  {
    email: 'smokehouse.bbq@needsapp.io',
    password: 'SmokeHouse@2024!',
    updates: {
      tagline: 'Low & slow, the way BBQ was meant to be.',
      description: 'Smoke House BBQ brings authentic Southern-style barbecue to LA. Every rack of ribs and every brisket is rubbed, smoked low and slow over oak and hickory for 12–16 hours, and served fresh off the pit.',
      priceRange: '$$',
      goodToKnow: [
        'Meats smoked low and slow for 12–16 hours over oak and hickory',
        'House-made sauces: sweet honey BBQ, spicy chipotle, and tangy vinegar',
        'Family platters and catering available — feeds 10 to 100+',
        'Sell out early on weekends — arrive before 7PM',
      ],
    },
  },
  {
    email: 'olivezaatar.med@needsapp.io',
    password: 'OliveZaatar@2024!',
    updates: {
      tagline: 'Fresh, bold flavors from the Mediterranean coast.',
      description: 'Olive & Zaatar brings the warmth of Mediterranean cooking to Los Angeles — hand-rolled falafel, slow-roasted shawarma, and vibrant salads made fresh daily with imported spices and locally sourced produce.',
      priceRange: '$$',
      goodToKnow: [
        'Halal certified — all meats sourced from halal suppliers',
        'Fresh pita bread baked in-house every morning',
        'Fully vegetarian and vegan options available',
        'Imported spices and olive oil from Lebanon and Greece',
      ],
    },
  },
  {
    email: 'siambite.thai@needsapp.io',
    password: 'SiamBite@2024!',
    updates: {
      tagline: 'Authentic Thai flavors, straight from Bangkok.',
      description: 'Siam Bite brings the bold, aromatic flavors of Thai street food and traditional cuisine to LA. From wok-tossed pad thai to rich red and green curries, every dish is made from scratch using imported Thai ingredients.',
      priceRange: '$$',
      goodToKnow: [
        'Spice level customizable: mild, medium, hot, or Thai hot',
        'Gluten-free and vegetarian options clearly marked on menu',
        'Authentic recipes sourced from family kitchens in Bangkok',
        'Thai iced tea and fresh coconut drinks available',
      ],
    },
  },
  {
    email: 'phoviet.viet@needsapp.io',
    password: 'PhoViet@2024!',
    updates: {
      tagline: 'A bowl of pho made with 24 hours of love.',
      description: 'Pho Viet is a family-owned Vietnamese restaurant bringing the soul of Saigon to Los Angeles. Our bone broth simmers for 24 hours, our banh mi is built on freshly baked baguettes, and our spring rolls are hand-rolled daily.',
      priceRange: '$',
      goodToKnow: [
        'Bone broth slow-simmered for 24 hours — never from concentrate',
        'Open early at 9AM — perfect for breakfast pho',
        'Vietnamese iced coffee and boba served all day',
        'Family-owned and operated — recipes passed down three generations',
      ],
    },
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
  console.log('🍽️  Patching new restaurant profiles...\n');
  for (const p of PATCHES) {
    try {
      const token = await login(p.email, p.password);

      const meRes = await fetch(`${NODE_API}/myRestaurant`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) throw new Error(`myRestaurant failed ${meRes.status}`);
      const rest = await meRes.json();
      const id = rest._id;

      const res = await fetch(`${NODE_API}/restaurants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(p.updates),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(JSON.stringify(e)); }
      console.log(`  ✅ ${p.email.split('@')[0]}`);
    } catch (e) {
      console.error(`  ❌ ${p.email}: ${e.message}`);
    }
  }
  console.log('\n✅ Done');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
