// scripts/geocodeBusinesses.js
// One-time migration: geocode all existing Services, Restaurants, and Nonprofits
// and ensure 2dsphere indexes exist on each collection.
//
// Run with:  node scripts/geocodeBusinesses.js
// Nominatim rate limit: 1 req/s — the script respects this automatically.
// Safe to re-run: already-geocoded docs are skipped.

const { MongoClient } = require('mongodb');
const https = require('https');

const ATLAS_URI =
  'mongodb+srv://jrehurst7:FmFml9ohKDtGBh36@needcluster1.3mhquys.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME = 'test';

// ── Nominatim geocoder ────────────────────────────────────────────────────────
function nominatimGeocode(addressText) {
  return new Promise((resolve) => {
    if (!addressText || !addressText.trim()) return resolve(null);
    const q = encodeURIComponent(addressText.trim());
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
    const options = { headers: { 'User-Agent': 'NeedsApp-Migration/1.0 (jrehurst7@gmail.com)' } };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results.length > 0) {
            resolve({
              type: 'Point',
              coordinates: [parseFloat(results[0].lon), parseFloat(results[0].lat)],
            });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Process one collection ────────────────────────────────────────────────────
async function processCollection(col, addressField, labelField) {
  // Ensure 2dsphere index
  try {
    await col.createIndex({ geoPoint: '2dsphere' });
    console.log(`  ✅ 2dsphere index ensured on ${col.collectionName}`);
  } catch (e) {
    console.log(`  ⚠️  Index already exists or failed: ${e.message}`);
  }

  // Find docs without geoPoint
  const docs = await col.find({ geoPoint: { $exists: false } }).toArray();
  console.log(`  Found ${docs.length} un-geocoded docs in ${col.collectionName}`);

  let success = 0, failed = 0;
  for (const doc of docs) {
    const address = doc[addressField] || doc.address || doc.serviceArea || '';
    const label   = doc[labelField]   || doc._id.toString();
    if (!address.trim()) {
      console.log(`    SKIP  ${label} — no address field`);
      failed++;
      continue;
    }

    const geoPoint = await nominatimGeocode(address);
    if (geoPoint) {
      await col.updateOne({ _id: doc._id }, { $set: { geoPoint } });
      console.log(`    ✅  ${label} → [${geoPoint.coordinates}]`);
      success++;
    } else {
      console.log(`    ❌  ${label} — geocode failed for: "${address}"`);
      failed++;
    }

    await sleep(1100); // Nominatim: max 1 req/s
  }

  return { success, failed };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const client = new MongoClient(ATLAS_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    console.log('Connected to MongoDB\n');

    console.log('── Restaurants ──────────────────────────────');
    const r = await processCollection(db.collection('Restaurants'), 'address', 'name');

    console.log('\n── Services ─────────────────────────────────');
    const s = await processCollection(db.collection('Services'), 'businessAddress', 'businessName');

    console.log('\n── Nonprofits ───────────────────────────────');
    const n = await processCollection(db.collection('Nonprofits'), 'address', 'orgName');

    console.log('\n══ Done ══════════════════════════════════════');
    console.log(`Restaurants: ${r.success} geocoded, ${r.failed} skipped/failed`);
    console.log(`Services:    ${s.success} geocoded, ${s.failed} skipped/failed`);
    console.log(`Nonprofits:  ${n.success} geocoded, ${n.failed} skipped/failed`);
  } finally {
    await client.close();
  }
})();
