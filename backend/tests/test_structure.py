"""
Module boundaries: importing a service must not touch the database, and route
paths must not move when code is reorganised.

Both are invisible to a functional test and both break things:

- An import-time database read breaks read-only replicas, workers that start
  before migrations, and any test that wants to seed before first use. It
  fails as a warning at startup and as a routing bug at request time, never as
  an exception.
- The frontend addresses the admin endpoints by literal path
  (`/api/admin/approve-doctor/{id}`). Splitting a router without changing a
  path would have passed every test here and 404'd in the browser.
"""

import importlib
import os
import subprocess
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ---------------------------------------------------------------------------
# Importing a service must not open a database connection
# ---------------------------------------------------------------------------
class TestNoImportTimeDatabaseAccess:
    """
    Each service is imported in a subprocess with `DATABASE_URL` pointed at a
    file that does not exist.

    Any query at import time creates the file, because SQLite creates on open.
    Its absence afterwards is the proof.
    """
    SERVICES = [
        "services.nlp_processor",
        "services.routing",
        "services.doctor_search",
        "services.vocabulary",
        "services.geo",
        "services.translator_logic",
        "services.email_service",
    ]

    @pytest.mark.parametrize("module", SERVICES)
    def test_import_does_not_touch_the_database(self, module, tmp_path):
        missing = tmp_path / "should-not-exist.db"

        env = dict(os.environ)
        env["DATABASE_URL"] = f"sqlite:///{missing}"
        env["PYTHONPATH"] = BACKEND_DIR
        # A key so auth_utils can import if the chain reaches it.
        env["SECRET_KEY"] = "x" * 64

        result = subprocess.run(
            [sys.executable, "-c", f"import {module}"],
            cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=90,
        )

        assert result.returncode == 0, f"{module} failed to import:\n{result.stderr}"
        assert not missing.exists(), (
            f"importing {module} opened the database. A service must not query "
            "at import time -- warm its caches from the lifespan handler "
            "instead."
        )

    def test_importing_vocabulary_leaves_it_empty(self):
        """
        The vocabulary must start empty even after a successful import.

        That is the point of the refactor: the caches are now populated by an
        explicit `warm_all()`, so a caller that forgets gets a logged
        degradation rather than an import-time connection.
        """
        from services import vocabulary

        vocabulary.invalidate()
        assert vocabulary.symptom_keywords() == []
        assert vocabulary.regional_symptom_keywords() == {}
        assert vocabulary.dataset_symptoms() == []

    def test_ensure_loaded_recovers_a_forgotten_warm_call(self):
        """
        The safety net: after an explicit `warm_all()` the caches are usable
        without any other setup, which is what a script or worker needs.
        """
        import database
        import models
        from services import vocabulary

        models.Base.metadata.create_all(bind=database.engine)
        try:
            vocabulary.invalidate()
            counts = vocabulary.warm_all()
            # Empty database, so counts are legitimately zero, but the call
            # must have run rather than raised.
            assert set(counts) == {
                "symptom_keywords",
                "regional_symptom_keywords",
                "dataset_symptoms",
            }
        finally:
            vocabulary.invalidate()

    def test_warm_all_survives_a_broken_database(self, monkeypatch):
        """
        A missing table must degrade one tier of routing, not prevent startup.
        Each loader swallows its own failure and reports zero.
        """
        from services import vocabulary

        def boom():
            raise RuntimeError("no such table")

        monkeypatch.setattr(vocabulary, "warm_symptom_keywords", boom)
        monkeypatch.setattr(vocabulary, "warm_regional_keywords", boom)
        monkeypatch.setattr(vocabulary, "warm_dataset_symptoms", boom)

        counts = vocabulary.warm_all()
        assert counts == {
            "symptom_keywords": 0,
            "regional_symptom_keywords": 0,
            "dataset_symptoms": 0,
        }


# ---------------------------------------------------------------------------
# Route paths are part of the contract
# ---------------------------------------------------------------------------
class TestRoutePathsUnchanged:
    """
    The admin panel was split across three modules. These paths are called by
    literal string from the frontend, so a refactor that renames one breaks
    the browser while leaving every test green.
    """
    EXPECTED = [
        ("GET", "/api/admin/users"),
        ("POST", "/api/admin/users"),
        ("GET", "/api/admin/users/{user_id}"),
        ("PUT", "/api/admin/users/{user_id}"),
        ("DELETE", "/api/admin/users/{user_id}"),
        ("GET", "/api/admin/users/{user_id}/appointments"),
        ("GET", "/api/admin/pending-doctors"),
        ("PUT", "/api/admin/approve-doctor/{doctor_id}"),
        ("DELETE", "/api/admin/reject-doctor/{doctor_id}"),
        ("GET", "/api/admin/doctors/{doctor_id}/schedule"),
        ("PUT", "/api/admin/doctors/{doctor_id}/schedule"),
        ("GET", "/api/admin/doctors/{doctor_id}/calendar-summary"),
        ("GET", "/api/admin/stats"),
        ("GET", "/api/admin/symptoms"),
        ("POST", "/api/admin/symptoms"),
        ("DELETE", "/api/admin/symptoms/{symptom_id}"),
        ("GET", "/api/admin/specializations"),
        ("POST", "/api/admin/specializations"),
        ("DELETE", "/api/admin/specializations/{spec_id}"),
        # Top-level endpoints that are not feature routers.
        ("GET", "/"),
        ("GET", "/health"),
        ("GET", "/api/doctors"),
        ("POST", "/process"),
    ]

    @pytest.fixture(scope="class")
    def registered(self):
        from main import app

        found = set()
        for route in app.routes:
            path = getattr(route, "path", None)
            methods = getattr(route, "methods", None)
            if not path or not methods:
                continue
            for method in methods:
                found.add((method, path))
        return found

    @pytest.mark.parametrize("method,path", EXPECTED)
    def test_route_is_registered(self, method, path, registered):
        assert (method, path) in registered, (
            f"{method} {path} is no longer registered. The frontend calls "
            "admin endpoints by literal path."
        )

    def test_admin_routes_span_all_three_modules(self):
        """
        Guards against the split being reverted by a single-module merge, and
        makes the intended boundary explicit.
        """
        from routers import admin, admin_doctors, admin_taxonomy

        assert len(admin.router.routes) >= 6
        assert len(admin_doctors.router.routes) >= 7
        assert len(admin_taxonomy.router.routes) >= 6

    def test_no_duplicate_routes(self, registered):
        """
        Two modules registering the same path means one shadows the other at
        request time, and which one wins depends on include order.
        """
        from collections import Counter

        counts = Counter(registered)
        duplicates = [route for route, n in counts.items() if n > 1]
        assert not duplicates, f"routes registered more than once: {duplicates}"


# ---------------------------------------------------------------------------
# Module layout
# ---------------------------------------------------------------------------
class TestModuleLayout:
    @pytest.mark.parametrize("name,limit", [
        ("main.py", 450),
        ("routers/admin.py", 650),
    ])
    def test_module_stays_readable(self, name, limit):
        """
        A soft ceiling on file length.

        Not a style rule for its own sake: main.py was 762 lines mixing wiring,
        routing and business logic, and admin.py was 963 mixing four unrelated
        admin concerns. Both are now under the limit, and this fails loudly
        rather than letting them grow back.
        """
        path = os.path.join(BACKEND_DIR, name)
        with open(path, encoding="utf-8") as fh:
            lines = fh.readlines()
        assert len(lines) <= limit, (
            f"{name} is {len(lines)} lines (limit {limit}). Split it rather "
            "than letting it grow."
        )

    def test_services_do_not_import_main(self):
        """
        A service importing the app entrypoint is a circular dependency.

        `nlp_processor` used to do exactly that, inside a function, to reach
        `get_specialist`. The routing logic now lives in `services/routing.py`
        and is imported directly.
        """
        import ast

        offenders = []
        for name in ("nlp_processor", "routing", "doctor_search",
                     "vocabulary", "geo", "translator_logic", "email_service"):
            path = os.path.join(BACKEND_DIR, "services", f"{name}.py")
            with open(path, encoding="utf-8") as fh:
                tree = ast.parse(fh.read())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module == "main":
                    offenders.append(f"{name}.py imports from main")
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        if alias.name == "main":
                            offenders.append(f"{name}.py imports main")

        assert not offenders, offenders

    def test_services_do_not_import_each_other_circularly(self):
        """`routing` and `doctor_search` are leaves; neither should import the other."""
        import ast

        edges = {}
        for name in ("nlp_processor", "routing", "doctor_search", "vocabulary",
                     "geo", "translator_logic", "email_service"):
            path = os.path.join(BACKEND_DIR, "services", f"{name}.py")
            with open(path, encoding="utf-8") as fh:
                tree = ast.parse(fh.read())
            targets = set()
            for node in ast.walk(tree):
                if (isinstance(node, ast.ImportFrom)
                    and node.module
                    and node.module.startswith("services")):
                    targets.add(node.module.split(".")[-1])
            edges[name] = targets - {name}

        # A cycle here would mean two services that cannot be imported
        # independently, which is what makes a test file able to import one.
        for name, targets in edges.items():
            for target in targets:
                assert name not in edges.get(target, set()), (
                    f"circular import: {name} -> {target} -> {name}"
                )

    def test_reload_is_idempotent(self):
        """
        `importlib.reload` must not raise, and must leave the module usable.

        Guards against module-level state that only works on first import.
        """
        module = importlib.import_module("services.vocabulary")
        reloaded = importlib.reload(module)
        assert reloaded.city_aliases()
