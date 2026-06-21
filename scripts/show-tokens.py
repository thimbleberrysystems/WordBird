#!/usr/bin/env python3
"""
show-tokens.py — visualise how Ollama tokenises a prompt.

Usage:
  python3 scripts/show-tokens.py "your prompt here"
  python3 scripts/show-tokens.py "your prompt here" --model llama3
  python3 scripts/show-tokens.py --model qwen2.5-coder:3b "def hello():"

Ollama 0.30.x has no /api/tokenize endpoint, so this script uses two calls:
  1. /api/generate (non-streaming) → input token count via prompt_eval_count
  2. /api/generate (streaming, repeat task) → each output token printed individually
"""
import argparse
import json
import urllib.request
import sys

OLLAMA_BASE = "http://localhost:11434"


def generate(payload: dict, stream: bool = False):
    data = json.dumps(payload).encode()
    with urllib.request.urlopen(f"{OLLAMA_BASE}/api/generate", data=data) as r:
        if not stream:
            return json.loads(r.read())
        return [json.loads(line) for line in r if line.strip()]


def count_input_tokens(model: str, prompt: str) -> int:
    resp = generate({"model": model, "prompt": prompt, "stream": False})
    return resp.get("prompt_eval_count", -1)


def stream_output_tokens(model: str, prompt: str, max_tokens: int = 512):
    chunks = generate(
        {
            "model": model,
            "prompt": prompt,
            "stream": True,
            "options": {"temperature": 0, "num_predict": max_tokens},
        },
        stream=True,
    )
    tokens = []
    stats = {}
    for chunk in chunks:
        t = chunk.get("response", "")
        if t:
            tokens.append(t)
        if chunk.get("done"):
            stats = chunk
    return tokens, stats


def main():
    parser = argparse.ArgumentParser(description="Visualise Ollama tokenisation")
    parser.add_argument("prompt", help="Text to tokenise")
    parser.add_argument("--model", default="llama3", help="Ollama model name")
    parser.add_argument(
        "--repeat",
        action="store_true",
        default=True,
        help="Ask the model to repeat the prompt so we can observe its tokens (default: on)",
    )
    parser.add_argument(
        "--no-repeat",
        dest="repeat",
        action="store_false",
        help="Stream a real generation instead of a repeat task",
    )
    parser.add_argument(
        "--max-tokens", type=int, default=120, help="Max output tokens to stream (default: 120)"
    )
    args = parser.parse_args()

    prompt = args.prompt
    model = args.model

    # ── Input token count ───────────────────────────────────────────────────
    print(f"Model        : {model}")
    print(f"Input text   : {prompt!r}")
    try:
        n_input = count_input_tokens(model, prompt)
        print(f"Input tokens : {n_input}")
    except Exception as e:
        print(f"Input tokens : ERROR — {e}", file=sys.stderr)
        n_input = "?"

    # ── Token stream ────────────────────────────────────────────────────────
    if args.repeat:
        task_prompt = (
            f'Repeat the following text exactly as written, nothing else:\n"{prompt}"'
        )
    else:
        task_prompt = prompt

    print()
    print("Output tokens (streamed):")
    print("─" * 48)
    try:
        tokens, stats = stream_output_tokens(model, task_prompt, args.max_tokens)
        for i, tok in enumerate(tokens):
            # Show repr so spaces/newlines are visible
            print(f"  [{i:4d}]  {tok!r}")
        print()
        print(f"Output token count : {stats.get('eval_count', len(tokens))}")
        prompt_eval = stats.get("prompt_eval_count", "?")
        print(f"Task prompt tokens : {prompt_eval}")
        total_ms = stats.get("total_duration", 0) // 1_000_000
        print(f"Total time         : {total_ms} ms")
    except Exception as e:
        print(f"ERROR streaming tokens: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
