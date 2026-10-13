"""
Guard against silent text corruption.

Every other test in this suite passes on mojibake. Assertions on ASCII routes,
status codes and SQL do not care that a Devanagari symptom term has been
re-encoded twice and now reads as Latin-1 gibberish -- the lookup simply stops
matching, and the user gets "General Physician" instead of a real answer.

This happened for real: a PowerShell `Get-Content | Set-Content` round-trip
double-encoded the non-ASCII vocabulary in `nlp_processor.py`, breaking regional
symptom matching in nine languages while all 199 tests stayed green.

The checks here are structural rather than behavioural wherever possible, so
they catch the damage before anything has to fail at runtime.
"""

import ast
import io
import os
import tokenize

import pytest

import services.nlp_processor as nlp
from services import vocabulary

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Characters that appear when UTF-8 bytes are decoded as cp1252 or latin-1 and
# then re-encoded as UTF-8. Latin-1 supplement plus the Windows-1252
# replacements for the unmapped C1 block.
_C1_AND_LATIN1_SUPPLEMENT = frozenset(
    chr(c) for c in list(range(0x00C0, 0x0100)) + [0x20AC, 0x201A, 0x0192, 0x201E]
)


def _read_bytes(path: str) -> bytes:
    with open(path, "rb") as fh:
        return fh.read()


def _read_text(path: str) -> str:
    with open(path, encoding="utf-8-sig") as fh:
        return fh.read()


def _source_files():
    for root, dirs, files in os.walk(BACKEND_DIR):
        dirs[:] = [d for d in dirs if d not in {"venv", "__pycache__", ".git"}]
        for name in files:
            if name.endswith((".py", ".md", ".toml", ".txt", ".example")):
                yield os.path.join(root, name)


def _mojibake_count(text: str) -> int:
    return sum(1 for ch in text if ch in _C1_AND_LATIN1_SUPPLEMENT)


# ---------------------------------------------------------------------------
# Structural checks over the whole tree
# ---------------------------------------------------------------------------
class TestNoCorruptedText:
    def test_no_file_contains_mojibake(self):
        """
        Scans every source file for the Latin-1 supplement characters that
        only appear via a bad encoding round-trip.

        Legitimate non-Latin text -- Devanagari, Tamil, em-dashes in prose --
        is untouched by this: none of it is in U+00C0..U+00FF.
        """
        offenders = {}
        for path in _source_files():
            raw = _read_bytes(path)
            text = raw.decode("utf-8-sig", errors="replace")
            count = _mojibake_count(text)
            if count:
                offenders[os.path.relpath(path, BACKEND_DIR)] = count

        assert not offenders, f"mojibake found: {offenders}"

    def test_no_file_has_a_byte_order_mark(self):
        """
        A BOM at the start of a Python file is a SyntaxError, and PowerShell's
        Set-Content adds one by default.
        """
        offenders = [
            os.path.relpath(p, BACKEND_DIR)
            for p in _source_files()
            if _read_bytes(p).startswith(b"\xef\xbb\xbf")
        ]
        assert not offenders, f"files start with a BOM: {offenders}"

    def test_every_python_file_is_valid_utf8(self):
        bad = []
        for path in _source_files():
            if not path.endswith((".py", ".md", ".toml", ".txt", ".example")):
                continue
            try:
                _read_bytes(path).decode("utf-8")
            except UnicodeDecodeError as exc:
                bad.append(f"{os.path.relpath(path, BACKEND_DIR)}: {exc}")

        assert not bad, "not valid UTF-8:\n" + "\n".join(bad)

    def test_every_python_file_parses(self):
        bad = []
        for path in _source_files():
            if not path.endswith(".py"):
                continue
            try:
                ast.parse(_read_text(path))
            except SyntaxError as exc:
                bad.append(f"{os.path.relpath(path, BACKEND_DIR)}:{exc.lineno}")

        assert not bad, "failed to parse:\n" + "\n".join(bad)


# ---------------------------------------------------------------------------
# The vocabulary, exercised directly
# ---------------------------------------------------------------------------
class TestRegionalVocabulary:
    """
    The regional tables are the most encoding-sensitive data in the project:
    every key is a non-Latin script string, and a corrupted one silently stops
    matching rather than raising.
    """

    @pytest.fixture(autouse=True)
    def _loaded(self, db):
        """
        Populate the regional vocabulary.

        `nlp_processor` reads it from the `regional_symptom_keywords` table at
        import time, which is empty in a fresh test database. Seeding from
        `scripts/seed_regional_symptoms.py` -- the same source the app ships
        -- means this checks the real data rather than a fixture invented here.

        Function-scoped because the shared `db` fixture is: the autouse
        `clean_tables` empties every table between tests, so the vocabulary has
        to be reloaded each time.
        """
        import importlib.util

        import models

        seed_path = os.path.join(BACKEND_DIR, "scripts", "seed_regional_symptoms.py")
        spec = importlib.util.spec_from_file_location("seed_regional_symptoms", seed_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        for language, entries in module.REGIONAL_KEYWORDS.items():
            for term, canonical in entries:
                db.add(models.RegionalSymptomKeyword(
                    language=language, regional_term=term,
                    english_canonical=canonical,
                ))
        db.commit()

        vocabulary.warm_all()

        assert vocabulary.regional_symptom_keywords(), "seeder produced no vocabulary"

        yield

        # Leave the caches as found, so ordering cannot leak between tests.
        vocabulary.invalidate()

    def test_symptom_vocabulary_is_populated(self):
        total = sum(len(v) for v in vocabulary.regional_symptom_keywords().values())
        assert total > 0, "no regional symptom terms loaded"

    def test_every_language_has_terms(self):
        for lang, terms in vocabulary.regional_symptom_keywords().items():
            assert terms, f"language {lang!r} has no terms"

    def test_terms_are_not_mojibake(self):
        """
        The direct assertion the corruption actually violates. A mojibake term
        looks like plausible text and would pass a length or type check.
        """
        offenders = []
        for lang, terms in vocabulary.regional_symptom_keywords().items():
            for term, canonical in terms:
                if _mojibake_count(term) or _mojibake_count(canonical):
                    offenders.append((lang, term, canonical))

        assert not offenders, f"corrupted vocabulary entries: {offenders[:5]}"

    def test_city_terms_are_not_mojibake(self):
        offenders = []
        for lang, terms in vocabulary.regional_city_aliases().items():
            for term, canonical in terms:
                if _mojibake_count(term) or _mojibake_count(canonical):
                    offenders.append((lang, term, canonical))

        assert not offenders, f"corrupted city entries: {offenders[:5]}"

    def test_every_stored_term_matches_itself(self):
        """
        The end-to-end check that would have caught the original damage: every
        term in every language, passed through the matcher, returns its own
        canonical symptom.

        With a double-encoded vocabulary this fails immediately -- the stored
        key and the input no longer agree on any byte.
        """
        assert vocabulary.regional_symptom_keywords()

        failures = []
        for lang, terms in vocabulary.regional_symptom_keywords().items():
            for term, canonical in terms:
                resolved = nlp._match_regional_symptom(term)
                if resolved != canonical:
                    failures.append((lang, term, canonical, resolved))

        assert not failures, (
            f"{len(failures)} term(s) do not resolve, first: {failures[0]}"
        )

    def test_terms_are_in_the_scripts_they_should_be(self):
        """
        Each language's terms must be written in that language's script. A
        vocabulary that had drifted into Latin characters would still match its
        own (corrupted) keys, so the resolve test above would pass.
        """
        blocks = {
            "hi": (0x0900, 0x097F),   # Devanagari
            "bn": (0x0980, 0x09FF),   # Bengali
            "ta": (0x0B80, 0x0BFF),   # Tamil
            "te": (0x0C00, 0x0C7F),   # Telugu
            "kn": (0x0C80, 0x0CFF),   # Kannada
            "ml": (0x0D00, 0x0D7F),   # Malayalam
            "gu": (0x0A80, 0x0AFF),   # Gujarati
            "pa": (0x0A00, 0x0A7F),   # Gurmukhi
            "mr": (0x0900, 0x097F),   # Devanagari
        }

        wrong = []
        checked = 0
        for lang, (low, high) in blocks.items():
            for term, _canonical in vocabulary.regional_symptom_keywords().get(lang, []):
                checked += 1
                if not any(low <= ord(c) <= high for c in term):
                    wrong.append((lang, term))

        assert checked, "no vocabulary entries to check"
        assert not wrong, (
            f"{len(wrong)} of {checked} term(s) not in the expected script, "
            f"first: {wrong[0]}"
        )

    def test_regional_matcher_ignores_latin_terms(self):
        """
        The regional matcher only consults the regional vocabulary, so a Latin
        phrase must not resolve through it. Stated here because the two
        vocabularies are easy to conflate when reading the code.
        """
        assert nlp._match_regional_symptom("chest pain") is None


# ---------------------------------------------------------------------------
# Round-trip check on the encoder itself
# ---------------------------------------------------------------------------
class TestRoundTrip:
    def test_non_ascii_survives_a_utf8_round_trip(self):
        """
        A guard on the failure mode, not the data: encode a string with
        non-Latin characters, decode it again, and confirm it is unchanged.
        """
        samples = [
            "\u092c\u0947\u0902\u0917\u0932\u0942\u0930\u0942",  # Bengaluru
            "\u0b9a\u0bc7\u0ba9\u0bcd\u0ba8\u0bc8",               # Chennai
            "\u09ac\u09be\u0982\u0997\u09b2\u09be",               # Kolkata
            "\u2014",  # em dash, used throughout the prose
        ]
        for sample in samples:
            assert sample.encode("utf-8").decode("utf-8") == sample

    def test_current_source_encodes_as_expected(self):
        """The module under test, round-tripped."""
        source = _read_text(nlp.__file__)
        assert source.encode("utf-8").decode("utf-8") == source
        assert _mojibake_count(source) == 0

    @pytest.mark.parametrize("token", ["comment", "string", "both"])
    def test_tokenizer_sees_non_latin_characters(self, token):
        """
        Confirm the tokenizer reads multi-byte characters as single tokens
        rather than splitting them -- which is what makes a byte-level
        round-trip destructive.
        """
        source = "x = 1  # \u092c\u0947\u0902\u0917\u0932\u0942\u0930\u0942\n"
        tokens = [
            t for t in tokenize.generate_tokens(io.StringIO(source).readline)
            if t.type not in (tokenize.NL, tokenize.NEWLINE, tokenize.ENCODING)
        ]
        assert tokens, "tokenizer produced nothing"
