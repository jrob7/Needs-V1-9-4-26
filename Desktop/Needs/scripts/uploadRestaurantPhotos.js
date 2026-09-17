// scripts/uploadRestaurantPhotos.js
// Downloads every Unsplash image, uploads to GridFS, patches restaurant docs
// Run: node scripts/uploadRestaurantPhotos.js
const https = require('https');
const http  = require('http');

const NODE_API = 'https://needs-v1-9-4-26-production.up.railway.app';

const RESTAURANTS = [
  {
    email: 'elsol.mexican@needsapp.io',
    password: 'ElSol@2024!',
    restaurantId: '6aab405a82318581b0404c0b',
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
    restaurantId: '6aab405c82318581b0404c0d',
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
    restaurantId: '6aab405e82318581b0404c0f',
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
    restaurantId: '6aab405f82318581b0404c11',
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
    restaurantId: '6aab406082318581b0404c13',
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
    restaurantId: '6aab406182318581b0404c15',
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
    restaurantId: '6aab406282318581b0404c17',
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
    restaurantId: '6aab406382318581b0404c19',
    coverImageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=800&q=80',
    topDishes: [
      { name: 'Fried Chicken',   imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&q=80' },
      { name: 'Wings',           imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400&q=80' },
      { name: 'Grilled Chicken', imageUrl: 'https://images.unsplash.com/photo-1604503468506-a8da13d11d36?w=400&q=80' },
    ],
  },
  {
    email: 'thedock.seafood@needsapp.io',
    password: 'TheDock@2024!',
    restaurantId: '6aab406482318581b0404c1b',
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
    restaurantId: '6aab406582318581b0404c1d',
    coverImageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80',
    topDishes: [
      { name: 'Brisket',     imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=80' },
      { name: 'Ribs',        imageUrl: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&q=80' },
      { name: 'Pulled Pork', imageUrl: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&q=80' },
    ],
  },
];

// Download a URL and return a Buffer
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Upload a Buffer to GridFS, returns 24-char ObjectId string
async function uploadToGridFS(buffer) {
  const base64 = buffer.toString('base64');
  const res = await fetch(`${NODE_API}/uploadImage`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: base64,
  });
  if (!res.ok) throw new Error(`uploadImage failed: ${res.status}`);
  const { imageUrl } = await res.json();
  return imageUrl; // 24-char ObjectId
}

// Login and return JWT token
async function login(email, password) {
  const res = await fetch(`${NODE_API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function run() {
  for (const r of RESTAURANTS) {
    console.log(`\n🍽️  ${r.email}`);

    // Login
    let token;
    try {
      token = await login(r.email, r.password);
      console.log('  ✅ Logged in');
    } catch (e) {
      console.error('  ❌ Login failed:', e.message);
      continue;
    }

    // Upload cover
    let newCover;
    try {
      process.stdout.write('  📸 cover... ');
      const buf = await downloadBuffer(r.coverImageUrl);
      newCover = await uploadToGridFS(buf);
      console.log(`✅ ${newCover}`);
    } catch (e) {
      console.error(`❌ ${e.message}`);
      newCover = r.coverImageUrl; // fallback to original URL
    }

    // Upload each dish
    const newDishes = [];
    for (const dish of r.topDishes) {
      try {
        process.stdout.write(`  📸 ${dish.name}... `);
        const buf = await downloadBuffer(dish.imageUrl);
        const id = await uploadToGridFS(buf);
        console.log(`✅ ${id}`);
        newDishes.push({ name: dish.name, imageUrl: id });
      } catch (e) {
        console.error(`❌ ${e.message}`);
        newDishes.push({ name: dish.name, imageUrl: dish.imageUrl });
      }
    }

    // Patch restaurant doc
    try {
      const patchRes = await fetch(`${NODE_API}/restaurants/${r.restaurantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          coverImageUrl: newCover,
          topDishes: newDishes,
        }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        console.error('  ❌ Patch failed:', err.error);
      } else {
        console.log('  ✅ Restaurant doc updated');
      }
    } catch (e) {
      console.error('  ❌ Patch error:', e.message);
    }
  }

  console.log('\n\n✅ All done — all images now live in GridFS');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
