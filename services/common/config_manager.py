#!/usr/bin/env python3
# =============================================================================
# Configuration Manager - Enterprise Grade
# =============================================================================

import os
import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

class Environment(Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"

@dataclass
class DatabaseConfig:
    """Database configuration"""
    url: str
    host: str
    port: int
    database: str
    username: str
    password: str
    
    @classmethod
    def from_env(cls, prefix: str = "") -> 'DatabaseConfig':
        """Create database config from environment variables"""
        host = os.getenv(f'{prefix}DB_HOST', 'localhost')
        port = int(os.getenv(f'{prefix}DB_PORT', '5432'))
        database = os.getenv(f'{prefix}DB_NAME', 'nekazari')
        username = os.getenv(f'{prefix}DB_USER', 'postgres')
        password = os.getenv(f'{prefix}DB_PASSWORD', '')
        
        if not password:
            raise ValueError(f"{prefix}DB_PASSWORD environment variable is required")
        
        url = f"postgresql://{username}:{password}@{host}:{port}/{database}"
        
        return cls(
            url=url,
            host=host,
            port=port,
            database=database,
            username=username,
            password=password
        )

@dataclass
class KeycloakConfig:
    """Keycloak configuration"""
    url: str
    realm: str
    client_id: str
    admin_username: str
    admin_password: str
    
    @classmethod
    def from_env(cls) -> 'KeycloakConfig':
        """Create Keycloak config from environment variables"""
        url = os.getenv('KEYCLOAK_URL')
        realm = os.getenv('KEYCLOAK_REALM', 'nekazari')
        client_id = os.getenv('KEYCLOAK_CLIENT_ID', 'nekazari-api-gateway')
        admin_username = os.getenv('KEYCLOAK_ADMIN_USERNAME', 'admin')
        admin_password = os.getenv('KEYCLOAK_ADMIN_PASSWORD')
        
        if not url:
            raise ValueError("KEYCLOAK_URL environment variable is required")
        if not admin_password:
            raise ValueError("KEYCLOAK_ADMIN_PASSWORD environment variable is required")
        
        return cls(
            url=url,
            realm=realm,
            client_id=client_id,
            admin_username=admin_username,
            admin_password=admin_password
        )

@dataclass
class OrionConfig:
    """Orion-LD configuration"""
    url: str
    context_url: str
    
    @classmethod
    def from_env(cls) -> 'OrionConfig':
        """Create Orion config from environment variables"""
        url = os.getenv('ORION_URL')
        context_url = os.getenv('CONTEXT_URL')
        
        if not url:
            raise ValueError("ORION_URL environment variable is required")
        if not context_url:
            raise ValueError("CONTEXT_URL environment variable is required")
        
        return cls(url=url, context_url=context_url)

@dataclass
class SecurityConfig:
    """Security configuration"""
    jwt_secret: str
    jwt_algorithm: str
    jwt_expiration_hours: int
    
    @classmethod
    def from_env(cls) -> 'SecurityConfig':
        """Create security config from environment variables"""
        jwt_secret = os.getenv('JWT_SECRET')
        jwt_algorithm = os.getenv('JWT_ALGORITHM', 'HS256')
        jwt_expiration_hours = int(os.getenv('JWT_EXPIRATION_HOURS', '24'))
        
        if not jwt_secret:
            raise ValueError("JWT_SECRET environment variable is required")
        
        return cls(
            jwt_secret=jwt_secret,
            jwt_algorithm=jwt_algorithm,
            jwt_expiration_hours=jwt_expiration_hours
        )

@dataclass
class ServiceConfig:
    """Service-specific configuration"""
    port: int
    host: str
    debug: bool
    log_level: str
    
    @classmethod
    def from_env(cls, service_name: str) -> 'ServiceConfig':
        """Create service config from environment variables"""
        port = int(os.getenv(f'{service_name.upper()}_PORT', '5000'))
        host = os.getenv(f'{service_name.upper()}_HOST', '0.0.0.0')
        debug = os.getenv(f'{service_name.upper()}_DEBUG', 'false').lower() == 'true'
        log_level = os.getenv(f'{service_name.upper()}_LOG_LEVEL', 'INFO')
        
        return cls(
            port=port,
            host=host,
            debug=debug,
            log_level=log_level
        )

class ConfigManager:
    """Centralized configuration manager"""
    
    def __init__(self, service_name: str):
        self.service_name = service_name
        self.environment = self._get_environment()
        self._config_cache: Dict[str, Any] = {}
        
    def _get_environment(self) -> Environment:
        """Get current environment"""
        env_str = os.getenv('ENVIRONMENT', 'development').lower()
        
        try:
            return Environment(env_str)
        except ValueError:
            logging.warning(f"Unknown environment '{env_str}', defaulting to development")
            return Environment.DEVELOPMENT
    
    def get_database_config(self, prefix: str = "") -> DatabaseConfig:
        """Get database configuration"""
        cache_key = f"database_{prefix}"
        if cache_key not in self._config_cache:
            self._config_cache[cache_key] = DatabaseConfig.from_env(prefix)
        return self._config_cache[cache_key]
    
    def get_keycloak_config(self) -> KeycloakConfig:
        """Get Keycloak configuration"""
        if 'keycloak' not in self._config_cache:
            self._config_cache['keycloak'] = KeycloakConfig.from_env()
        return self._config_cache['keycloak']
    
    def get_orion_config(self) -> OrionConfig:
        """Get Orion-LD configuration"""
        if 'orion' not in self._config_cache:
            self._config_cache['orion'] = OrionConfig.from_env()
        return self._config_cache['orion']
    
    def get_security_config(self) -> SecurityConfig:
        """Get security configuration"""
        if 'security' not in self._config_cache:
            self._config_cache['security'] = SecurityConfig.from_env()
        return self._config_cache['security']
    
    def get_service_config(self) -> ServiceConfig:
        """Get service configuration"""
        if 'service' not in self._config_cache:
            self._config_cache['service'] = ServiceConfig.from_env(self.service_name)
        return self._config_cache['service']
    
    def get_feature_flag(self, flag_name: str, default: bool = False) -> bool:
        """Get feature flag value"""
        env_var = f"ENABLE_{flag_name.upper()}"
        return os.getenv(env_var, str(default)).lower() == 'true'
    
    def get_external_url(self, service: str) -> str:
        """Get external service URL"""
        base_url = os.getenv('PRODUCTION_DOMAIN', 'localhost')
        
        if self.environment == Environment.DEVELOPMENT:
            return f"http://localhost:{self._get_service_port(service)}"
        elif self.environment == Environment.STAGING:
            return f"https://staging.{base_url}"
        else:  # Production
            return f"https://{base_url}"
    
    @staticmethod
    def get_production_domain() -> str:
        """Get production domain from environment"""
        return os.getenv('PRODUCTION_DOMAIN', '')
    
    @staticmethod
    def get_frontend_url() -> str:
        """Get frontend URL, constructing from PRODUCTION_DOMAIN"""
        frontend_url = os.getenv('FRONTEND_URL', '')
        if frontend_url:
            return frontend_url.rstrip('/')
        domain = ConfigManager.get_production_domain()
        return f"https://{domain}"
    
    @staticmethod
    def get_keycloak_public_url() -> str:
        """Get Keycloak public URL, constructing from PRODUCTION_DOMAIN"""
        keycloak_url = os.getenv('KEYCLOAK_PUBLIC_URL', '')
        if keycloak_url:
            return keycloak_url.rstrip('/')
        domain = ConfigManager.get_production_domain()
        return f"https://{domain}/auth"
    
    @staticmethod
    def get_grafana_public_url() -> str:
        """Get Grafana public URL, constructing from PRODUCTION_DOMAIN"""
        grafana_url = os.getenv('GRAFANA_PUBLIC_URL', '')
        if grafana_url:
            return grafana_url.rstrip('/')
        domain = ConfigManager.get_production_domain()
        return f"https://{domain}/grafana"
    
    @staticmethod
    def get_platform_email() -> str:
        """Get platform admin email (uses ADMIN_EMAIL or SMTP_FROM_EMAIL as fallback)"""
        return os.getenv('ADMIN_EMAIL') or os.getenv('SMTP_FROM_EMAIL', '')
    
    @staticmethod
    def get_vpn_server_endpoint() -> str:
        """Get VPN server endpoint, constructing from PRODUCTION_DOMAIN"""
        vpn_endpoint = os.getenv('VPN_SERVER_ENDPOINT', '')
        if vpn_endpoint:
            return vpn_endpoint
        domain = ConfigManager.get_production_domain()
        return f"{domain}:51820"
    
    def _get_service_port(self, service: str) -> str:
        """Get service port for development"""
        ports = {
            'api-gateway': '8080',
            'orion-ld': '1026',
            'keycloak': '8080',
            'mongodb': '27017',
            'postgresql': '5432',
            'mosquitto': '1883',
        }
        return ports.get(service, '5000')
    
    def is_development(self) -> bool:
        """Check if running in development mode"""
        return self.environment == Environment.DEVELOPMENT
    
    def is_production(self) -> bool:
        """Check if running in production mode"""
        return self.environment == Environment.PRODUCTION
    
    def validate_config(self) -> None:
        """Validate all required configuration"""
        errors = []
        
        try:
            self.get_database_config()
        except ValueError as e:
            errors.append(f"Database config: {e}")
        
        try:
            self.get_keycloak_config()
        except ValueError as e:
            errors.append(f"Keycloak config: {e}")
        
        try:
            self.get_orion_config()
        except ValueError as e:
            errors.append(f"Orion config: {e}")
        
        try:
            self.get_security_config()
        except ValueError as e:
            errors.append(f"Security config: {e}")
        
        if errors:
            raise ValueError(f"Configuration validation failed: {'; '.join(errors)}")
    
    def get_all_config(self) -> Dict[str, Any]:
        """Get all configuration as dictionary"""
        return {
            'environment': self.environment.value,
            'service_name': self.service_name,
            'database': self.get_database_config().__dict__,
            'keycloak': self.get_keycloak_config().__dict__,
            'orion': self.get_orion_config().__dict__,
            'security': self.get_security_config().__dict__,
            'service': self.get_service_config().__dict__,
        }

# Global configuration instance
_config_manager: Optional[ConfigManager] = None

def get_config_manager(service_name: str = "api-gateway") -> ConfigManager:
    """Get global configuration manager instance"""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager(service_name)
        _config_manager.validate_config()
    return _config_manager

def init_config(service_name: str) -> ConfigManager:
    """Initialize configuration for a service"""
    global _config_manager
    _config_manager = ConfigManager(service_name)
    _config_manager.validate_config()
    return _config_manager
