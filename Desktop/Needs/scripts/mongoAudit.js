// scripts/mongoAudit.js
// Read-only audit script. Run with:
//   mongosh "<your full connection string>" --quiet scripts/mongoAudit.js
// Does not use MONGO_URI from the environment - pass the connection string
// directly on the command line so this can be run ad hoc without .env setup.

const db = db.getSiblingDB("Need");

print("=== Collections and document counts ===");
db.getCollectionNames().sort().forEach(name => {
  print(`${name}: ${db.getCollection(name).countDocuments()}`);
});

print("\n=== Users created in the last 60 days (sanity check for unfamiliar accounts) ===");
db.Users.find(
  { createdAt: { $gte: new Date(Date.now() - 60*24*60*60*1000) } },
  { email: 1, firstName: 1, lastName: 1, createdAt: 1, isAdmin: 1, role: 1 }
).sort({ createdAt: -1 }).limit(50).forEach(u => printjson(u));

print("\n=== Any users with admin-like flags set (should only be you, if anyone) ===");
db.Users.find(
  { $or: [ { isAdmin: true }, { role: "admin" }, { admin: true } ] },
  { email: 1, firstName: 1, lastName: 1, isAdmin: 1, role: 1, admin: 1 }
).forEach(u => printjson(u));

print("\n=== Scan for suspicious content in text fields (script tags, shortened links, obvious spam) ===");
const suspiciousPattern = /<script|javascript:|bit\.ly|tinyurl|DROP\s+TABLE|\$where|eval\(/i;
const textCollections = {
  Services:       ["businessName", "description", "tagline"],
  Restaurants:    ["name", "description", "tagline"],
  NeedRequests:   ["searchText", "context"],
  Nonprofits:     ["orgName", "description"],
  Users:          ["firstName", "lastName", "email", "bio"],
};
Object.entries(textCollections).forEach(([coll, fields]) => {
  if (!db.getCollectionNames().includes(coll)) return;
  const or = fields.map(f => ({ [f]: { $regex: suspiciousPattern } }));
  const hits = db.getCollection(coll).find({ $or: or }).limit(20).toArray();
  if (hits.length) {
    print(`\n-- ${coll} (${hits.length} possible hits) --`);
    hits.forEach(h => printjson(h));
  }
});

print("\n=== Done ===");
