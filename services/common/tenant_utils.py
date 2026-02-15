#!/usr/bin/env python3
# =============================================================================
# Tenant Utilities - Common Functions for Tenant ID Normalization
# =============================================================================
# Provides consistent tenant ID normalization across all services
# Ensures compatibility with PostgreSQL, MongoDB, and other services

import re
import logging

logger = logging.getLogger(__name__)

# Tenant ID constraints
MIN_TENANT_ID_LENGTH = 3
MAX_TENANT_ID_LENGTH = 63  # MongoDB database name limit
ALLOWED_CHARS_PATTERN = re.compile(r'^[a-z0-9_]+$')


def normalize_tenant_id(tenant_id: str) -> str:
    """
    Normalize tenant ID to ensure consistency across all services.
    
    Rules:
    - Convert to lowercase
    - Replace hyphens with underscores (MongoDB compatibility)
    - Remove any characters that are not alphanumeric or underscore
    - Ensure minimum and maximum length
    
    Args:
        tenant_id: Raw tenant ID string
        
    Returns:
        Normalized tenant ID string
        
    Examples:
        >>> normalize_tenant_id("TESTTENANT")
        'testtenant'
        >>> normalize_tenant_id("Test-Tenant-1")
        'test_tenant_1'
        >>> normalize_tenant_id("My Tenant@123")
        'my_tenant123'
    """
    if not tenant_id:
        raise ValueError("Tenant ID cannot be empty")
    
    # Convert to lowercase
    normalized = tenant_id.lower().strip()
    
    # Replace hyphens with underscores (MongoDB database names don't support hyphens)
    normalized = normalized.replace('-', '_')
    
    # Remove any characters that are not alphanumeric or underscore
    normalized = re.sub(r'[^a-z0-9_]', '', normalized)
    
    # Remove leading/trailing underscores
    normalized = normalized.strip('_')
    
    # Validate length
    if len(normalized) < MIN_TENANT_ID_LENGTH:
        raise ValueError(
            f"Tenant ID must be at least {MIN_TENANT_ID_LENGTH} characters after normalization. "
            f"Got: '{normalized}' (from '{tenant_id}')"
        )
    
    if len(normalized) > MAX_TENANT_ID_LENGTH:
        raise ValueError(
            f"Tenant ID must be at most {MAX_TENANT_ID_LENGTH} characters after normalization. "
            f"Got: '{normalized}' (from '{tenant_id}')"
        )
    
    # Final validation: should only contain allowed characters
    if not ALLOWED_CHARS_PATTERN.match(normalized):
        raise ValueError(
            f"Tenant ID contains invalid characters after normalization. "
            f"Only lowercase letters, numbers, and underscores are allowed. "
            f"Got: '{normalized}' (from '{tenant_id}')"
        )
    
    return normalized


def validate_tenant_id(tenant_id: str) -> tuple[bool, str]:
    """
    Validate tenant ID format without normalizing it.
    
    Args:
        tenant_id: Tenant ID string to validate
        
    Returns:
        Tuple of (is_valid, error_message)
        If valid, error_message is empty string
    """
    if not tenant_id:
        return False, "El ID del tenant no puede estar vacío"
    
    if len(tenant_id) < MIN_TENANT_ID_LENGTH:
        return False, f"El ID del tenant debe tener al menos {MIN_TENANT_ID_LENGTH} caracteres"
    
    if len(tenant_id) > MAX_TENANT_ID_LENGTH:
        return False, f"El ID del tenant debe tener como máximo {MAX_TENANT_ID_LENGTH} caracteres"
    
    # Check for characters that would be removed during normalization
    if re.search(r'[^a-z0-9_-]', tenant_id.lower()):
        return False, (
            "El ID del tenant solo puede contener letras minúsculas, números, guiones y guiones bajos. "
            "Los caracteres especiales y espacios no están permitidos."
        )
    
    return True, ""


def get_tenant_id_validation_rules() -> dict:
    """
    Get tenant ID validation rules for frontend display.
    
    Returns:
        Dictionary with validation rules
    """
    return {
        'min_length': MIN_TENANT_ID_LENGTH,
        'max_length': MAX_TENANT_ID_LENGTH,
        'allowed_chars': 'letras minúsculas, números, guiones (-) y guiones bajos (_)',
        'description': (
            f'El ID del tenant debe tener entre {MIN_TENANT_ID_LENGTH} y {MAX_TENANT_ID_LENGTH} caracteres. '
            'Solo se permiten letras minúsculas, números, guiones y guiones bajos. '
            'Los guiones se convertirán automáticamente en guiones bajos.'
        )
    }

