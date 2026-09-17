// scripts/swapImageUrls.js
// Replaces all http://localhost:3000/images/:id URLs in MongoDB
// with the Railway production URL.
//
// Run:  NODE_PATH=./server/node_modules node scripts/swapImageUrls.js

const { MongoClient } = require('mongodb');

const ATLAS_URI   = 'mongodb+srv://jrehurst7:FmFml9ohKDtGBh36@needcluster1.3mhquys.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME     = 'Need';
const OLD_BASE    = 'http://localhost:3000';
const NEW_BASE    = 'https://needs-v1-9-4-26-production.up.railway.app';

const COLLECTIONS_IMAGE_FIELDS = {
  Users:        ['profilePicture', 'profileImageUrl'],
  Restaurants:  ['coverImageUrl', 'logoUrl', 'portfolioImageUrls'],
  Services:     ['portfolioImageUrls', 'logoUrl'],
  Nonprofits:   ['logoUrl'],
  NeedRequests: ['mediaUri'],
  UploadedItems:['images'],
};

function swap(val) {
  if (!val || typeof val !== 'string') return null;
  if (!val.startsWith(OLD_BASE)) return null;
  return NEW_BASE + val.slice(OLD_BASE.length);
}

async function run() {
  const client = new MongoClient(ATLAS_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  let totalUpdated = 0;

  for (const [colName, fields] of Object.entries(COLLECTIONS_IMAGE_FIELDS)) {
    const col  = db.collection(colName);
    const docs = await col.find({}).toArray();

    for (const doc of docs) {
      const updates = {};

      for (const field of fields) {
        const val = doc[field];
        if (Array.isArray(val)) {
          const newArr = val.map(v => swap(v) || v);
          if (JSON.stringify(newArr) !== JSON.stringify(val)) updates[field] = newArr;
        } else {
          const newVal = swap(val);
          if (newVal) updates[field] = newVal;
        }
      }

      if (Object.keys(updates).length) {
        await col.updateOne({ _id: doc._id }, { $set: updates });
        console.log(`  Updated ${colName} ${doc._id}:`, updates);
        totalUpdated++;
      }
    }
  }

  console.log(`\nDone — ${totalUpdated} documents updated.`);
  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
