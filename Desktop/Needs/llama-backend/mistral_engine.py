import subprocess
import os

# Paths to your llama.cpp CLI and model
MISTRAL_CLI_PATH = os.path.abspath("/Users/joshhurst/llama.cpp/build/bin/llama-cli")
MISTRAL_MODEL_PATH = os.path.expanduser(
    "~/llama.cpp/models/mistral-7b-instruct-v0.1.Q4_K_M.gguf"
)

def run_mistral(system_prompt: str, user_prompt: str) -> str:
    """
    Runs the Mistral model using llama.cpp and returns the raw output text.
    """
    full_prompt = f"{system_prompt}\n\nUSER:\n{user_prompt}\n\nASSISTANT:"
    
    command = [
        MISTRAL_CLI_PATH,
        "-m", MISTRAL_MODEL_PATH,
        "-p", full_prompt,
        "--temp", "0.2",
        "--n_predict", "80"
    ]

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace"
        )

        output_lines = []
        for line in process.stdout:
            output_lines.append(line)
        
        process.stdout.close()
        process.wait()

        return "".join(output_lines).strip()

    except Exception as e:
        return f"ERROR: {e}"