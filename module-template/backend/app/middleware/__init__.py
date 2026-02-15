"""
MODULE_DISPLAY_NAME Backend - Authentication Middleware

JWT validation middleware for Keycloak tokens.
Compatible with Nekazari platform authentication.
"""

import httpx
from typing import Optional
from functools import lru_cache
from fastapi import HTTPException, Depends, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, jwk, JWTError
from jose.exceptions import JWKError

from app.config import get_settings, Settings


# Security scheme
security = HTTPBearer(auto_error=False)


class JWKSClient:
    """JWKS client for fetching and caching public keys from Keycloak."""
    
    def __init__(self, jwks_url: str):
        self.jwks_url = jwks_url
        self._keys: dict = {}
    
    async def get_signing_key(self, kid: str) -> dict:
        """Get signing key by key ID."""
        if kid not in self._keys:
            await self._refresh_keys()
        
        if kid not in self._keys:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to find signing key"
            )
        
        return self._keys[kid]
    
    async def _refresh_keys(self):
        """Fetch JWKS from Keycloak."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.jwks_url, timeout=10.0)
                response.raise_for_status()
                jwks_data = response.json()
                
                for key_data in jwks_data.get("keys", []):
                    kid = key_data.get("kid")
                    if kid:
                        self._keys[kid] = key_data
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to fetch JWKS: {str(e)}"
            )


@lru_cache()
def get_jwks_client() -> JWKSClient:
    """Get cached JWKS client."""
    settings = get_settings()
    return JWKSClient(settings.jwks_url)


class TokenPayload:
    """Validated token payload."""
    
    def __init__(self, payload: dict):
        self.sub: str = payload.get("sub", "")
        self.email: str = payload.get("email", "")
        self.preferred_username: str = payload.get("preferred_username", "")
        self.tenant_id: Optional[str] = payload.get("tenant_id")
        self.realm_access: dict = payload.get("realm_access", {})
        self.resource_access: dict = payload.get("resource_access", {})
        self._payload = payload
    
    @property
    def roles(self) -> list[str]:
        """Get user roles from realm_access."""
        return self.realm_access.get("roles", [])
    
    def has_role(self, role: str) -> bool:
        """Check if user has a specific role."""
        return role in self.roles
    
    def has_any_role(self, roles: list[str]) -> bool:
        """Check if user has any of the specified roles."""
        return any(role in self.roles for role in roles)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    settings: Settings = Depends(get_settings),
) -> TokenPayload:
    """
    Validate JWT token and return user payload.
    
    Usage:
        @router.get("/protected")
        async def protected_route(user: TokenPayload = Depends(get_current_user)):
            return {"user": user.email}
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    
    try:
        # Decode header to get key ID
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        
        if not kid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing key ID"
            )
        
        # Get signing key from JWKS
        jwks_client = get_jwks_client()
        key_data = await jwks_client.get_signing_key(kid)
        
        # Construct public key
        public_key = jwk.construct(key_data)
        
        # Verify and decode token
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer_url,
        )
        
        return TokenPayload(payload)
        
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWKError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Key error: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    settings: Settings = Depends(get_settings),
) -> Optional[TokenPayload]:
    """
    Same as get_current_user but returns None for unauthenticated requests.
    Useful for endpoints that work differently for authenticated vs anonymous users.
    """
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials, settings)
    except HTTPException:
        return None


def require_roles(*required_roles: str):
    """
    Dependency factory that requires specific roles.
    
    Usage:
        @router.get("/admin-only")
        async def admin_route(user: TokenPayload = Depends(require_roles("PlatformAdmin"))):
            return {"admin": user.email}
    """
    async def role_checker(
        user: TokenPayload = Depends(get_current_user)
    ) -> TokenPayload:
        if not user.has_any_role(list(required_roles)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required roles: {', '.join(required_roles)}"
            )
        return user
    
    return role_checker


def get_tenant_id(
    fiware_service: Optional[str] = Header(None, alias="fiware-service"),
    user: TokenPayload = Depends(get_current_user),
) -> str:
    """
    Get tenant ID from FIWARE-Service header or user token.
    
    Usage:
        @router.get("/data")
        async def get_data(tenant_id: str = Depends(get_tenant_id)):
            return {"tenant": tenant_id}
    """
    # Priority: Header > Token > Default
    if fiware_service:
        return fiware_service
    if user.tenant_id:
        return user.tenant_id
    return "default"
