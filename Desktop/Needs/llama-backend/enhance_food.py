# enhance_food.py

def build_food_prompt(labels: str, user_text: str) -> str:
    """
    Short prompt for food/restaurant-style requests.
    Only fixes grammar/spelling — never adds cuisine, cravings, or any detail
    the user did not explicitly state.
    """

    # HYBRID MODE (image + user text)
    if user_text:
        return f"""
You are cleaning up a food request for a community app.

User's original request:
{user_text}

TASK:
Fix grammar and spelling ONLY. Do NOT add any food type, cuisine, craving, adjective, or detail that the user did not write. Do NOT mention any price or dollar amount. If the user did not name a food or cuisine, do not invent one.

Return ONLY the corrected sentence. No explanation.
""".strip()

    # IMAGE-ONLY MODE (labels from image recognition, no user text)
    return f"""
Write a short, natural food request (1 sentence) based only on what is shown in these image keywords.
Do NOT invent restaurant names, ingredients, or any detail not in the keywords. Do NOT mention price or dollar amount.

Keywords: {labels}

Return ONLY the request sentence.
""".strip()
