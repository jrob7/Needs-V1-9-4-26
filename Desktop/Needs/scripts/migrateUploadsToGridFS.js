// scripts/migrateUploadsToGridFS.js
// Uploads every file in server/uploads/ to MongoDB GridFS (images bucket)
// and rewrites all DB references from local paths/filenames to /images/:id URLs.
//
// Run once:  node scripts/migrateUploadsToGridFS.js
// Safe to re-run: files already in GridFS (matched by filename) are skipped.

const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const fs   = require('fs');
const path = require('path');

const ATLAS_URI  = 'mongodb+srv://jrehurst7:FmFml9ohKDtGBh36@needcluster1.3mhquys.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME    = 'Need';
const NODE_API   = 'https://your-node-service.up.railway.app'; // ← update after Railway deploy
const UPLOADS_DIR = path.join(__dirname, '../server/uploads');

const COLLECTIONS_IMAGE_FIELDS = {
  Users:        ['profilePicture', 'profileImageUrl'],
  Restaurants:  ['coverImageUrl', 'logoUrl', 'portfolioImageUrls'],
  Services:     ['portfolioImageUrls', 'logoUrl'],
  Nonprofits:   ['logoUrl'],
  NeedRequests: ['mediaUri'],
  UploadedItems:['images'],
};

async function run() {
  const client = new MongoClient(ATLAS_URI);
  await client.connect();
  const db     = client.db(DB_NAME);
  const bucket = new GridFSBucket(db, { bucketName: 'images' });

  // ── Step 1: upload all files, build filename → GridFS URL map ───────────────
  const files     = fs.readdirSync(UPLOADS_DIR).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
  const urlMap    = {}; // filename → full /images/:id URL

  console.log(`\nFound ${files.length} files in uploads/\n`);

  for (const filename of files) {
    // Check if already uploaded
    const existing = await bucket.find({ filename }).toArray();
    if (existing.length) {
      const id = existing[0]._id.toString();
      urlMap[filename] = `${NODE_API}/images/${id}`;
      console.log(`  SKIP  ${filename} (already in GridFS → ${id})`);
      continue;
    }

    const filepath = path.join(UPLOADS_DIR, filename);
    const ext      = path.extname(filename).toLowerCase();
    const mimeMap  = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
    const mime     = mimeMap[ext] || 'image/jpeg';

    await new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(filename, { contentType: mime });
      uploadStream.on('error', reject);
      uploadStream.on('finish', () => {
        const id = uploadStream.id.toString();
        urlMap[filename] = `${NODE_API}/images/${id}`;
        console.log(`  ✅  ${filename} → ${id}`);
        resolve();
      });
      fs.createReadStream(filepath).pipe(uploadStream);
    });
  }

  console.log(`\nUploaded ${Object.keys(urlMap).length} files.\n`);

  // ── Step 2: rewrite DB references ───────────────────────────────────────────
  // Patterns that indicate a local reference (not already an https:// URL):
  //   - bare filename: "img_123.jpg" or "burner_logo.png"
  //   - localhost path: "http://localhost:3000/uploads/img_123.jpg"
  const toGridFSUrl = (val) => {
    if (!val || typeof val !== 'string') return null;
    if (val.startsWith('https://') && val.includes('/images/')) return null; // already migrated
    // strip any localhost prefix
    const bare = val.replace(/^https?:\/\/[^/]+\/uploads\//, '');
    return urlMap[bare] || null;
  };

  let totalUpdated = 0;

  for (const [colName, fields] of Object.entries(COLLECTIONS_IMAGE_FIELDS)) {
    const col  = db.collection(colName);
    const docs = await col.find({}).toArray();

    for (const doc of docs) {
      const updates = {};

      for (const field of fields) {
        const val = doc[field];
        if (Array.isArray(val)) {
          const newArr = val.map(v => toGridFSUrl(v) || v);
          if (JSON.stringify(newArr) !== JSON.stringify(val)) updates[field] = newArr;
        } else {
          const newVal = toGridFSUrl(val);
          if (newVal) updates[field] = newVal;
        }
      }

      if (Object.keys(updates).length) {
        await col.updateOne({ _id: doc._id }, { $set: updates });
        console.log(`  📝  ${colName} ${doc._id} →`, updates);
        totalUpdated++;
      }
    }
  }

  console.log(`\n✅ Done — ${totalUpdated} DB documents updated.`);
  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
