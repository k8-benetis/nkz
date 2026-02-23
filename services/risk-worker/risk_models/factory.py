#!/usr/bin/env python3
# =============================================================================
# Risk Model Factory
# =============================================================================
# Factory Pattern for creating risk evaluation models based on risk domain

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Import risk model classes
try:
    from .agronomic_model import AgronomicRiskModel
    from .robotic_model import RoboticRiskModel
    from .energy_model import EnergyRiskModel
    from .spray_suitability_model import SpraySuitabilityRiskModel
except ImportError as e:
    logger.warning(f"Failed to import risk models: {e}")
    AgronomicRiskModel = None
    RoboticRiskModel = None
    EnergyRiskModel = None
    SpraySuitabilityRiskModel = None

# Models dispatched by model_type (takes precedence over domain mapping)
MODEL_TYPE_MAP = {
    'spray_suitability': SpraySuitabilityRiskModel,
}

# Fallback dispatch by risk_domain
DOMAIN_MAP = {
    'agronomic': AgronomicRiskModel,
    'robotic': RoboticRiskModel,
    'energy': EnergyRiskModel,
}


class RiskModelFactory:
    """Factory for creating risk evaluation models"""

    @staticmethod
    def create_model(risk_code: str, risk_domain: str, model_config: Dict[str, Any], model_type: Optional[str] = None) -> Optional[Any]:
        """
        Create appropriate risk model based on model_type (preferred) or domain.

        Args:
            risk_code: Risk code identifier
            risk_domain: Risk domain ('agronomic', 'robotic', 'energy')
            model_config: Model configuration from risk_catalog
            model_type: Optional explicit model type from risk_catalog

        Returns:
            Risk model instance or None
        """
        # 1. Dispatch by model_type if provided and known
        if model_type and model_type in MODEL_TYPE_MAP:
            cls = MODEL_TYPE_MAP[model_type]
            if cls:
                return cls(risk_code, model_config)
            else:
                logger.error(f"Model class for model_type '{model_type}' not available")
                return None

        # 2. Fallback: dispatch by domain
        cls = DOMAIN_MAP.get(risk_domain)
        if cls:
            return cls(risk_code, model_config)

        logger.warning(f"Unknown risk domain '{risk_domain}' and no model_type match for risk '{risk_code}'")
        return None

