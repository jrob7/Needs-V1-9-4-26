// scripts/seedNewRestaurants.js
// Adds 4 new restaurant profiles: Smoke House BBQ, Olive & Zaatar,
// Siam Bite Thai, Pho Viet Vietnamese
// Run: node scripts/seedNewRestaurants.js
const NODE_API = 'https://needs-v1-9-4-26-production.up.railway.app';

const RESTAURANTS = [
  {
    email: 'smokehouse.bbq@needsapp.io',
    password: 'SmokeHouse@2024!',
    name: 'Smoke House BBQ',
    cuisine: 'BBQ',
    address: '820 Smokehouse Ln, Los Angeles, CA 90003',
    phone: '(213) 555-1112',
    hoursOpen: 'Wed–Thu 11AM–9PM, Fri–Sat 11AM–10PM, Sun 11AM–8PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
    topDishes: [
      { name: 'Brisket',              imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=80' },
      { name: 'Ribs',                 imageUrl: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&q=80' },
      { name: 'Pulled Pork Sandwich', imageUrl: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400&q=80' },
    ],
  },
  {
    email: 'olivezaatar.med@needsapp.io',
    password: 'OliveZaatar@2024!',
    name: 'Olive & Zaatar Mediterranean Kitchen',
    cuisine: 'Mediterranean',
    address: '415 Olive Branch Ave, Los Angeles, CA 90036',
    phone: '(323) 555-1213',
    hoursOpen: 'Mon–Thu 11AM–10PM, Fri–Sat 11AM–11PM, Sun 12PM–9PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=800&q=80',
    topDishes: [
      { name: 'Chicken Shawarma', imageUrl: 'https://images.unsplash.com/photo-1561043433-aaf687c4cf04?w=400&q=80' },
      { name: 'Falafel Plate',    imageUrl: 'https://images.unsplash.com/photo-1590598016693-d0e2a95e5c52?w=400&q=80' },
      { name: 'Greek Salad',      imageUrl: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&q=80' },
    ],
  },
  {
    email: 'siambite.thai@needsapp.io',
    password: 'SiamBite@2024!',
    name: 'Siam Bite Thai Cuisine',
    cuisine: 'Thai',
    address: '310 Bangkok Blvd, Los Angeles, CA 90014',
    phone: '(213) 555-1314',
    hoursOpen: 'Tue–Sun 11:30AM–10PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&q=80',
    topDishes: [
      { name: 'Pad Thai',       imageUrl: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400&q=80' },
      { name: 'Drunken Noodles',imageUrl: 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=400&q=80' },
      { name: 'Red Curry',      imageUrl: 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=400&q=80' },
    ],
  },
  {
    email: 'phoviet.viet@needsapp.io',
    password: 'PhoViet@2024!',
    name: 'Pho Viet Vietnamese Cuisine',
    cuisine: 'Vietnamese',
    address: '528 Saigon St, Los Angeles, CA 90021',
    phone: '(213) 555-1415',
    hoursOpen: 'Mon–Sun 9AM–9PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800&q=80',
    topDishes: [
      { name: 'Pho',         imageUrl: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=400&q=80' },
      { name: 'Banh Mi',     imageUrl: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=80' },
      { name: 'Spring Rolls',imageUrl: 'https://images.unsplash.com/photo-1534482421-64566f976cfa?w=400&q=80' },
    ],
  },
];

async function seed() {
  const results = [];

  for (const r of RESTAURANTS) {
    console.log(`\n🍽️  Creating: ${r.name}`);

    // 1. Register business user
    const regRes = await fetch(`${NODE_API}/createUser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: r.email,
        password: r.password,
        accountType: 'business',
        businessType: 'restaurant',
      }),
    });
    const regData = await regRes.json();
    if (!regRes.ok) {
      console.error(`  ❌ User creation failed: ${regData.error}`);
      results.push({ name: r.name, email: r.email, status: 'FAILED: ' + regData.error });
      continue;
    }
    const token = regData.token;
    const userId = regData._id;
    console.log(`  ✅ User created: ${userId}`);

    // 2. Create restaurant profile
    const restRes = await fetch(`${NODE_API}/createRestaurant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name:         r.name,
        cuisine:      r.cuisine,
        address:      r.address,
        phone:        r.phone,
        hoursOpen:    r.hoursOpen,
        coverImageUrl:r.coverImageUrl,
        topDishes:    r.topDishes,
      }),
    });
    const restData = await restRes.json();
    if (!restRes.ok) {
      console.error(`  ❌ Restaurant creation failed: ${restData.error}`);
      results.push({ name: r.name, email: r.email, userId, status: 'FAILED restaurant: ' + restData.error });
      continue;
    }
    console.log(`  ✅ Restaurant created: ${restData._id}`);
    results.push({ name: r.name, email: r.email, password: r.password, userId, restaurantId: restData._id, status: 'OK' });
  }

  console.log('\n\n========================================');
  console.log('  SEED RESULTS');
  console.log('========================================');
  for (const r of results) {
    const icon = r.status === 'OK' ? '✅' : '❌';
    console.log(`${icon}  ${r.name}`);
    console.log(`     Email:    ${r.email}`);
    console.log(`     Password: ${r.password || 'N/A'}`);
    if (r.userId)       console.log(`     UserID:   ${r.userId}`);
    if (r.restaurantId) console.log(`     RestID:   ${r.restaurantId}`);
    if (r.status !== 'OK') console.log(`     Error:    ${r.status}`);
    console.log('');
  }
}

seed().catch(err => { console.error('Fatal error:', err); process.exit(1); });
