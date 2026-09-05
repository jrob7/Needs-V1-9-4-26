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
    "handyman", "cleaner", "housekeeping", "maid",
    "landscaper", "landscaping", "lawn", "mow", "hedge", "yard", "garden", "sprinkler",
    "painter", "painting", "carpenter", "carpentry", "cabinet", "deck",
    "moving", "movers", "relocation",
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
    "food", "eat", "hungry", "restaurant", "taco", "burger", "pizza", "sushi",
    "ramen", "salad", "sandwich", "wings", "bbq", "brunch", "breakfast", "lunch",
    "dinner", "dessert", "coffee", "boba", "seafood", "steak", "vegan", "halal",
    "kosher", "gluten", "menu", "dish", "cuisine", "chef", "dine", "takeout",
    "delivery", "spicy", "sweet", "craving", "meal", "drink", "bar", "cafe"
]


def is_food_description(labels: str, user_text: str) -> bool:
    """
    Simple heuristic: if any FOOD-related keyword appears
    in the combined text, treat the request as food-related.
    """
    text = f"{labels} {user_text}".lower()
    return any(word in text for word in FOOD_HINT_WORDS)


@enhancer_bp.post("/enhanceNeedDescription")
def enhance_need_description():
    """
    Unified enhancement endpoint:
      - Auto-detect SERVICE vs FOOD (no match on either -> ask user to clarify)
      - Build the correct prompt
      - Run your local LLM
      - Clean unwanted copied prompt text
      - Return final enhanced description
    """
    body = request.get_json(silent=True) or {}
    labels = (body.get("labels") or "").strip()
    user_text = (body.get("userText") or "").strip()

    if not labels and not user_text:
        return jsonify({"error": "labels or userText is required"}), 400

    is_service = is_service_description(labels, user_text)
    is_food = is_food_description(labels, user_text)

    # Neither domain detected — don't force a guess (this is what was producing
    # unrelated "craving Thai food" text for things like "start a fundraiser").
    # Let the caller ask the user to restate their request instead.
    if not is_service and not is_food:
        return jsonify({"description": "", "unclear": True})

    # Decide which prompt to use
    if is_service:
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