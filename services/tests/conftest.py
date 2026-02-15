"""
Shared pytest fixtures for Nekazari backend tests.

Provides mock JWT tokens, Keycloak configuration, and test helpers
so that tests never depend on real external services.
"""

import os
import sys
import time
import json
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

import jwt as pyjwt
import pytest

# ---------------------------------------------------------------------------
# Ensure the common/ and api-gateway/ directories are importable
# ---------------------------------------------------------------------------
_services_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_common_dir = os.path.join(_services_dir, "common")
_api_gateway_dir = os.path.join(_services_dir, "api-gateway")

for _p in (_services_dir, _common_dir, _api_gateway_dir):
    if _p not in sys.path:
        sys.path.insert(0, _p)


# ---------------------------------------------------------------------------
# Constants used across test fixtures
# ---------------------------------------------------------------------------
TEST_KEYCLOAK_URL = "http://keycloak-test:8080"
TEST_KEYCLOAK_PUBLIC_URL = "https://auth.test.example.com"
TEST_KEYCLOAK_HOSTNAME = "auth.test.example.com"
TEST_KEYCLOAK_REALM = "nekazari"
TEST_HMAC_SECRET = "test-hmac-secret-key-for-testing-only"
TEST_JWT_SECRET = "test-jwt-secret-for-testing-only"


# ---------------------------------------------------------------------------
# RSA key pair for signing/verifying test JWTs (RS256)
# ---------------------------------------------------------------------------
# We generate a fresh key pair once per test session for speed.
_rsa_private_key = None
_rsa_public_key = None


def _get_rsa_keys():
    """Lazily generate an RSA key pair for test JWT signing."""
    global _rsa_private_key, _rsa_public_key
    if _rsa_private_key is None:
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization

        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        _rsa_private_key = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
        _rsa_public_key = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    return _rsa_private_key, _rsa_public_key


# ---------------------------------------------------------------------------
# JWT helper
# ---------------------------------------------------------------------------
def create_test_jwt(
    claims: dict | None = None,
    *,
    tenant_id: str = "test_tenant",
    username: str = "testuser",
    user_id: str = "user-uuid-1234",
    email: str = "testuser@example.com",
    roles: list[str] | None = None,
    groups: list[str] | None = None,
    issuer: str | None = None,
    expired: bool = False,
    algorithm: str = "HS256",
    secret: str = TEST_JWT_SECRET,
):
    """
    Create a signed JWT for testing purposes.

    Parameters
    ----------
    claims : dict, optional
        Extra claims to merge into the payload.
    tenant_id : str
        Value for the ``tenant-id`` claim.
    username : str
        Value for ``preferred_username``.
    user_id : str
        Value for ``sub``.
    email : str
        Value for ``email``.
    roles : list[str], optional
        Roles placed under ``realm_access.roles``.  Defaults to ``["user"]``.
    groups : list[str], optional
        Groups placed under ``groups``.
    issuer : str, optional
        Token issuer (``iss``).  Defaults to the test Keycloak internal URL
        with ``/auth/realms/<realm>`` suffix.
    expired : bool
        If True the token ``exp`` is set in the past.
    algorithm : str
        JWT signing algorithm (``HS256`` or ``RS256``).
    secret : str
        Signing key for HS256.  Ignored when algorithm is RS256.

    Returns
    -------
    str
        Encoded JWT string.
    """
    if roles is None:
        roles = ["user"]

    now = datetime.now(tz=timezone.utc)
    exp = now - timedelta(hours=1) if expired else now + timedelta(hours=1)

    if issuer is None:
        issuer = f"{TEST_KEYCLOAK_URL}/auth/realms/{TEST_KEYCLOAK_REALM}"

    payload = {
        "sub": user_id,
        "preferred_username": username,
        "email": email,
        "tenant-id": tenant_id,
        "realm_access": {"roles": roles},
        "iss": issuer,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }

    if groups is not None:
        payload["groups"] = groups

    if claims:
        payload.update(claims)

    if algorithm == "RS256":
        priv, _ = _get_rsa_keys()
        return pyjwt.encode(payload, priv, algorithm="RS256")

    return pyjwt.encode(payload, secret, algorithm=algorithm)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_jwt_token():
    """
    Return a factory function that creates test JWT tokens.

    Usage in tests::

        def test_something(mock_jwt_token):
            token = mock_jwt_token(tenant_id="farm_a", roles=["admin"])
    """
    return create_test_jwt


@pytest.fixture
def mock_keycloak_config(monkeypatch):
    """
    Set environment variables for Keycloak-related configuration.

    These values are deterministic and never point to a real service.
    """
    env_vars = {
        "KEYCLOAK_URL": TEST_KEYCLOAK_URL,
        "KEYCLOAK_PUBLIC_URL": TEST_KEYCLOAK_PUBLIC_URL,
        "KEYCLOAK_HOSTNAME": TEST_KEYCLOAK_HOSTNAME,
        "KEYCLOAK_REALM": TEST_KEYCLOAK_REALM,
        "HMAC_SECRET": TEST_HMAC_SECRET,
        "JWT_SECRET": TEST_JWT_SECRET,
        "TRUST_API_GATEWAY": "false",
    }
    for key, value in env_vars.items():
        monkeypatch.setenv(key, value)

    return env_vars


@pytest.fixture
def rsa_keys():
    """Return ``(private_key_pem, public_key_pem)`` bytes for RS256 signing."""
    return _get_rsa_keys()
