"""Sample a Tinker model zero-shot with the shared system prompt, one transcript at a time.

    python train/sample.py "to bottles" "no make that three"
    python train/sample.py --file data/val.jsonl
"""

import argparse
import json
import time
from pathlib import Path

import tinker
from tinker import types
from tinker_cookbook import renderers
from tinker_cookbook.tokenizer_utils import get_tokenizer

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("texts", nargs="*", help="transcripts to parse")
    parser.add_argument("--file", type=Path, help="JSONL file with a 'text' field per row")
    parser.add_argument("--model", default="Qwen/Qwen3.5-4B")
    parser.add_argument("--renderer", default="qwen3_5_disable_thinking")
    args = parser.parse_args()
    if not args.texts and not args.file:
        parser.error("give transcripts or --file")

    texts = args.texts or [json.loads(line)["text"] for line in args.file.read_text().splitlines() if line.strip()]
    system = (ROOT / "prompt" / "system.txt").read_text().strip()
    tokenizer = get_tokenizer(args.model)
    renderer = renderers.get_renderer(args.renderer, tokenizer)
    sampler = tinker.ServiceClient().create_sampling_client(base_model=args.model)
    params = types.SamplingParams(max_tokens=96, temperature=0.0, stop=renderer.get_stop_sequences())

    for text in texts:
        prompt = renderer.build_generation_prompt(
            [{"role": "system", "content": system}, {"role": "user", "content": text}]
        )
        start = time.perf_counter()
        result = sampler.sample(prompt=prompt, num_samples=1, sampling_params=params).result()
        ms = round((time.perf_counter() - start) * 1000)
        tokens = result.sequences[0].tokens
        reply = tokenizer.decode(tokens).removesuffix("<|im_end|>")
        print(json.dumps({
            "text": text,
            "reply": reply,
            "ms": ms,
            "prompt_tokens": prompt.length,
            "sampled_tokens": len(tokens),
        }))


if __name__ == "__main__":
    main()
