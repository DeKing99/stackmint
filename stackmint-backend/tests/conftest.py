"""
conftest.py — shared pytest fixtures for stackmint-backend tests.

All tests operate offline (no live Supabase calls) by default.
Tests that require Supabase are marked @pytest.mark.integration and
are skipped unless SUPABASE_URL / SUPABASE_SECRET_KEY are set.
"""

import os
import pathlib
import pytest

TESTS_DIR = pathlib.Path(__file__).parent
DATA_DIR = TESTS_DIR / "data"


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "integration: requires live Supabase credentials"
    )


@pytest.fixture(scope="session")
def data_dir() -> pathlib.Path:
    return DATA_DIR


def _make_upload(file_path: str, activity_type: str | None = None) -> dict:
    """Build a minimal upload record suitable for pipeline/preflight helpers."""
    return {
        "id": "test-upload-001",
        "organization_id": "test-org-001",
        "company_location_id": "FAC-001",
        "activity_type": activity_type,
        "file_path": file_path,
        "storage_path": None,
        "created_at": "2024-01-01T00:00:00+00:00",
        "updated_at": "2024-01-01T00:00:00+00:00",
        "parsing_status": "pending",
        "strict_mode": False,
    }


@pytest.fixture
def make_upload():
    return _make_upload
