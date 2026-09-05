# app.py
from flask import Flask, request, jsonify
from pymongo import MongoClient
from flask_cors import CORS
import subprocess, re, logging, os
from datetime import datetime

MISTRAL_CLI_PATH = os.path.abspath("/Users/joshhurst/llama.cpp/build/bin/llama-cli")
MISTRAL_MODEL_PATH = os.path.expanduser(
    "~/llama.cpp/models/mistral-7b-instruct-v0.1.Q4_K_M.gguf"
)

app = Flask(__name__)
CORS(app)

logging.getLogger("pymongo").setLevel(logging.WARNING)
logging.basicConfig(level=logging.DEBUG)

# --- Mongo (still used to log need extractions) ---
MONGO_URI = "mongodb+srv://jrehurst7:FmFml9ohKDtGBh36@needcluster1.3mhquys.mongodb.net/?retryWrites=true&w=majority"
client = MongoClient(MONGO_URI)
db = client.Need
mistral_queries = db.mistral_queries

# ---------- logging ----------
@app.before_request
def log_request():
    logging.debug(f"🔥 Incoming Request: {request.method} {request.url}")
    logging.debug(f"📡 Headers: {dict(request.headers)}")
    logging.debug(f"📦 Body: {request.get_json(silent=True)}")

@app.after_request
def log_response(response):
    logging.debug(f"✅ Response Status: {response.status_code}")
    logging.debug(f"📨 Response Data: {response.get_json(silent=True)}")
    return response

# ---------- LLM helpers ----------
def call_mistral(prompt: str, temp="0.2", n_predict="60") -> str:
    cmd = [MISTRAL_CLI_PATH, "-m", MISTRAL_MODEL_PATH, "-p", prompt, "--temp", temp, "--n_predict", n_predict]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
        out = []
        for line in proc.stdout:
            out.append(line.rstrip("\n"))
        proc.stdout.close()
        proc.wait()
        return "\n".join(out)
    except Exception as e:
        return f"🔥 Error running Mistral: {e}"

def classify_intent(user_query: str) -> str:
    q = (user_query or "").lower()
    FUND_WORDS = [
        "fundraiser","raise funds","raising funds","start a fund","crowdfund",
        "go fund me","gofundme","donation drive","campaign","collect donations",
        "funding goal","fund my","help me raise"
    ]
    return "fundraiser" if any(w in q for w in FUND_WORDS) else "need"

def need_prompt(user_query: str) -> str:
    return f"""
You are an AI assistant that extracts structured information from user requests.

Once a request is received, answer the following questions in a numbered list format:
1. What is the user requesting? (Item name)
2. When do they want it? (Urgency: today, tomorrow, next week, etc.)
3. How much are they willing to pay? (Price in dollars)

ONLY return the list with extracted details—no extra text.

#### USER REQUEST
"{user_query}"

---
1. <Extracted Item>
2. <Extracted Urgency>
3. <Extracted Price>
"""

def extract_need(ai_text: str):
    logging.debug(f"📝 Raw Mistral Response:\n{ai_text}")
    m = re.search(r"\n?1\.\s*(.*?)\s*\n2\.\s*(.*?)\s*\n3\.\s*\$?(\d+)", ai_text, re.S)
    if not m:
        return None
    item = m.group(1).strip()
    urgency = m.group(2).strip()
    price = int(m.group(3).strip())
    bad = [
        "What is the user requesting?",
        "When do they want it?",
        "How much are they willing to pay?",
    ]
    if item in bad or urgency in bad:
        return None
    return {"searchText": item, "urgency": urgency, "bidprice": price}

# ---------- Routes ----------
@app.post("/search")
def search():
    """
    Detects intent:
      - 'fundraiser' => return type='fundraiser' (UI will run fundraiser Q&A)
      - 'need' => run Mistral extraction and return searchParams (original flow)
    """
    body = request.get_json(silent=True) or {}
    user_query = (body.get("query") or "").strip()
    if not user_query:
        return jsonify({"error": "Query is required"}), 400

    logging.debug(f"🚀 Processing Search Query: {user_query}")
    intent = classify_intent(user_query)
    logging.debug(f"🔎 Classified intent: {intent}")

    if intent == "fundraiser":
        return jsonify({"summary": "Detected fundraiser intent", "type": "fundraiser"})

    llm_text = call_mistral(need_prompt(user_query), n_predict="60", temp="0.2")
    params = extract_need(llm_text)
    if not params:
        return jsonify({"error": "Could not extract structured data"}), 400

    try:
        mistral_queries.insert_one({
            "query": user_query,
            "raw_response": llm_text,
            "extracted": params,
            "createdAt": datetime.utcnow(),
        })
    except Exception as e:
        logging.warning(f"mistral insert warning: {e}")

    return jsonify({"summary": llm_text, "searchParams": params, "type": "need"})

# 🔧 Add back a simple /ask endpoint so your Node route /createNeedRequest can call it
@app.post("/ask")
def ask():
    body = request.get_json(silent=True) or {}
    q = (body.get("query") or "").strip()
    if not q:
        return jsonify({"error": "Query is required"}), 400
    prompt = f"""You are helping collect missing fields for a need request.
Given: "{q}"
Reply with a concise suggestion like:
searchText: <guess or 'General Inquiry'>
urgency: <guess or 'No Urgency'>
bidprice: <number or '0'>
"""
    text = call_mistral(prompt, temp="0.4", n_predict="80")
    return jsonify({"response": text})

if __name__ == "__main__":
    app.run(debug=True, port=5001)