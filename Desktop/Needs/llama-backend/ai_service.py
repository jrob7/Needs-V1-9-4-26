import os
import logging
import subprocess
import base64
import requests

from mistralai.client import Mistral
from mistralai.client.models.file import File as MistralFile

AI_PROVIDER = os.getenv("AI_PROVIDER", "api")

# ---------- LOCAL ----------
def call_local(prompt):
    MISTRAL_CLI_PATH = os.path.abspath("/Users/joshhurst/llama.cpp/build/bin/llama-cli")
    MISTRAL_MODEL_PATH = os.path.expanduser("~/llama.cpp/models/mistral-7b-instruct-v0.1.Q4_K_M.gguf")

    command = [
        MISTRAL_CLI_PATH,
        "-m", MISTRAL_MODEL_PATH,
        "-p", prompt,
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
    for line in process.stdout:
        output.append(line.strip())

    process.stdout.close()
    process.wait()

    return "\n".join(output)

# ---------- MISTRAL API ----------
_mistral = Mistral(api_key=os.getenv("MISTRAL_API_KEY", ""))

def call_api(prompt):
    print("🔥 USING MISTRAL API")
    response = _mistral.chat.complete(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content

# ---------- RUNPOD GPU ----------
RUNPOD_API_URL = os.getenv("RUNPOD_API_URL", "")
RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "")
RUNPOD_MODEL   = os.getenv("RUNPOD_MODEL", "mistral")

def call_gpu(prompt):
    print("⚡ USING RUNPOD GPU")
    if not RUNPOD_API_URL:
        raise ValueError("RUNPOD_API_URL env var not set")
    headers = {"Content-Type": "application/json"}
    if RUNPOD_API_KEY:
        headers["Authorization"] = f"Bearer {RUNPOD_API_KEY}"
    res = requests.post(
        f"{RUNPOD_API_URL}/v1/chat/completions",
        headers=headers,
        json={
            "model": RUNPOD_MODEL,
            "messages": [{"role": "user", "content": prompt}]
        },
        timeout=120
    )
    res.raise_for_status()
    return res.json()["choices"][0]["message"]["content"]

# ---------- MASTER SWITCH ----------
def generate_response(prompt):
    print(f"🔥 AI PROVIDER BEING USED: {AI_PROVIDER}")
    print("🔥 generate_response() WAS CALLED")

    if AI_PROVIDER == "api":
        print("🌐 USING API")
        try:
            return call_api(prompt)
        except Exception as e:
            if RUNPOD_API_URL:
                logging.warning(f"Mistral API failed ({e}), falling back to RunPod")
                return call_gpu(prompt)
            raise

    elif AI_PROVIDER == "gpu":
        print("⚡ USING GPU MODEL")
        return call_gpu(prompt)

    elif AI_PROVIDER == "local":
        print("💻 USING LOCAL MODEL")
        return call_local(prompt)

    else:
        raise ValueError(f"❌ Unknown AI_PROVIDER: {AI_PROVIDER}")

# ---------- PIXTRAL (image analysis) ----------
def analyze_image_pixtral(base64_image: str) -> str:
    response = _mistral.chat.complete(
        model="pixtral-12b-2409",
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
                },
                {
                    "type": "text",
                    "text": (
                        "Describe this image focusing on any visible problems, damage, or service needs. "
                        "Be specific about what a service provider would need to know: what the problem is, "
                        "where it is, and any severity or urgency indicators. Keep it under 3 sentences."
                    )
                }
            ]
        }]
    )
    return response.choices[0].message.content

# ---------- VOXTRAL (audio transcription) ----------
def transcribe_audio_voxtral(audio_base64: str, mime_type: str = "audio/mpeg") -> str:
    audio_bytes = base64.b64decode(audio_base64)
    ext_map = {
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/m4a": "m4a",
        "audio/wav": "wav",
        "audio/webm": "webm",
        "audio/aac": "aac",
    }
    ext = ext_map.get(mime_type.lower(), "m4a")

    result = _mistral.audio.transcriptions.complete(
        model="voxtral-mini-transcribe-2",
        file=MistralFile(
            file_name=f"recording.{ext}",
            content=audio_bytes,
            content_type=mime_type,
        )
    )
    return result.text or ""
