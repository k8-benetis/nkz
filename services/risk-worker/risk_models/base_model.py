#!/usr/bin/env python3
# =============================================================================
# Base Risk Model
# =============================================================================
# Abstract base class for all risk evaluation models

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class BaseRiskModel(ABC):
    """Base class for risk evaluation models"""
    
    def __init__(self, risk_code: str, model_config: Dict[str, Any]):
        """
        Initialize risk model
        
        Args:
            risk_code: Risk code identifier
            model_config: Model configuration from risk_catalog
        """
        self.risk_code = risk_code
        self.model_config = model_config or {}
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    @abstractmethod
    def evaluate(
        self,
        entity_id: str,
        entity_type: str,
        tenant_id: str,
        data_sources: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate risk for an entity
        
        Args:
            entity_id: Entity ID from Orion-LD
            entity_type: SDM entity type
            tenant_id: Tenant ID
            data_sources: Dictionary with required data sources
                e.g., {'weather': {...}, 'ndvi': {...}, 'telemetry': {...}}
        
        Returns:
            Dictionary with:
                - probability_score: float (0-100)
                - evaluation_data: dict (raw data used)
                - confidence: float (0-1, optional)
        """
        pass
    
    def _get_config_value(self, key: str, default: Any = None) -> Any:
        """Get configuration value with default"""
        return self.model_config.get(key, default)
    
    def _validate_data_sources(self, required: list, available: Dict[str, Any]) -> bool:
        """Validate that required data sources are available"""
        missing = [src for src in required if src not in available or available[src] is None]
        if missing:
            self.logger.warning(f"Missing required data sources: {missing}")
            return False
        return True

