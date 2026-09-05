# query_llm.py
import subprocess
import os

MISTRAL_CLI_PATH = os.path.abspath("/Users/joshhurst/llama.cpp/build/bin/llama-cli")
MISTRAL_MODEL_PATH = os.path.expanduser("~/llama.cpp/models/mistral-7b-instruct-v0.1.Q4_K_M.gguf")

def query_llm(prompt: str):
    """
    Minimal wrapper to run local Mistral through llama-cli.
    Returns raw string output.
    """

    command = [
        MISTRAL_CLI_PATH,
        "-m", MISTRAL_MODEL_PATH,
        "-p", prompt,
        "--temp", "0.4",
        "--n_predict", "200"
    ]

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace"
    )

    output_lines = []
    try:
        for line in process.stdout:
            output_lines.append(line.rstrip())
        process.stdout.close()
        process.wait()
    except Exception as e:
        process.kill()
        return f"[ERROR] LLM crashed: {str(e)}"

    return "\n".join(output_lines)