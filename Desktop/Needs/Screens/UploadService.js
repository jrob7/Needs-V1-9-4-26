// Screens/UploadService.js
import React, { useState, useContext } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Image, Alert, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserContext } from '../server/CurrentUser';
import { authFetch } from '../server/api';
import { NODE_API } from '../config';

export const SERVICE_CATEGORY_GROUPS = [
  { group: 'Home Services',         items: ['Plumber', 'Electrician', 'HVAC', 'Handyman', 'House Cleaning', 'Landscaping', 'Lawn Care', 'Painter', 'Carpentry', 'Moving', 'Junk Removal', 'Pest Control', 'Carpet & Upholstery Cleaning', 'Pressure Washing', 'Window Cleaning', 'Pool Service', 'Appliance Repair', 'Garage Door Service', 'Locksmith'] },
  { group: 'Automotive',             items: ['Auto Repair', 'Auto Detailing', 'Tire Shop', 'Auto Body', 'Towing'] },
  { group: 'Personal Care',          items: ['Barber', 'Hair Salon', 'Nail Salon', 'Massage'] },
  { group: 'Professional Services',  items: ['Attorney', 'CPA', 'Tax Preparer', 'Insurance Agent', 'Real Estate Agent'] },
  { group: 'Family & Education',     items: ['Tutor', 'Daycare', 'Music Lessons', 'Elder Care'] },
  { group: 'Pet Services',           items: ['Groomer', 'Boarding', 'Pet Sitting'] },
  { group: 'Community Support',      items: ['Shelters', 'Rehab', 'Food Assistance', 'Churches', 'Nonprofits'] },
  { group: 'Other',                  items: ['Other'] },
];

// ── Per-category sub-service pricing questions ───────────────────────────────
// Each entry: { service: string, questions: string[] }
// Shown after a category is selected; all answers are required.
const CATEGORY_QUESTIONS = {
  'House Cleaning': [
    { service: 'Standard Cleaning', questions: [
      { label: 'Base price?', placeholder: 'e.g. $120 for a standard clean' },
      { label: 'What home size / bed-bath count does that cover?', placeholder: 'e.g. Up to 3 bed / 2 bath, ~1,500 sq ft' },
      { label: 'Price for additional bed/bath or size tier?', placeholder: 'e.g. +$25 per additional bedroom' },
    ]},
    { service: 'Deep Cleaning', questions: [
      { label: 'Base price?', placeholder: 'e.g. $200 for a deep clean' },
      { label: 'What size does that cover?', placeholder: 'e.g. Up to 2,000 sq ft, 3 bed / 2 bath' },
      { label: 'How much above standard for extra size/condition?', placeholder: 'e.g. +$50 for 4+ bedrooms or heavily soiled' },
    ]},
    { service: 'Move-In/Out', questions: [
      { label: 'Base price?', placeholder: 'e.g. $250 for a move-out clean' },
      { label: 'What size does that cover?', placeholder: 'e.g. Up to 1,500 sq ft, unfurnished' },
      { label: 'Add-on for appliances/cabinets?', placeholder: 'e.g. +$40 for inside appliances and cabinet interiors' },
    ]},
    { service: 'Recurring Cleaning', questions: [
      { label: 'Base visit price?', placeholder: 'e.g. $100/visit on a biweekly plan' },
      { label: 'What frequency options do you offer?', placeholder: 'e.g. Weekly, biweekly, or monthly' },
      { label: 'Discount for weekly/biweekly/monthly?', placeholder: 'e.g. 10% off for weekly, 5% off for biweekly' },
    ]},
  ],
  'Lawn Care': [
    { service: 'Lawn Mowing', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $40 minimum for lawns up to 3,000 sq ft' },
      { label: 'What lawn size does that cover?', placeholder: 'e.g. Flat residential lawn up to 3,000 sq ft' },
      { label: 'Price/add-on for larger or overgrown lawns?', placeholder: 'e.g. $0.01/sq ft over 3,000 sq ft; +$20 if overgrown' },
    ]},
    { service: 'Hedge Trimming', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $50 for up to 10 linear ft of hedges' },
      { label: 'What amount/size does that cover?', placeholder: 'e.g. Standard hedges up to 6 ft tall, 10 linear ft' },
      { label: 'Additional hedge/linear-foot charge?', placeholder: 'e.g. $3/linear ft beyond the first 10' },
    ]},
    { service: 'Yard Cleanup', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $80 for a standard yard cleanup' },
      { label: 'What property/debris level does that cover?', placeholder: 'e.g. Up to 5,000 sq ft with light debris' },
      { label: 'Heavy cleanup surcharge?', placeholder: 'e.g. +$40 for heavy debris or haul-away needed' },
    ]},
    { service: 'Recurring Maintenance', questions: [
      { label: 'Base visit price?', placeholder: 'e.g. $60/visit on a weekly plan' },
      { label: "What's included?", placeholder: 'e.g. Mow, edge, blow, and basic weeding' },
      { label: 'Weekly/biweekly/monthly pricing?', placeholder: 'e.g. Weekly $60, biweekly $70, monthly $90' },
    ]},
  ],
  'Auto Detailing': [
    { service: 'Full Detail', questions: [
      { label: 'Price by vehicle type?', placeholder: 'e.g. Sedan $150, SUV/Truck $200' },
      { label: "What's included?", placeholder: 'e.g. Exterior wash, wax, interior vacuum, wipe-down, windows' },
      { label: 'Pet hair/heavy-soil surcharge?', placeholder: 'e.g. +$30 for pet hair or heavily soiled interior' },
    ]},
    { service: 'Interior Detail', questions: [
      { label: 'Price by vehicle type?', placeholder: 'e.g. Sedan $100, SUV/Truck $130' },
      { label: "What's included?", placeholder: 'e.g. Vacuum, shampoo seats, wipe all surfaces, clean windows' },
      { label: 'Stain/pet-hair surcharge?', placeholder: 'e.g. +$25 for deep stains or excessive pet hair' },
    ]},
    { service: 'Exterior Detail', questions: [
      { label: 'Price by vehicle type?', placeholder: 'e.g. Sedan $80, SUV/Truck $110' },
      { label: "What's included?", placeholder: 'e.g. Hand wash, clay bar, polish, and wax' },
      { label: 'SUV/truck/oversize surcharge?', placeholder: 'e.g. +$30 for SUVs, trucks, or vans' },
    ]},
    { service: 'Wash & Wax', questions: [
      { label: 'Starting price by vehicle?', placeholder: 'e.g. Sedan $60, SUV $80' },
      { label: 'What wax/service is included?', placeholder: 'e.g. Hand wash, spray wax, tire shine, windows' },
      { label: 'Oversize vehicle surcharge?', placeholder: 'e.g. +$20 for full-size trucks or vans' },
    ]},
  ],
  'Handyman': [
    { service: 'TV Mounting', questions: [
      { label: 'Base price?', placeholder: 'e.g. $80 to mount a TV up to 55"' },
      { label: 'What TV size does it cover?', placeholder: 'e.g. Up to 55" on a standard drywall wall' },
      { label: 'Add-on for larger TV/concealed wires?', placeholder: 'e.g. +$20 for 65"+ or +$40 to conceal wires in wall' },
    ]},
    { service: 'Furniture Assembly', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $60 for a standard item like a bed frame or desk' },
      { label: 'Which item/size does that cover?', placeholder: 'e.g. Single item up to ~30 min assembly time' },
      { label: 'Additional item/hour charge?', placeholder: 'e.g. +$40/hr for additional items or complex assembly' },
    ]},
    { service: 'Shelf Installation', questions: [
      { label: 'Price per shelf?', placeholder: 'e.g. $30 per shelf including hardware and mounting' },
      { label: "What's included?", placeholder: 'e.g. Standard drywall anchor mount, up to 30 lbs' },
      { label: 'Add-on for masonry/special mounting?', placeholder: 'e.g. +$15/shelf for concrete, brick, or tile walls' },
    ]},
    { service: 'Curtain/Blind Install', questions: [
      { label: 'Base/per-window price?', placeholder: 'e.g. $35 per window' },
      { label: "What's included?", placeholder: 'e.g. Standard bracket install — customer supplies hardware and blinds' },
      { label: 'Additional window/hardware charge?', placeholder: 'e.g. +$10/window beyond the first 3' },
    ]},
  ],
  'Junk Removal': [
    { service: 'Furniture Removal', questions: [
      { label: 'Price per item / starting price?', placeholder: 'e.g. $60 for a single piece of furniture' },
      { label: 'Which items does that cover?', placeholder: 'e.g. Couch, dresser, bed frame, or similar standard items' },
      { label: 'Oversized/heavy-item surcharge?', placeholder: 'e.g. +$30 for pianos, safes, or items over 200 lbs' },
    ]},
    { service: 'Appliance Removal', questions: [
      { label: 'Price per appliance?', placeholder: 'e.g. $75 per major appliance' },
      { label: 'Which appliances?', placeholder: 'e.g. Refrigerators, washers, dryers, stoves, dishwashers' },
      { label: 'Stairs/disconnection surcharge?', placeholder: 'e.g. +$20 if carried down stairs; disconnection is extra' },
    ]},
    { service: 'Mattress Removal', questions: [
      { label: 'Price per mattress?', placeholder: 'e.g. $60 for twin/full, $75 for queen/king' },
      { label: 'Does size affect price?', placeholder: 'e.g. Yes — twin/full $60, queen $70, king $80' },
      { label: 'Additional mattress/box spring price?', placeholder: 'e.g. +$30 per box spring' },
    ]},
    { service: 'Load Removal', questions: [
      { label: 'Price by load size?', placeholder: 'e.g. 1/4 load $100, 1/2 load $175, full load $300' },
      { label: 'How do you define a load?', placeholder: 'e.g. 1/4 load = 1–2 items or fills a quarter of our truck' },
      { label: 'Heavy-material surcharge?', placeholder: 'e.g. +$50 for concrete, dirt, or tile (hazmat excluded)' },
    ]},
  ],
  'Pest Control': [
    { service: 'General Pest', questions: [
      { label: 'Base treatment price?', placeholder: 'e.g. $120 for a standard interior/exterior treatment' },
      { label: 'What property size does that cover?', placeholder: 'e.g. Single-family home up to 2,500 sq ft' },
      { label: 'Additional size/severity charge?', placeholder: 'e.g. +$30 for homes over 2,500 sq ft or heavy infestations' },
    ]},
    { service: 'Ant Treatment', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $95 for a standard ant treatment' },
      { label: "What's included?", placeholder: 'e.g. Interior bait stations and exterior perimeter spray' },
      { label: 'Severe/multiple-area surcharge?', placeholder: 'e.g. +$25 for multiple entry points or heavy infestation' },
    ]},
    { service: 'Roach Treatment', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $110 for a standard roach treatment' },
      { label: 'What infestation level does that cover?', placeholder: 'e.g. Light to moderate — gel bait and perimeter spray' },
      { label: 'Follow-up/severe infestation price?', placeholder: 'e.g. Severe starts at $175; follow-up visit $60' },
    ]},
    { service: 'Recurring Service', questions: [
      { label: 'Price per visit/month?', placeholder: 'e.g. $75/month on a quarterly plan' },
      { label: 'What pests are included?', placeholder: 'e.g. Ants, roaches, spiders, silverfish, general crawling insects' },
      { label: 'Frequency/contract discount?', placeholder: 'e.g. Monthly $75, quarterly $90/visit, no contract required' },
    ]},
  ],
  'Carpet & Upholstery Cleaning': [
    { service: 'Carpet Cleaning', questions: [
      { label: 'Price per room?', placeholder: 'e.g. $45 per room' },
      { label: 'Maximum room size?', placeholder: 'e.g. Up to 200 sq ft per room' },
      { label: 'Stain/heavy-soil surcharge?', placeholder: 'e.g. +$20/room for pet stains or heavily soiled carpet' },
    ]},
    { service: 'Stair Cleaning', questions: [
      { label: 'Price per stair/flight?', placeholder: 'e.g. $4 per stair or $60 per flight' },
      { label: "What's included?", placeholder: 'e.g. Steam clean, deodorize, and spot treat' },
      { label: 'Additional landing charge?', placeholder: 'e.g. +$25 per landing area' },
    ]},
    { service: 'Sofa Cleaning', questions: [
      { label: 'Price by sofa size?', placeholder: 'e.g. Loveseat $80, standard sofa $110, sectional $160' },
      { label: "What's included?", placeholder: 'e.g. Steam extraction, deodorize, and spot treatment' },
      { label: 'Stain/pet-hair surcharge?', placeholder: 'e.g. +$30 for pet hair or deep set-in stains' },
    ]},
    { service: 'Area Rug Cleaning', questions: [
      { label: 'Price by size/sq ft?', placeholder: 'e.g. $2/sq ft, minimum $50' },
      { label: 'Which materials are included?', placeholder: 'e.g. Wool, synthetic, and cotton — silk quoted separately' },
      { label: 'Specialty-material surcharge?', placeholder: 'e.g. +$25 for silk, antique, or hand-knotted rugs' },
    ]},
  ],
  'Pressure Washing': [
    { service: 'Driveway', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $100 for a standard 2-car driveway' },
      { label: 'What sq ft does that cover?', placeholder: 'e.g. Up to 500 sq ft' },
      { label: 'Additional sq-ft/heavy-stain charge?', placeholder: 'e.g. $0.15/sq ft over 500; +$30 for oil stains' },
    ]},
    { service: 'Patio', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $80 for a standard patio up to 300 sq ft' },
      { label: 'What size does that cover?', placeholder: 'e.g. Up to 300 sq ft concrete or pavers' },
      { label: 'Additional sq-ft charge?', placeholder: 'e.g. $0.20/sq ft over 300 sq ft' },
    ]},
    { service: 'House Exterior', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $250 for a single-story home' },
      { label: 'What home size/stories does that cover?', placeholder: 'e.g. Up to 1,500 sq ft single-story' },
      { label: 'Additional story/sq-ft charge?', placeholder: 'e.g. +$100/story; +$0.10/sq ft over 1,500' },
    ]},
    { service: 'Fence/Deck', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $120 for up to 200 sq ft deck or 100 linear ft fence' },
      { label: 'What sq/linear footage does that cover?', placeholder: 'e.g. Up to 200 sq ft deck or 100 linear ft fence' },
      { label: 'Additional footage charge?', placeholder: 'e.g. $0.50/linear ft or $0.40/sq ft over the base' },
    ]},
  ],
  'Window Cleaning': [
    { service: 'Exterior Windows', questions: [
      { label: 'Price per window / starting price?', placeholder: 'e.g. $8/window, minimum $80' },
      { label: 'What window type/size is standard?', placeholder: 'e.g. Standard single-pane up to 24" x 36"' },
      { label: 'Second-story/oversize surcharge?', placeholder: 'e.g. +$5/window for second story or large picture windows' },
    ]},
    { service: 'Interior + Exterior', questions: [
      { label: 'Price per window?', placeholder: 'e.g. $12/window both sides, minimum $100' },
      { label: "What's included?", placeholder: 'e.g. Both panes, sills wiped, and streak-free finish' },
      { label: 'Second-story/oversize surcharge?', placeholder: 'e.g. +$6/window for second story; oversize quoted separately' },
    ]},
    { service: 'Screen Cleaning', questions: [
      { label: 'Price per screen?', placeholder: 'e.g. $4/screen or free with a full window cleaning package' },
      { label: 'Included with window service?', placeholder: 'e.g. Included with 10+ window packages; otherwise $4/screen' },
      { label: 'Damaged/special screen handling?', placeholder: 'e.g. We remove and reinstall — damaged screens noted but not replaced' },
    ]},
    { service: 'Tracks/Sills', questions: [
      { label: 'Price per window?', placeholder: 'e.g. $3/window or included in interior cleaning packages' },
      { label: "What's included?", placeholder: 'e.g. Wipe tracks, sills, and frames with a damp cloth' },
      { label: 'Heavy buildup surcharge?', placeholder: 'e.g. +$2/window for heavy mold or debris buildup' },
    ]},
  ],
  'Pool Service': [
    { service: 'One-Time Cleaning', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $150 for a standard pool up to 15,000 gallons' },
      { label: 'What pool size/condition does that cover?', placeholder: 'e.g. Up to 15,000 gal in normal condition' },
      { label: 'Dirty/green-pool surcharge?', placeholder: 'e.g. +$50–$100 for green or algae-heavy pools' },
    ]},
    { service: 'Weekly Service', questions: [
      { label: 'Monthly/visit price?', placeholder: 'e.g. $150/month (4 visits) including chemicals' },
      { label: "What's included?", placeholder: 'e.g. Skim, brush, vacuum, test water, add chemicals' },
      { label: 'Chemicals included or additional?', placeholder: 'e.g. Included in monthly rate; heavy chemical needs may add $20–$40' },
    ]},
    { service: 'Filter Cleaning', questions: [
      { label: 'Base price?', placeholder: 'e.g. $85 for a standard cartridge or sand filter' },
      { label: 'Which filter types/sizes?', placeholder: 'e.g. Cartridge, sand, and DE filters — standard residential size' },
      { label: 'Replacement/material charges?', placeholder: 'e.g. Replacement cartridges and media priced separately at cost' },
    ]},
    { service: 'Green Pool Cleanup', questions: [
      { label: 'Starting price/range?', placeholder: 'e.g. $200–$350 depending on severity' },
      { label: 'What severity does it cover?', placeholder: 'e.g. Light green (1–2 treatments) up to moderate algae' },
      { label: 'When does it require an in-person quote?', placeholder: 'e.g. Black algae, severe buildup, or drained pools need a quote' },
    ]},
  ],
  'Plumber': [
    { service: 'Drain Unclogging', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $95 for a standard drain snake service' },
      { label: 'Which drain types are included?', placeholder: 'e.g. Kitchen, bathroom sink, tub, and shower drains' },
      { label: 'Severe/main-line condition — surcharge or quote?', placeholder: 'e.g. Main line or root intrusion requires a separate quote starting at $250' },
    ]},
    { service: 'Faucet Replacement', questions: [
      { label: 'Base labor price?', placeholder: 'e.g. $120 labor to swap a standard faucet' },
      { label: 'Customer-supplied faucet assumed?', placeholder: 'e.g. Yes — customer provides the faucet; we provide labor and parts' },
      { label: 'Additional faucet/complex install charge?', placeholder: 'e.g. +$40 for kitchen faucets with sprayer or tight under-sink access' },
    ]},
    { service: 'Toilet Replacement', questions: [
      { label: 'Base labor price?', placeholder: 'e.g. $150 labor to replace a standard toilet' },
      { label: 'Removal/disposal included?', placeholder: 'e.g. Yes, old toilet haul-away is included' },
      { label: 'Customer-supplied vs. supplied toilet pricing?', placeholder: 'e.g. Customer supplies toilet; we can source one for $100–$250 depending on model' },
    ]},
    { service: 'Garbage Disposal', questions: [
      { label: 'Base labor price?', placeholder: 'e.g. $130 to install a customer-supplied disposal' },
      { label: 'Customer supplies unit or you do?', placeholder: 'e.g. Customer supplies unit; or we supply starting at $160 including labor' },
      { label: 'Wiring/plumbing complication — price or quote?', placeholder: 'e.g. New wiring or plumbing tie-in starts at $80 extra; complex setups quoted on-site' },
    ]},
  ],
  'Electrician': [
    { service: 'Outlet/GFCI', questions: [
      { label: 'Price for first unit?', placeholder: 'e.g. $120 for the first outlet or GFCI install' },
      { label: 'Additional-unit price?', placeholder: 'e.g. $75 for each additional outlet on the same visit' },
      { label: 'New wiring required — quote?', placeholder: 'e.g. Running new circuits or conduit is quoted separately' },
    ]},
    { service: 'Light Fixture', questions: [
      { label: 'Base price per fixture?', placeholder: 'e.g. $90 per standard fixture swap' },
      { label: 'What fixture/height is standard?', placeholder: 'e.g. Standard ceiling height (8–10 ft), customer supplies fixture' },
      { label: 'High ceiling/heavy fixture surcharge?', placeholder: 'e.g. +$30 for ceilings above 12 ft or fixtures over 50 lbs' },
    ]},
    { service: 'Ceiling Fan', questions: [
      { label: 'Base price?', placeholder: 'e.g. $120 to install/replace a ceiling fan on an existing box' },
      { label: 'Additional fan price?', placeholder: 'e.g. $90 for each additional fan on the same visit' },
      { label: 'High ceiling/new wiring surcharge?', placeholder: 'e.g. +$40 for ceilings over 12 ft; new wiring or mounting box quoted separately' },
    ]},
    { service: 'EV Charger', questions: [
      { label: 'Base price / range?', placeholder: 'e.g. $350–$600 depending on panel distance and amperage' },
      { label: 'Existing circuit price?', placeholder: 'e.g. $200 if a 240V circuit is already in place near the garage' },
      { label: 'New circuit/distance — formula or quote?', placeholder: 'e.g. New circuit cost depends on panel location and run length — on-site quote recommended' },
    ]},
  ],
  'HVAC': [
    { service: 'AC Tune-Up', questions: [
      { label: 'Base price?', placeholder: 'e.g. $89 for a standard AC tune-up' },
      { label: "What's included?", placeholder: 'e.g. Filter check, coil clean, refrigerant check, thermostat test' },
      { label: 'Additional unit price?', placeholder: 'e.g. $70 for each additional unit on the same property' },
    ]},
    { service: 'Furnace Tune-Up', questions: [
      { label: 'Base price?', placeholder: 'e.g. $89 for a standard furnace tune-up' },
      { label: "What's included?", placeholder: 'e.g. Burner inspection, filter replacement, heat exchanger visual, safety check' },
      { label: 'Additional unit price?', placeholder: 'e.g. $70 per additional unit' },
    ]},
    { service: 'Thermostat Replacement', questions: [
      { label: 'Labor price?', placeholder: 'e.g. $100 labor to swap a standard thermostat' },
      { label: 'Standard vs smart thermostat pricing?', placeholder: 'e.g. Standard swap $100; Nest or Ecobee install $130 (customer supplies device)' },
      { label: 'New wiring required — surcharge or quote?', placeholder: 'e.g. C-wire install +$50; new wiring beyond that quoted on-site' },
    ]},
    { service: 'HVAC Diagnostic', questions: [
      { label: 'Service-call price?', placeholder: 'e.g. $95 diagnostic/service-call fee' },
      { label: 'Is fee applied toward repair?', placeholder: 'e.g. Yes — the $95 is credited toward any repair we complete' },
      { label: 'What systems/area does fee cover?', placeholder: 'e.g. Single system (AC or furnace) at one address' },
    ]},
  ],
  'Painter': [
    { service: 'Single Room', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $200 per room including labor and paint' },
      { label: 'What room size does that cover?', placeholder: 'e.g. Up to 150 sq ft, standard ceiling height, two coats' },
      { label: 'Additional wall/size/coat charge?', placeholder: 'e.g. +$50 for rooms over 200 sq ft or if a 3rd coat is needed' },
    ]},
    { service: 'Accent Wall', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $120 for a standard accent wall' },
      { label: 'What wall size does that cover?', placeholder: 'e.g. Up to 120 sq ft (10x12 wall)' },
      { label: 'Additional prep/coat charge?', placeholder: 'e.g. +$40 if wall needs patching or priming first' },
    ]},
    { service: 'Doors', questions: [
      { label: 'Price per door?', placeholder: 'e.g. $60 per interior door' },
      { label: 'One/both sides included?', placeholder: 'e.g. Both sides and trim included in the $60' },
      { label: 'Prep/damaged-door surcharge?', placeholder: 'e.g. +$20 if door needs sanding, filling, or primer coat' },
    ]},
    { service: 'Trim/Baseboards', questions: [
      { label: 'Price per room / linear foot?', placeholder: 'e.g. $80/room or $2.50/linear ft' },
      { label: "What's included?", placeholder: 'e.g. One coat, caulk as needed, tape and drop cloth included' },
      { label: 'Prep/additional-coat charge?', placeholder: 'e.g. +$40/room if bare wood or drastic color change requiring primer' },
    ]},
  ],
  'Moving': [
    { service: 'Local Move', questions: [
      { label: 'Hourly/base rate?', placeholder: 'e.g. $120/hr for a 2-man crew, 2-hour minimum' },
      { label: 'How many movers/hours included?', placeholder: 'e.g. 2 movers and a 16-ft truck, 2-hour minimum' },
      { label: 'Additional hour/mover price?', placeholder: 'e.g. $120/hr; add a 3rd mover for +$40/hr' },
    ]},
    { service: 'Labor Only', questions: [
      { label: 'Hourly rate?', placeholder: 'e.g. $90/hr for 2 movers, 2-hour minimum (no truck)' },
      { label: 'How many movers included?', placeholder: 'e.g. 2 movers — you provide or rent the truck' },
      { label: 'Minimum hours/additional mover price?', placeholder: 'e.g. 2-hour minimum; 3rd mover +$35/hr' },
    ]},
    { service: 'Furniture Move', questions: [
      { label: 'Starting/item price?', placeholder: 'e.g. $60 for the first large piece within a home' },
      { label: 'What size/weight is included?', placeholder: 'e.g. Standard sofas, beds, and dressers up to 300 lbs' },
      { label: 'Stairs/heavy-item surcharge?', placeholder: 'e.g. +$20/item per flight of stairs; items over 400 lbs quoted separately' },
    ]},
    { service: 'Loading/Unloading', questions: [
      { label: 'Hourly rate?', placeholder: 'e.g. $100/hr for 2 movers loading or unloading your rental truck' },
      { label: 'Crew size included?', placeholder: 'e.g. 2 movers; 3rd mover available for +$40/hr' },
      { label: 'Minimum/additional-hour charge?', placeholder: 'e.g. 2-hour minimum; billed in 30-min increments after that' },
    ]},
  ],
  'Appliance Repair': [
    { service: 'Refrigerator', questions: [
      { label: 'Diagnostic fee?', placeholder: 'e.g. $85 to diagnose a refrigerator issue' },
      { label: 'Is fee credited toward repair?', placeholder: 'e.g. Yes — the $85 is applied toward the repair cost if you proceed' },
      { label: 'Which brands/types do you service?', placeholder: 'e.g. Most major brands — Samsung, LG, GE, Whirlpool, Maytag' },
    ]},
    { service: 'Washer', questions: [
      { label: 'Diagnostic fee?', placeholder: 'e.g. $85 diagnostic fee' },
      { label: 'Credited toward repair?', placeholder: 'e.g. Yes, credited if repair is completed same day' },
      { label: 'Which brands/types?', placeholder: 'e.g. Top-load and front-load; most major brands' },
    ]},
    { service: 'Dryer', questions: [
      { label: 'Diagnostic fee?', placeholder: 'e.g. $85 diagnostic fee' },
      { label: 'Credited toward repair?', placeholder: 'e.g. Yes — credited toward repair labor' },
      { label: 'Which brands/types?', placeholder: 'e.g. Electric and gas dryers; most major brands' },
    ]},
    { service: 'Dishwasher', questions: [
      { label: 'Diagnostic fee?', placeholder: 'e.g. $85 to diagnose a dishwasher problem' },
      { label: 'Credited toward repair?', placeholder: 'e.g. Yes, credited if you approve the repair' },
      { label: 'Which brands/types?', placeholder: 'e.g. Bosch, KitchenAid, Whirlpool, GE, and most standard brands' },
    ]},
  ],
  'Garage Door Service': [
    { service: 'Tune-Up', questions: [
      { label: 'Base price?', placeholder: 'e.g. $80 for a standard single-door tune-up' },
      { label: "What's included?", placeholder: 'e.g. Lubricate springs/rollers, tighten hardware, test safety sensors, adjust balance' },
      { label: 'Additional door price?', placeholder: 'e.g. +$50 for a second door on the same visit' },
    ]},
    { service: 'Sensor Replacement', questions: [
      { label: 'Base price?', placeholder: 'e.g. $95 to replace a set of safety sensors' },
      { label: 'Parts included?', placeholder: 'e.g. Yes — includes new sensor set and wiring' },
      { label: 'Additional sensor/door charge?', placeholder: 'e.g. Standard replacement is per door; compatibility check included' },
    ]},
    { service: 'Opener Replacement', questions: [
      { label: 'Labor/package price?', placeholder: 'e.g. $250 installed for a standard belt-drive opener' },
      { label: 'Which opener types?', placeholder: 'e.g. Belt, chain, and wall-mount drives — brands include Chamberlain and LiftMaster' },
      { label: 'Parts supplied by business or customer?', placeholder: 'e.g. We supply the opener; customer can supply their own for labor-only rate of $120' },
    ]},
    { service: 'Spring Replacement', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $150 for a single torsion spring, $220 for a double' },
      { label: 'Single/double spring pricing?', placeholder: 'e.g. Single $150, double $220 — we recommend replacing both at the same time' },
      { label: 'Which door sizes/types require a quote?', placeholder: 'e.g. Commercial-grade doors, custom sizes, or extension springs need an on-site quote' },
    ]},
  ],
  'Locksmith': [
    { service: 'Home Lockout', questions: [
      { label: 'Base price?', placeholder: 'e.g. $75 during business hours to unlock a standard door' },
      { label: 'What lock types are included?', placeholder: 'e.g. Standard pin-tumbler deadbolts and knob locks' },
      { label: 'After-hours/complex-lock surcharge?', placeholder: 'e.g. +$40 after 8pm or weekends; high-security/smart locks quoted on arrival' },
    ]},
    { service: 'Car Lockout', questions: [
      { label: 'Base price?', placeholder: 'e.g. $65 for most standard vehicles' },
      { label: 'Which vehicle types are included?', placeholder: 'e.g. Most cars, trucks, and SUVs with standard door locks' },
      { label: 'After-hours/special vehicle surcharge?', placeholder: 'e.g. +$30 after 8pm; RVs or proximity fob vehicles quoted separately' },
    ]},
    { service: 'Rekey', questions: [
      { label: 'First-lock price?', placeholder: 'e.g. $60 to rekey the first lock' },
      { label: 'Additional-lock price?', placeholder: 'e.g. +$15 for each additional lock rekeyed to the same key' },
      { label: 'New keys included?', placeholder: 'e.g. 2 keys included; additional keys $5 each' },
    ]},
    { service: 'Lock Replacement', questions: [
      { label: 'Labor/base price?', placeholder: 'e.g. $85 labor to replace a standard deadbolt' },
      { label: 'Lock included or customer supplied?', placeholder: 'e.g. Customer supplies the lock; or we source a quality deadbolt for $45–$80' },
      { label: 'Additional lock/smart lock surcharge?', placeholder: 'e.g. Smart lock install +$30 for programming and setup' },
    ]},
  ],
  'Pet Services': [
    { service: 'Dog Walking', questions: [
      { label: 'Price per walk?', placeholder: 'e.g. $20 for a 30-minute walk' },
      { label: 'Duration included?', placeholder: 'e.g. 30-minute walk with GPS tracking and post-walk report' },
      { label: 'Additional dog price?', placeholder: 'e.g. +$10 for a second dog from the same household' },
    ]},
    { service: 'Drop-In Visit', questions: [
      { label: 'Price per visit?', placeholder: 'e.g. $18 per 20-minute drop-in visit' },
      { label: 'Duration/tasks included?', placeholder: 'e.g. Feed, refresh water, litter scoop or potty break, and a brief play session' },
      { label: 'Additional pet price?', placeholder: 'e.g. +$8 per additional pet' },
    ]},
    { service: 'Pet Sitting', questions: [
      { label: 'Price per day/night?', placeholder: 'e.g. $55/night for one dog at my home' },
      { label: "What's included?", placeholder: 'e.g. Overnight stay, all meals, walks, and play time' },
      { label: 'Additional pet surcharge?', placeholder: 'e.g. +$20/night for a second pet' },
    ]},
    { service: 'Dog Grooming', questions: [
      { label: 'Price by dog size?', placeholder: 'e.g. Small (under 25 lbs) $50, Medium $65, Large $80+' },
      { label: "What's included?", placeholder: 'e.g. Bath, blow-dry, brush out, trim, nail grind, and ear clean' },
      { label: 'Coat condition/add-on surcharge?', placeholder: 'e.g. +$15 for matted coats or heavy shedding' },
    ]},
  ],
  'Landscaping': [
    { service: 'Yard Maintenance', questions: [
      { label: 'Starting price?', placeholder: 'e.g. I usually charge a minimum of $40 for yard maintenance' },
      { label: 'What property size/work is included?', placeholder: 'e.g. Up to 5,000 sq ft — mow the lawn, trim hedges, blow clippings' },
      { label: 'Additional size/condition charge?', placeholder: 'e.g. Over 10,000 sq ft I charge $0.004/sq ft extra; +$25 for overgrown yards' },
    ]},
    { service: 'Hedge Trimming', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $60 for up to 20 linear ft of hedges' },
      { label: 'What hedge size/quantity is included?', placeholder: 'e.g. Hedges up to 6 ft tall, up to 20 linear ft' },
      { label: 'Additional linear-foot/hedge charge?', placeholder: 'e.g. $2/linear ft beyond 20 ft; tall hedges (8ft+) add $30' },
    ]},
    { service: 'Yard Cleanup', questions: [
      { label: 'Starting price?', placeholder: 'e.g. $100 for a standard seasonal cleanup' },
      { label: 'What size/debris level does that cover?', placeholder: 'e.g. Up to 5,000 sq ft with moderate leaf/debris accumulation' },
      { label: 'Heavy debris/haul-away surcharge?', placeholder: 'e.g. +$50 for heavy debris; haul-away $75 per truckload' },
    ]},
    { service: 'Mulch Installation', questions: [
      { label: 'Price per sq ft / yard?', placeholder: 'e.g. $5/sq ft installed or $80/cubic yard including material' },
      { label: 'Is material included?', placeholder: 'e.g. Yes — includes standard hardwood mulch; premium/colored mulch +$20/yard' },
      { label: 'Delivery/removal charge?', placeholder: 'e.g. Delivery within 15 miles included; old mulch removal +$45' },
    ]},
  ],
  'Auto Repair': [
    { service: 'Oil Change', questions: [
      { label: 'Base price by oil type?', placeholder: 'e.g. Conventional $35, full synthetic $65' },
      { label: 'How many quarts included?', placeholder: 'e.g. Up to 5 quarts included; $7/qt for vehicles needing more' },
      { label: 'Charge for additional oil/special filters?', placeholder: 'e.g. Diesel or European spec oil +$20; special filter at cost' },
    ]},
    { service: 'Brake Pad Replacement', questions: [
      { label: 'Price per axle?', placeholder: 'e.g. $150/axle for standard pads, labor included' },
      { label: 'Pads/parts included?', placeholder: 'e.g. Standard ceramic pads included; performance pads priced separately' },
      { label: 'Additional price for rotors or when is a quote required?', placeholder: 'e.g. Rotor replacement +$80/axle; if rotors are below spec, we quote before proceeding' },
    ]},
    { service: 'Battery Replacement', questions: [
      { label: 'Labor/base price?', placeholder: 'e.g. $120 installed for most standard vehicles' },
      { label: 'Battery included or priced by vehicle/battery type?', placeholder: 'e.g. Includes standard group-size battery; European or AGM batteries priced higher' },
      { label: 'Additional charge for difficult-access/programming vehicles?', placeholder: 'e.g. +$30 for BMWs, Audis, or vehicles requiring module programming after swap' },
    ]},
    { service: 'Diagnostic / Check Engine', questions: [
      { label: 'Diagnostic fee?', placeholder: 'e.g. $95 for a full scan and diagnosis' },
      { label: 'How much diagnostic time does that include?', placeholder: 'e.g. Up to 30 min of tech time — covers most common codes' },
      { label: 'Is the fee credited toward repair?', placeholder: 'e.g. Yes — the $95 is applied toward any repair completed at our shop' },
    ]},
  ],
};

const AVAILABILITY = ['', 'Next Day', 'Within a Week', 'Flexible'];

const resolveImg = (raw) => {
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  if (/^[0-9a-f]{24}$/i.test(raw)) return `${NODE_API}/images/${raw}`;
  return `${NODE_API}/uploads/${raw}`;
};

export default function UploadService({ route, navigation, onSubmitSuccess, onBack, pendingAccount, initialCategory } = {}) {
  const { userId, setUserId, setAccountType, setBusinessType } = useContext(UserContext);
  const insets = useSafeAreaInsets();

  // Edit mode: pre-fill from an existing listing and PUT instead of POST.
  // Used both by the Account tab (editing your own listing) and signup
  // (route params) or direct props (rendered inline during business signup).
  const editMode = route?.params?.editMode || false;
  const existingDoc = route?.params?.existingDoc || null;

  // ── Basic Info ──────────────────────────────────────────────
  const [businessName, setBusinessName]   = useState(existingDoc?.businessName || '');
  const [providerName, setProviderName]   = useState(existingDoc?.providerName || ''); // "John's Plumbing" vs "John Smith"
  const [category, setCategory]           = useState(initialCategory || existingDoc?.category || '');
  const [tagline, setTagline]             = useState(existingDoc?.tagline || ''); // short pitch
  const [description, setDescription]    = useState(existingDoc?.description || '');
  const [serviceArea, setServiceArea]     = useState(existingDoc?.serviceArea || ''); // city/zip
  const [businessAddress, setBusinessAddress] = useState(existingDoc?.businessAddress || '');
  const [zipcode, setZipcode]             = useState(existingDoc?.zipcode || '');
  const [phone, setPhone]                 = useState(existingDoc?.phone || '');
  const [website, setWebsite]             = useState(existingDoc?.website || '');

  // ── Availability ────────────────────────────────────────────
  const [availability, setAvailability]   = useState(existingDoc?.availability || '');
  const [responseTime, setResponseTime]   = useState(existingDoc?.responseTime || ''); // "Usually responds in < 1 hr"

  // ── Portfolio Images (up to 4) ──────────────────────────────
  const [portfolioImages, setPortfolioImages] = useState(
    () => (existingDoc?.portfolioImageUrls || []).map(raw => ({ uri: resolveImg(raw), raw }))
  );

  // ── License / Certifications ────────────────────────────────
  const [licensed, setLicensed]           = useState(existingDoc?.licensed ?? null); // true | false | null
  const [licenseNumber, setLicenseNumber] = useState(existingDoc?.licenseNumber || '');
  const [insured, setInsured]             = useState(existingDoc?.insured ?? null); // true | false | null
  const [bonded, setBonded]               = useState(existingDoc?.bonded ?? null); // true | false | null
  const [certifications, setCertifications] = useState(existingDoc?.certifications || '');

  // ── Pricing details (category-specific questions) ───────────
  const [pricingDetails, setPricingDetails] = useState(existingDoc?.pricingDetails || {});
  const updatePricing = (subService, question, value) => {
    setPricingDetails(prev => ({
      ...prev,
      [subService]: { ...(prev[subService] || {}), [question]: value },
    }));
  };

  // ── Top 3 Services customers come to you for ─────────────────
  const existingServices = existingDoc?.topServices?.length
    ? [...existingDoc.topServices, { name: '' }, { name: '' }, { name: '' }].slice(0, Math.max(3, existingDoc.topServices.length))
    : [{ name: '' }, { name: '' }, { name: '' }];
  const [services, setServices] = useState(existingServices);

  const updateService = (idx, field, value) => {
    setServices(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  // ── Pick portfolio image ─────────────────────────────────────
  const pickPortfolioImage = async () => {
    if (portfolioImages.length >= 4) {
      Alert.alert('Max 4 photos', 'You can upload up to 4 portfolio images.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
      base64: true,
    });
    if (result.assets?.[0]) {
      setPortfolioImages(prev => [...prev, result.assets[0]]);
    }
  };

  const removePortfolioImage = (idx) => {
    setPortfolioImages(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!pendingAccount && !userId) { Alert.alert('Not signed in', 'Please log in first.'); return; }
    if (!businessName || !category || !serviceArea) {
      Alert.alert('Missing info', 'Please fill in business name, category, and service area.');
      return;
    }

    // Validate category-specific pricing questions
    const catQuestions = CATEGORY_QUESTIONS[category];
    if (catQuestions) {
      for (const { service, questions } of catQuestions) {
        for (const { label } of questions) {
          if (!pricingDetails[service]?.[label]?.trim()) {
            Alert.alert('Pricing required', `Please answer "${label}" under ${service}.`);
            return;
          }
        }
      }
    }

    try {
      let effectiveUserId = userId;
      let createdToken = null;

      // Business accounts are only created right now, at the final submit —
      // not when the earlier account-info step was filled in. Create the
      // account and the listing together, back-to-back.
      if (pendingAccount) {
        const userRes = await fetch('${NODE_API}/createUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: pendingAccount.email,
            password: pendingAccount.password,
            accountType: pendingAccount.accountType,
            businessType: pendingAccount.businessType,
            profilePicture: null, cashCredits: 0, helpingCredits: 0, TrustScore: 0,
          }),
        });
        if (!userRes.ok) {
          const err = await userRes.json().catch(() => null);
          throw new Error(err?.error || 'Failed to create account');
        }
        const userData = await userRes.json();
        effectiveUserId = (userData._id || '').toString();
        if (userData.token) {
          createdToken = userData.token;
          await AsyncStorage.setItem('authToken', createdToken);
        }
        setUserId(effectiveUserId);
        setAccountType(pendingAccount.accountType);
        setBusinessType(pendingAccount.businessType);
      }

      // Upload portfolio images — keep unchanged existing ones (img.raw) as-is,
      // only upload newly-picked local images (img.base64).
      const portfolioUrls = await Promise.all(
        portfolioImages.map(async (img) => {
          if (img.raw) return img.raw;
          if (!img.base64) return null;
          const res = await fetch(`${NODE_API}/uploadImage`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: img.base64,
          });
          const json = await res.json();
          return json.imageUrl;
        })
      );

      const payload = {
        userId: effectiveUserId,
        type: 'service',
        businessName,
        providerName,
        category,
        tagline,
        description,
        serviceArea,
        businessAddress,
        zipcode,
        phone,
        website,
        availability,
        responseTime,
        licensed,
        licenseNumber,
        insured,
        bonded,
        certifications,
        topServices: services.filter(s => s.name),
        portfolioImageUrls: portfolioUrls.filter(Boolean),
        pricingDetails,
      };

      const url    = editMode ? `${NODE_API}/services/${existingDoc._id}` : '${NODE_API}/createService';
      const method = editMode ? 'PUT' : 'POST';
      const resp = await authFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error('Server error');
      // Server backfills the account's profile picture from the first
      // portfolio photo if one isn't already set — see setProfilePictureIfMissing.

      if (editMode) {
        Alert.alert('✅ Profile updated!', `${businessName} has been saved.`);
        if (onSubmitSuccess) onSubmitSuccess(effectiveUserId, createdToken);
        else navigation?.goBack();
        return;
      }

      Alert.alert('✅ Service uploaded!', `${businessName} is now live.`);
      if (onSubmitSuccess) { onSubmitSuccess(effectiveUserId, createdToken); return; }
      // Reset (create flow only)
      setBusinessName(''); setProviderName(''); setCategory(''); setTagline('');
      setDescription(''); setServiceArea(''); setBusinessAddress(''); setZipcode('');
      setPhone(''); setWebsite('');
      setAvailability('');
      setResponseTime(''); setPortfolioImages([]); setLicensed(null);
      setLicenseNumber(''); setInsured(null); setBonded(null); setCertifications('');
      setServices([{ name: '' }, { name: '' }, { name: '' }]);
      setPricingDetails({});
    } catch (err) {
      console.error(err);
      Alert.alert('Upload failed', err.message || 'Something went wrong.');
    }
  };

  const handleBack = onBack || (navigation ? () => navigation.goBack() : null);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {!!handleBack && (
        <TouchableOpacity
          style={[styles.backBtn, { marginTop: insets.top }]}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color="#0A8A4A" />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.header}>🔧 {editMode ? 'Edit Service' : 'Add a Service'}</Text>

      {/* ── Basic Info ── */}
      <SectionCard title="Business Info">
        <Field label="Business Name *" value={businessName} onChangeText={setBusinessName} placeholder="e.g. A1 Plumbing Co." />
        <Field label="Your Name" value={providerName} onChangeText={setProviderName} placeholder="e.g. John Smith" />
        <Field label="Tagline" value={tagline} onChangeText={setTagline} placeholder="e.g. Fast, reliable, and affordable" />
        <Field label="Service Area *" value={serviceArea} onChangeText={setServiceArea} placeholder="e.g. Long Beach, CA • 90802" />
        <Field label="Business Address" value={businessAddress} onChangeText={setBusinessAddress} placeholder="e.g. 123 Main St" />
        <Field label="Zipcode" value={zipcode} onChangeText={setZipcode} placeholder="90802" keyboardType="numeric" />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="(562) 555-0100" keyboardType="phone-pad" />
        <Field label="Website (optional)" value={website} onChangeText={setWebsite} placeholder="https://yourbusiness.com" />
      </SectionCard>

      {/* ── Category — hidden in signup flow (already selected), editable in edit mode ── */}
      {!initialCategory && (
        <SectionCard title="Category *">
          {SERVICE_CATEGORY_GROUPS.map(({ group, items }) => (
            <View key={group} style={styles.categoryGroup}>
              <Text style={styles.categoryGroupLabel}>{group}</Text>
              <View style={styles.chipWrap}>
                {items.map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => { if (c !== category) { setCategory(c); setPricingDetails({}); } }}
                    style={[styles.chip, category === c && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      {/* ── Category Pricing Questions ── */}
      {Boolean(category && CATEGORY_QUESTIONS[category]) && (
        <SectionCard title="Service Pricing *">
          <Text style={styles.pricingNote}>
            Please answer each question about your pricing. We'll use your answers to create quick, accurate estimates for specific jobs. You'll always review and approve an estimate before it's sent to a customer.
          </Text>
          {CATEGORY_QUESTIONS[category].map(({ service, questions }) => (
            <View key={service} style={styles.pricingGroup}>
              <Text style={styles.pricingServiceTitle}>{service}</Text>
              {questions.map(({ label, placeholder }) => (
                <Field
                  key={label}
                  label={label}
                  value={pricingDetails[service]?.[label] || ''}
                  onChangeText={v => updatePricing(service, label, v)}
                  placeholder={placeholder}
                />
              ))}
            </View>
          ))}
        </SectionCard>
      )}

      {/* ── Description ── */}
      <SectionCard title="Description">
        <Field
          label="Tell customers about your service"
          value={description}
          onChangeText={setDescription}
          placeholder="Experience, specialties, tools used, service guarantee…"
          multiline
        />
      </SectionCard>

      {/* ── Top 3 Services customers come to you for ── */}
      <SectionCard title="Top 3 Most Requested Services">
        {services.map((svc, idx) => (
          <Field
            key={idx}
            label={idx === 0 ? 'Service name' : undefined}
            value={svc.name}
            onChangeText={v => updateService(idx, 'name', v)}
            placeholder={['e.g. Brake repair', 'Annual Physical', 'Tax preparation'][idx]}
          />
        ))}
      </SectionCard>

      {/* ── Availability ── */}
      <SectionCard title="Availability">
        <Text style={styles.label}>Earliest available</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          {AVAILABILITY.map(a => (
            <TouchableOpacity
              key={a}
              onPress={() => setAvailability(a)}
              style={[styles.chip, availability === a && styles.chipActive]}
            >
              <Text style={[styles.chipText, availability === a && styles.chipTextActive]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Field label="Response Time" value={responseTime} onChangeText={setResponseTime} placeholder="e.g. Usually responds in < 1 hr" />
      </SectionCard>

      {/* ── Licensed / Insured / Bonded? ── */}
      <SectionCard title="Licensing, Insurance, Bonded">
        <Text style={styles.label}>Are you licensed?</Text>
        <View style={styles.toggleRow}>
          {[{ val: true, label: '✅ Yes' }, { val: false, label: '❌ No' }].map(opt => (
            <TouchableOpacity
              key={String(opt.val)}
              style={[styles.toggleBtn, licensed === opt.val && styles.toggleBtnActive]}
              onPress={() => setLicensed(opt.val)}
            >
              <Text style={[styles.toggleBtnText, licensed === opt.val && styles.toggleBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {licensed && (
          <Field label="License Number" value={licenseNumber} onChangeText={setLicenseNumber} placeholder="e.g. CA-PLM-123456" />
        )}

        <Text style={styles.label}>Are you insured?</Text>
        <View style={styles.toggleRow}>
          {[{ val: true, label: '✅ Yes' }, { val: false, label: '❌ No' }].map(opt => (
            <TouchableOpacity
              key={String(opt.val)}
              style={[styles.toggleBtn, insured === opt.val && styles.toggleBtnActive]}
              onPress={() => setInsured(opt.val)}
            >
              <Text style={[styles.toggleBtnText, insured === opt.val && styles.toggleBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Are you bonded?</Text>
        <View style={styles.toggleRow}>
          {[{ val: true, label: '✅ Yes' }, { val: false, label: '❌ No' }].map(opt => (
            <TouchableOpacity
              key={String(opt.val)}
              style={[styles.toggleBtn, bonded === opt.val && styles.toggleBtnActive]}
              onPress={() => setBonded(opt.val)}
            >
              <Text style={[styles.toggleBtnText, bonded === opt.val && styles.toggleBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Certifications (optional)" value={certifications} onChangeText={setCertifications} placeholder="e.g. EPA certified, OSHA trained" />
      </SectionCard>

      {/* ── Portfolio Photos ── */}
      <SectionCard title={`Portfolio Photos (${portfolioImages.length}/4)`}>
        <View style={styles.portfolioGrid}>
          {portfolioImages.map((img, idx) => (
            <View key={idx} style={styles.portfolioThumbWrap}>
              <Image
                source={{ uri: img.uri }}
                style={[styles.portfolioThumb, idx === 0 && styles.portfolioThumbProfile]}
              />
              <TouchableOpacity style={styles.removeBtn} onPress={() => removePortfolioImage(idx)}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
              {idx === 0 && <Text style={styles.profilePicLabel}>Profile Picture</Text>}
            </View>
          ))}
          {portfolioImages.length < 4 && (
            <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPortfolioImage}>
              <Text style={styles.addPhotoBtnIcon}>+</Text>
              <Text style={styles.addPhotoBtnText}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </SectionCard>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.88}>
        <Text style={styles.submitText}>
          {editMode ? 'Save Changes' : onBack ? 'Confirm Account and Upload Service' : 'Upload Service'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Reusable sub-components ──────────────────────────────────────────────────
function SectionCard({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType || 'default'}
        multiline={!!multiline}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#F8FAFD' },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, alignSelf: 'flex-start' },
  backBtnText: { fontSize: 16, fontWeight: '600', color: '#0A8A4A', marginLeft: 2 },
  header: {
    fontSize: 26, fontWeight: '800', color: '#0A8A4A',
    textAlign: 'center', marginBottom: 20, marginTop: 10,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.07,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#111',
    marginBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#F1F3F5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111',
  },
  textArea: { height: 110, textAlignVertical: 'top' },

  categoryLockedRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryLockedNote: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
  categoryGroup:      { marginBottom: 16 },
  categoryGroupLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 },
  chipWrap:           { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999,
    borderWidth: 1.5, borderColor: '#D1D5DB', marginRight: 8,
    backgroundColor: '#fff', marginBottom: 8,
  },
  chipActive: { backgroundColor: '#0A8A4A', borderColor: '#0A8A4A' },
  chipText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },

  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  toggleBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center',
    backgroundColor: '#fff',
  },
  toggleBtnActive: { backgroundColor: '#0A8A4A', borderColor: '#0A8A4A' },
  toggleBtnText: { fontWeight: '700', color: '#374151', fontSize: 14 },
  toggleBtnTextActive: { color: '#fff' },


  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  portfolioThumbWrap: { position: 'relative', width: 90, height: 90 },
  portfolioThumb: { width: 90, height: 90, borderRadius: 10 },
  portfolioThumbProfile: { borderWidth: 3, borderColor: '#2563EB' },
  profilePicLabel: {
    position: 'absolute', bottom: 2, left: 2, right: 2,
    backgroundColor: '#2563EB', borderRadius: 4,
    paddingVertical: 2, textAlign: 'center',
    color: '#fff', fontSize: 8, fontWeight: '700',
  },
  removeBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#EF4444', width: 22, height: 22,
    borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  addPhotoBtn: {
    width: 90, height: 90, borderRadius: 10,
    borderWidth: 2, borderColor: '#D1D5DB', borderStyle: 'dashed',
    backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center',
  },
  addPhotoBtnIcon: { fontSize: 24, color: '#9CA3AF', lineHeight: 28 },
  addPhotoBtnText: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },

  pricingNote: {
    fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 18,
  },
  pricingGroup: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pricingServiceTitle: {
    fontSize: 14, fontWeight: '800', color: '#0A8A4A',
    marginBottom: 12, letterSpacing: 0.2,
  },

  submitButton: {
    backgroundColor: '#0A8A4A', paddingVertical: 18,
    borderRadius: 14, alignItems: 'center',
    shadowColor: '#0A8A4A', shadowOpacity: 0.35,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 17 },
});