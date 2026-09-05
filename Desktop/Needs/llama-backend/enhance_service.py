# enhance_service.py

def build_service_prompt(labels, user_text=""):
    # TEXT-ONLY MODE — user typed their own request, no image.
    # Rewrite/clarify what they said; do not invent new facts.
    if user_text and not labels:
        return f"""
You are cleaning up a service-based need request for a community help app.

User's original request:
{user_text}

TASK:
Restructure and clarify the request above into a single, natural, legible request to hire a service. Infer the most likely service category (e.g., plumbing, electrical, automotive repair, hair/nail salon, legal, tutoring, pet grooming, elder care, etc.) from what they wrote.

Do NOT invent or add any facts, prices, measurements, brands, or details the user did not mention. If they gave a price or urgency, keep it as given. If they did not, leave it out rather than making one up.

Do NOT list bullets.
Do NOT add headers.
Just return the rewritten request text.
[end]
"""

    # HYBRID MODE (image + user text)
    if labels and user_text:
        return f"""
You are writing a service-based need request for a community help app.

Image clues:
{labels}

User description:
{user_text}

TASK:
Write a natural marketplace request to hire a service for the issue described above. If a price or urgency was mentioned, include it; otherwise do not invent one. Include a brief description of the work. Do not ask for a quote.

Do NOT invent specific facts that are not in the keywords or user description above — no made-up sizes, model numbers, brands, measurements, or part numbers. Keep the description general enough to cover the issue without stating specifics you were not given.

Do NOT list bullets.
Do NOT add headers.
Just return the combined service request text.
[end]
"""
    else:
        return f"""
You are writing a service-based need request for a community help app.

Image clues:
{labels}

TASK:
Write a natural marketplace request to hire a service for the issue in the keywords. If a price or urgency is reasonably implied, include it; otherwise do not invent one. Include a brief description of the work. Do not ask for a quote.

Do NOT invent specific facts that are not in the keywords above — no made-up sizes, model numbers, brands, measurements, or part numbers. Keep the description general enough to cover the issue without stating specifics you were not given.

Make the output sound like a request a real person would make.

Do NOT list bullets.
Do NOT add headers.
Just return the text.
[end]
"""
