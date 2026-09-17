// scripts/seedRestaurants.js
// Run: node scripts/seedRestaurants.js
const NODE_API = 'https://needs-v1-9-4-26-production.up.railway.app';

const RESTAURANTS = [
  {
    email: 'elsol.mexican@needsapp.io',
    password: 'ElSol@2024!',
    name: 'El Sol Mexican Cuisine',
    cuisine: 'Mexican',
    address: '1234 Sunset Blvd, Los Angeles, CA 90028',
    phone: '(323) 555-0101',
    hoursOpen: 'Mon–Thu 11AM–10PM, Fri–Sat 11AM–11PM, Sun 12PM–9PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80',
    topDishes: [
      { name: 'Tacos',      imageUrl: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&q=80' },
      { name: 'Burrito',    imageUrl: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&q=80' },
      { name: 'Enchiladas', imageUrl: 'https://images.unsplash.com/photo-1534352956036-cd81e27dd615?w=400&q=80' },
    ],
  },
  {
    email: 'thelocal.american@needsapp.io',
    password: 'TheLocal@2024!',
    name: 'The Local American Eats',
    cuisine: 'American',
    address: '456 Main St, Los Angeles, CA 90012',
    phone: '(213) 555-0202',
    hoursOpen: 'Mon–Fri 11AM–10PM, Sat–Sun 10AM–11PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80',
    topDishes: [
      { name: 'Burger',        imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80' },
      { name: 'Sandwich',      imageUrl: 'https://images.unsplash.com/photo-1539252554453-80ab65ce3586?w=400&q=80' },
      { name: 'Grilled Steak', imageUrl: 'https://images.unsplash.com/photo-1546964124-0cce460f38ef?w=400&q=80' },
    ],
  },
  {
    email: 'lucas.italian@needsapp.io',
    password: 'LucasPizza@2024!',
    name: "Luca's Pizza Pasta Vino",
    cuisine: 'Italian',
    address: '789 Olive Ave, Los Angeles, CA 90017',
    phone: '(213) 555-0303',
    hoursOpen: 'Tue–Thu 12PM–10PM, Fri–Sat 12PM–11PM, Sun 12PM–9PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    topDishes: [
      { name: 'Pizza',   imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80' },
      { name: 'Pasta',   imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&q=80' },
      { name: 'Lasagna', imageUrl: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=400&q=80' },
    ],
  },
  {
    email: 'dragonwok.chinese@needsapp.io',
    password: 'DragonWok@2024!',
    name: 'Dragon Wok Chinese Cuisine',
    cuisine: 'Chinese',
    address: '321 Broadway, Los Angeles, CA 90012',
    phone: '(213) 555-0404',
    hoursOpen: 'Mon–Sun 11AM–10PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800&q=80',
    topDishes: [
      { name: 'Orange Chicken', imageUrl: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&q=80' },
      { name: 'Fried Rice',     imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&q=80' },
      { name: 'Dim Sum',        imageUrl: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&q=80' },
    ],
  },
  {
    email: 'sora.japanese@needsapp.io',
    password: 'SoraJapan@2024!',
    name: 'Sora Japanese Cuisine',
    cuisine: 'Japanese',
    address: '654 Little Tokyo Way, Los Angeles, CA 90012',
    phone: '(213) 555-0505',
    hoursOpen: 'Tue–Sun 12PM–10PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&q=80',
    topDishes: [
      { name: 'Sushi',   imageUrl: 'https://images.unsplash.com/photo-1617196034183-421b4040ed20?w=400&q=80' },
      { name: 'Ramen',   imageUrl: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=400&q=80' },
      { name: 'Tempura', imageUrl: 'https://images.unsplash.com/photo-1559410545-0bdcd187e0a6?w=400&q=80' },
    ],
  },
  {
    email: 'sunrise.cafe@needsapp.io',
    password: 'Sunrise@2024!',
    name: 'Sunrise Cafe Breakfast & Brunch',
    cuisine: 'Breakfast',
    address: '987 Morning Dr, Los Angeles, CA 90028',
    phone: '(323) 555-0606',
    hoursOpen: 'Mon–Fri 7AM–3PM, Sat–Sun 7AM–4PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=800&q=80',
    topDishes: [
      { name: 'Pancakes',        imageUrl: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&q=80' },
      { name: 'Breakfast Plate', imageUrl: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400&q=80' },
      { name: 'Avocado Toast',   imageUrl: 'https://images.unsplash.com/photo-1541519227354-08fa5d50c820?w=400&q=80' },
    ],
  },
  {
    email: 'burgerexpress@needsapp.io',
    password: 'BurgerExp@2024!',
    name: 'Burger Express',
    cuisine: 'Fast Food',
    address: '147 Fast Lane, Los Angeles, CA 90001',
    phone: '(213) 555-0707',
    hoursOpen: 'Mon–Sun 10AM–11PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=800&q=80',
    topDishes: [
      { name: 'Cheeseburger',    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80' },
      { name: 'French Fries',    imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&q=80' },
      { name: 'Chicken Nuggets', imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80' },
    ],
  },
  {
    email: 'cluckhouse@needsapp.io',
    password: 'CluckHouse@2024!',
    name: 'Cluck House – Chicken Done Right',
    cuisine: 'Chicken',
    address: '258 Poultry Ave, Los Angeles, CA 90002',
    phone: '(213) 555-0808',
    hoursOpen: 'Mon–Sun 11AM–10PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=800&q=80',
    topDishes: [
      { name: 'Fried Chicken',  imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80' },
      { name: 'Wings',          imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400&q=80' },
      { name: 'Grilled Chicken',imageUrl: 'https://images.unsplash.com/photo-1604503468506-a8da13d11d36?w=400&q=80' },
    ],
  },
  {
    email: 'thedock.seafood@needsapp.io',
    password: 'TheDock@2024!',
    name: 'The Dock Seafood & Oyster Bar',
    cuisine: 'Seafood',
    address: '369 Shoreline Dr, San Pedro, CA 90731',
    phone: '(310) 555-0909',
    hoursOpen: 'Tue–Thu 12PM–9PM, Fri–Sat 12PM–10PM, Sun 12PM–8PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    topDishes: [
      { name: 'Grilled Salmon', imageUrl: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&q=80' },
      { name: 'Shrimp',         imageUrl: 'https://images.unsplash.com/photo-1559731409-6ce25d7b9a7a?w=400&q=80' },
      { name: 'Lobster',        imageUrl: 'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400&q=80' },
    ],
  },
  {
    email: 'smokeoak.bbq@needsapp.io',
    password: 'SmokeOak@2024!',
    name: 'The Smoke & Oak BBQ',
    cuisine: 'BBQ',
    address: '741 Pit Row, Los Angeles, CA 90003',
    phone: '(213) 555-1010',
    hoursOpen: 'Wed–Thu 11AM–9PM, Fri–Sat 11AM–10PM, Sun 11AM–8PM',
    coverImageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80',
    topDishes: [
      { name: 'Brisket',     imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=80' },
      { name: 'Ribs',        imageUrl: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&q=80' },
      { name: 'Pulled Pork', imageUrl: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&q=80' },
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
      results.push({ name: r.name, email: r.email, password: r.password, status: 'FAILED: ' + regData.error });
      continue;
    }
    const token = regData.token;
    const userId = regData._id;
    console.log(`  ✅ User created: ${userId}`);

    // 2. Create restaurant profile
    const restRes = await fetch(`${NODE_API}/createRestaurant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: r.name,
        cuisine: r.cuisine,
        address: r.address,
        phone: r.phone,
        hoursOpen: r.hoursOpen,
        coverImageUrl: r.coverImageUrl,
        topDishes: r.topDishes,
      }),
    });
    const restData = await restRes.json();
    if (!restRes.ok) {
      console.error(`  ❌ Restaurant creation failed: ${restData.error}`);
      results.push({ name: r.name, email: r.email, password: r.password, userId, status: 'FAILED restaurant: ' + restData.error });
      continue;
    }
    console.log(`  ✅ Restaurant created: ${restData._id}`);
    results.push({
      name: r.name,
      email: r.email,
      password: r.password,
      userId,
      restaurantId: restData._id,
      status: 'OK',
    });
  }

  console.log('\n\n========================================');
  console.log('  SEED RESULTS');
  console.log('========================================');
  for (const r of results) {
    const icon = r.status === 'OK' ? '✅' : '❌';
    console.log(`${icon}  ${r.name}`);
    console.log(`     Email:    ${r.email}`);
    console.log(`     Password: ${r.password}`);
    if (r.userId)       console.log(`     UserID:   ${r.userId}`);
    if (r.restaurantId) console.log(`     RestID:   ${r.restaurantId}`);
    if (r.status !== 'OK') console.log(`     Error:    ${r.status}`);
    console.log('');
  }
}

seed().catch(err => { console.error('Fatal error:', err); process.exit(1); });
