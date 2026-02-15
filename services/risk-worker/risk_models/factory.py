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
except ImportError as e:
    logger.warning(f"Failed to import risk models: {e}")
    AgronomicRiskModel = None
    RoboticRiskModel = None
    EnergyRiskModel = None


class RiskModelFactory:
    """Factory for creating risk evaluation models"""
    
    @staticmethod
    def create_model(risk_code: str, risk_domain: str, model_config: Dict[str, Any]) -> Optional[Any]:
        """
        Create appropriate risk model based on domain
        
        Args:
            risk_code: Risk code identifier
            risk_domain: Risk domain ('agronomic', 'robotic', 'energy')
            model_config: Model configuration from risk_catalog
            
        Returns:
            Risk model instance or None
        """
        if risk_domain == 'agronomic':
            if AgronomicRiskModel:
                return AgronomicRiskModel(risk_code, model_config)
            else:
                logger.error("AgronomicRiskModel not available")
                return None
                
        elif risk_domain == 'robotic':
            if RoboticRiskModel:
                return RoboticRiskModel(risk_code, model_config)
            else:
                logger.error("RoboticRiskModel not available")
                return None
                
        elif risk_domain == 'energy':
            if EnergyRiskModel:
                return EnergyRiskModel(risk_code, model_config)
            else:
                logger.error("EnergyRiskModel not available")
                return None
                
        else:
            logger.warning(f"Unknown risk domain: {risk_domain}")
            return None

