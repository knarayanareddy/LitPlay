"""
LitPlay ASR scoring engine (§12 of the SSOT).

The score combines two signals:
  1. Fuzzy string match — RapidFuzz token_sort_ratio (weight 0.70)
  2. Phonetic match     — Metaphone encoding (weight 0.30)

Difficulty-aware thresholds (§12.3) then map the score to PASS / PARTIAL / FAIL.

This module is pure (no I/O) so it can be unit-tested exhaustively and also
reused by the on-device whisper.cpp path (a JS port of the same logic runs
client-side — see §12.1 step 10c).
"""

from __future__ import annotations

import re
import string
from dataclasses import dataclass
from metaphone import doublemetaphone
from rapidfuzz import fuzz

from .config import DIFFICULTY_THRESHOLDS, SCORING_WEIGHTS, Difficulty

# -- Text normalization (§12.1 step 10) -------------------------------------


def normalize(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    text = text.lower().strip()
    # Remove punctuation but keep apostrophes within words
    text = re.sub(r"[^\w\s']", " ", text)
    text = text.translate(str.maketrans("", "", string.punctuation.replace("'", "")))
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# -- Phonetic helpers --------------------------------------------------------


def metaphone_tokens(word: str) -> list[str]:
    """Return the (primary, secondary) Double Metaphone encodings, dropping empties."""
    primary, secondary = doublemetaphone(word)
    tokens = [t for t in (primary, secondary) if t]
    # Fallback to the word itself if metaphone produced nothing
    return tokens or [word]


def phonetic_similarity(expected: str, actual: str) -> float:
    """
    Word-by-word phonetic comparison.

    For each expected word we check whether the corresponding actual word's
    metaphone encoding overlaps. We allow a ±1 alignment window so a minor
    insertion/deletion doesn't cascade.
    """
    exp_words = normalize(expected).split()
    act_words = normalize(actual).split()

    if not exp_words:
        return 0.0 if actual.strip() else 100.0

    matched = 0
    search_start = 0
    window = 1  # alignment slack

    for i, ew in enumerate(exp_words):
        exp_codes = set(metaphone_tokens(ew))
        found = False
        # Look in a sliding window around the expected position
        lo = max(search_start, i - window)
        hi = min(len(act_words), i + window + 1)
        for j in range(lo, hi):
            aw = act_words[j]
            act_codes = set(metaphone_tokens(aw))
            if exp_codes & act_codes:
                found = True
                search_start = j + 1
                break
        if found:
            matched += 1

    return (matched / len(exp_words)) * 100.0


# -- Composite score ---------------------------------------------------------


@dataclass(frozen=True)
class ScoreBreakdown:
    fuzzy_score: float
    phonetic_score: float
    final_score: float


def compute_scores(expected: str, actual: str) -> ScoreBreakdown:
    """
    Compute the composite reading-aloud score (§12.3).

    final = fuzzy * 0.70 + phonetic * 0.30
    """
    exp_norm = normalize(expected)
    act_norm = normalize(actual)

    if not exp_norm:
        return ScoreBreakdown(0.0, 0.0, 0.0)

    # Empty / inaudible attempt
    if not act_norm:
        return ScoreBreakdown(0.0, 0.0, 0.0)

    fuzzy = fuzz.token_sort_ratio(exp_norm, act_norm)
    phonetic = phonetic_similarity(exp_norm, act_norm)

    final = round(
        fuzzy * SCORING_WEIGHTS["fuzzy"] + phonetic * SCORING_WEIGHTS["phonetic"], 2
    )
    return ScoreBreakdown(
        fuzzy_score=round(fuzzy, 2),
        phonetic_score=round(phonetic, 2),
        final_score=min(final, 100.0),
    )


# -- Result classification (§12.3) -------------------------------------------


def classify(score: float, difficulty: Difficulty) -> str:
    """
    Map a score to PASS / PARTIAL / FAIL using difficulty-aware thresholds.

    Easy:   PASS ≥ 75, PARTIAL 55–74
    Medium: PASS ≥ 82, PARTIAL 62–81
    Hard:   PASS ≥ 88, PARTIAL 70–87
    """
    thresholds = DIFFICULTY_THRESHOLDS[difficulty]
    if score >= thresholds["pass"]:
        return "PASS"
    if score >= thresholds["partial"]:
        return "PARTIAL"
    return "FAIL"


def retries_remaining(attempt_number: int, max_retries: int, result: str) -> int:
    """How many retries the child has left after this attempt (FR-005)."""
    if result == "PASS":
        return 0
    # attempt_number is 1-indexed; max_retries is the number of *retries* allowed
    attempts_used = attempt_number
    total_allowed = max_retries + 1  # first attempt + retries
    return max(0, total_allowed - attempts_used)


# -- Per-word phoneme breakdown (for the API response §11.5) -----------------


def phoneme_breakdown(expected: str, actual: str) -> list[dict]:
    """Produce a per-word breakdown with fuzzy + phonetic scores for display."""
    exp_words = normalize(expected).split()
    act_words = normalize(actual).split()
    breakdown = []
    search_start = 0
    for i, ew in enumerate(exp_words):
        best_score = 0.0
        best_match = ""
        lo = max(search_start, i - 1)
        hi = min(len(act_words), i + 2)
        for j in range(lo, hi):
            if j >= len(act_words):
                continue
            aw = act_words[j]
            word_fuzzy = fuzz.ratio(ew, aw)
            # phonetic bonus
            if set(metaphone_tokens(ew)) & set(metaphone_tokens(aw)):
                word_score = word_fuzzy * 0.7 + 100 * 0.3
            else:
                word_score = word_fuzzy
            if word_score > best_score:
                best_score = word_score
                best_match = aw
                search_start = j + 1
        breakdown.append(
            {
                "word": ew,
                "score": round(min(best_score, 100.0), 2),
                "phonetic": metaphone_tokens(ew)[0],
            }
        )
    return breakdown
