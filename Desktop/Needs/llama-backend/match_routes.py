# match_routes.py
# ─────────────────────────────────────────────────────────────────────────────
# Registers:  POST /ai/findMatches
#
# Called by Tab1Content when the user makes a food or service request.
# Searches the Restaurants / Services MongoDB collections and returns
# the top 3 scored matches.
#
# Paste into app.py:
#   from match_routes import match_bp
#   app.register_blueprint(match_bp, url_prefix="/ai")
# ─────────────────────────────────────────────────────────────────────────────

from flask import Blueprint, request, jsonify
import os, re, json, logging, math, urllib.request, urllib.parse
from ai_service import generate_response

match_bp = Blueprint("match_bp", __name__)

# ── MongoDB connection ────────────────────────────────────────────────────────
def get_db():
    from __main__ import db
    return db


# ── Geo helpers ───────────────────────────────────────────────────────────────
METERS_PER_MILE = 1609.34
RESTAURANT_RADIUS_MI = 15
NONPROFIT_RADIUS_MI  = 35

def haversine_miles(lat1, lng1, lat2, lng2):
    """Straight-line distance in miles between two lat/lng points."""
    R = 3958.8  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))

def proximity_boost(distance_miles, radius_miles):
    """Returns a multiplier 1.0–3.0: closer = higher. Zero beyond radius."""
    if distance_miles > radius_miles:
        return 0.0
    # Inverse-distance boost, capped at 2x extra weight at 0 miles
    return 1.0 + 2.0 / (1.0 + distance_miles)

def reverse_geocode(lat, lng):
    """Returns (city, state, postcode) via Nominatim. Returns ('','','') on failure."""
    try:
        url = (f"https://nominatim.openstreetmap.org/reverse"
               f"?lat={lat}&lon={lng}&format=json")
        req = urllib.request.Request(
            url, headers={"User-Agent": "NeedsApp/1.0 (jrehurst7@gmail.com)"}
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
        addr = data.get("address", {})
        city     = addr.get("city") or addr.get("town") or addr.get("village") or ""
        state    = addr.get("state", "")
        postcode = addr.get("postcode", "")
        return city, state, postcode
    except Exception:
        return "", "", ""

def service_covers_location(doc, user_city, user_state, user_zip):
    """
    Binary gate: does this service cover the user's area?
    serviceArea is free text like 'Long Beach, CA • 90802'.
    Returns True if the business has no serviceArea set (assume citywide/regional).
    """
    service_area = (doc.get("serviceArea") or "").lower()
    if not service_area:
        return True  # no restriction declared — include

    if user_city  and user_city.lower()  in service_area: return True
    if user_zip   and user_zip           in service_area: return True
    if user_state and user_state.lower() in service_area: return True
    return False

def fetch_with_geonear(collection, user_lat, user_lng, radius_miles, extra_fields):
    """
    Runs $geoNear aggregation. Returns docs with injected 'distance_miles' field.
    Falls back to a plain find() if geoPoint index doesn't exist yet.
    """
    db = get_db()
    col = db[collection]
    pipeline = [
        {
            "$geoNear": {
                "near": {"type": "Point", "coordinates": [user_lng, user_lat]},
                "distanceField": "dist_meters",
                "maxDistance": radius_miles * METERS_PER_MILE,
                "spherical": True,
            }
        },
        {"$limit": 200},
        {"$project": dict({f: 1 for f in extra_fields}, dist_meters=1)},
    ]
    try:
        docs = list(col.aggregate(pipeline))
        for d in docs:
            d["distance_miles"] = d.pop("dist_meters", 0) / METERS_PER_MILE
        return docs, True  # (docs, used_geo)
    except Exception as e:
        logging.warning(f"$geoNear failed on {collection} (index may not exist yet): {e}")
        docs = list(col.find({}, {f: 1 for f in extra_fields}).limit(200))
        return docs, False  # fell back to plain query


URGENCY_MAP = {
    "now": "Now", "right now": "Now", "asap": "Now", "immediately": "Now",
    "tonight": "Tonight", "this evening": "Tonight",
    "lunch": "Quick lunch", "quick lunch": "Quick lunch",
    "breakfast": "Breakfast", "brunch": "Brunch",
    "dinner": "Dinner", "tonight's dinner": "Dinner",
    "later": "Later today", "today": "Later today",
    "tomorrow": "Tomorrow",
    "this afternoon": "This afternoon", "afternoon": "This afternoon",
    "soon": "Soon", "in a bit": "Soon", "whenever": "Flexible",
    "this weekend": "This weekend", "weekend": "This weekend",
}

MEAL_TYPE_MAP = {
    "quick lunch": "Quick lunch", "lunch": "Lunch", "breakfast": "Breakfast",
    "brunch": "Brunch", "dinner": "Dinner", "late night": "Late night",
    "snack": "Snack", "dessert": "Dessert", "coffee": "Coffee",
    "afternoon": "Afternoon snack", "this afternoon": "Afternoon snack",
}

STRIP_PREFIXES = re.compile(
    r'^(?:i\s+)?(?:want|need|looking for|craving|find me|get me|show me|'
    r'searching for|can i get|id like|i\'d like|give me|any)\s+(?:some\s+)?(?:a\s+)?',
    re.I
)

DISTANCE_PATTERNS = [
    (r'(\d+\.?\d*)\s*mi(?:les?)?',    'mi'),
    (r'(\d+\.?\d*)\s*km',             'km'),
    (r'(\d+\.?\d*)\s*block',          'blocks'),
    (r'nearby|close by|walking distance|close to me', 'nearby'),
    (r'far|far away',                  '5+ mi'),
]

PRICE_PATTERN = re.compile(
    r'\$\s*(\d+)\s*(?:[-–to]+\s*\$?\s*(\d+))?'
    r'|(\d+)\s*(?:[-–to]+\s*(\d+))?\s*dollars?'
    r'|(?:under|below|less than|around|about|approx\.?)\s*\$?\s*(\d+)',
    re.I
)

MEAL_BUDGET_DEFAULTS = {
    "Breakfast":        (8,  15),
    "Brunch":           (12, 25),
    "Quick lunch":      (10, 20),
    "Lunch":            (10, 20),
    "Afternoon snack":  (5,  12),
    "Snack":            (5,  12),
    "Coffee":           (4,  10),
    "Dinner":           (15, 40),
    "Tonight":          (15, 40),
    "Late night":       (8,  20),
    "Dessert":          (5,  15),
    "Now":              (10, 20),
    "Soon":             (10, 20),
    "Later today":      (10, 20),
    "This afternoon":   (8,  15),
    "Tomorrow":         (10, 25),
    "This weekend":     (15, 40),
    "Flexible":         (10, 25),
}

def extract_food_context(text: str) -> dict:
    lower = text.lower().strip()

    search_text = STRIP_PREFIXES.sub('', text).strip()
    search_text = re.split(
        r'\s+(?:for\s+(?:quick\s+)?(?:lunch|dinner|breakfast|brunch|dessert|coffee|snack))'
        r'|\s+(?:under|around|about|below|less than|approx\.?)\s*\$'
        r'|\s+(?:within|near|close to|around)\s+\d'
        r'|\s+\$\d',
        search_text, maxsplit=1, flags=re.I
    )[0].strip()

    if not search_text or len(search_text) < 2:
        search_text = text.strip()

    urgency = "Now"
    for phrase, val in sorted(URGENCY_MAP.items(), key=lambda x: -len(x[0])):
        if phrase in lower:
            urgency = val
            break

    meal_type = None
    for phrase, val in sorted(MEAL_TYPE_MAP.items(), key=lambda x: -len(x[0])):
        if phrase in lower:
            meal_type = val
            break
    if meal_type is None:
        meal_type = urgency if urgency not in ("Now", "Soon", "Flexible") else "Meal"

    budget_min   = None
    budget_max   = None
    budget_label = None
    pm = PRICE_PATTERN.search(text)
    if pm:
        g = pm.groups()
        if g[0]:
            budget_min = int(g[0])
            budget_max = int(g[1]) if g[1] else budget_min
        elif g[2]:
            budget_min = int(g[2])
            budget_max = int(g[3]) if g[3] else budget_min
        elif g[4]:
            budget_max = int(g[4])
            budget_min = max(1, budget_max - 10)

    if budget_min is None:
        defaults = MEAL_BUDGET_DEFAULTS.get(meal_type) \
                or MEAL_BUDGET_DEFAULTS.get(urgency) \
                or (10, 20)
        budget_min, budget_max = defaults
        budget_label = f"~${budget_min}–${budget_max}"
    else:
        if budget_min != budget_max:
            budget_label = f"${budget_min}–${budget_max}"
        else:
            budget_label = f"Under ${budget_min}"

    distance = None
    for pattern, unit in DISTANCE_PATTERNS:
        dm = re.search(pattern, lower)
        if dm:
            if unit in ('mi', 'km', 'blocks'):
                distance = f"{dm.group(1)} {unit}"
            else:
                distance = unit
            break

    return {
        "searchText":   search_text,
        "urgency":      urgency,
        "mealType":     meal_type,
        "budgetMin":    budget_min,
        "budgetMax":    budget_max,
        "budgetLabel":  budget_label,
        "distance":     distance,
        "needType":     "food",
        "bidprice":     budget_max,
    }


FOOD_KEYWORDS = [
    "food","eat","hungry","restaurant","taco","burger","pizza","sushi",
    "ramen","salad","sandwich","wings","bbq","brunch","breakfast","lunch",
    "dinner","dessert","coffee","boba","seafood","steak","vegan","halal",
    "kosher","gluten","menu","dish","cuisine","chef","dine","takeout",
    "delivery","spicy","sweet","fresh","homemade"
]

SERVICE_KEYWORDS = [
    "fix","repair","install","plumb","electric","clean","paint","landscape",
    "move","haul","handyman","hvac","carpenter","wiring","pipe","leak",
    "broken","outlet","mow","lawn","pressure","wash","service","contractor"
]

NONPROFIT_KEYWORDS = [
    "shelter","homeless shelter","emergency shelter","temporary shelter",
    "temporary housing","transitional housing","emergency housing","affordable housing",
    "housing assistance","rent assistance","eviction","homelessness","homeless",
    "rehab","rehabilitation","addiction treatment","recovery program",
    "food bank","food assistance","food pantry","meal program","pantry",
    "church","ministry","congregation","religious service",
    "nonprofit","charity","ngo","community organization",
    "community resource","community services","social services","welfare",
    "free help","low income",
    "need help with shelter","help with shelter","help finding shelter",
]

def classify_request(text: str) -> str:
    lower = text.lower()
    nonprofit_score = sum(1 for w in NONPROFIT_KEYWORDS if w in lower)
    food_score      = sum(1 for w in FOOD_KEYWORDS      if w in lower)
    service_score   = sum(1 for w in SERVICE_KEYWORDS   if w in lower)
    if nonprofit_score > 0 and nonprofit_score >= food_score and nonprofit_score >= service_score:
        return "nonprofit"
    if food_score > service_score and food_score > 0:
        return "food"
    if service_score > food_score and service_score > 0:
        return "service"
    return "item"


# ── Service category domain detection ───────────────────────────────────────
# Generic action/symptom words like "leak" or "repair" show up across many
# trades, so they can't reliably identify a domain on their own — they're
# listed under whichever trade they're most associated with, but the trade-
# specific anchor words (tire, pipe, outlet, lawn...) are what really decide
# the detected category below.
CATEGORY_KEYWORDS = {
    # Home Services
    "Plumber":           ["plumber", "plumbing", "pipe", "faucet", "drain", "toilet",
                            "sink", "water heater", "clog"],
    "Electrician":       ["electrician", "electrical", "outlet", "wiring", "breaker",
                            "circuit", "fuse", "switch", "light fixture"],
    "HVAC":              ["hvac", "furnace", "thermostat", "air conditioner", "ac unit",
                            "heater", "ductwork", "ventilation"],
    "Handyman":          ["handyman", "odd job", "small repair", "general repair"],
    "Cleaner":           ["clean", "cleaning", "carpet cleaning", "deep clean",
                            "housekeeping", "maid"],
    "Landscaper":        ["lawn", "mow", "landscape", "landscaping", "hedge",
                            "tree trim", "yard", "garden", "sprinkler"],
    "Painter":           ["paint", "painting", "painter", "wall paint",
                            "exterior paint", "interior paint"],
    "Carpentry":         ["carpenter", "carpentry", "woodwork", "cabinet",
                            "deck building", "framing"],
    "Moving":            ["moving", "movers", "relocation", "haul furniture",
                            "move out", "move in"],
    # Automotive
    "Mechanic":          ["mechanic", "engine", "transmission", "oil change",
                            "car repair", "check engine", "alternator", "car battery"],
    "Tire Shop":         ["tire", "wheel", "flat tire", "tire repair",
                            "tire replacement", "rotor", "alignment"],
    "Auto Body":         ["auto body", "dent", "bumper", "collision", "fender",
                            "windshield"],
    "Towing":            ["tow", "towing", "tow truck", "roadside assistance",
                            "stuck car", "jump start"],
    # Personal Care
    "Barber":            ["barber", "haircut", "beard trim", "shave", "fade"],
    "Hair Salon":        ["hair salon", "hairstylist", "blowout", "hair color",
                            "highlights", "perm"],
    "Nail Salon":        ["nail salon", "manicure", "pedicure", "gel nails",
                            "nails done"],
    "Massage":           ["massage", "masseuse", "spa", "deep tissue",
                            "relaxation massage"],
    # Professional Services
    "Attorney":          ["attorney", "lawyer", "legal advice", "lawsuit",
                            "contract review", "divorce", "custody"],
    "CPA":               ["cpa", "accountant", "bookkeeping", "accounting",
                            "financial statement"],
    "Tax Preparer":      ["tax preparer", "tax prep", "file my taxes", "filing my taxes",
                            "filing taxes", "tax filing", "my taxes", "tax return", "irs"],
    "Insurance Agent":   ["insurance agent", "insurance policy", "auto insurance",
                            "home insurance", "life insurance"],
    "Real Estate Agent": ["real estate agent", "realtor", "buy a house",
                            "sell my house", "home listing"],
    # Family & Education
    "Tutor":             ["tutor", "tutoring", "homework help", "math help",
                            "test prep", "algebra", "sat prep"],
    "Daycare":           ["daycare", "childcare", "babysitter", "babysitting", "preschool"],
    "Music Lessons":     ["music lessons", "piano lessons", "guitar lessons",
                            "voice lessons", "music teacher"],
    "Elder Care":        ["elder care", "senior care", "caregiver", "home health aide",
                            "elderly assistance"],
    # Pet Services
    "Groomer":           ["dog groomer", "pet groomer", "grooming", "dog grooming",
                            "cat grooming"],
    "Boarding":          ["pet boarding", "dog boarding", "kennel", "pet hotel"],
    "Pet Sitting":       ["pet sitting", "dog walking", "dog walker", "pet sitter",
                            "walk my dog", "walk the dog", "walking my dog", "dog sitter"],
}

def _category_keyword_counts(text: str) -> dict:
    lower = text.lower()
    counts = {cat: sum(1 for w in words if w in lower)
              for cat, words in CATEGORY_KEYWORDS.items()}
    return {cat: n for cat, n in counts.items() if n > 0}

def detect_service_category(text: str):
    """Returns the trade category with the most anchor-word hits, or None if no
    category has any hits (ambiguous / generic request)."""
    counts = _category_keyword_counts(text)
    if not counts:
        return None
    return max(counts, key=counts.get)

def detect_service_category_with_count(text: str):
    """Like detect_service_category, but also returns how many anchor words
    matched — used to judge how confident the keyword signal is."""
    counts = _category_keyword_counts(text)
    if not counts:
        return None, 0
    top = max(counts, key=counts.get)
    return top, counts[top]

SERVICE_CATEGORY_LIST = list(CATEGORY_KEYWORDS.keys())

def classify_category_with_ai(text: str):
    """Asks the LLM to pick the best-matching category directly from the
    request text. Returns None if the model says "None" or returns something
    that doesn't match one of the known categories."""
    prompt = f"""
You are a strict classifier for a local services marketplace. Read the user's request and return ONLY the single best matching category from this exact list, written exactly as shown, or return "None" if it does not clearly match any of them.

Categories: {", ".join(SERVICE_CATEGORY_LIST)}

Request: "{text}"

Respond with ONLY the category name exactly as listed, or "None". No explanation, no punctuation, no extra words.
""".strip()

    try:
        raw = (generate_response(prompt) or "").strip()
    except Exception as e:
        logging.error(f"AI category classification failed: {e}")
        return None

    raw = raw.strip().strip('"').strip("'").split("\n")[0].strip()
    for cat in SERVICE_CATEGORY_LIST:
        if raw.lower() == cat.lower():
            return cat
    return None

# Categories named "<Specific Anchor> <generic suffix>" (e.g. "Food
# Assistance") are vulnerable to the AI picking them purely because the
# query contains the generic suffix word ("assistance", "help") attached to
# some *other* topic — e.g. "utility bill assistance" has nothing to do with
# food, but shares the word "assistance" with the category's own name. This
# requires the category's actual anchor word to be present before trusting
# the AI's pick of it.
CATEGORY_ANCHOR_REQUIRED = {
    "Food Assistance": ["food", "meal"],
}

def classify_service_category(text: str):
    """Hybrid classifier: runs the AI classifier and the keyword matcher and
    reconciles disagreements.
    - If they agree, use that category (this also covers both saying "none").
    - If they disagree, trust the AI — UNLESS the keyword match is extremely
      strong (2+ distinct anchor words matched), in which case the keyword
      match overrides the AI.

    Deliberately NOT triggering an override on a single literal mention of a
    category's own name — e.g. "...need a tow to my mechanic" contains the
    word "mechanic", but the actual need is Towing. A lone incidental word
    isn't reliable evidence on its own; only count it when keywords agree
    on the same category from 2+ independent angles.
    """
    ai_category = classify_category_with_ai(text)
    kw_category, kw_hits = detect_service_category_with_count(text)

    # Anchor guard — disqualify the AI's pick if it's a generic-suffix
    # category whose specific anchor word isn't actually in the query
    # (e.g. AI says "Food Assistance" for "utility bill assistance", but
    # "food"/"meal" never appears — defer entirely to the keyword matcher).
    if ai_category in CATEGORY_ANCHOR_REQUIRED:
        lower = text.lower()
        if not any(anchor in lower for anchor in CATEGORY_ANCHOR_REQUIRED[ai_category]):
            return kw_category

    if ai_category == kw_category:
        return ai_category

    kw_is_strong = kw_hits >= 2

    return kw_category if kw_is_strong else ai_category


# ── Routing-readiness check ─────────────────────────────────────────────────
# A second layer beyond category detection: is the request understandable
# enough for a provider to decide whether to respond? Not enough to diagnose
# or quote — just enough to route. If not, ask exactly ONE non-technical
# clarifying question targeting the single most valuable missing piece of
# information. Never invent facts; only use what the user actually wrote.
READINESS_PROMPT_TEMPLATE = """
You are evaluating a service request for a local services marketplace. Decide whether a typical qualified service provider would have enough information to decide whether they want to respond to this request.

Do NOT require enough information to diagnose or quote the job. Only judge whether the request is understandable enough for ROUTING — i.e. matching it to the right provider and letting that provider decide if they're interested.

Rules:
- A request that names ONLY the profession/category with no indication of the actual task or issue (e.g. "I need a plumber", "I need to hire an electrician", "Looking for a mechanic") is NEVER ready, even though the category is obvious — knowing who to route it to is not the same as a provider having enough to decide whether to respond. Ask what specifically the work is for.
- If the request is already understandable enough for routing, set "ready" to true and "question" to null. Favor this outcome — do not ask unnecessary questions.
- If not, identify the SINGLE most valuable missing piece of information and ask exactly ONE short, plain-language, non-technical question about it. Never ask more than one question.
- Good questions (examples): "What do you need the plumber for?", "Is the leak constant or only when the faucet is running?", "Which appliance needs repair?", "Is the issue inside or outside the home?", "Approximately how many rooms need painting?"
- Bad questions — never ask things like this (too technical/diagnostic): "What type of PVC fitting is installed?", "What breaker size do you have?", "What brand is your water heater?", "What tools have you already tried?"
- Never invent or assume severity, measurements, brand names, materials, causes, or damage level. Base your judgment only on the user's actual text below.
- Prioritize a missing piece of information that would help determine: the correct service category, whether a business can reasonably decide to respond, the scope of work, or urgency — in that order of value.

Detected category: {category}
User's request: "{query}"

Respond with ONLY valid JSON, no other text, in exactly this shape:
{{"ready": true, "question": null}}
or
{{"ready": false, "question": "<single short non-technical question>"}}
""".strip()

def _extract_json_object(text: str) -> dict:
    """Pulls the first balanced top-level {...} block out of raw LLM output
    (which may be wrapped in markdown code fences) and parses it. Tracks
    brace depth rather than a non-greedy regex, since a naive regex stops at
    the first inner "}" and mangles any response with nested objects/arrays."""
    if not text:
        return {}
    start = text.find('{')
    if start == -1:
        return {}
    depth = 0
    for i in range(start, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                try:
                    obj = json.loads(text[start:i + 1])
                    return obj if isinstance(obj, dict) else {}
                except Exception:
                    return {}
    return {}

_READINESS_FILLER_WORDS = {
    "i", "need", "needs", "a", "an", "to", "want", "wanted", "wants", "hire",
    "hiring", "looking", "for", "some", "get", "help", "with", "please",
    "the", "my", "is", "im", "am", "asap", "now",
}

def _is_bare_category_request(query: str, category: str) -> bool:
    """True if, once filler words and the category name itself are stripped,
    nothing is left — i.e. the request names only a profession ("I need a
    plumber") with zero indication of the actual task. The readiness LLM
    call was judging these as ready since the category alone is routable,
    but a bare profession name is never enough for a provider to decide
    whether to respond."""
    if not category:
        return False
    words = re.findall(r"[a-z]+", query.lower())
    category_words = set(re.findall(r"[a-z]+", category.lower()))
    leftover = [w for w in words if w not in _READINESS_FILLER_WORDS and w not in category_words]
    return len(leftover) == 0

def assess_service_readiness(query: str, category=None):
    """Returns {"ready": bool, "question": str|None, "category": str|None}.
    Defaults to ready=True (favor routing) if the LLM call fails or returns
    something unparseable — a missing assessment should never block posting."""
    if category is None:
        category = classify_service_category(query)

    if _is_bare_category_request(query, category):
        return {
            "ready": False,
            "question": f"What specifically do you need the {category.lower()} for?",
            "category": category,
        }

    prompt = READINESS_PROMPT_TEMPLATE.format(category=category or "Unknown", query=query)

    try:
        raw = generate_response(prompt) or ""
    except Exception as e:
        logging.error(f"Readiness assessment failed: {e}")
        return {"ready": True, "question": None, "category": category}

    parsed = _extract_json_object(raw)
    ready = parsed.get("ready")
    question = parsed.get("question")

    if not isinstance(ready, bool):
        # Unparseable response — favor routing rather than blocking the user.
        return {"ready": True, "question": None, "category": category}

    if ready or not question or not isinstance(question, str) or not question.strip():
        return {"ready": True, "question": None, "category": category}

    return {"ready": False, "question": question.strip(), "category": category}


INFO_REQUEST_PROMPT_TEMPLATE = """
A service provider in the category "{category}" received this request from a customer and wants a few more details before responding.

Customer's request: "{query}"

Generate exactly 3 short, customer-friendly multiple-choice questions that would help the provider understand the job. Each question must have 2 to 5 short answer options (single words or short phrases, no more than ~3 words each).

Rules:
- Questions must be answerable by a typical homeowner with no technical knowledge — never ask about parts, brands, models, or measurements.
- Base the questions on the category and the customer's actual request — do not invent specifics they didn't mention.
- Keep each question and option short enough to fit on a mobile screen.

Respond with ONLY valid JSON, no other text, in exactly this shape:
{{"questions": [
  {{"question": "<short question>", "options": ["<opt1>", "<opt2>"]}},
  {{"question": "<short question>", "options": ["<opt1>", "<opt2>", "<opt3>"]}},
  {{"question": "<short question>", "options": ["<opt1>", "<opt2>"]}}
]}}
""".strip()

def generate_info_request_questions(query: str, category=None):
    """Returns up to 3 {"question": str, "options": [str, ...]} dicts.
    Falls back to one generic open-ended question if the LLM call fails or
    returns something unparseable."""
    if category is None:
        category = classify_service_category(query)

    fallback = [{"question": "Can you share a bit more detail about what you need?", "options": []}]

    prompt = INFO_REQUEST_PROMPT_TEMPLATE.format(category=category or "service", query=query)
    try:
        raw = generate_response(prompt) or ""
    except Exception as e:
        logging.error(f"Info request generation failed: {e}")
        return fallback

    parsed = _extract_json_object(raw)
    questions = parsed.get("questions")
    if not isinstance(questions, list) or not questions:
        return fallback

    cleaned = []
    for q in questions[:3]:
        if not isinstance(q, dict):
            continue
        text = (q.get("question") or "").strip()
        opts = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
        if text:
            cleaned.append({"question": text, "options": opts[:5]})

    return cleaned or fallback


def _expand_query_words(words: list) -> list:
    """For compound food words (e.g. 'cheeseburger'), also emit the last 6-char
    suffix so 'burger' is checked separately. Handles spelling variants like
    'cheesburger' vs 'cheeseburger' that share the same food-type suffix."""
    expanded = list(words)
    for w in words:
        if len(w) >= 8:
            suffix = w[-6:]
            if suffix not in expanded:
                expanded.append(suffix)
    return expanded

def score_restaurant(doc: dict, query_words: list) -> int:
    score = 0
    name    = doc.get("name", "").lower()
    tagline = doc.get("tagline", "").lower()
    cuisine = doc.get("cuisine", "").lower()
    gtk     = " ".join(doc.get("goodToKnow", [])).lower()
    dishes  = doc.get("topDishes", [])

    for word in _expand_query_words(query_words):
        if word in name:    score += 3
        if word in tagline: score += 4
        if word in cuisine: score += 5
        if word in gtk:     score += 2

        for dish in dishes:
            dish_name = dish.get("name", "").lower()
            dish_desc = dish.get("description", "").lower()
            like_pct  = dish.get("likePercent", 0) or 0

            if word in dish_name:
                score += 10
                if like_pct >= 90:   score += 3
                elif like_pct >= 75: score += 1
            if word in dish_desc:
                score += 6

    if score == 0:
        score = -1

    return score

def score_service(doc: dict, query_words: list, detected_category=None) -> int:
    category = doc.get("category", "").lower()

    # A confidently-detected trade (e.g. "Automotive" from "tire") hard-vetoes
    # providers in an unrelated trade. This has to be a hard cutoff rather than
    # a score penalty — a long, natural query can rack up enough incidental
    # word overlaps (e.g. "installation" matching "Toilet ... Installation",
    # "right" matching a tagline's "Fixed Right") to outweigh a soft penalty.
    if detected_category and category != detected_category.lower():
        return -1

    score = 0
    business_name = doc.get("businessName", "").lower()
    tagline       = doc.get("tagline", "").lower()
    description   = doc.get("description", "").lower()
    service_area  = doc.get("serviceArea", "").lower()
    services      = doc.get("topServices", [])

    for word in query_words:
        if word in business_name: score += 3
        if word in tagline:       score += 3
        if word in category:      score += 6
        if word in service_area:  score += 1
        if word in description:   score += 1

        for svc in services:
            svc_name = svc.get("name", "").lower()
            if word in svc_name:
                score += 8

    if detected_category and category == detected_category.lower():
        score += 10

    if score <= 0:
        score = -1

    return score


def score_nonprofit(doc: dict, query_words: list) -> int:
    score = 0
    org_name     = doc.get("orgName", "").lower()
    org_type     = doc.get("orgType", "").lower()
    description  = doc.get("description", "").lower()
    help_types   = " ".join(doc.get("helpTypes", [])).lower()
    who_help     = doc.get("whoYouHelp", "").lower()
    service_area = doc.get("serviceArea", "").lower()

    for word in query_words:
        if word in org_name:     score += 3
        if word in org_type:     score += 4
        if word in description:  score += 2
        if word in help_types:   score += 8
        if word in who_help:     score += 3
        if word in service_area: score += 1

    return score if score > 0 else -1


@match_bp.route("/generateInfoRequest", methods=["POST"])
def generate_info_request_route():
    body  = request.get_json(silent=True) or {}
    query = (body.get("query") or "").strip()
    category = body.get("category")
    if not query:
        return jsonify({"error": "query required"}), 400
    questions = generate_info_request_questions(query, category)
    return jsonify({"questions": questions})


@match_bp.route("/extractFoodContext", methods=["POST"])
def extract_food_context_route():
    body  = request.get_json(silent=True) or {}
    query = (body.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400
    ctx = extract_food_context(query)
    return jsonify(ctx)


@match_bp.route("/checkServiceReadiness", methods=["POST"])
def check_service_readiness_route():
    body  = request.get_json(silent=True) or {}
    query = (body.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400
    result = assess_service_readiness(query)
    return jsonify(result)


@match_bp.route("/findMatches", methods=["POST"])
def find_matches():
    body          = request.get_json(silent=True) or {}
    query         = (body.get("query") or "").strip()
    req_type      = (body.get("type") or "auto").strip().lower()
    exclude_names = [n.lower().strip() for n in (body.get("excludeNames") or [])]

    # ── User location ─────────────────────────────────────────────────────────
    user_lat  = body.get("userLat")   # float | None
    user_lng  = body.get("userLng")   # float | None
    user_city = (body.get("userCity") or "").strip()
    user_zip  = (body.get("userZip")  or "").strip()
    user_state= (body.get("userState") or "").strip()
    has_coords = user_lat is not None and user_lng is not None

    # Reverse-geocode coords → city/state/zip if not provided (needed for service coverage check)
    if has_coords and not user_city:
        user_city, user_state, user_zip = reverse_geocode(float(user_lat), float(user_lng))
        logging.info(f"Reverse geocoded ({user_lat},{user_lng}) → {user_city}, {user_state} {user_zip}")

    if not query:
        return jsonify({"error": "query is required"}), 400

    if req_type == "auto":
        req_type = classify_request(query)

    STOPWORDS = {"the","and","for","with","that","this","have","want","need",
                 "please","can","you","from","some","get","find","near","me","a"}
    query_words = [w for w in re.findall(r'\b\w+\b', query.lower())
                   if len(w) >= 3 and w not in STOPWORDS]

    # ── FOOD ──────────────────────────────────────────────────────────────────
    if req_type == "food":
        ctx = extract_food_context(query)
        if ctx.get("searchText"):
            extra = [w for w in re.findall(r'\b\w+\b', ctx["searchText"].lower())
                     if len(w) >= 3 and w not in STOPWORDS]
            query_words = list(set(query_words + extra))

        FIELDS = ["_id", "userId", "name", "tagline", "cuisine", "priceRange",
                  "address", "phone", "coverImageUrl", "topDishes", "goodToKnow",
                  "waitMin", "waitMax", "hoursOpen", "menuUrl", "offer", "geoPoint"]

        if has_coords:
            docs, used_geo = fetch_with_geonear(
                "Restaurants", float(user_lat), float(user_lng),
                RESTAURANT_RADIUS_MI, FIELDS
            )
        else:
            try:
                docs = list(get_db()["Restaurants"].find({}, {f: 1 for f in FIELDS}).limit(200))
                used_geo = False
            except Exception as e:
                logging.error(f"Restaurants query failed: {e}")
                return jsonify({"error": "DB error"}), 500

        def final_score_restaurant(d):
            kw = score_restaurant(d, query_words)
            if kw <= 0:
                return -1
            if used_geo:
                dist = d.get("distance_miles", 0)
                return kw * proximity_boost(dist, RESTAURANT_RADIUS_MI)
            return kw

        scored  = sorted(docs, key=final_score_restaurant, reverse=True)
        matched = [d for d in scored if final_score_restaurant(d) > 0]
        if exclude_names:
            matched = [d for d in matched
                       if (d.get("name") or "").lower().strip() not in exclude_names]

        top3    = matched[:3]
        results = []
        for d in top3:
            d.pop("dist_meters", None)
            results.append(dict(d, _id=str(d["_id"]),
                                userId=str(d["userId"]) if d.get("userId") else None,
                                distanceMiles=round(d.get("distance_miles", 0), 1) if used_geo else None))
        return jsonify({"type": "food", "matches": results, "context": ctx})

    # ── SERVICE ───────────────────────────────────────────────────────────────
    if req_type == "service":
        FIELDS = ["_id", "userId", "businessName", "providerName", "category",
                  "tagline", "description", "serviceArea", "businessAddress",
                  "phone", "website", "rateType", "rateMin", "rateMax",
                  "availability", "responseTime", "licensed",
                  "topServices", "portfolioImageUrls"]
        try:
            docs = list(get_db()["Services"].find({}, {f: 1 for f in FIELDS}).limit(200))
        except Exception as e:
            logging.error(f"Services query failed: {e}")
            return jsonify({"error": "DB error"}), 500

        detected_category = classify_service_category(query)

        # Coverage gate first, then keyword score (no distance ranking for services)
        def final_score_service(d):
            if has_coords or user_city:
                if not service_covers_location(d, user_city, user_state, user_zip):
                    return -1
            return score_service(d, query_words, detected_category)

        scored  = sorted(docs, key=final_score_service, reverse=True)
        matched = [d for d in scored if final_score_service(d) > 0]
        if exclude_names:
            matched = [d for d in matched
                       if (d.get("businessName") or "").lower().strip() not in exclude_names]

        top3    = matched[:3]
        results = [dict(d, _id=str(d["_id"]),
                        userId=str(d["userId"]) if d.get("userId") else None) for d in top3]
        return jsonify({"type": "service", "matches": results, "context": {}})

    # ── NONPROFIT ─────────────────────────────────────────────────────────────
    if req_type == "nonprofit":
        FIELDS = ["_id", "userId", "orgName", "orgType", "description", "helpTypes",
                  "whoYouHelp", "cost", "serviceArea", "phone", "email", "website",
                  "address", "logoUrl", "availability", "requirements", "languages", "geoPoint"]

        if has_coords:
            docs, used_geo = fetch_with_geonear(
                "Nonprofits", float(user_lat), float(user_lng),
                NONPROFIT_RADIUS_MI, FIELDS
            )
        else:
            try:
                docs = list(get_db()["Nonprofits"].find({}, {f: 1 for f in FIELDS}).limit(200))
                used_geo = False
            except Exception as e:
                logging.error(f"Nonprofits query failed: {e}")
                return jsonify({"error": "DB error"}), 500

        def final_score_nonprofit(d):
            kw = score_nonprofit(d, query_words) if query_words else 1
            if kw <= 0:
                return -1
            if used_geo:
                dist = d.get("distance_miles", 0)
                return kw * proximity_boost(dist, NONPROFIT_RADIUS_MI)
            return kw

        scored  = sorted(docs, key=final_score_nonprofit, reverse=True)
        matched = [d for d in scored if final_score_nonprofit(d) > 0]
        if not matched:
            matched = docs[:3]  # fallback: show nearest if no keyword match

        top3    = matched[:3]
        results = []
        for d in top3:
            results.append(dict(d, _id=str(d["_id"]),
                                userId=str(d["userId"]) if d.get("userId") else None,
                                distanceMiles=round(d.get("distance_miles", 0), 1) if used_geo else None))
        return jsonify({"type": "nonprofit", "matches": results, "context": {}})

    # ── ITEM (passthrough) ────────────────────────────────────────────────────
    return jsonify({"type": "item", "matches": [], "context": {}})