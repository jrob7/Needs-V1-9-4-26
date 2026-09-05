# image_enhancer.py

from flask import Blueprint, request, jsonify
import json
import re
import subprocess
import os

# Re-use the same model + binary path
MISTRAL_CLI_PATH = os.path.abspath("/Users/joshhurst/llama.cpp/build/bin/llama-cli")
MISTRAL_MODEL_PATH = os.path.expanduser(
    "~/llama.cpp/models/mistral-7b-instruct-v0.1.Q4_K_M.gguf"
)

enhancer_bp = Blueprint("enhancer_bp", __name__)


def query_mistral_raw(prompt: str) -> str:
    """
    Minimal raw runner for the image-title/description enhancer.
    Uses --simple-io so we just get plain text back.
    """
    command = [
        MISTRAL_CLI_PATH,
        "-m", MISTRAL_MODEL_PATH,
        "-p", prompt,
        "--temp", "0.4",
        "--n_predict", "200",
        "--simple-io",
    ]

    process = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )

    output_lines = []
    try:
        for line in process.stdout:
            output_lines.append(line.rstrip("\n"))
        process.stdout.close()
        process.wait()
    except Exception as e:
        process.kill()
        return f"[ERROR] LLM crashed: {str(e)}"

    return "\n".join(output_lines)


@enhancer_bp.post("/enhanceImageDescription")
def enhance_image_description():
    """
    Takes Vision labels and turns them into:
      { "title": "...", "description": "..." }

    Used by UploadItems.js when user uploads an image to create an item listing.
    """
    data = request.get_json(silent=True) or {}
    labels = data.get("labels", "")

    prompt = f"""
<s>[INST]
Turn the following visual keyword text into a marketplace item listing.

Return output **as pure JSON only**, with no explanation:

{{
  "title": "<6-10 word product title>",
  "description": "<2-4 sentence friendly description>"
}}

Rules:
- Do NOT invent brand names. (If a brand is already present, you may keep it.)
- If condition unknown, assume: "Gently used and well cared for."
- Output must be JSON **and nothing else**.

KEYWORDS: {labels}
[/INST]
"""

    # 🔹 Use the correctly named helper
    raw_output = query_mistral_raw(prompt)

    # Try to pull the last JSON object out of the raw text
    matches = re.findall(r"\{[\s\S]*?\}", raw_output)
    if matches:
        try:
            return jsonify(json.loads(matches[-1].strip()))
        except Exception:
            pass

    # Fallback if parsing failed
    return jsonify({"title": "", "description": ""})