"""
Exhaustive tests for the ASR scoring engine (§12, §29.2 ≥95% coverage).

These are the highest-stakes unit tests in the system: the scoring logic
determines whether a child's reading attempt unlocks the next scene.
"""

import pytest

from asr_app.config import Difficulty
from asr_app.scoring import (
    classify,
    compute_scores,
    normalize,
    phoneme_breakdown,
    phonetic_similarity,
    retries_remaining,
)


# --- normalize --------------------------------------------------------------


class TestNormalize:
    def test_lowercase_and_strip_punctuation(self):
        assert normalize("The Cat Sat.") == "the cat sat"

    def test_collapse_whitespace(self):
        assert normalize("  the   cat   sat  ") == "the cat sat"

    def test_empty(self):
        assert normalize("") == ""

    def test_apostrophe_preserved(self):
        assert normalize("don't go") == "don't go"

    def test_numbers_kept(self):
        assert normalize("3 little pigs") == "3 little pigs"


# --- phonetic_similarity ----------------------------------------------------


class TestPhonetic:
    def test_identical_words(self):
        assert phonetic_similarity("the cat", "the cat") == 100.0

    def test_homophone_caught(self):
        # "elefant" vs "elephant" — spelling differs, sound matches
        score = phonetic_similarity("elephant", "elefant")
        assert score == 100.0

    def test_completely_different(self):
        score = phonetic_similarity("the cat sat", "xyzzy qwerty")
        assert score < 50.0

    def test_partial_match(self):
        # 2 of 3 words phonetically match
        score = phonetic_similarity("the cat dog", "the kat dog")
        assert score == pytest.approx(100.0, abs=0.1)

    def test_empty_expected(self):
        assert phonetic_similarity("", "something") == 0.0

    def test_empty_actual(self):
        assert phonetic_similarity("the cat", "") == 0.0


# --- compute_scores ---------------------------------------------------------


class TestComputeScores:
    def test_perfect_match(self):
        s = compute_scores("the cat sat on the mat", "the cat sat on the mat")
        assert s.final_score == 100.0
        assert s.fuzzy_score == 100.0
        assert s.phonetic_score == 100.0

    def test_empty_expected(self):
        s = compute_scores("", "anything")
        assert s.final_score == 0.0

    def test_empty_actual_scores_zero(self):
        s = compute_scores("the cat sat", "")
        assert s.final_score == 0.0

    def test_word_reorder_handled_by_token_sort(self):
        # token_sort_ratio is 100 for reordering, but the phonetic component is
        # positional so reordering is partially penalised (correct behaviour).
        s = compute_scores("the cat sat", "sat cat the")
        assert s.fuzzy_score == 100.0
        assert s.final_score >= 75.0

    def test_completely_wrong(self):
        s = compute_scores("the cat sat on the mat", "zzz qqq xxx yyy vvv")
        assert s.final_score < 40.0

    def test_score_capped_at_100(self):
        s = compute_scores("hello", "hello")
        assert s.final_score <= 100.0

    def test_minor_mispronunciation(self):
        # Phonetic component boosts a pronunciation-correct attempt.
        # fuzzy("elephant","elefant")=80, phonetic=100 → 80*0.7+100*0.3=86
        s = compute_scores("elephant", "elefant")
        assert s.fuzzy_score == 80.0
        assert s.phonetic_score == 100.0
        assert s.final_score == 86.0


# --- classify ---------------------------------------------------------------


class TestClassify:
    @pytest.mark.parametrize(
        "difficulty,pass_threshold",
        [("Easy", 75), ("Medium", 82), ("Hard", 88)],
    )
    def test_pass_at_threshold(self, difficulty, pass_threshold):
        assert classify(pass_threshold, Difficulty(difficulty)) == "PASS"

    @pytest.mark.parametrize(
        "difficulty,partial_threshold",
        [("Easy", 55), ("Medium", 62), ("Hard", 70)],
    )
    def test_partial_at_threshold(self, difficulty, partial_threshold):
        assert classify(partial_threshold, Difficulty(difficulty)) == "PARTIAL"

    def test_fail_below_partial(self):
        assert classify(54.9, Difficulty.EASY) == "FAIL"
        assert classify(61.9, Difficulty.MEDIUM) == "FAIL"
        assert classify(69.9, Difficulty.HARD) == "FAIL"

    def test_boundary_easy(self):
        d = Difficulty.EASY
        assert classify(74.9, d) == "PARTIAL"
        assert classify(75.0, d) == "PASS"

    def test_boundary_hard(self):
        d = Difficulty.HARD
        assert classify(87.9, d) == "PARTIAL"
        assert classify(88.0, d) == "PASS"

    def test_score_100_always_pass(self):
        for d in Difficulty:
            assert classify(100, d) == "PASS"

    def test_score_0_always_fail(self):
        for d in Difficulty:
            assert classify(0, d) == "FAIL"


# --- retries_remaining ------------------------------------------------------


class TestRetriesRemaining:
    def test_pass_returns_zero(self):
        assert retries_remaining(1, 3, "PASS") == 0

    def test_first_attempt_partial(self):
        # first attempt (1) used, 3 retries allowed → 3 left
        assert retries_remaining(1, 3, "PARTIAL") == 3

    def test_second_attempt(self):
        assert retries_remaining(2, 3, "FAIL") == 2

    def test_exhausted(self):
        # attempt 4 = 1 initial + 3 retries → 0 left
        assert retries_remaining(4, 3, "FAIL") == 0

    def test_never_negative(self):
        assert retries_remaining(10, 3, "FAIL") == 0

    def test_max_retries_one(self):
        # maxRetries=1 → total 2 attempts
        assert retries_remaining(1, 1, "PARTIAL") == 1
        assert retries_remaining(2, 1, "PARTIAL") == 0


# --- phoneme_breakdown ------------------------------------------------------


class TestPhonemeBreakdown:
    def test_returns_per_word(self):
        b = phoneme_breakdown("the cat sat", "the cat sat")
        assert len(b) == 3
        assert all("word" in item and "score" in item and "phonetic" in item for item in b)

    def test_scores_capped(self):
        b = phoneme_breakdown("the cat sat", "the cat sat")
        assert all(item["score"] <= 100.0 for item in b)

    def test_empty_actual(self):
        b = phoneme_breakdown("the cat sat", "")
        assert len(b) == 3
        assert all(item["score"] == 0.0 for item in b)

    def test_phonetic_field_populated(self):
        b = phoneme_breakdown("elephant", "elefant")
        assert b[0]["word"] == "elephant"
        assert len(b[0]["phonetic"]) > 0


# --- end-to-end scoring scenarios -------------------------------------------


class TestEndToEndScoring:
    """Realistic child-reading scenarios."""

    def test_fluent_reader_easy_passes(self):
        passage = "The quick brown fox jumps over the lazy dog."
        transcript = "the quick brown fox jumps over the lazy dog"
        s = compute_scores(passage, transcript)
        assert classify(s.final_score, Difficulty.EASY) == "PASS"

    def test_struggling_reader_hard_fails(self):
        passage = "The extraordinary elephant ambled through the dense forest."
        transcript = "the ext  el fant am bled for est"
        s = compute_scores(passage, transcript)
        assert classify(s.final_score, Difficulty.HARD) == "FAIL"

    def test_pronunciation_variant_still_passes(self):
        passage = "She thought the knight would fight."
        # "nite" for "knight", "fite" for "fight" — phonetically correct
        transcript = "she thought the nite would fite"
        s = compute_scores(passage, transcript)
        assert s.final_score >= 75  # at least easy pass

    def test_completely_silent_fail(self):
        passage = "The cat sat on the mat."
        transcript = ""
        s = compute_scores(passage, transcript)
        assert classify(s.final_score, Difficulty.EASY) == "FAIL"
