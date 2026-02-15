"""
Configuration for Weather Worker
"""

import os
from typing import Optional


class WeatherWorkerConfig:
    """Configuration for Weather Worker service"""
    
    # PostgreSQL
    POSTGRES_URL: Optional[str] = os.getenv('POSTGRES_URL')
    POSTGRES_USER: Optional[str] = os.getenv('POSTGRES_USER', 'nekazari')
    POSTGRES_PASSWORD: Optional[str] = os.getenv('POSTGRES_PASSWORD')
    POSTGRES_HOST: Optional[str] = os.getenv('POSTGRES_HOST', 'postgresql-service')
    POSTGRES_PORT: Optional[str] = os.getenv('POSTGRES_PORT', '5432')
    POSTGRES_DB: Optional[str] = os.getenv('POSTGRES_DB', 'nekazari')
    
    # Open-Meteo API (Primary source)
    OPENMETEO_API_URL: str = os.getenv('OPENMETEO_API_URL', 'https://api.open-meteo.com/v1')
    
    # AEMET API (Secondary source - alerts only)
    AEMET_API_KEY: Optional[str] = os.getenv('AEMET_API_KEY')
    AEMET_API_URL: str = os.getenv('AEMET_API_URL', 'https://opendata.aemet.es/opendata/api')
    
    # Ingestion settings
    WEATHER_INGESTION_INTERVAL_HOURS: int = int(os.getenv('WEATHER_INGESTION_INTERVAL_HOURS', '1'))
    FORECAST_DAYS: int = int(os.getenv('WEATHER_FORECAST_DAYS', '14'))
    
    # Metrics
    METRICS_HOST: str = os.getenv('METRICS_HOST', '0.0.0.0')
    METRICS_PORT: int = int(os.getenv('METRICS_PORT', '9106'))
    
    # Logging
    LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')
    
    @classmethod
    def build_postgres_url(cls) -> Optional[str]:
        """Build PostgreSQL URL from components if password is available"""
        if cls.POSTGRES_PASSWORD:
            return f"postgresql://{cls.POSTGRES_USER}:{cls.POSTGRES_PASSWORD}@{cls.POSTGRES_HOST}:{cls.POSTGRES_PORT}/{cls.POSTGRES_DB}"
        return cls.POSTGRES_URL

