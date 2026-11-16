"""Shared fixtures for the Playwright end-to-end suite.

Requires the app running locally (``npm run dev``) against a dedicated
Supabase *test* project, with email confirmation disabled so that
``supabase.auth.signUp`` returns an active session immediately (see
tests/e2e/README.md for the full environment setup).
"""

import os
import uuid

import pytest


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Environment variable {name} is not set. "
            "See tests/e2e/README.md for the required setup."
        )
    return value


@pytest.fixture(scope="session")
def base_url() -> str:
    return os.environ.get("BASE_URL", "https://ordem-carmesim-ficha.vercel.app/").rstrip("/")


@pytest.fixture(scope="session")
def test_user() -> dict:
    """Pre-existing, email-confirmed account used by the login/logout tests."""
    return {
        "email": _require_env("TEST_USER_EMAIL"),
        "password": _require_env("TEST_USER_PASSWORD"),
    }


@pytest.fixture
def new_signup() -> dict:
    """Fresh, never-used credentials for the sign-up test (avoids
    'email already registered' on repeated runs)."""
    unique = uuid.uuid4().hex[:12]
    return {
        "display_name": f"QA Teste {unique[:6]}",
        "email": f"qa.playwright+{unique}@example.com",
        "password": "SenhaForte!123",
    }
