from flask import Blueprint, request, jsonify
from mistral_engine import run_mistral
import json
import logging
import re

decision_bp = Blueprint("decision_bp", __name__)

# Allowed actions
VALID_ACTIONS = {"VIEW_NEED", "VIEW_UPLOADED", "NEW_REQUEST", "FUNDRAISER",
                 "FIND_RESTAURANT", "FIND_SERVICE"}


# ---------------------------------------------------------
# CLEAN EXTRACTOR — picks the LAST valid JSON block
# ---------------------------------------------------------
def extract_json_block(text: str) -> dict:
    if not text:
        return {"action": "NEW_REQUEST"}

    matches = re.findall(r'\{[\s\S]*?\}', text)
    if not matches:
        return {"action": "NEW_REQUEST"}

    candidate = matches[-1]

    try:
        obj = json.loads(candidate)
        if isinstance(obj, dict) and "action" in obj:
            return obj
    except:
        pass

    return {"action": "NEW_REQUEST"}


# ---------------------------------------------------------
# DECISION ENDPOINT
# ---------------------------------------------------------
@decision_bp.route("/nextAction", methods=["POST"])
def next_action():
    body = request.json or {}
    user_reply = (body.get("userReply") or "").strip()

    logging.info(f"🧠 /nextAction received: '{user_reply}'")

    if not user_reply:
        return jsonify({"error": "Missing userReply"}), 400

    lower = user_reply.casefold()

    # ---------------------------------------------------------
    # 🔥 HARD RULES — RETURN IMMEDIATELY (NO LLM)
    # ---------------------------------------------------------

    # FUNDRAISER — initiation disabled for now; app is currently focused on services & restaurants.
    # if "fundraiser" in lower or "start a fundraiser" in lower:
    #     logging.info("🎯 HARD RULE → FUNDRAISER")
    #     return jsonify({"action": "FUNDRAISER"})

    # VIEW_UPLOADED (browse items)
    if any(phrase in lower for phrase in [
        "browse available",
        "browse items",
        "browse all items",
        "browse related items",
        "I want to browse related items",
        "view uploads",
        "view uploaded",
        "view uploaded items",
        "see available items",
        "show me items",
        "see similar items",
        "show me related items",
        "browse similar items"
    ]):
        logging.info("🎯 HARD RULE → VIEW_UPLOADED")
        return jsonify({"action": "VIEW_UPLOADED"})

    # VIEW_NEED
    if any(phrase in lower for phrase in [
        "view my need",
        "see my need",
        "view the need",
        "show my need",
    ]):
        logging.info("🎯 HARD RULE → VIEW_NEED")
        return jsonify({"action": "VIEW_NEED"})

    # ---------------------------------------------------------
    # ⭐ ONLY IF NO HARD RULE MATCHED → LLM
    # ---------------------------------------------------------

    system_prompt = """
You are an intent classifier for a community needs app. Classify the user's message into EXACTLY one of these actions based on their intent and context — not keywords.

ACTIONS:
• FIND_RESTAURANT  — The user is expressing hunger, craving a specific food, wanting to eat somewhere, or looking for a place that serves food. This includes any mention of a dish, cuisine, meal, or eating occasion regardless of how it is phrased.
• FIND_SERVICE     — The user wants to hire, find, or connect with a person or business that performs a skill or trade (repair, cleaning, construction, tutoring, design, legal, medical, etc.). This includes wanting help with a task they cannot or don't want to do themselves.
• VIEW_NEED        — The user wants to see or review a need request they just created.
• VIEW_UPLOADED    — The user wants to browse items that other people have uploaded or listed for sale/trade.
• FUNDRAISER       — The user wants to start a fundraiser or raise money for something.
• NEW_REQUEST      — The user wants to create a brand new need request, or their intent doesn't fit any of the above.

CLASSIFICATION RULES:
- Base your decision entirely on the user's intent and context, not on the presence or absence of specific words.
- A user describing a food item, meal occasion, or eating desire → FIND_RESTAURANT
- A user describing a problem they need someone else to solve, a skill they need, or a professional they want to hire → FIND_SERVICE
- When intent is ambiguous between FIND_SERVICE and NEW_REQUEST, choose FIND_SERVICE if there is any indication they want to connect with an existing provider.
- Return ONLY valid JSON with no extra text: {"action": "<ACTION>"}
""".strip()

    user_prompt = f'User said: "{user_reply}". Respond ONLY with JSON.'

    raw_output = run_mistral(system_prompt, user_prompt)
    logging.info(f"🧪 Raw Mistral Output: {raw_output}")

    # Clean common contamination
    raw_output = raw_output.replace("<one of the 4>", "")
    raw_output = raw_output.replace("one of the 4", "")
    raw_output = raw_output.replace("(one of the 4)", "")

    parsed = extract_json_block(raw_output)
    logging.info(f"🧹 Extracted JSON: {parsed}")

    action = parsed.get("action")
    if action not in VALID_ACTIONS:
        action = "NEW_REQUEST"

    # Fundraiser initiation disabled for now — app is currently focused on services & restaurants.
    if action == "FUNDRAISER":
        action = "NEW_REQUEST"

    final = {"action": action}
    logging.info(f"🎯 Final Decided Action: {final}")

    return jsonify(final)