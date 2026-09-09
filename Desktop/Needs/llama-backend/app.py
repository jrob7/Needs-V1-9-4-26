from flask import Flask, request, jsonify, make_response
from pymongo import MongoClient
from flask_cors import CORS
import re
import logging
import os
from datetime import datetime, timezone

from ai_service import generate_response

app = Flask(__name__)
CORS(app, origins='*', allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

from image_enhancer import enhancer_bp as image_enhancer_bp
app.register_blueprint(image_enhancer_bp)

from decision_routes import decision_bp
app.register_blueprint(decision_bp, url_prefix="/ai")

from enhancer_router import enhancer_bp
app.register_blueprint(enhancer_bp, url_prefix="/ai")

from match_routes import match_bp
app.register_blueprint(match_bp, url_prefix="/ai")

logging.getLogger("pymongo").setLevel(logging.WARNING)
logging.basicConfig(level=logging.DEBUG)

MONGO_URI = "mongodb+srv://jrehurst7:FmFml9ohKDtGBh36@needcluster1.3mhquys.mongodb.net/?retryWrites=true&w=majority"
client = MongoClient(MONGO_URI)
db = client.Need
collection = db.mistral_queries

@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        res = make_response()
        res.headers['Access-Control-Allow-Origin']  = '*'
        res.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        res.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        return res

@app.before_request
def log_request():
    logging.debug(f"🔥 Incoming Request: {request.method} {request.url}")
    logging.debug(f"📦 Body: {request.get_json()}")

@app.after_request
def log_response(response):
    logging.debug(f"✅ Response Status: {response.status_code}")
    logging.debug(f"📨 Response Data: {response.get_json()}")
    return response

def classify_intent(user_query: str) -> str:
    q = (user_query or "").lower()
    FUND_WORDS = [
        "fundraiser","raise funds","raising funds","start a fund","crowdfund",
        "go fund me","gofundme","donation drive","campaign","collect donations"
    ]
    # Fundraiser initiation disabled for now — app is currently focused on services & restaurants.
    # return "fundraiser" if any(w in q for w in FUND_WORDS) else "need"
    return "need"

SERVICE_HINT_WORDS = [
    "repair","fix","leak","broken","installation","install",
    "pickup","remove","clean","service","damaged","replace",
    # Home Services
    "plumber","plumbing","pipe","faucet","drain","toilet","sink","water heater","clog",
    "electrician","electrical","outlet","wiring","breaker","circuit","fuse","switch",
    "hvac","furnace","thermostat","air conditioner","heater","ductwork",
    "handyman","cleaner","housekeeping","maid",
    "landscaper","landscaping","lawn","mow","hedge","yard","garden","sprinkler",
    "painter","painting","carpenter","carpentry","cabinet","deck",
    "moving","movers","relocation",
    # Automotive
    "tire","wheel","automotive","vehicle","car","mechanic","oil change","check engine","alternator",
    "brake","engine","battery","windshield","transmission",
    "alignment","rotor","muffler","exhaust","flat","worn","tread",
    "tow","towing","roadside assistance","auto body","dent","bumper","collision","fender",
    # Personal Care
    "barber","haircut","beard trim","fade","hair salon","hairstylist","blowout",
    "nail salon","manicure","pedicure","massage","masseuse","spa",
    # Professional Services
    "attorney","lawyer","legal advice","lawsuit","custody",
    "cpa","accountant","bookkeeping","tax preparer","tax return",
    "filing my taxes","filing taxes","tax filing","my taxes",
    "insurance agent","real estate agent","realtor",
    # Family & Education
    "tutor","tutoring","homework help","test prep",
    "daycare","childcare","babysitter","babysitting","preschool",
    "music lessons","piano lessons","guitar lessons","voice lessons",
    "elder care","senior care","caregiver","home health aide",
    # Pet Services
    "groomer","dog grooming","cat grooming","pet boarding","kennel",
    "pet sitting","dog walking","dog walker","pet sitter",
    "walk my dog","walk the dog","walking my dog","dog sitter",
    # Community Support
    "shelter","rehab","rehabilitation","addiction treatment",
    "food bank","food assistance","food pantry","church","ministry","nonprofit","charity",
]

def detect_need_type(text: str) -> str:
    t = (text or "").lower()
    if any(w in t for w in SERVICE_HINT_WORDS):
        return "service"
    # Item flow disabled for now — app is currently focused on services & restaurants.
    # return "item"
    return "food"

def looks_like_enhanced_text(text: str) -> bool:
    if not text:
        return False
    return bool(
        re.search(r"\n?\s*1\.\s+.+\n\s*2\.\s+.+\n\s*3\.\s+", text, re.S)
    )

def query_mistral(prompt):
    formatted_prompt = f"""
Extract:
1. What is the user requesting?
2. When do they want it?
3. How much are they willing to pay?

User: "{prompt}"

1.
2.
3.
"""
    return generate_response(formatted_prompt)

def normalize_urgency(text):
    t = text.lower()
    if any(w in t for w in ['asap', 'immediately', 'right now', 'as soon as possible', 'urgently', 'urgent']):
        return 'ASAP'
    if 'today' in t:
        return 'Today'
    if 'this week' in t or 'few days' in t:
        return 'This Week'
    if 'this month' in t or 'few weeks' in t:
        return 'This Month'
    if any(w in t for w in ['flexible', 'anytime', 'no rush', 'whenever']):
        return 'Flexible'
    return 'Flexible'

def extract_search_params(ai_response, original_query=None):
    if "---" in ai_response:
        ai_response = ai_response.split("---")[-1].strip()
    if "[end of text]" in ai_response:
        ai_response = ai_response.split("[end of text]")[0].strip()

    match = re.search(
        r"1\.\s*(.*?)\s*"
        r"2\.\s*(.*?)\s*"
        r"3\.\s*(.*?)(?:\[end of text\]|\Z)",
        ai_response,
        re.S
    )

    if not match:
        return {
            "searchText": original_query or ai_response.strip()[:120],
            "urgency": "Flexible",
            "bidprice": 0
        }

    urgency_raw = match.group(2).strip()
    price_text = match.group(3).strip()

    num_match = re.search(r"(\d+)", price_text)
    bidprice = int(num_match.group(1)) if num_match else 0

    return {
        "searchText": original_query or match.group(1).strip(),
        "urgency": normalize_urgency(urgency_raw),
        "bidprice": bidprice
    }

@app.post("/search")
def search():
    data = request.json
    user_query = data.get("query")

    if not user_query:
        return jsonify({"error": "Query is required"}), 400

    intent = classify_intent(user_query)
    need_type = detect_need_type(user_query)

    if intent == "fundraiser":
        return jsonify({
            "summary": user_query,
            "searchParams": None,
            "context": user_query,
            "type": "fundraiser"
        })

    if looks_like_enhanced_text(user_query):
        extracted_data = extract_search_params(user_query, original_query=user_query)
        summary = user_query
    else:
        ai_response = query_mistral(user_query)
        extracted_data = extract_search_params(ai_response, original_query=user_query)
        summary = ai_response

    try:
        collection.insert_one({
            "query": user_query,
            "raw_response": summary,
            "extracted": extracted_data,
            "createdAt": datetime.now(timezone.utc)
        })
    except:
        pass

    return jsonify({
        "summary": summary,
        "searchParams": extracted_data,
        "type": "need",
        "needType": need_type
    })

@app.post("/ask")
def ask():
    body = request.get_json(silent=True) or {}
    q = (body.get("query") or "").strip()

    if not q:
        return jsonify({"error": "Query is required"}), 400

    prompt = f"""
searchText:
urgency:
bidprice:

User: {q}
"""

    text = query_mistral(prompt)
    return jsonify({"response": text})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=False, port=port, host='0.0.0.0')