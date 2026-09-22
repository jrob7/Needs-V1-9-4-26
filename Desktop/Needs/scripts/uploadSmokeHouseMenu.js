// scripts/uploadSmokeHouseMenu.js
// Stores the full Smoke House BBQ menu as structured JSON in MongoDB.
// Run from server/ dir: node ../scripts/uploadSmokeHouseMenu.js
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb+srv://jrehurst7:FmFml9ohKDtGBh36@needcluster1.3mhquys.mongodb.net/?retryWrites=true&w=majority';

const MENU = [
  {
    section: "Pit Starters",
    items: [
      { name: "Burnt End Bites", description: "Caramelized brisket ends tossed in house sweet-heat BBQ sauce, served with pickles.", price: "$14" },
      { name: "Smoked Wings", description: "Eight jumbo wings dry-rubbed and smoked, then crisped. Choice of classic BBQ, hot honey, or Alabama white.", price: "$15" },
      { name: "Loaded Smokehouse Fries", description: "Seasoned fries piled with chopped brisket, cheddar, smoked queso, scallions, jalapeños, and BBQ drizzle.", price: "$16" },
      { name: "Cornbread Skillet", description: "Warm cast-iron cornbread with whipped honey butter and smoked sea salt.", price: "$8" },
      { name: "BBQ Nachos", description: "Corn chips, pulled pork, queso, black beans, pico, jalapeños, crema, and tangy BBQ sauce.", price: "$15" }
    ]
  },
  {
    section: "From the Smoker",
    items: [
      { name: "Texas-Style Brisket", description: "Hand-sliced prime beef brisket with peppery bark. Choice of lean, moist, or mixed.", price: "$18", unit: "1/2 lb" },
      { name: "St. Louis Pork Ribs", description: "Meaty ribs seasoned with our house rub, smoked until tender, and lightly glazed.", price: "$21", unit: "1/2 rack" },
      { name: "Pulled Pork", description: "Slow-smoked pork shoulder, hand-pulled and finished with cider mop.", price: "$14", unit: "1/2 lb" },
      { name: "Smoked Turkey", description: "Juicy herb-brined turkey breast with cracked pepper and a light smoke finish.", price: "$15", unit: "1/2 lb" },
      { name: "Jalapeño Cheddar Sausage", description: "Coarse-ground smoked sausage with cheddar and jalapeño.", price: "$7", unit: "Link" }
    ]
  },
  {
    section: "Smoke House Plates",
    items: [
      { name: "One Meat Plate", description: "Choice of brisket, pulled pork, turkey, sausage, or ribs; includes two sides, pickles, onions, and Texas toast.", price: "$19" },
      { name: "Two Meat Plate", description: "Pick any two smoked meats with two sides, pickles, onions, and Texas toast.", price: "$25" },
      { name: "Pitmaster Three Meat", description: "Three smoked meats, two sides, cornbread, pickles, onions, and your choice of two sauces.", price: "$31" },
      { name: "Rib Dinner", description: "Half rack St. Louis ribs with two sides, cornbread, and house BBQ sauce.", price: "$27" },
      { name: "Smoke House Feast", description: "Brisket, ribs, pulled pork, sausage, four sides, cornbread, pickles, onions, and sauces. Serves 3-4.", price: "$79" }
    ]
  },
  {
    section: "Sandwiches",
    items: [
      { name: "The Smoke Stack", description: "Chopped brisket, pulled pork, smoked sausage, crispy onions, pickles, and BBQ sauce on a toasted brioche bun.", price: "$18" },
      { name: "Brisket Sandwich", description: "Sliced brisket, pickled red onions, house pickles, and smoky BBQ sauce.", price: "$16" },
      { name: "Carolina Pulled Pork", description: "Pulled pork topped with vinegar slaw and Carolina mustard sauce.", price: "$14" },
      { name: "Smoked Turkey Club", description: "Smoked turkey, bacon, lettuce, tomato, pepper jack, and Alabama white sauce on Texas toast.", price: "$15" },
      { name: "BBQ Chicken Sandwich", description: "Smoked pulled chicken, cheddar, crispy onions, pickles, and sweet BBQ sauce.", price: "$14" }
    ]
  },
  {
    section: "House Specialties",
    items: [
      { name: "Brisket Mac Bowl", description: "Creamy smoked-gouda mac and cheese topped with chopped brisket, crispy onions, scallions, and BBQ drizzle.", price: "$17" },
      { name: "Smoke House Loaded Potato", description: "Jumbo baked potato stuffed with butter, cheddar, sour cream, scallions, and choice of pulled pork or brisket.", price: "$16" },
      { name: "Pitmaster Chili", description: "Smoky beef-and-bean chili made with brisket trimmings, topped with cheddar, onions, and crema.", price: "Cup $7 / Bowl $11" },
      { name: "BBQ Street Tacos", description: "Three flour tortillas with choice of brisket or pulled pork, slaw, pickled onions, cilantro, and smoky crema.", price: "$15" }
    ]
  },
  {
    section: "Southern Sides",
    items: [
      { name: "Smoked Gouda Mac & Cheese", description: "Creamy three-cheese sauce with a toasted breadcrumb crust.", price: "$6" },
      { name: "Pit Beans", description: "Slow-cooked beans with brisket, brown sugar, molasses, and spices.", price: "$6" },
      { name: "Collard Greens", description: "Braised greens with smoked turkey, garlic, and cider vinegar.", price: "$6" },
      { name: "Creamy Slaw", description: "Crisp cabbage and carrots in a tangy house dressing.", price: "$5" },
      { name: "Seasoned Fries", description: "Crisp skin-on fries with smokehouse seasoning.", price: "$5" },
      { name: "Potato Salad", description: "Southern-style with mustard, egg, celery, and herbs.", price: "$5" },
      { name: "Street Corn", description: "Fire-roasted corn with lime crema, cotija, chile, and cilantro.", price: "$6" }
    ]
  },
  {
    section: "House Sauces",
    items: [
      { name: "Original Smoke", description: "Balanced tomato-molasses BBQ sauce with a smoky finish.", price: "$1" },
      { name: "Sweet Heat", description: "Brown sugar sweetness with a slow chile kick.", price: "$1" },
      { name: "Carolina Gold", description: "Tangy mustard sauce with vinegar and warm spices.", price: "$1" },
      { name: "Alabama White", description: "Creamy, peppery, vinegar-forward white BBQ sauce.", price: "$1" },
      { name: "Firehouse", description: "Hot chile BBQ sauce for serious heat.", price: "$1" }
    ]
  },
  {
    section: "Kids",
    items: [
      { name: "Junior BBQ Plate", description: "Choice of pulled pork or turkey with one side and Texas toast.", price: "$10" },
      { name: "Kids Mac & Cheese", description: "Creamy smoked-gouda mac with a side of fruit.", price: "$8" },
      { name: "Chicken Tenders", description: "Three crispy tenders with fries and choice of dipping sauce.", price: "$10" }
    ]
  },
  {
    section: "Desserts",
    items: [
      { name: "Bourbon Pecan Bread Pudding", description: "Warm bread pudding with pecans and vanilla bourbon sauce.", price: "$9" },
      { name: "Banana Pudding", description: "Vanilla custard, fresh bananas, wafers, and whipped cream.", price: "$8" },
      { name: "Peach Cobbler", description: "Warm cinnamon peaches under a buttery crust; add vanilla ice cream +$2.", price: "$9" },
      { name: "Chocolate Mud Pie", description: "Chocolate cookie crust, fudge filling, whipped cream, and chocolate drizzle.", price: "$9" }
    ]
  },
  {
    section: "Drinks",
    items: [
      { name: "Fresh-Brewed Sweet Tea", description: "Classic Southern sweet tea; free refills.", price: "$4" },
      { name: "Unsweet Tea", description: "Fresh-brewed black tea; free refills.", price: "$4" },
      { name: "House Lemonade", description: "Fresh lemon, cane sugar, and citrus zest.", price: "$5" },
      { name: "Arnold Palmer", description: "Half lemonade, half fresh-brewed tea.", price: "$5" },
      { name: "Fountain Soda", description: "Assorted fountain beverages; free refills.", price: "$4" }
    ]
  },
  {
    section: "Family Packs & Catering",
    items: [
      { name: "Backyard Pack", description: "1 lb pulled pork, 1 lb smoked chicken, two pints of sides, buns, pickles, onions, and sauce. Serves 4-5.", price: "$55" },
      { name: "Big Smoke Pack", description: "1 lb brisket, 1 rack ribs, 1 lb pulled pork, 2 sausage links, three pints of sides, cornbread, pickles, onions, and sauces. Serves 6-8.", price: "$95" },
      { name: "Catering", description: "Bulk smoked meats, sides, sandwich packages, boxed meals, and full-service pit packages available for parties and events.", price: null }
    ]
  }
];

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const col = client.db('Need').collection('Restaurants');

  const doc = await col.findOne({ slug: 'smoke-house-bbq' });
  if (!doc) throw new Error('smoke-house-bbq not found in Restaurants');

  const itemCount = MENU.reduce((sum, s) => sum + s.items.length, 0);
  console.log(`Found: ${doc.name} (${doc._id})`);
  console.log(`Writing ${MENU.length} sections, ${itemCount} items...`);

  await col.updateOne(
    { _id: doc._id },
    { $set: { menu: MENU, menuUpdatedAt: new Date() } }
  );

  console.log('\n✅ Menu stored in MongoDB!');
  console.log(`   Sections : ${MENU.length}`);
  console.log(`   Items    : ${itemCount}`);
  await client.close();
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
