"""Tests for session merge logic (task 15).

Verifies that anonymous reading list entries are transferred to the
authenticated user on OAuth callback, with union semantics (no duplicates),
and the anonymous_id cookie is cleared afterwards.
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app.api.auth import _merge_anonymous_reading_list
from app.main import app

# ── Helpers ────────────────────────────────────────────────────────

SESSION_SECRET = "test-secret-key-for-jwt"

ANON_ID = "anon-uuid-1234-5678"


@pytest.fixture(autouse=True)
def _reset_oauth_cache():
    """Reset global OAuth client between tests."""
    import app.api.auth as auth_mod

    auth_mod._oauth = None
    yield
    auth_mod._oauth = None


def _settings(**overrides):
    """Create a mock Settings object with sensible defaults."""
    mock = MagicMock()
    defaults = {
        "session_secret": SESSION_SECRET,
        "google_client_id": "g-id",
        "google_client_secret": "g-secret",
        "github_client_id": "gh-id",
        "github_client_secret": "gh-secret",
        "backend_url": "http://localhost:8000",
        "frontend_url": "http://localhost:3000",
        "database_url": "sqlite:///test.db",
        "arxiv_rate_limit": 1.0,
        "nebius_api_key": "k",
        "nebius_api_url": "http://n",
        "gemini_api_key": "k",
    }
    defaults.update(overrides)
    for k, v in defaults.items():
        setattr(mock, k, v)
    return mock


@pytest.fixture()
def client():
    return TestClient(app, raise_server_exceptions=False)


# ── Unit tests: _merge_anonymous_reading_list ─────────────────────


class TestMergeFunction:
    """Direct unit tests for the merge helper."""

    def test_transfers_all_anonymous_entries(self):
        """Anonymous has 2 papers, user has none → both transferred."""
        db = MagicMock()

        # SELECT anonymous entries
        select_result = MagicMock()
        select_result.fetchall.return_value = [
            (10, 1700000000),  # paper_id=10
            (20, 1700001000),  # paper_id=20
        ]
        # INSERT OR IGNORE (rowcount=1 means inserted)
        insert_result_1 = MagicMock(rowcount=1)
        insert_result_2 = MagicMock(rowcount=1)
        # DELETE anonymous entries
        delete_result = MagicMock()

        db.execute.side_effect = [
            select_result,
            insert_result_1,
            insert_result_2,
            delete_result,
        ]

        count = _merge_anonymous_reading_list(db, ANON_ID, user_id=1)

        assert count == 2
        # Verify INSERT calls used correct user_id and paper_ids
        insert_calls = db.execute.call_args_list[1:3]
        assert insert_calls[0][0][1] == (1, 10, 1700000000)
        assert insert_calls[1][0][1] == (1, 20, 1700001000)
        # Verify DELETE called
        delete_call = db.execute.call_args_list[3]
        assert "DELETE" in delete_call[0][0]
        assert delete_call[0][1] == (ANON_ID,)
        db.commit.assert_called_once()

    def test_no_duplicates_on_overlap(self):
        """Anonymous and user both have paper 10 → INSERT OR IGNORE skips it."""
        db = MagicMock()

        select_result = MagicMock()
        select_result.fetchall.return_value = [
            (10, 1700000000),  # paper_id=10 (user already has this)
        ]
        # INSERT OR IGNORE → rowcount=0 (duplicate, ignored)
        insert_result = MagicMock(rowcount=0)
        delete_result = MagicMock()

        db.execute.side_effect = [select_result, insert_result, delete_result]

        count = _merge_anonymous_reading_list(db, ANON_ID, user_id=1)

        assert count == 0  # Nothing newly transferred
        db.commit.assert_called_once()

    def test_union_semantics_mixed(self):
        """Anonymous has papers 10, 20; user has 20. Result: 10 transferred, 20 skipped."""
        db = MagicMock()

        select_result = MagicMock()
        select_result.fetchall.return_value = [
            (10, 1700000000),
            (20, 1700001000),
        ]
        insert_new = MagicMock(rowcount=1)  # paper 10: new
        insert_dup = MagicMock(rowcount=0)  # paper 20: duplicate
        delete_result = MagicMock()

        db.execute.side_effect = [select_result, insert_new, insert_dup, delete_result]

        count = _merge_anonymous_reading_list(db, ANON_ID, user_id=1)

        assert count == 1  # Only paper 10 was newly transferred

    def test_empty_anonymous_list_is_noop(self):
        """Anonymous has no reading list entries → nothing to merge."""
        db = MagicMock()

        select_result = MagicMock()
        select_result.fetchall.return_value = []
        delete_result = MagicMock()

        db.execute.side_effect = [select_result, delete_result]

        count = _merge_anonymous_reading_list(db, ANON_ID, user_id=1)

        assert count == 0
        db.commit.assert_called_once()

    def test_anonymous_entries_deleted_after_transfer(self):
        """After merge, anonymous reading_list rows are removed."""
        db = MagicMock()

        select_result = MagicMock()
        select_result.fetchall.return_value = [(10, 1700000000)]
        insert_result = MagicMock(rowcount=1)
        delete_result = MagicMock()

        db.execute.side_effect = [select_result, insert_result, delete_result]

        _merge_anonymous_reading_list(db, ANON_ID, user_id=1)

        # Last execute call should be DELETE
        last_call = db.execute.call_args_list[-1]
        assert "DELETE FROM reading_list" in last_call[0][0]
        assert last_call[0][1] == (ANON_ID,)


# ── Integration tests: OAuth callback with merge ──────────────────


class TestCallbackMerge:
    """Test that OAuth callback triggers merge and clears cookie."""

    def _google_oauth_mock(self):
        """Create mock OAuth objects for Google callback."""
        mock_oauth = MagicMock()
        mock_google = MagicMock()
        mock_google.authorize_access_token = AsyncMock(
            return_value={
                "userinfo": {
                    "sub": "g-merge-user",
                    "email": "merge@test.com",
                    "name": "Merge User",
                }
            }
        )
        mock_oauth.google = mock_google
        return mock_oauth

    def test_merge_triggered_on_callback_with_anonymous_cookie(self, client):
        """OAuth callback with anonymous_id cookie → merge called, cookie cleared."""
        mock_oauth = self._google_oauth_mock()

        mock_db = MagicMock()
        # 1. SELECT user: not found
        mock_select_user = MagicMock()
        mock_select_user.fetchone.return_value = None
        # 2. INSERT user
        mock_insert_user = MagicMock()
        mock_insert_user.lastrowid = 7
        # 3. merge: SELECT anonymous reading_list
        mock_select_anon = MagicMock()
        mock_select_anon.fetchall.return_value = [
            (10, 1700000000),
            (20, 1700001000),
        ]
        # 4. merge: INSERT paper 10
        mock_insert_1 = MagicMock(rowcount=1)
        # 5. merge: INSERT paper 20
        mock_insert_2 = MagicMock(rowcount=1)
        # 6. merge: DELETE anonymous entries
        mock_delete = MagicMock()

        mock_db.execute.side_effect = [
            mock_select_user,
            mock_insert_user,
            mock_select_anon,
            mock_insert_1,
            mock_insert_2,
            mock_delete,
        ]

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
            patch("app.api.auth.get_db_connection", return_value=mock_db),
        ):
            resp = client.get(
                "/api/auth/google/callback?code=c&state=s",
                cookies={"anonymous_id": ANON_ID},
                follow_redirects=False,
            )

        assert resp.status_code == 302
        # Verify anonymous_id cookie is deleted
        set_cookies = resp.headers.get_list("set-cookie")
        anon_cookie_cleared = any(
            'anonymous_id=""' in sc or "anonymous_id=;" in sc for sc in set_cookies
        )
        assert anon_cookie_cleared, (
            f"anonymous_id cookie should be cleared. Set-Cookie headers: {set_cookies}"
        )

    def test_no_merge_without_anonymous_cookie(self, client):
        """OAuth callback without anonymous_id cookie → no merge attempt."""
        mock_oauth = self._google_oauth_mock()

        mock_db = MagicMock()
        # Only user upsert calls (no merge)
        mock_select_user = MagicMock()
        mock_select_user.fetchone.return_value = None
        mock_insert_user = MagicMock()
        mock_insert_user.lastrowid = 5
        mock_db.execute.side_effect = [mock_select_user, mock_insert_user]

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
            patch("app.api.auth.get_db_connection", return_value=mock_db),
        ):
            resp = client.get(
                "/api/auth/google/callback?code=c&state=s",
                follow_redirects=False,
            )

        assert resp.status_code == 302
        # Only 2 db.execute calls (SELECT user + INSERT user), no merge
        assert mock_db.execute.call_count == 2

    def test_merge_preserves_saved_at_timestamps(self, client):
        """Merged entries keep the original saved_at from anonymous session."""
        mock_oauth = self._google_oauth_mock()

        original_saved_at = 1690000000

        mock_db = MagicMock()
        mock_select_user = MagicMock()
        mock_select_user.fetchone.return_value = (99, "merge@test.com", "Merge User")
        mock_select_anon = MagicMock()
        mock_select_anon.fetchall.return_value = [(10, original_saved_at)]
        mock_insert = MagicMock(rowcount=1)
        mock_delete = MagicMock()

        mock_db.execute.side_effect = [
            mock_select_user,  # SELECT user (found)
            mock_select_anon,  # merge: SELECT anonymous
            mock_insert,  # merge: INSERT paper
            mock_delete,  # merge: DELETE anonymous
        ]

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
            patch("app.api.auth.get_db_connection", return_value=mock_db),
        ):
            resp = client.get(
                "/api/auth/google/callback?code=c&state=s",
                cookies={"anonymous_id": ANON_ID},
                follow_redirects=False,
            )

        assert resp.status_code == 302
        # Verify INSERT used original saved_at, not a new timestamp
        insert_call = mock_db.execute.call_args_list[2]  # 3rd call: INSERT
        assert insert_call[0][1] == (99, 10, original_saved_at)

    def test_callback_still_sets_session_cookie_after_merge(self, client):
        """Session JWT cookie is set even after merge path executes."""
        mock_oauth = self._google_oauth_mock()

        mock_db = MagicMock()
        mock_select_user = MagicMock()
        mock_select_user.fetchone.return_value = None
        mock_insert_user = MagicMock()
        mock_insert_user.lastrowid = 8
        mock_select_anon = MagicMock()
        mock_select_anon.fetchall.return_value = []
        mock_delete = MagicMock()

        mock_db.execute.side_effect = [
            mock_select_user,
            mock_insert_user,
            mock_select_anon,
            mock_delete,
        ]

        with (
            patch("app.api.auth.get_settings", return_value=_settings()),
            patch("app.api.auth.get_oauth", return_value=mock_oauth),
            patch("app.api.auth.get_db_connection", return_value=mock_db),
        ):
            resp = client.get(
                "/api/auth/google/callback?code=c&state=s",
                cookies={"anonymous_id": ANON_ID},
                follow_redirects=False,
            )

        assert resp.status_code == 302
        set_cookies = resp.headers.get_list("set-cookie")
        has_session = any("session=" in sc for sc in set_cookies)
        assert has_session, f"JWT session cookie missing. Set-Cookie: {set_cookies}"
