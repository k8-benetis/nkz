// =============================================================================
// useEntityDependencies Hook - Check Entity Relationships (FIWARE NGSI-LD)
// =============================================================================
// Checks for dependent entities before deletion to prevent orphaned data.
// In FIWARE/Orion-LD, relationships are one-way (no CASCADE DELETE).
// This hook identifies entities that reference the target entity.

import { useState, useCallback } from 'react';
import api from '@/services/api';
import { UnifiedAsset } from '@/types/assets';

// =============================================================================
// Types
// =============================================================================

export interface EntityDependency {
  entityId: string;
  entityName: string;
  entityType: string;
  dependentType: string;
  dependentCount: number;
}

// Relationship mappings: which entity types can reference which
const RELATIONSHIP_MAP: Record<string, { attribute: string; dependentTypes: string[] }> = {
  AgriParcel: {
    attribute: 'refAgriParcel',
    dependentTypes: ['AgriSensor', 'AgriculturalRobot', 'AgriCrop', 'Device'],
  },
  AgriFarm: {
    attribute: 'refAgriFarm',
    dependentTypes: ['AgriParcel', 'AgriGreenhouse', 'AgriculturalRobot'],
  },
  AgriGreenhouse: {
    attribute: 'refAgriGreenhouse',
    dependentTypes: ['AgriSensor', 'AgriCrop'],
  },
};

// =============================================================================
// Hook
// =============================================================================

export const useEntityDependencies = () => {
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check dependencies for a single entity
   */
  const checkDependencies = useCallback(async (
    entity: UnifiedAsset
  ): Promise<EntityDependency[]> => {
    const relationship = RELATIONSHIP_MAP[entity.type];
    if (!relationship) {
      // No known relationships for this entity type
      return [];
    }

    setIsChecking(true);
    setError(null);

    try {
      const dependencies: EntityDependency[] = [];

      // Check each dependent type
      for (const dependentType of relationship.dependentTypes) {
        try {
          // Get all instances of the dependent type
          const instances = await api.getSDMEntityInstances(dependentType);
          
          // Filter instances that reference this entity
          const dependents = instances.filter((instance: any) => {
            const refAttr = instance[relationship.attribute];
            if (!refAttr) return false;
            
            // Handle NGSI-LD object format
            const refValue = typeof refAttr === 'object' ? refAttr.object || refAttr.value : refAttr;
            return refValue === entity.id || refValue === entity.rawEntity?.id;
          });

          if (dependents.length > 0) {
            dependencies.push({
              entityId: entity.id,
              entityName: entity.name,
              entityType: entity.type,
              dependentType: dependentType,
              dependentCount: dependents.length,
            });
          }
        } catch (err) {
          // Skip this type if it fails (might not exist or no permissions)
          console.warn(`[useEntityDependencies] Failed to check ${dependentType}:`, err);
        }
      }

      return dependencies;
    } catch (err: any) {
      console.error('[useEntityDependencies] Error checking dependencies:', err);
      setError(err.message || 'Error al verificar dependencias');
      return [];
    } finally {
      setIsChecking(false);
    }
  }, []);

  /**
   * Check dependencies for multiple entities
   */
  const checkDependenciesBatch = useCallback(async (
    entities: UnifiedAsset[]
  ): Promise<EntityDependency[]> => {
    setIsChecking(true);
    setError(null);

    try {
      const allDependencies: EntityDependency[] = [];

      for (const entity of entities) {
        const deps = await checkDependencies(entity);
        allDependencies.push(...deps);
      }

      return allDependencies;
    } catch (err: any) {
      console.error('[useEntityDependencies] Error in batch check:', err);
      setError(err.message || 'Error al verificar dependencias');
      return [];
    } finally {
      setIsChecking(false);
    }
  }, [checkDependencies]);

  /**
   * Determine if deletion should be blocked based on dependencies
   * For Phase 1: Block if ANY dependencies are found
   */
  const shouldBlockDeletion = useCallback((dependencies: EntityDependency[]): boolean => {
    return dependencies.length > 0;
  }, []);

  return {
    checkDependencies,
    checkDependenciesBatch,
    shouldBlockDeletion,
    isChecking,
    error,
  };
};


