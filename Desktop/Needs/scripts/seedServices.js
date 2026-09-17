// scripts/seedServices.js
// Creates 10 service business accounts, uploads all 40 images to GridFS, seeds docs
// Run: node scripts/seedServices.js
const fs   = require('fs');
const path = require('path');

const NODE_API = 'https://needs-v1-9-4-26-production.up.railway.app';
const IMG_DIR  = path.join(process.env.HOME, 'Downloads/service_module_40_images');

const SERVICES = [
  {
    email: 'brightertomorrow@needsapp.io',
    password: 'BrightElec@2024!',
    businessName: 'Brighter Tomorrow Electrical Solutions',
    providerName: 'Brighter Tomorrow',
    category: 'Electrical',
    tagline: 'Safe, reliable electrical work done right.',
    description: 'Licensed and insured electricians serving the greater LA area. From panel upgrades to EV charger installations, we do it all.',
    serviceArea: 'Los Angeles, CA',
    businessAddress: '500 Volt Ave, Los Angeles, CA 90001',
    phone: '(213) 555-1100',
    licensed: true,
    insured: true,
    cover: '01_electrical_01_profile.png',
    serviceFiles: [
      { name: 'Lighting Installation', file: '01_electrical_02_lighting_installation.png' },
      { name: 'Panel Upgrade',          file: '01_electrical_03_panel_upgrade.png' },
      { name: 'EV Charger Installation',file: '01_electrical_04_ev_charger_installation.png' },
    ],
  },
  {
    email: 'freshstart.cleaning@needsapp.io',
    password: 'FreshClean@2024!',
    businessName: 'Fresh Start Cleaning Services',
    providerName: 'Fresh Start',
    category: 'Cleaning',
    tagline: 'Spotless spaces, every time.',
    description: 'Professional residential and commercial cleaning. Home cleaning, deep cleans, and move-in/move-out specialists.',
    serviceArea: 'Los Angeles, CA',
    businessAddress: '220 Pristine Blvd, Los Angeles, CA 90017',
    phone: '(213) 555-2200',
    licensed: true,
    insured: true,
    cover: '02_cleaning_01_profile.png',
    serviceFiles: [
      { name: 'Home Cleaning',             file: '02_cleaning_02_home_cleaning.png' },
      { name: 'Deep Cleaning',             file: '02_cleaning_03_deep_cleaning.png' },
      { name: 'Move-In/Move-Out Cleaning', file: '02_cleaning_04_move_in_move_out_cleaning.png' },
    ],
  },
  {
    email: 'greenspaces.landscape@needsapp.io',
    password: 'GreenLawn@2024!',
    businessName: 'Green Spaces Landscape Solutions',
    providerName: 'Green Spaces',
    category: 'Landscaping',
    tagline: 'Your outdoor vision, brought to life.',
    description: 'Full-service landscaping including lawn care, hardscaping, and tree & shrub care. Serving LA and surrounding areas.',
    serviceArea: 'Los Angeles, CA',
    businessAddress: '88 Garden Way, Los Angeles, CA 90042',
    phone: '(323) 555-3300',
    licensed: true,
    insured: true,
    cover: '03_landscaping_01_profile.png',
    serviceFiles: [
      { name: 'Lawn Care',        file: '03_landscaping_02_lawn_care.png' },
      { name: 'Hardscaping',      file: '03_landscaping_03_hardscaping.png' },
      { name: 'Tree & Shrub Care',file: '03_landscaping_04_tree_shrub_care.png' },
    ],
  },
  {
    email: 'freshlook.painting@needsapp.io',
    password: 'FreshPaint@2024!',
    businessName: 'Fresh Look Painting',
    providerName: 'Fresh Look',
    category: 'Painting',
    tagline: 'A fresh coat changes everything.',
    description: 'Interior, exterior, and cabinet painting by experienced professionals. Clean, precise, and on time.',
    serviceArea: 'Los Angeles, CA',
    businessAddress: '310 Brush St, Los Angeles, CA 90028',
    phone: '(323) 555-4400',
    licensed: true,
    insured: true,
    cover: '04_painting_01_profile.png',
    serviceFiles: [
      { name: 'Interior Painting',        file: '04_painting_02_interior_painting.png' },
      { name: 'Exterior Painting',        file: '04_painting_03_exterior_painting.png' },
      { name: 'Cabinet & Trim Painting',  file: '04_painting_04_cabinet_trim_painting.png' },
    ],
  },
  {
    email: 'skyline.roofing@needsapp.io',
    password: 'SkylineRoof@2024!',
    businessName: 'Skyline Roofing',
    providerName: 'Skyline Roofing',
    category: 'Roofing',
    tagline: 'Built to protect, built to last.',
    description: 'Expert roof repair, replacement, and gutter installation. Licensed roofing contractors serving all of LA County.',
    serviceArea: 'Los Angeles, CA',
    businessAddress: '99 Summit Rd, Los Angeles, CA 90065',
    phone: '(323) 555-5500',
    licensed: true,
    insured: true,
    cover: '05_roofing_01_profile.png',
    serviceFiles: [
      { name: 'Roof Repair',       file: '05_roofing_02_roof_repair.png' },
      { name: 'Roof Replacement',  file: '05_roofing_03_roof_replacement.png' },
      { name: 'Gutter Installation',file: '05_roofing_04_gutter_installation.png' },
    ],
  },
  {
    email: 'fixitright.handyman@needsapp.io',
    password: 'FixItRight@2024!',
    businessName: 'Fix It Right Handyman Services',
    providerName: 'Fix It Right',
    category: 'Handyman',
    tagline: 'No job too small.',
    description: 'TV mounting, door & hardware repairs, fixture installation, and more. Fast, affordable, and reliable.',
    serviceArea: 'Los Angeles, CA',
    businessAddress: '47 Toolbelt Ave, Los Angeles, CA 90003',
    phone: '(213) 555-6600',
    licensed: false,
    insured: true,
    cover: '06_handyman_general_repairs_01_profile.png',
    serviceFiles: [
      { name: 'TV Mounting',          file: '06_handyman_general_repairs_02_tv_mounting.png' },
      { name: 'Door & Hardware',      file: '06_handyman_general_repairs_03_door_hardware.png' },
      { name: 'Fixture Installation', file: '06_handyman_general_repairs_04_fixture_installation.png' },
    ],
  },
  {
    email: 'premierfloors@needsapp.io',
    password: 'PremierFloor@2024!',
    businessName: 'Premier Floors – Beautiful Spaces',
    providerName: 'Premier Floors',
    category: 'Flooring',
    tagline: 'Beautiful floors, flawless finish.',
    description: 'Hardwood, carpet, and tile flooring installation by certified flooring specialists. Free estimates available.',
    serviceArea: 'Los Angeles, CA',
    businessAddress: '612 Plank Rd, Los Angeles, CA 90016',
    phone: '(323) 555-7700',
    licensed: true,
    insured: true,
    cover: '07_flooring_01_profile.png',
    serviceFiles: [
      { name: 'Hardwood Flooring',    file: '07_flooring_02_hardwood_flooring.png' },
      { name: 'Carpet Installation',  file: '07_flooring_03_carpet_installation.png' },
      { name: 'Tile Flooring',        file: '07_flooring_04_tile_flooring.png' },
    ],
  },
  {
    email: 'appliancepros@needsapp.io',
    password: 'AppliancePro@2024!',
    businessName: 'Appliance Pros – Repair · Service · Trust',
    providerName: 'Appliance Pros',
    category: 'Appliance Repair',
    tagline: 'Repair it right, the first time.',
    description: 'Expert appliance repair for all major brands. Refrigerators, washers, dryers, ovens, and more. Same-day service available.',
    serviceArea: 'Los Angeles, CA',
    businessAddress: '180 Repair Lane, Los Angeles, CA 90006',
    phone: '(213) 555-8800',
    licensed: true,
    insured: true,
    cover: '08_appliance_repair_01_profile.png',
    serviceFiles: [
      { name: 'Refrigerator Repair',    file: '08_appliance_repair_02_refrigerator_repair.png' },
      { name: 'Washer & Dryer Repair',  file: '08_appliance_repair_03_washer_dryer_repair.png' },
      { name: 'Oven & Stove Repair',    file: '08_appliance_repair_04_oven_stove_repair.png' },
    ],
  },
  {
    email: 'easymove.services@needsapp.io',
    password: 'EasyMove@2024!',
    businessName: 'Easy Move Moving Services',
    providerName: 'Easy Move',
    category: 'Moving',
    tagline: 'Stress-free moves, every time.',
    description: 'Local moving, packing services, and furniture moving. Fully insured and experienced movers ready to help.',
    serviceArea: 'Los Angeles, CA',
    businessAddress: '75 Cargo St, Los Angeles, CA 90021',
    phone: '(213) 555-9900',
    licensed: true,
    insured: true,
    cover: '09_moving_01_profile.png',
    serviceFiles: [
      { name: 'Local Moving',      file: '09_moving_02_local_moving.png' },
      { name: 'Packing Services',  file: '09_moving_03_packing_services.png' },
      { name: 'Furniture Moving',  file: '09_moving_04_furniture_moving.png' },
    ],
  },
  {
    email: 'trustedauto@needsapp.io',
    password: 'TrustedAuto@2024!',
    businessName: 'Trusted Auto Repair & Service',
    providerName: 'Trusted Auto',
    category: 'Auto Repair',
    tagline: 'Your car in trusted hands.',
    description: 'Full-service auto repair shop. Oil changes, brake service, diagnostics, and more. ASE-certified mechanics on staff.',
    serviceArea: 'Los Angeles, CA',
    businessAddress: '400 Motor Blvd, Los Angeles, CA 90058',
    phone: '(323) 555-0011',
    licensed: true,
    insured: true,
    cover: '10_auto_repair_01_profile.png',
    serviceFiles: [
      { name: 'Oil Change',    file: '10_auto_repair_02_oil_change.png' },
      { name: 'Brake Service', file: '10_auto_repair_03_brake_service.png' },
      { name: 'Diagnostics',   file: '10_auto_repair_04_diagnostics.png' },
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
  const results = [];

  for (const s of SERVICES) {
    console.log(`\n🔧  Creating: ${s.businessName}`);

    // 1. Register business user
    const regRes = await fetch(`${NODE_API}/createUser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: s.email,
        password: s.password,
        accountType: 'business',
        businessType: 'service',
      }),
    });
    const regData = await regRes.json();
    if (!regRes.ok) {
      console.error(`  ❌ User creation failed: ${regData.error}`);
      results.push({ name: s.businessName, email: s.email, password: s.password, status: 'FAILED: ' + regData.error });
      continue;
    }
    const token  = regData.token;
    const userId = regData._id;
    console.log(`  ✅ User created: ${userId}`);

    // 2. Upload cover image
    let coverId;
    try {
      process.stdout.write(`  📸 cover (${s.cover})... `);
      coverId = await uploadFile(path.join(IMG_DIR, s.cover));
      console.log(`✅ ${coverId}`);
    } catch (e) {
      console.error(`❌ ${e.message}`);
      results.push({ name: s.businessName, email: s.email, password: s.password, userId, status: 'FAILED cover upload' });
      continue;
    }

    // 3. Upload service images
    const serviceImageIds = [];
    for (const svc of s.serviceFiles) {
      try {
        process.stdout.write(`  📸 ${svc.name} (${svc.file})... `);
        const id = await uploadFile(path.join(IMG_DIR, svc.file));
        console.log(`✅ ${id}`);
        serviceImageIds.push(id);
      } catch (e) {
        console.error(`❌ ${e.message}`);
        serviceImageIds.push(null);
      }
    }

    // portfolioImageUrls = [cover, svc1, svc2, svc3]
    const portfolioImageUrls = [coverId, ...serviceImageIds].filter(Boolean);
    const topServices = s.serviceFiles.map(svc => ({ name: svc.name }));

    // 4. Create service profile
    const svcRes = await fetch(`${NODE_API}/createService`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'service',
        businessName: s.businessName,
        providerName: s.providerName,
        category: s.category,
        tagline: s.tagline,
        description: s.description,
        serviceArea: s.serviceArea,
        businessAddress: s.businessAddress,
        phone: s.phone,
        licensed: s.licensed,
        insured: s.insured,
        topServices,
        portfolioImageUrls,
      }),
    });
    const svcData = await svcRes.json();
    if (!svcRes.ok) {
      console.error(`  ❌ Service creation failed: ${svcData.error}`);
      results.push({ name: s.businessName, email: s.email, password: s.password, userId, status: 'FAILED service: ' + svcData.error });
      continue;
    }
    console.log(`  ✅ Service created: ${svcData._id}`);
    results.push({ name: s.businessName, email: s.email, password: s.password, userId, serviceId: svcData._id, status: 'OK' });
  }

  console.log('\n\n========================================');
  console.log('  SERVICE SEED RESULTS');
  console.log('========================================');
  for (const r of results) {
    const icon = r.status === 'OK' ? '✅' : '❌';
    console.log(`${icon}  ${r.name}`);
    console.log(`     Email:     ${r.email}`);
    console.log(`     Password:  ${r.password}`);
    if (r.userId)    console.log(`     UserID:    ${r.userId}`);
    if (r.serviceId) console.log(`     ServiceID: ${r.serviceId}`);
    if (r.status !== 'OK') console.log(`     Error:     ${r.status}`);
    console.log('');
  }
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
