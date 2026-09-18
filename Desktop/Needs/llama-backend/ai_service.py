import os
import logging
import subprocess
from mistralai.client import MistralClient
import requests

AI_PROVIDER = os.getenv("AI_PROVIDER", "api")  # local | api | gpu

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
client = MistralClient(api_key=os.getenv("MISTRAL_API_KEY", ""))

def call_api(prompt):
    print("🔥 USING MISTRAL API")
    response = client.chat(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content

# ---------- RUNPOD GPU ----------
RUNPOD_API_URL = os.getenv("RUNPOD_API_URL", "")   # e.g. https://xxxx-8000.proxy.runpod.net
RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "")   # RunPod API key (optional, depends on your setup)
RUNPOD_MODEL   = os.getenv("RUNPOD_MODEL", "mistral")  # model name your RunPod server exposes

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
            # Automatic fallback to RunPod if Mistral fails and RunPod is configured
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