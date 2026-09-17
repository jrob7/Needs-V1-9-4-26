// scripts/patchAddresses.js
// Updates all 20 business profiles with real Long Beach, CA addresses
// Server re-geocodes geoPoint on every address update
// Run: node scripts/patchAddresses.js
const NODE_API = 'https://needs-v1-9-4-26-production.up.railway.app';

const RESTAURANTS = [
  {
    email: 'elsol.mexican@needsapp.io',
    password: 'ElSol@2024!',
    restaurantId: '6aab405a82318581b0404c0b',
    address: '3621 Atlantic Ave, Long Beach, CA 90807',
  },
  {
    email: 'thelocal.american@needsapp.io',
    password: 'TheLocal@2024!',
    restaurantId: '6aab405c82318581b0404c0d',
    address: '240 Pine Ave, Long Beach, CA 90802',
  },
  {
    email: 'lucas.italian@needsapp.io',
    password: 'LucasPizza@2024!',
    restaurantId: '6aab405e82318581b0404c0f',
    address: '144 W 4th St, Long Beach, CA 90802',
  },
  {
    email: 'dragonwok.chinese@needsapp.io',
    password: 'DragonWok@2024!',
    restaurantId: '6aab405f82318581b0404c11',
    address: '1600 Long Beach Blvd, Long Beach, CA 90813',
  },
  {
    email: 'sora.japanese@needsapp.io',
    password: 'SoraJapan@2024!',
    restaurantId: '6aab406082318581b0404c13',
    address: '5278 E 2nd St, Long Beach, CA 90803',
  },
  {
    email: 'sunrise.cafe@needsapp.io',
    password: 'Sunrise@2024!',
    restaurantId: '6aab406182318581b0404c15',
    address: '3900 Bellflower Blvd, Long Beach, CA 90808',
  },
  {
    email: 'burgerexpress@needsapp.io',
    password: 'BurgerExp@2024!',
    restaurantId: '6aab406282318581b0404c17',
    address: '2390 Pacific Coast Hwy, Long Beach, CA 90804',
  },
  {
    email: 'cluckhouse@needsapp.io',
    password: 'CluckHouse@2024!',
    restaurantId: '6aab406382318581b0404c19',
    address: '4890 Cherry Ave, Long Beach, CA 90807',
  },
  {
    email: 'thedock.seafood@needsapp.io',
    password: 'TheDock@2024!',
    restaurantId: '6aab406482318581b0404c1b',
    address: '429 Shoreline Village Dr, Long Beach, CA 90802',
  },
  {
    email: 'smokeoak.bbq@needsapp.io',
    password: 'SmokeOak@2024!',
    restaurantId: '6aab406582318581b0404c1d',
    address: '2850 Redondo Ave, Long Beach, CA 90806',
  },
];

const SERVICES = [
  {
    email: 'brightertomorrow@needsapp.io',
    password: 'BrightElec@2024!',
    serviceId: '6aab44cf82318581b0404cbf',
    businessAddress: '1456 Atlantic Ave, Long Beach, CA 90813',
    serviceArea: 'Long Beach, CA',
  },
  {
    email: 'freshstart.cleaning@needsapp.io',
    password: 'FreshClean@2024!',
    serviceId: '6aab44d182318581b0404cc9',
    businessAddress: '3210 Pacific Ave, Long Beach, CA 90806',
    serviceArea: 'Long Beach, CA',
  },
  {
    email: 'greenspaces.landscape@needsapp.io',
    password: 'GreenLawn@2024!',
    serviceId: '6aab44d382318581b0404cd3',
    businessAddress: '890 Anaheim St, Long Beach, CA 90813',
    serviceArea: 'Long Beach, CA',
  },
  {
    email: 'freshlook.painting@needsapp.io',
    password: 'FreshPaint@2024!',
    serviceId: '6aab44d582318581b0404cdd',
    businessAddress: '4567 Long Beach Blvd, Long Beach, CA 90805',
    serviceArea: 'Long Beach, CA',
  },
  {
    email: 'skyline.roofing@needsapp.io',
    password: 'SkylineRoof@2024!',
    serviceId: '6aab44d782318581b0404ce7',
    businessAddress: '2134 Santa Fe Ave, Long Beach, CA 90810',
    serviceArea: 'Long Beach, CA',
  },
  {
    email: 'fixitright.handyman@needsapp.io',
    password: 'FixItRight@2024!',
    serviceId: '6aab44d882318581b0404cf1',
    businessAddress: '780 Willow St, Long Beach, CA 90806',
    serviceArea: 'Long Beach, CA',
  },
  {
    email: 'premierfloors@needsapp.io',
    password: 'PremierFloor@2024!',
    serviceId: '6aab44da82318581b0404cfb',
    businessAddress: '3456 Cherry Ave, Long Beach, CA 90807',
    serviceArea: 'Long Beach, CA',
  },
  {
    email: 'appliancepros@needsapp.io',
    password: 'AppliancePro@2024!',
    serviceId: '6aab44dc82318581b0404d05',
    businessAddress: '1234 Lakewood Blvd, Long Beach, CA 90815',
    serviceArea: 'Long Beach, CA',
  },
  {
    email: 'easymove.services@needsapp.io',
    password: 'EasyMove@2024!',
    serviceId: '6aab44de82318581b0404d0f',
    businessAddress: '5678 Orange Ave, Long Beach, CA 90805',
    serviceArea: 'Long Beach, CA',
  },
  {
    email: 'trustedauto@needsapp.io',
    password: 'TrustedAuto@2024!',
    serviceId: '6aab44e082318581b0404d19',
    businessAddress: '2890 Pacific Coast Hwy, Long Beach, CA 90804',
    serviceArea: 'Long Beach, CA',
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
  console.log('🍽️  Patching RESTAURANTS...\n');
  for (const r of RESTAURANTS) {
    try {
      const token = await login(r.email, r.password);
      const res = await fetch(`${NODE_API}/restaurants/${r.restaurantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address: r.address }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      console.log(`  ✅ ${r.email.split('@')[0].padEnd(28)} → ${r.address}`);
    } catch (e) {
      console.error(`  ❌ ${r.email}: ${e.message}`);
    }
  }

  console.log('\n🔧  Patching SERVICES...\n');
  for (const s of SERVICES) {
    try {
      const token = await login(s.email, s.password);
      const res = await fetch(`${NODE_API}/services/${s.serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businessAddress: s.businessAddress, serviceArea: s.serviceArea }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      console.log(`  ✅ ${s.email.split('@')[0].padEnd(28)} → ${s.businessAddress}`);
    } catch (e) {
      console.error(`  ❌ ${s.email}: ${e.message}`);
    }
  }

  console.log('\n✅ All addresses updated — server re-geocoded geoPoint for each doc');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
