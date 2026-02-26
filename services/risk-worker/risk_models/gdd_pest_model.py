#!/usr/bin/env python3
# =============================================================================
# GDD Pest Cycle Risk Model
# =============================================================================
# Evaluates pest pressure based on Growing Degree Days (GDD) accumulated
# since the start of the agronomic season.
#
# GDD (Growing Degree Days) = max(0, (T_max + T_min) / 2 - T_base)
# Accumulated from `season_start_doy` (day of year) to today.
#
# How it works:
#   The model receives pre-computed accumulated GDD via data_sources['gdd'].
#   It compares the season total against three configurable thresholds to
#   derive a pest pressure score.
#
# Configurable thresholds (model_config keys):
#   base_temp:          default 10.0  °C — thermal base for GDD calculation
#   season_start_doy:   default 1     — day of year for season start (1=Jan1)
#   watch_threshold:    default 100   GDD — early observation window
#   alert_threshold:    default 250   GDD — significant pest pressure
#   critical_threshold: default 400   GDD — peak pressure / action required
#   crop_type:          "olive", "vine", etc. (informational)
#   pest_name:          "Prays oleae", "Lobesia botrana", etc. (informational)
#
# Catalog entry examples (see migration 054):
#   GDD_PRAYS_OLEAE   — olive moth (Prays oleae)
#   GDD_LOBESIA_1ST   — grape berry moth 1st flight (Lobesia botrana)
#   GDD_LOBESIA_2ND   — grape berry moth 2nd flight
# =============================================================================

from typing import Dict, Any, Optional
from .base_model import BaseRiskModel


class GDDPestRiskModel(BaseRiskModel):
    """Pest cycle risk model based on accumulated Growing Degree Days."""

    def evaluate(
        self,
        entity_id: str,
        entity_type: str,
        tenant_id: str,
        data_sources: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate pest pressure from accumulated GDD.

        Requires:
            data_sources['gdd'] = {
                'gdd_season_total': float,   # GDD accumulated since season start
                'season_start_doy': int,     # day of year season started
                'days_accumulated': int,     # number of observation days counted
            }
        """
        gdd_data = data_sources.get('gdd')

        if not gdd_data:
            return {
                'probability_score': 0.0,
                'evaluation_data': {'error': 'Missing GDD data'},
                'confidence': 0.0
            }

        gdd_total: Optional[float] = gdd_data.get('gdd_season_total')
        days = gdd_data.get('days_accumulated', 0)

        if gdd_total is None:
            return {
                'probability_score': 0.0,
                'evaluation_data': {
                    'condition': 'no_data',
                    'recommendation': 'Sin datos de GDD para esta temporada.',
                    'days_accumulated': days,
                },
                'confidence': 0.0
            }

        # Config thresholds
        watch_threshold    = self._get_config_value('watch_threshold',    100.0)
        alert_threshold    = self._get_config_value('alert_threshold',    250.0)
        critical_threshold = self._get_config_value('critical_threshold', 400.0)
        crop_type          = self._get_config_value('crop_type',          'unknown')
        pest_name          = self._get_config_value('pest_name',          self.risk_code)

        # Confidence degrades if we have fewer than 7 days of data
        confidence = min(1.0, days / 7.0) if days < 7 else 1.0

        # ── Score ─────────────────────────────────────────────────────────────
        if gdd_total < watch_threshold:
            probability = 5.0
            condition = 'below_threshold'
            recommendation = (
                f'{pest_name}: {gdd_total:.0f} GDD acumulados. '
                f'Umbral de vigilancia: {watch_threshold:.0f} GDD. Sin presión actual.'
            )
        elif gdd_total < alert_threshold:
            # Linear interpolation from 30 → 65 in the watch→alert range
            ratio = (gdd_total - watch_threshold) / (alert_threshold - watch_threshold)
            probability = 30.0 + ratio * 35.0
            condition = 'watch'
            recommendation = (
                f'{pest_name}: {gdd_total:.0f} GDD. '
                f'Aproximándose al umbral de alerta ({alert_threshold:.0f} GDD). '
                f'Incrementar monitorización.'
            )
        elif gdd_total < critical_threshold:
            # Linear interpolation from 65 → 88 in the alert→critical range
            ratio = (gdd_total - alert_threshold) / (critical_threshold - alert_threshold)
            probability = 65.0 + ratio * 23.0
            condition = 'alert'
            recommendation = (
                f'{pest_name}: {gdd_total:.0f} GDD. '
                f'Presión significativa. Evaluar tratamiento fitosanitario.'
            )
        else:
            probability = 93.0
            condition = 'critical'
            recommendation = (
                f'{pest_name}: {gdd_total:.0f} GDD (≥{critical_threshold:.0f}). '
                f'Presión máxima. Tratamiento urgente recomendado.'
            )

        return {
            'probability_score': round(probability, 2),
            'evaluation_data': {
                'condition': condition,
                'recommendation': recommendation,
                'gdd_season_total': round(gdd_total, 1),
                'days_accumulated': days,
                'thresholds': {
                    'watch_gdd':    watch_threshold,
                    'alert_gdd':    alert_threshold,
                    'critical_gdd': critical_threshold,
                },
                'crop_type': crop_type,
                'pest_name': pest_name,
            },
            'confidence': round(confidence, 2)
        }
