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


def classify_domain_with_llm(labels: str, user_text: str) -> str:
    """
    Ask the LLM to classify the request as FOOD, SERVICE, or UNCLEAR.
    Returns one of: 'food', 'service', 'unclear'.

    Used as a fallback when keyword matching doesn't confidently detect food —
    so that "I want a burrito", "something spicy", "I'm starving", etc. all
    route correctly without needing an exhaustive keyword list.
    """
    combined = f"{labels} {user_text}".strip()
    classification_prompt = (
        f'Classify this request with one word: FOOD, SERVICE, or UNCLEAR.\n\n'
        f'FOOD — person is hungry or wants to find/order food or a meal:\n'
        f'  - Any expression of hunger counts: "I\'m starving", "haven\'t eaten",\n'
        f'    "I\'m hungry", "I need something to eat", "feed me"\n'
        f'  - Craving or requesting any food, dish, drink, or restaurant\n\n'
        f'SERVICE — person needs a skilled professional or trade to do work:\n'
        f'  - Trade/profession names always mean SERVICE, even as a single word:\n'
        f'    mover, movers, cleaner, plumber, electrician, painter, mechanic,\n'
        f'    landscaper, handyman, roofer, contractor, barber, therapist, lawyer,\n'
        f'    accountant, tutor, babysitter, dog walker, groomer, etc.\n'
        f'  - Repair, cleaning, moving, electrical, plumbing, auto, landscaping, etc.\n'
        f'  - Appliance problems are ALWAYS SERVICE (not food): "fridge doesn\'t work",\n'
        f'    "washer broken", "dryer won\'t start", "stove not heating", "oven broken",\n'
        f'    "dishwasher leaking", "microwave not working", "fridge stopped working"\n\n'
        f'UNCLEAR — food assistance / food bank / food pantry (nonprofit need),\n'
        f'  fundraiser, donation, or anything not clearly food or a paid service.\n\n'
        f'Request: "{combined}"\n\n'
        f'Answer with one word only:'
    )
    try:
        raw = generate_response(classification_prompt).strip().upper()
        # Take only the first word to avoid false matches like
        # "This is SERVICE not FOOD" triggering "FOOD" first.
        first_word = raw.split()[0] if raw.split() else ""
        if first_word in ("FOOD", "SERVICE", "UNCLEAR"):
            return first_word.lower()
        # Fallback: scan for the first of the three labels that appears
        import re
        match = re.search(r'\b(SERVICE|FOOD|UNCLEAR)\b', raw)
        if match:
            return match.group(1).lower()
    except Exception:
        pass
    return "unclear"


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