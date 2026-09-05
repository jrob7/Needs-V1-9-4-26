import os
import subprocess
from mistralai.client import MistralClient
import requests

AI_PROVIDER = os.getenv("AI_PROVIDER", "api")  # local | api | gpu

# ---------- LOCAL (your current setup) ----------
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

# ---------- API (what you're switching to) ----------
client = MistralClient(api_key=os.getenv("MISTRAL_API_KEY", ""))

def call_api(prompt):
    print("🔥 USING MISTRAL API")

    response = client.chat(
        model="mistral-small-latest",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content

# ---------- FUTURE GPU ----------
def call_gpu(prompt):
    res = requests.post(
        "http://gpu-server:8000/v1/chat/completions",
        json={"messages": [{"role": "user", "content": prompt}]}
    )
    return res.json()["choices"][0]["message"]["content"]

# ---------- MASTER SWITCH ----------
def generate_response(prompt):
    print(f"🔥 AI PROVIDER BEING USED: {AI_PROVIDER}")
    print("🔥 generate_response() WAS CALLED")

    if AI_PROVIDER == "api":

        print("🌐 USING API")

        return call_api(prompt)

    elif AI_PROVIDER == "gpu":

        print("⚡ USING GPU MODEL")

        return call_gpu(prompt)

    elif AI_PROVIDER == "local":

        print("💻 USING LOCAL MODEL")

        return call_local(prompt)

    else:

        raise ValueError(f"❌ Unknown AI_PROVIDER: {AI_PROVIDER}")