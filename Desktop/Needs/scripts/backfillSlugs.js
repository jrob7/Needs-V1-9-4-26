// scripts/backfillSlugs.js
// Generates a URL-safe slug for every Restaurant and Service that doesn't have one.
// Run once: node --require /Users/joshhurst/Desktop/Needs/server/node_modules/mongodb scripts/backfillSlugs.js
// OR:       cd server && node ../scripts/backfillSlugs.js
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb+srv://jrehurst7:FmFml9ohKDtGBh36@needcluster1.3mhquys.mongodb.net/?retryWrites=true&w=majority';

function makeSlug(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // strip special chars
    .trim()
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .slice(0, 80);                   // max length
}

async function ensureUniqueSlug(col, base, excludeId) {
  let slug = base;
  let n = 2;
  while (true) {
    const existing = await col.findOne({ slug, _id: { $ne: excludeId } });
    if (!existing) return slug;
    slug = `${base}-${n++}`;
  }
}

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('Need');

  for (const colName of ['Restaurants', 'Services']) {
    const col = db.collection(colName);
    const nameField = colName === 'Restaurants' ? 'name' : 'businessName';
    const docs = await col.find({ slug: { $exists: false } }).toArray();

    console.log(`\n${colName}: ${docs.length} without slug`);
    for (const doc of docs) {
      const base = makeSlug(doc[nameField] || doc.name || String(doc._id));
      const slug = await ensureUniqueSlug(col, base, doc._id);
      await col.updateOne({ _id: doc._id }, { $set: { slug } });
      console.log(`  ✅ ${doc[nameField] || doc._id} → ${slug}`);
    }
  }

  console.log('\n✅ Done');
  await client.close();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
