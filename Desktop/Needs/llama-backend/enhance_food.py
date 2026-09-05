# enhance_food.py

def build_food_prompt(labels: str, user_text: str) -> str:
    """
    Short prompt for food/restaurant-style requests.
    """

    # HYBRID MODE (image + user text)
    if user_text:
        return f"""
Write a short, natural food order request (1-2 sentences) for a person craving the dish or cuisine described below.
Mention the dish or cuisine and optionally include urgency (e.g., "right now", "tonight"). Do NOT mention any price, budget, or dollar amount.

Do NOT invent specific facts that are not in the keywords or user text above — no made-up restaurant names, dish ingredients, or details you were not given. Keep it general enough to cover the craving without stating specifics you were not given.

Keywords: {labels}
User: {user_text}

Write the final request clearly and naturally.
""".strip()

    # IMAGE-ONLY MODE
    return f"""
Write a short, natural food order request (1-2 sentences) as if you are a real person craving the dish or cuisine shown in the keywords.
Optionally include urgency (e.g., "right now", "tonight"). Do NOT mention any price, budget, or dollar amount.

Do NOT invent specific facts that are not in the keywords above — no made-up restaurant names, dish ingredients, or details you were not given. Keep it general enough to cover the craving without stating specifics you were not given.

Keywords: {labels}

Write the final request clearly and naturally.
""".strip()
