from flask import Flask, request, jsonify
from pymongo import MongoClient
from flask_cors import CORS
import subprocess
import re
import logging
import requests
import os
import json
from datetime import datetime, timezone

# ✅ Set paths for Mistral CLI and Model
MISTRAL_CLI_PATH = os.path.abspath("/Users/joshhurst/llama.cpp/build/bin/llama-cli")
MISTRAL_MODEL_PATH = os.path.expanduser("~/llama.cpp/models/mistral-7b-instruct-v0.1.Q4_K_M.gguf")

# Initialize Flask App
app = Flask(__name__)
CORS(app)

# ⬇️ Already correct
from image_enhancer import enhancer_bp as image_enhancer_bp
app.register_blueprint(image_enhancer_bp)

# ⬇️ Decision system (View Need / Browse / New Request)
from decision_routes import decision_bp
app.register_blueprint(decision_bp, url_prefix="/ai")

# ⬇️ Master enhancement router
from enhancer_router import enhancer_bp
app.register_blueprint(enhancer_bp, url_prefix="/ai")

# ⬇️ Mistral engine (unused here but kept exactly as-is)
from mistral_engine import run_mistral

logging.getLogger("pymongo").setLevel(logging.WARNING)
logging.basicConfig(level=logging.DEBUG)

# ✅ MongoDB Connection
MONGO_URI = "mongodb+srv://jrehurst7:FmFml9ohKDtGBh36@needcluster1.3mhquys.mongodb.net/?retryWrites=true&w=majority"
client = MongoClient(MONGO_URI)
db = client.Need
collection = db.mistral_queries

# 🔹 Middleware
@app.before_request
def log_request():
    logging.debug(f"🔥 Incoming Request: {request.method} {request.url}")
    logging.debug(f"📦 Body: {request.get_json()}")

@app.after_request
def log_response(response):
    logging.debug(f"✅ Response Status: {response.status_code}")
    logging.debug(f"📨 Response Data: {response.get_json()}")
    return response

# ---------- Fundraiser classification ----------
def classify_intent(user_query: str) -> str:
    q = (user_query or "").lower()
    FUND_WORDS = [
        "fundraiser","raise funds","raising funds","start a fund","crowdfund",
        "go fund me","gofundme","donation drive","campaign","collect donations",
        "funding goal","fund my","help me raise"
    ]
    return "fundraiser" if any(w in q for w in FUND_WORDS) else "need"

# ---------- Item vs Service detection ----------
SERVICE_HINT_WORDS = [
    "repair","fix","leak","broken","installation","install",
    "pickup","remove","clean","service","damaged","replace",
    "outlet","electrical","hose","pipe","water",
    "trash","junk","haul","wiring","plumbing",
    "crack","burnt"
]

def detect_need_type(text: str) -> str:
    t = (text or "").lower()
    return "service" if any(w in t for w in SERVICE_HINT_WORDS) else "item"

# ---------- 🔒 Enhanced-text detector (NEW – minimal & safe) ----------
def looks_like_enhanced_text(text: str) -> bool:
    if not text:
        return False
    return bool(
        re.search(r"\n?\s*1\.\s+.+\n\s*2\.\s+.+\n\s*3\.\s+", text, re.S)
    )

# ---------- Mistral Prompt and Parsing (ORIGINAL – UNCHANGED) ----------
def query_mistral(prompt):
    formatted_prompt = f"""
You are an AI assistant that extracts structured information from user requests. 
Do not generate any response until a user request is given.

Once a request is received, answer the following questions in a numbered list format:
1. What is the user requesting? (Item name, but use full descriptive phrase. Include adjectives or context like “leaky faucet”, “broken pipe under sink”, “damaged iPhone screen”, not just a single noun.)
2. When do they want it? (Urgency: today, tomorrow, next week, etc.)
3. How much are they willing to pay? (Price in dollars)

ONLY return the list with extracted details—do NOT include explanations, examples, or any extra text.
⚠️ Do not repeat or rephrase the above instructions. Only output the answers as a numbered list.
⚠️ Do not include explanations, clarifications, or examples.
⚠️ Do not copy phrases like "What is the user requesting?" or "Urgency: today, tomorrow, next week".

#### **USER REQUEST**
"{prompt}"

---

1. <Extracted Item>
2. <Extracted Urgency>
3. <Extracted Price> [end of text]
"""
    command = [
        MISTRAL_CLI_PATH,
        "-m", MISTRAL_MODEL_PATH,
        "-p", formatted_prompt,
        "--temp", "0.2",
        "--n_predict", "30"
    ]

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace"
    )

    output = []
    try:
        for line in process.stdout:
            output.append(line.strip())
        process.stdout.close()
        process.wait()
    except Exception as e:
        process.kill()
        return f"🔥 Error Running Mistral: {e}"

    return "\n".join(output)
def extract_search_params(ai_response):
    logging.debug(f"📝 Raw Mistral Response:\n{ai_response}")

    # Clean unwanted prefixes
    if "---" in ai_response:
        ai_response = ai_response.split("---")[-1].strip()
    if "[end of text]" in ai_response:
        ai_response = ai_response.split("[end of text]")[0].strip()

    # Capture ALL three fields — item, urgency, price_text (NOT NUMBER!)
    match = re.search(
        r"1\.\s*(.*?)\s*"
        r"2\.\s*(.*?)\s*"
        r"3\.\s*(.*?)(?:\[end of text\]|\Z)",
        ai_response,
        re.S
    )

    if not match:
        logging.error("❌ Regex failed — using fallback extraction")
        return {
            "searchText": ai_response.strip()[:120],
            "urgency": "Unknown",
            "bidprice": 0
        }

    item = match.group(1).strip()
    urgency = match.group(2).strip()
    price_text = match.group(3).strip()

    # 🔥 SAFE PRICE EXTRACTION
    num_match = re.search(r"(\d+)", price_text)
    bidprice = int(num_match.group(1)) if num_match else 0

    return {
        "searchText": item,
        "urgency": urgency,
        "bidprice": bidprice
    }

# ---------- SEARCH ENDPOINT (MINIMALLY MODIFIED) ----------
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

    # 🔒 NEW SAFE LOGIC
    if looks_like_enhanced_text(user_query):
        logging.debug("🟢 Enhanced text detected — skipping Mistral")
        extracted_data = extract_search_params(user_query)
        summary = user_query
    else:
        ai_response = query_mistral(user_query)
        extracted_data = extract_search_params(ai_response)
        summary = ai_response

    try:
        collection.insert_one({
            "query": user_query,
            "raw_response": summary,
            "extracted": extracted_data,
            "context": user_query,
            "createdAt": datetime.now(timezone.utc)
        })
    except:
        pass

    return jsonify({
        "summary": summary,
        "searchParams": extracted_data,
        "context": user_query,
        "type": "need",
        "needType": need_type
    })

@app.post("/ask")
def ask():
    body = request.get_json(silent=True) or {}
    q = (body.get("query") or "").strip()
    if not q:
        return jsonify({"error": "Query is required"}), 400
    prompt = f"""You are helping collect missing fields for a need request.
Given: "{q}"
Reply with:
searchText: <guess>
urgency: <guess>
bidprice: <number>
"""
    text = query_mistral(prompt)
    return jsonify({"response": text})

if __name__ == "__main__":
    app.run(debug=True, port=5001)