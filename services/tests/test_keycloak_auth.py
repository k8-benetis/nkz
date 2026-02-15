"""
Tests for services/common/keycloak_auth.py

All tests mock external dependencies (Keycloak JWKS endpoint, env vars)
so that no real services are needed.
"""

import os
import sys
import time
import hmac
import hashlib
from unittest.mock import patch, MagicMock, PropertyMock

import jwt as pyjwt
import pytest
from flask import Flask
from cryptography.hazmat.primitives.serialization import load_pem_public_key

# ---------------------------------------------------------------------------
# Ensure imports resolve correctly
# ---------------------------------------------------------------------------
_tests_dir = os.path.dirname(os.path.abspath(__file__))
_services_dir = os.path.dirname(_tests_dir)
_common_dir = os.path.join(_services_dir, "common")
for _p in (_tests_dir, _services_dir, _common_dir):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Constants must match conftest.py (do NOT import conftest directly —
# pytest auto-loads it as a special module with its own globals, so importing
# it as a regular module creates a second copy with different RSA keys).
TEST_KEYCLOAK_URL = "http://keycloak-test:8080"
TEST_KEYCLOAK_PUBLIC_URL = "https://auth.test.example.com"
TEST_KEYCLOAK_HOSTNAME = "auth.test.example.com"
TEST_KEYCLOAK_REALM = "nekazari"
TEST_HMAC_SECRET = "test-hmac-secret-key-for-testing-only"
TEST_JWT_SECRET = "test-jwt-secret-for-testing-only"


# ---------------------------------------------------------------------------
# Helper: create a minimal Flask app with a protected route
# ---------------------------------------------------------------------------
def _make_app():
    """
    Build a throw-away Flask app with one protected endpoint
    that uses ``require_keycloak_auth``.
    """
    # We must import inside the function so that the module-level env vars
    # in keycloak_auth are resolved AFTER monkeypatch / mock_keycloak_config
    # has set them.  To work around the module-level resolution we reload.
    import importlib
    import keycloak_auth as _mod

    importlib.reload(_mod)

    app = Flask(__name__)

    @app.route("/protected")
    @_mod.require_keycloak_auth
    def protected():
        from flask import g, jsonify

        return jsonify(
            {
                "user": g.username,
                "tenant": g.tenant,
                "roles": g.roles,
            }
        )

    @app.route("/health")
    def health():
        from flask import jsonify

        return jsonify({"status": "ok"})

    return app, _mod


# =========================================================================
# 1. require_keycloak_auth rejects requests without Authorization header
# =========================================================================
class TestRequireKeycloakAuthNoHeader:
    """The decorator must return 401 when no Authorization header is sent."""

    def test_missing_auth_header_returns_401(self, mock_keycloak_config):
        app, _ = _make_app()
        client = app.test_client()

        resp = client.get("/protected")
        assert resp.status_code == 401
        data = resp.get_json()
        assert "error" in data
        assert "authorization" in data["error"].lower() or "missing" in data["error"].lower()

    def test_malformed_auth_header_returns_401(self, mock_keycloak_config):
        """Authorization header present but not 'Bearer <token>' format."""
        app, _ = _make_app()
        client = app.test_client()

        resp = client.get("/protected", headers={"Authorization": "Basic dXNlcjpwYXNz"})
        assert resp.status_code == 401

    def test_empty_bearer_token_returns_401(self, mock_keycloak_config):
        """'Bearer ' with nothing after it."""
        app, _ = _make_app()
        client = app.test_client()

        # The split logic will yield an empty string for the token
        resp = client.get("/protected", headers={"Authorization": "Bearer "})
        assert resp.status_code == 401


# =========================================================================
# 2. Issuer validation rejects tokens with wrong issuer
# =========================================================================
class TestIssuerValidation:
    """validate_keycloak_token must reject tokens whose ``iss`` is not whitelisted."""

    def test_wrong_issuer_is_rejected(self, mock_keycloak_config, mock_jwt_token, rsa_keys):
        """A token signed correctly but with a foreign issuer must be rejected."""
        priv, pub = rsa_keys
        token = mock_jwt_token(
            issuer="https://evil.example.com/auth/realms/nekazari",
            algorithm="RS256",
        )

        _, mod = _make_app()

        # Mock the PyJWKClient so it returns our test public key
        mock_signing_key = MagicMock()
        mock_signing_key.key = load_pem_public_key(pub)

        with patch.object(mod, "get_jwks_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
            mock_get_client.return_value = mock_client

            with pytest.raises(mod.TokenValidationError, match="[Ii]ssuer"):
                mod.validate_keycloak_token(token)

    def test_correct_issuer_internal_url_accepted(self, mock_keycloak_config, mock_jwt_token, rsa_keys):
        """A token with the internal Keycloak issuer URL should be accepted."""
        priv, pub = rsa_keys
        correct_issuer = f"{TEST_KEYCLOAK_URL}/auth/realms/{TEST_KEYCLOAK_REALM}"
        token = mock_jwt_token(issuer=correct_issuer, algorithm="RS256")

        _, mod = _make_app()

        mock_signing_key = MagicMock()
        mock_signing_key.key = load_pem_public_key(pub)

        with patch.object(mod, "get_jwks_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
            mock_get_client.return_value = mock_client

            payload = mod.validate_keycloak_token(token)
            assert payload is not None
            assert payload["iss"] == correct_issuer

    def test_correct_issuer_public_url_accepted(self, mock_keycloak_config, mock_jwt_token, rsa_keys):
        """A token with the public Keycloak URL should also be accepted."""
        priv, pub = rsa_keys
        public_issuer = f"{TEST_KEYCLOAK_PUBLIC_URL}/auth/realms/{TEST_KEYCLOAK_REALM}"
        token = mock_jwt_token(issuer=public_issuer, algorithm="RS256")

        _, mod = _make_app()

        mock_signing_key = MagicMock()
        mock_signing_key.key = load_pem_public_key(pub)

        with patch.object(mod, "get_jwks_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
            mock_get_client.return_value = mock_client

            payload = mod.validate_keycloak_token(token)
            assert payload is not None
            assert payload["iss"] == public_issuer

    def test_correct_issuer_hostname_https_accepted(self, mock_keycloak_config, mock_jwt_token, rsa_keys):
        """A token with the KEYCLOAK_HOSTNAME-based issuer should be accepted."""
        priv, pub = rsa_keys
        hostname_issuer = f"https://{TEST_KEYCLOAK_HOSTNAME}/auth/realms/{TEST_KEYCLOAK_REALM}"
        token = mock_jwt_token(issuer=hostname_issuer, algorithm="RS256")

        _, mod = _make_app()

        mock_signing_key = MagicMock()
        mock_signing_key.key = load_pem_public_key(pub)

        with patch.object(mod, "get_jwks_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
            mock_get_client.return_value = mock_client

            payload = mod.validate_keycloak_token(token)
            assert payload is not None


# =========================================================================
# 3. Tenant ID extraction
# =========================================================================
class TestExtractTenantId:
    """extract_tenant_id must find the tenant in various claim locations."""

    def test_tenant_from_tenant_dash_id(self, mock_keycloak_config):
        _, mod = _make_app()
        payload = {"tenant-id": "Farm-Alpha"}
        result = mod.extract_tenant_id(payload)
        # Should be normalized (lowercase, underscores)
        assert result is not None
        assert "farm" in result.lower()

    def test_tenant_from_tenant_underscore_id(self, mock_keycloak_config):
        _, mod = _make_app()
        payload = {"tenant_id": "my_farm"}
        result = mod.extract_tenant_id(payload)
        assert result is not None
        assert "my_farm" in result.lower()

    def test_tenant_from_tenant_claim(self, mock_keycloak_config):
        _, mod = _make_app()
        payload = {"tenant": "another-farm"}
        result = mod.extract_tenant_id(payload)
        assert result is not None

    def test_tenant_from_groups_fallback(self, mock_keycloak_config):
        _, mod = _make_app()
        payload = {"groups": ["/my_farm_group"]}
        result = mod.extract_tenant_id(payload)
        assert result is not None
        assert "my_farm_group" in result.lower()

    def test_no_tenant_returns_none(self, mock_keycloak_config):
        _, mod = _make_app()
        payload = {"sub": "user-1234"}
        result = mod.extract_tenant_id(payload)
        assert result is None

    def test_system_groups_are_skipped(self, mock_keycloak_config):
        """Groups like 'default' or 'offline_access' must not be used as tenant."""
        _, mod = _make_app()
        payload = {"groups": ["/default", "/offline_access", "/uma_authorization"]}
        result = mod.extract_tenant_id(payload)
        assert result is None

    def test_platform_group_accepted(self, mock_keycloak_config):
        """The special 'platform' group should be accepted as tenant."""
        _, mod = _make_app()
        payload = {"groups": ["/platform"]}
        result = mod.extract_tenant_id(payload)
        assert result == "platform"


# =========================================================================
# 4. Role extraction from realm_access
# =========================================================================
class TestRoleExtraction:
    """The decorator should populate ``g.roles`` from ``realm_access.roles``."""

    def test_roles_set_in_flask_g(self, mock_keycloak_config, mock_jwt_token, rsa_keys):
        priv, pub = rsa_keys
        token = mock_jwt_token(
            roles=["admin", "user", "manager"],
            algorithm="RS256",
            issuer=f"{TEST_KEYCLOAK_URL}/auth/realms/{TEST_KEYCLOAK_REALM}",
        )

        app, mod = _make_app()

        mock_signing_key = MagicMock()
        mock_signing_key.key = load_pem_public_key(pub)

        with patch.object(mod, "get_jwks_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
            mock_get_client.return_value = mock_client

            client = app.test_client()
            resp = client.get(
                "/protected",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.get_json()
            assert set(data["roles"]) == {"admin", "user", "manager"}

    def test_empty_roles(self, mock_keycloak_config, mock_jwt_token, rsa_keys):
        priv, pub = rsa_keys
        token = mock_jwt_token(
            roles=[],
            algorithm="RS256",
            issuer=f"{TEST_KEYCLOAK_URL}/auth/realms/{TEST_KEYCLOAK_REALM}",
        )

        app, mod = _make_app()

        mock_signing_key = MagicMock()
        mock_signing_key.key = load_pem_public_key(pub)

        with patch.object(mod, "get_jwks_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
            mock_get_client.return_value = mock_client

            client = app.test_client()
            resp = client.get(
                "/protected",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.get_json()
            assert data["roles"] == []


# =========================================================================
# 5. HMAC signature generation and verification
# =========================================================================
class TestHmacSignature:
    """generate_hmac_signature and verify_hmac_signature round-trip."""

    def test_generate_and_verify_round_trip(self, mock_keycloak_config):
        _, mod = _make_app()

        token = "dummy-token-value"
        tenant_id = "test_tenant"

        sig = mod.generate_hmac_signature(token, tenant_id)
        assert sig  # non-empty
        assert ":" in sig  # format is "<hex>:<timestamp>"

        result = mod.verify_hmac_signature(sig, token, tenant_id)
        assert result is True

    def test_tampered_signature_is_rejected(self, mock_keycloak_config):
        _, mod = _make_app()

        token = "dummy-token-value"
        tenant_id = "test_tenant"

        sig = mod.generate_hmac_signature(token, tenant_id)
        # Flip a character in the hex portion
        parts = sig.split(":")
        tampered_hex = parts[0][:-1] + ("a" if parts[0][-1] != "a" else "b")
        tampered_sig = f"{tampered_hex}:{parts[1]}"

        result = mod.verify_hmac_signature(tampered_sig, token, tenant_id)
        assert result is False

    def test_expired_timestamp_is_rejected(self, mock_keycloak_config):
        _, mod = _make_app()

        token = "dummy-token-value"
        tenant_id = "test_tenant"

        # Manually craft a signature with an old timestamp (> 5 min)
        old_timestamp = str(int(time.time()) - 400)
        message = f"{token}|{tenant_id}|{old_timestamp}"
        signature = hmac.new(
            TEST_HMAC_SECRET.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        sig_header = f"{signature}:{old_timestamp}"

        result = mod.verify_hmac_signature(sig_header, token, tenant_id)
        assert result is False

    def test_empty_hmac_secret_returns_empty_string(self, mock_keycloak_config, monkeypatch):
        monkeypatch.setenv("HMAC_SECRET", "")
        monkeypatch.setenv("JWT_SECRET", "")

        _, mod = _make_app()

        sig = mod.generate_hmac_signature("token", "tenant")
        assert sig == ""

    def test_verify_without_signature_configured_returns_true(self, mock_keycloak_config, monkeypatch):
        """When HMAC is not configured, verification should not block requests."""
        monkeypatch.setenv("HMAC_SECRET", "")
        monkeypatch.setenv("JWT_SECRET", "")

        _, mod = _make_app()

        # Empty signature header with no secret -> should pass (not block)
        result = mod.verify_hmac_signature("", "token", "tenant")
        assert result is True


# =========================================================================
# 6. Token validation edge cases
# =========================================================================
class TestTokenValidationEdgeCases:
    """Miscellaneous edge-case tests for validate_keycloak_token."""

    def test_empty_token_raises(self, mock_keycloak_config):
        _, mod = _make_app()

        with pytest.raises(mod.TokenValidationError, match="empty"):
            mod.validate_keycloak_token("")

    def test_none_token_raises(self, mock_keycloak_config):
        _, mod = _make_app()

        with pytest.raises(mod.TokenValidationError, match="empty"):
            mod.validate_keycloak_token(None)

    def test_expired_token_raises(self, mock_keycloak_config, mock_jwt_token, rsa_keys):
        priv, pub = rsa_keys
        token = mock_jwt_token(
            expired=True,
            algorithm="RS256",
            issuer=f"{TEST_KEYCLOAK_URL}/auth/realms/{TEST_KEYCLOAK_REALM}",
        )

        _, mod = _make_app()

        mock_signing_key = MagicMock()
        mock_signing_key.key = load_pem_public_key(pub)

        with patch.object(mod, "get_jwks_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
            mock_get_client.return_value = mock_client

            with pytest.raises(mod.TokenValidationError, match="[Ee]xpired"):
                mod.validate_keycloak_token(token)
