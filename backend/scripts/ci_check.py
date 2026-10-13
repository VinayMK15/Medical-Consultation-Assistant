"""
Run the same checks CI runs, in the same order.

    python scripts/ci_check.py

Faster feedback than pushing and waiting for a build, and it catches a failure
before it becomes a red check. Keep this list in step with
`.github/workflows/ci.yml` -- if you add a check to one, add it here.
"""

from __future__ import annotations

import subprocess
import sys

CHECKS: list[tuple[str, list[str]]] = [
    ("ruff", ["ruff", "check", "."]),
    ("mypy", ["mypy"]),
    ("pytest", ["pytest", "--tb=short"]),
]


def main() -> int:
    failed: list[str] = []

    for name, args in CHECKS:
        print(f"\n=== {name} ===", flush=True)
        if subprocess.run([sys.executable, "-m", *args]).returncode != 0:
            failed.append(name)

    if failed:
        print(f"\nFAILED: {', '.join(failed)}")
        return 1

    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
