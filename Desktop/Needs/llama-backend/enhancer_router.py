# enhancer_router.py
from flask import Blueprint, request, jsonify
# Item flow disabled for now — app is currently focused on services & restaurants.
# from enhance_item import build_item_prompt
from enhance_service import build_service_prompt
from enhance_food import build_food_prompt
from query_llm import query_llm  # simple one-argument LLM wrapper
from ai_service import generate_response
enhancer_bp = Blueprint("enhancer", __name__)

# Words that strongly suggest a SERVICE-type need
SERVICE_HINT_WORDS = [
    "repair", "fix", "leak", "broken", "installation", "install",
    "pickup", "remove", "clean", "service", "damaged", "replace",
    "outlet", "electrical", "hose", "pipe", "water",
    "trash", "junk", "haul", "wiring", "plumbing",
    "crack", "burnt",
    "tire", "wheel", "automotive", "vehicle", "car",
    "brake", "engine", "battery", "windshield", "transmission",
    "alignment", "rotor", "muffler", "exhaust", "flat", "worn", "tread",
    # Home Services
    "plumber", "faucet", "drain", "toilet", "sink", "water heater", "clog",
    "electrician", "breaker", "circuit", "fuse", "switch",
    "hvac", "furnace", "thermostat", "air conditioner", "heater", "ductwork",
    "roofer", "roofing", "roof", "shingle", "shingles", "gutter", "fascia",
    "handyman", "cleaner", "housekeeping", "maid",
    "appliance", "dryer", "washer", "dishwasher", "refrigerator", "fridge",
    "microwave", "oven", "stove", "garbage disposal", "freezer", "ice maker",
    "floor", "flooring", "hardwood", "carpet", "laminate", "vinyl floor", "tile floor",
    "auto repair", "auto shop", "brake service", "diagnostic", "tune up",
    "landscaper", "landscaping", "lawn", "mow", "hedge", "yard", "garden", "sprinkler",
    "painter", "painting", "carpenter", "carpentry", "cabinet", "deck",
    "moving", "mover", "movers", "relocation",
    # Automotive
    "mechanic", "oil change", "check engine", "alternator",
    "tow", "towing", "roadside assistance", "auto body", "dent", "bumper", "collision", "fender",
    # Personal Care
    "barber", "haircut", "beard trim", "fade", "hair salon", "hairstylist", "blowout",
    "nail salon", "manicure", "pedicure", "massage", "masseuse", "spa",
    # Professional Services
    "attorney", "lawyer", "legal advice", "lawsuit", "custody",
    "cpa", "accountant", "bookkeeping", "tax preparer", "tax return",
    "filing my taxes", "filing taxes", "tax filing", "my taxes",
    "insurance agent", "real estate agent", "realtor",
    # Family & Education
    "tutor", "tutoring", "homework help", "test prep",
    "daycare", "childcare", "babysitter", "babysitting", "preschool",
    "music lessons", "piano lessons", "guitar lessons", "voice lessons",
    "elder care", "senior care", "caregiver", "home health aide",
    # Pet Services
    "groomer", "dog grooming", "cat grooming", "pet boarding", "kennel",
    "pet sitting", "dog walking", "dog walker", "pet sitter",
    "walk my dog", "walk the dog", "walking my dog", "dog sitter",
    # Community Support
    "shelter", "rehab", "rehabilitation", "addiction treatment",
    "food bank", "food assistance", "food pantry", "church", "ministry", "nonprofit", "charity",
]


def is_service_description(labels: str, user_text: str) -> bool:
    """
    Simple heuristic: if any SERVICE-related keyword appears
    in the combined text, treat the request as service-related.
    """
    text = f"{labels} {user_text}".lower()
    return any(word in text for word in SERVICE_HINT_WORDS)


# Words that strongly suggest a FOOD/RESTAURANT-type need
FOOD_HINT_WORDS = [
    # General
    "food", "eat", "eating", "hungry", "hunger", "craving", "meal", "meals",
    "restaurant", "dine", "dining", "takeout", "delivery", "menu", "dish", "cuisine",
    "chef", "order", "ordered", "want to eat", "something to eat", "place to eat",
    # Mexican
    "taco", "tacos", "burrito", "burritos", "enchilada", "enchiladas", "quesadilla",
    "guacamole", "salsa", "nachos", "tamale", "tamales", "torta", "mexican",
    # American / Fast Food
    "burger", "burgers", "cheeseburger", "fries", "french fries", "hot dog",
    "chicken nuggets", "nuggets", "wings", "sandwich", "sub", "wrap", "bbq",
    "ribs", "brisket", "pulled pork", "steak", "steakhouse",
    # Italian / Pizza
    "pizza", "pasta", "lasagna", "spaghetti", "fettuccine", "alfredo",
    "ravioli", "risotto", "calzone", "stromboli", "italian",
    # Asian
    "sushi", "ramen", "pho", "udon", "soba", "tempura", "teriyaki", "hibachi",
    "dim sum", "dumplings", "fried rice", "lo mein", "pad thai", "spring roll",
    "orange chicken", "chinese", "japanese", "thai", "vietnamese", "korean",
    "bibimbap", "bulgogi", "boba", "bubble tea",
    # Seafood
    "bbq", "barbecue", "barbeque", "smokehouse", "brisket",
    "seafood", "fish", "shrimp", "lobster", "crab", "salmon", "tuna", "oyster",
    "clam", "scallop", "calamari",
    # Breakfast / Brunch
    "breakfast", "brunch", "pancakes", "waffles", "omelette", "eggs benedict",
    "avocado toast", "french toast", "bagel", "crepe",
    # Salads / Healthy
    "salad", "vegan", "vegetarian", "halal", "kosher", "gluten", "keto",
    "smoothie", "acai", "bowl",
    # Drinks / Desserts
    "coffee", "latte", "espresso", "cafe", "dessert", "ice cream", "gelato",
    "cake", "pastry", "donut", "cookie", "bar", "drink", "juice", "tea",
    # Catch-all phrases
    "spicy", "sweet", "savory", "comfort food", "soul food", "street food",
    "lunch", "dinner", "snack", "appetizer",
]


def _ask_yes_no(prompt: str) -> str:
    """Ask a focused YES/NO question. Returns 'yes', 'no', or 'unknown'."""
    try:
        raw = generate_response(prompt).strip().upper()
        first = raw.split()[0] if raw.split() else ""
        if first == "YES": return "yes"
        if first == "NO":  return "no"
        if "YES" in raw:   return "yes"
        if "NO"  in raw:   return "no"
    except Exception:
        pass
    return "unknown"


def classify_domain_chain(text: str) -> str:
    """
    Multi-step chain classifier. Each question is short and focused so the
    model can answer reliably without needing a wall of examples.
    Returns 'food', 'service', or 'unclear'.
    """
    # Q1 — Is this about eating or finding food/restaurants?
    q1 = _ask_yes_no(
        f'Is this a request for food, a restaurant, or something to eat or drink?\n'
        f'Request: "{text}"\n'
        f'Answer YES or NO only.'
    )
    if q1 == "yes":
        return "food"

    # Q2 — Does this need a skilled professional or trade service?
    q2 = _ask_yes_no(
        f'Does this request need a skilled professional, contractor, or trade service of any kind?\n'
        f'This includes: home repair, appliance repair, automotive, legal, financial,\n'
        f'medical, tutoring, pet care, personal care (hair/nails/massage/barber),\n'
        f'cleaning, landscaping, moving, roofing, flooring, pest control, locksmith, etc.\n'
        f'Request: "{text}"\n'
        f'Answer YES or NO only.'
    )
    if q2 == "yes":
        return "service"

    # Q3 — Is this a community/nonprofit need?
    q3 = _ask_yes_no(
        f'Is this a request for nonprofit help, community resources, a food bank,\n'
        f'shelter, donation, or charity assistance?\n'
        f'Request: "{text}"\n'
        f'Answer YES or NO only.'
    )
    if q3 == "yes":
        return "unclear"

    # Default — if we still can't tell, lean service (safer than food)
    return "service"


def classify_domain_with_llm(labels: str, user_text: str) -> str:
    """Wrapper kept for backwards compatibility — delegates to chain classifier."""
    return classify_domain_chain(f"{labels} {user_text}".strip())


@enhancer_bp.post("/enhanceNeedDescription")
def enhance_need_description():
    """
    Unified enhancement endpoint:
      1. Service keyword fast-path  (reliable — service words are distinctive)
      2. Food keyword fast-path     (catches obvious cases instantly)
      3. LLM classification fallback (catches anything the keywords miss)
      4. Return unclear only if the LLM also can't identify food or service
    """
    body = request.get_json(silent=True) or {}
    labels = (body.get("labels") or "").strip()
    user_text = (body.get("userText") or "").strip()

    if not labels and not user_text:
        return jsonify({"error": "labels or userText is required"}), 400

    import re as _re
    combined_lower = f"{labels} {user_text}".lower()

    def _food_matches(text):
        for w in FOOD_HINT_WORDS:
            # Use word-boundary match to avoid "eat" inside "heater", "bar" inside "barber"
            pattern = r'\b' + _re.escape(w) + r'\b'
            if _re.search(pattern, text):
                return True
        return False

    # Step 1: service keyword fast-path
    if is_service_description(labels, user_text):
        domain = "service"
    # Step 2: food keyword fast-path (word-boundary safe)
    elif _food_matches(combined_lower):
        domain = "food"
    # Step 3: LLM classification for anything the keywords missed
    else:
        domain = classify_domain_with_llm(labels, user_text)

    if domain == "unclear":
        return jsonify({"description": "", "unclear": True})

    if domain == "service":
        prompt = build_service_prompt(labels, user_text)
    else:
        prompt = build_food_prompt(labels, user_text)

    # ---- RUN LLM -------------------------------------------------
    raw = generate_response(prompt)

    # ---- CLEANUP PHASE -------------------------------------------

    # 1) Remove llama.cpp end markers
    if "[end of text]" in raw:
        raw = raw.split("[end of text]")[0]

    # 2) Remove echoed prompt by keeping only the last paragraph
    parts = raw.strip().split("\n\n")
    if len(parts) > 1:
        raw = parts[-1].strip()

    # REMOVE quotation marks
    raw = raw.replace('"', '').replace("'", '')
    
    # REMOVE forbidden phrase if LLM echoes it
    forbidden_phrase = "Write the final request clearly and naturally"
    if forbidden_phrase.lower() in raw.lower():
        raw = raw.lower().replace(forbidden_phrase.lower(), "").strip()



    # 3) Fallback if LLM produced nothing
    final = raw.strip() or user_text or labels

    # --------------------------------------------------------------

    return jsonify({"description": final})