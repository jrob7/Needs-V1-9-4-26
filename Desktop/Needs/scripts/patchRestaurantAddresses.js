// scripts/patchRestaurantAddresses.js
// Updates the 4 new restaurants to Long Beach addresses
// Run: node scripts/patchRestaurantAddresses.js
const NODE_API = 'https://needs-v1-9-4-26-production.up.railway.app';

const PATCHES = [
  {
    email: 'smokehouse.bbq@needsapp.io',
    password: 'SmokeHouse@2024!',
    updates: { address: '2150 Pacific Ave, Long Beach, CA 90806' },
  },
  {
    email: 'olivezaatar.med@needsapp.io',
    password: 'OliveZaatar@2024!',
    updates: { address: '550 Pine Ave, Long Beach, CA 90802' },
  },
  {
    email: 'siambite.thai@needsapp.io',
    password: 'SiamBite@2024!',
    updates: { address: '1200 E Broadway, Long Beach, CA 90802' },
  },
  {
    email: 'phoviet.viet@needsapp.io',
    password: 'PhoViet@2024!',
    updates: { address: '400 W Willow St, Long Beach, CA 90806' },
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('📍 Patching restaurant addresses to Long Beach...\n');
  for (const p of PATCHES) {
    try {
      const token = await login(p.email, p.password);
      const meRes = await fetch(`${NODE_API}/myRestaurant`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) throw new Error(`myRestaurant failed ${meRes.status}`);
      const rest = await meRes.json();

      const res = await fetch(`${NODE_API}/restaurants/${rest._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(p.updates),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(JSON.stringify(e)); }
      console.log(`  ✅ ${p.email.split('@')[0]} → ${p.updates.address}`);
    } catch (e) {
      console.error(`  ❌ ${p.email}: ${e.message}`);
    }
    await sleep(1500); // Nominatim rate limit: 1 req/s
  }
  console.log('\n✅ Done');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
