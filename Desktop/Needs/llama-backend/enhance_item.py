# enhance_item.py

def build_item_prompt(labels: str, user_text: str) -> str:
    """
    Very short, leak-proof prompt for item requests.
    """

    # HYBRID MODE (image + user text)
    if user_text:
        return f"""
Write a short marketplace request for an item (1–2 sentences). 
Use only the physical object mentioned in the keywords or user text. Do not include store names.

Keywords: {labels}
User: {user_text}

Write the final request clearly and naturally.
""".strip()

    # IMAGE-ONLY MODE
    return f"""
Write a short, clear marketplace request (1–2 sentences) as if you a real person looking to buy the phyiscal item mentoned in the keywords. 
Please include a price, condition, and urgency in the description for the item you are trying to purchase. 


Keywords: {labels}

Write the final request clearly and naturally.
""".strip()