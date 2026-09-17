// scripts/uploadLocalPhotos.js
// Reads local PNGs, uploads to GridFS, patches all 10 restaurant docs
// Run: node scripts/uploadLocalPhotos.js
const fs   = require('fs');
const path = require('path');

const NODE_API  = 'https://needs-v1-9-4-26-production.up.railway.app';
const IMG_DIR   = path.join(process.env.HOME, 'Downloads/restaurant_module_40_images');

const RESTAURANTS = [
  {
    email: 'elsol.mexican@needsapp.io',
    password: 'ElSol@2024!',
    restaurantId: '6aab405a82318581b0404c0b',
    cover: '01_mexican_01_profile.png',
    dishes: [
      { name: 'Tacos',      file: '01_mexican_02_tacos.png' },
      { name: 'Burrito',    file: '01_mexican_03_burrito.png' },
      { name: 'Enchiladas', file: '01_mexican_04_enchiladas.png' },
    ],
  },
  {
    email: 'thelocal.american@needsapp.io',
    password: 'TheLocal@2024!',
    restaurantId: '6aab405c82318581b0404c0d',
    cover: '02_american_01_profile.png',
    dishes: [
      { name: 'Burger',        file: '02_american_02_burger.png' },
      { name: 'Sandwich',      file: '02_american_03_sandwich.png' },
      { name: 'Grilled Steak', file: '02_american_04_grilled_steak.png' },
    ],
  },
  {
    email: 'lucas.italian@needsapp.io',
    password: 'LucasPizza@2024!',
    restaurantId: '6aab405e82318581b0404c0f',
    cover: '03_pizza_italian_01_profile.png',
    dishes: [
      { name: 'Pizza',   file: '03_pizza_italian_02_pizza.png' },
      { name: 'Pasta',   file: '03_pizza_italian_03_pasta.png' },
      { name: 'Lasagna', file: '03_pizza_italian_04_lasagna.png' },
    ],
  },
  {
    email: 'dragonwok.chinese@needsapp.io',
    password: 'DragonWok@2024!',
    restaurantId: '6aab405f82318581b0404c11',
    cover: '04_chinese_01_profile.png',
    dishes: [
      { name: 'Orange Chicken', file: '04_chinese_02_orange_chicken.png' },
      { name: 'Fried Rice',     file: '04_chinese_03_fried_rice.png' },
      { name: 'Dim Sum',        file: '04_chinese_04_dim_sum.png' },
    ],
  },
  {
    email: 'sora.japanese@needsapp.io',
    password: 'SoraJapan@2024!',
    restaurantId: '6aab406082318581b0404c13',
    cover: '05_japanese_sushi_01_profile.png',
    dishes: [
      { name: 'Sushi',   file: '05_japanese_sushi_02_sushi.png' },
      { name: 'Ramen',   file: '05_japanese_sushi_03_ramen.png' },
      { name: 'Tempura', file: '05_japanese_sushi_04_tempura.png' },
    ],
  },
  {
    email: 'sunrise.cafe@needsapp.io',
    password: 'Sunrise@2024!',
    restaurantId: '6aab406182318581b0404c15',
    cover: '06_breakfast_brunch_01_profile.png',
    dishes: [
      { name: 'Pancakes',        file: '06_breakfast_brunch_02_pancakes.png' },
      { name: 'Breakfast Plate', file: '06_breakfast_brunch_03_breakfast_plate.png' },
      { name: 'Avocado Toast',   file: '06_breakfast_brunch_04_avocado_toast.png' },
    ],
  },
  {
    email: 'burgerexpress@needsapp.io',
    password: 'BurgerExp@2024!',
    restaurantId: '6aab406282318581b0404c17',
    cover: '07_fast_food_quick_service_01_profile.png',
    dishes: [
      { name: 'Cheeseburger',    file: '07_fast_food_quick_service_02_cheeseburger.png' },
      { name: 'French Fries',    file: '07_fast_food_quick_service_03_french_fries.png' },
      { name: 'Chicken Nuggets', file: '07_fast_food_quick_service_04_chicken_nuggets.png' },
    ],
  },
  {
    email: 'cluckhouse@needsapp.io',
    password: 'CluckHouse@2024!',
    restaurantId: '6aab406382318581b0404c19',
    cover: '08_chicken_01_profile.png',
    dishes: [
      { name: 'Fried Chicken',   file: '08_chicken_02_fried_chicken.png' },
      { name: 'Wings',           file: '08_chicken_03_wings.png' },
      { name: 'Grilled Chicken', file: '08_chicken_04_grilled_chicken.png' },
    ],
  },
  {
    email: 'thedock.seafood@needsapp.io',
    password: 'TheDock@2024!',
    restaurantId: '6aab406482318581b0404c1b',
    cover: '09_seafood_01_profile.png',
    dishes: [
      { name: 'Grilled Salmon', file: '09_seafood_02_grilled_salmon.png' },
      { name: 'Shrimp',         file: '09_seafood_03_shrimp.png' },
      { name: 'Lobster',        file: '09_seafood_04_lobster.png' },
    ],
  },
  {
    email: 'smokeoak.bbq@needsapp.io',
    password: 'SmokeOak@2024!',
    restaurantId: '6aab406582318581b0404c1d',
    cover: '10_bbq_01_profile.png',
    dishes: [
      { name: 'Brisket',     file: '10_bbq_02_brisket.png' },
      { name: 'Ribs',        file: '10_bbq_03_ribs.png' },
      { name: 'Pulled Pork', file: '10_bbq_04_pulled_pork.png' },
    ],
  },
];

async function uploadFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  const res = await fetch(`${NODE_API}/uploadImage`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: base64,
  });
  if (!res.ok) throw new Error(`uploadImage HTTP ${res.status}`);
  const { imageUrl } = await res.json();
  return imageUrl; // 24-char GridFS ObjectId
}

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
  for (const r of RESTAURANTS) {
    console.log(`\n🍽️  ${r.email}`);

    let token;
    try {
      token = await login(r.email, r.password);
      console.log('  ✅ Logged in');
    } catch (e) {
      console.error('  ❌ Login:', e.message);
      continue;
    }

    // Upload cover
    let coverId;
    try {
      process.stdout.write(`  📸 cover (${r.cover})... `);
      coverId = await uploadFile(path.join(IMG_DIR, r.cover));
      console.log(`✅ ${coverId}`);
    } catch (e) {
      console.error(`❌ ${e.message}`);
      continue;
    }

    // Upload dishes
    const topDishes = [];
    for (const d of r.dishes) {
      try {
        process.stdout.write(`  📸 ${d.name} (${d.file})... `);
        const id = await uploadFile(path.join(IMG_DIR, d.file));
        console.log(`✅ ${id}`);
        topDishes.push({ name: d.name, imageUrl: id });
      } catch (e) {
        console.error(`❌ ${e.message}`);
        topDishes.push({ name: d.name, imageUrl: '' });
      }
    }

    // Patch restaurant
    try {
      const patchRes = await fetch(`${NODE_API}/restaurants/${r.restaurantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ coverImageUrl: coverId, topDishes }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        console.error('  ❌ Patch:', err.error);
      } else {
        console.log('  ✅ Restaurant doc updated');
      }
    } catch (e) {
      console.error('  ❌ Patch error:', e.message);
    }
  }

  console.log('\n\n🎉 Done — all 40 images uploaded to GridFS and restaurant docs updated');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
