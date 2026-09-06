"""
wrappers/transcription.py
--------------------------
Local speech-to-text transcription optimised for maximum speed on a
Ryzen 7 5700G (CPU-only, no CUDA/ROCm).

Model selection rationale
--------------------------
faster-whisper tiny.en  (CTranslate2, int8)
  - ~39 MB model, English-only
  - CTranslate2 uses AVX2 SIMD (supported by 5700G) + int8 quantization
  - Typical RTF on 8-core Ryzen: 0.03–0.06 (transcribes 5 min in ~10–18 s)
  - Vastly outperforms openai-whisper on CPU
  - Easier to set up on Windows than whisper.cpp (no compilation needed)
  - beam_size=1 (greedy) + VAD filter to skip silence = additional speedup

Comparison vs next-fastest option (whisper.cpp)
-------------------------------------------------
whisper.cpp ggml-tiny.en  ~5–20% faster raw throughput on CPU
  BUT requires: compiling from source (MSVC/MinGW on Windows), separate
  Python binding (pywhispercpp / whisper-cpp-python, less maintained), and
  manual model download in GGML format. Setup complexity is not worth the
  marginal gain when faster-whisper int8 already hits the target.
"""

import os
import shutil
import tempfile
import time
from typing import Literal

from faster_whisper import WhisperModel

from .youtube_api import _download_audio

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_CLIP_SECONDS = 300          # First 5 minutes only
THREADS = min(os.cpu_count() or 8, 8)   # 5700G has 8 physical cores

# Model ladder: fastest → slowest, used for auto-fallback benchmarking
_MODEL_LADDER = [
    ("tiny.en",  "int8",   "greedy / VAD, smallest English model"),
    ("base.en",  "int8",   "~2× larger, noticeably better accuracy"),
    ("small.en", "int8",   "~6× larger, near cloud quality on clear audio"),
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_model(model_name: str, compute_type: str) -> WhisperModel:
    """Load (or reuse) a WhisperModel.  Downloads on first call (~seconds)."""
    return WhisperModel(
        model_name,
        device="cpu",
        compute_type=compute_type,
        cpu_threads=THREADS,
        num_workers=1,         # single worker avoids GIL contention overhead
    )


def _get_audio_duration_seconds(audio_path: str) -> float:
    """Return the duration of an audio file using PyAV (bundled with faster-whisper)."""
    import av
    with av.open(audio_path) as container:
        return float(container.duration) / 1_000_000   # microseconds → seconds


def _run_transcription(
    model: WhisperModel,
    audio_path: str,
    language: str = "en",
) -> tuple[str, float]:
    """
    Run transcription and return (transcript_text, transcription_seconds).
    """
    t0 = time.perf_counter()

    segments, _ = model.transcribe(
        audio_path,
        language=language,
        beam_size=1,            # greedy — fastest decoding
        vad_filter=True,        # skip silence segments
        vad_parameters={
            "min_silence_duration_ms": 400,
            "threshold": 0.5,
        },
        word_timestamps=False,  # not needed — saves post-processing time
        condition_on_previous_text=False,   # avoids slow context propagation
    )

    # Materialise the lazy generator
    text = " ".join(seg.text.strip() for seg in segments)
    elapsed = time.perf_counter() - t0
    return text, elapsed


def _print_benchmark(
    model_name: str,
    compute_type: str,
    audio_duration: float,
    extract_time: float,
    transcribe_time: float,
) -> None:
    total = extract_time + transcribe_time
    rtf = transcribe_time / audio_duration if audio_duration > 0 else float("inf")
    mins = int(audio_duration // 60)
    secs = audio_duration % 60

    print()
    print("━" * 46)
    print("  Transcription Benchmark")
    print("━" * 46)
    print(f"  Model            : {model_name}  ({compute_type}, CPU, {THREADS} threads)")
    print(f"  Audio duration   : {mins}m {secs:.1f}s  ({audio_duration:.1f}s)")
    print(f"  Audio extraction : {extract_time:.2f}s")
    print(f"  Transcription    : {transcribe_time:.2f}s")
    print(f"  Total            : {total:.2f}s")
    print(f"  RTF              : {rtf:.4f}  ({rtf*1000:.1f}ms per second of audio)")
    target_ok = total < 60
    print(f"  < 60s target     : {'✅ YES' if target_ok else '❌ NO'}")
    print("━" * 46)
    print()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _transcribe_local(
    url: str,
    output_dir: str | None = None,
    model_name: str = "tiny.en",
    compute_type: str = "int8",
    benchmark: bool = True,
) -> str:
    """
    Download the first 5 minutes of a YouTube video and transcribe it
    locally using faster-whisper for maximum speed on CPU.

    Args:
        url:          YouTube URL or video ID.
        output_dir:   Where to save the temporary audio file.  A system
                      temp dir is created (and cleaned up) automatically
                      when None is passed.
        model_name:   faster-whisper model to use.  Defaults to 'tiny.en'
                      (fastest, English-only, ~39 MB).
        compute_type: Quantization level.  'int8' is fastest on CPU.
        benchmark:    If True, print timing metrics to stdout.

    Returns:
        Transcribed text of the first 5 minutes (or full video if shorter).
    """
    auto_cleanup = output_dir is None
    if auto_cleanup:
        output_dir = tempfile.mkdtemp(prefix="yt_transcribe_")

    try:
        # ── 1. Download first 5 minutes ─────────────────────────────────────
        t_extract_start = time.perf_counter()
        audio_path = _download_audio(
            url,
            output_dir=output_dir,
            max_seconds=MAX_CLIP_SECONDS,
        )
        extract_time = time.perf_counter() - t_extract_start

        # ── 2. Measure actual audio duration ────────────────────────────────
        audio_duration = _get_audio_duration_seconds(audio_path)

        # ── 3. Load model & transcribe ───────────────────────────────────────
        model = _load_model(model_name, compute_type)
        transcript, transcribe_time = _run_transcription(model, audio_path)

        # ── 4. Benchmark report ──────────────────────────────────────────────
        if benchmark:
            _print_benchmark(
                model_name, compute_type,
                audio_duration, extract_time, transcribe_time,
            )

            # Auto-test next model up the ladder if we missed the 60s target
            total = extract_time + transcribe_time
            if total >= 60:
                current_idx = next(
                    (i for i, (m, _, _) in enumerate(_MODEL_LADDER) if m == model_name),
                    -1,
                )
                prev_idx = current_idx - 1
                if prev_idx >= 0:
                    faster_name, faster_ct, faster_desc = _MODEL_LADDER[prev_idx]
                    print(f"  ⚠  Target missed. Re-running with {faster_name} ({faster_desc})…\n")
                    faster_model = _load_model(faster_name, faster_ct)
                    faster_text, faster_time = _run_transcription(faster_model, audio_path)
                    _print_benchmark(
                        faster_name, faster_ct,
                        audio_duration, extract_time, faster_time,
                    )
                    print(
                        f"  Trade-off: '{faster_name}' vs '{model_name}'\n"
                        f"    Speed gain : {transcribe_time - faster_time:.1f}s faster\n"
                        f"    Accuracy   : lower — only use for speed-critical paths\n"
                    )

        return transcript

    finally:
        if auto_cleanup and os.path.exists(output_dir):
            shutil.rmtree(output_dir, ignore_errors=True)
