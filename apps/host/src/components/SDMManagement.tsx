// =============================================================================
// SDM Management Component - Admin Panel
// =============================================================================

import React, { useState, useEffect } from 'react';
import api from '@/services/api';
import { 
  Database, 
  RefreshCw, 
  Upload, 
  Download, 
  CheckCircle, 
  AlertCircle,
  Info,
  Settings
} from 'lucide-react';

interface SDMEntity {
  entityType: string;
  schema: any;
  count?: number;
}

interface MigrationResult {
  migrated: string[];
  errors: string[];
  total: number;
  success: number;
}

export const SDMManagement: React.FC = () => {
  const [entities, setEntities] = useState<SDMEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);

  const loadSDMEntities = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSDMEntities();
      setEntities(data.entities || []);
    } catch (error) {
      console.error('Error loading SDM entities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const migrateEntities = async () => {
    if (selectedEntities.length === 0) {
      alert('Selecciona al menos una entidad para migrar');
      return;
    }

    setIsLoading(true);
    try {
      const result = await api.migrateToSDM(selectedEntities);
      setMigrationResult(result);
    } catch (error) {
      console.error('Error migrating entities:', error);
      alert('Error durante la migración');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEntitySelect = (entityId: string) => {
    setSelectedEntities(prev => 
      prev.includes(entityId) 
        ? prev.filter(id => id !== entityId)
        : [...prev, entityId]
    );
  };

  const selectAllEntities = () => {
    const allEntityIds = entities.map(e => e.entityType);
    setSelectedEntities(allEntityIds);
  };

  const clearSelection = () => {
    setSelectedEntities([]);
  };

  useEffect(() => {
    loadSDMEntities();
  }, []);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Database className="h-6 w-6 text-blue-600 mr-3" />
          <h2 className="text-lg font-semibold text-gray-900">SDM Management</h2>
        </div>
        <button
          onClick={loadSDMEntities}
          disabled={isLoading}
          className="flex items-center text-gray-600 hover:text-gray-900 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* SDM Entities List */}
      <div className="mb-6">
        <h3 className="text-md font-medium text-gray-900 mb-4">Entidades SDM Disponibles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {entities.map((entity) => (
            <div
              key={entity.entityType}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedEntities.includes(entity.entityType)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => handleEntitySelect(entity.entityType)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{entity.entityType}</h4>
                  <p className="text-sm text-gray-600">{entity.schema?.description}</p>
                  {entity.count !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      {entity.count} instancias
                    </p>
                  )}
                </div>
                <div className="flex items-center">
                  {selectedEntities.includes(entity.entityType) ? (
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                  ) : (
                    <div className="h-5 w-5 border-2 border-gray-300 rounded-full" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selection Controls */}
      <div className="flex items-center space-x-4 mb-6">
        <button
          onClick={selectAllEntities}
          className="flex items-center text-sm text-blue-600 hover:text-blue-700"
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          Seleccionar todas
        </button>
        <button
          onClick={clearSelection}
          className="flex items-center text-sm text-gray-600 hover:text-gray-700"
        >
          <AlertCircle className="h-4 w-4 mr-1" />
          Limpiar selección
        </button>
        <span className="text-sm text-gray-500">
          {selectedEntities.length} entidades seleccionadas
        </span>
      </div>

      {/* Migration Section */}
      <div className="border-t pt-6">
        <h3 className="text-md font-medium text-gray-900 mb-4">Migración a SDM</h3>
        <div className="flex items-center space-x-4">
          <button
            onClick={migrateEntities}
            disabled={isLoading || selectedEntities.length === 0}
            className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="h-4 w-4 mr-2" />
            {isLoading ? 'Migrando...' : 'Migrar Entidades'}
          </button>
          <div className="flex items-center text-sm text-gray-600">
            <Info className="h-4 w-4 mr-1" />
            Migrar entidades existentes al formato SDM
          </div>
        </div>
      </div>

      {/* Migration Results */}
      {migrationResult && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">Resultado de la Migración</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
              <span>Exitosas: {migrationResult.success}</span>
            </div>
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
              <span>Errores: {migrationResult.errors.length}</span>
            </div>
            <div className="flex items-center">
              <Database className="h-4 w-4 text-blue-600 mr-2" />
              <span>Total: {migrationResult.total}</span>
            </div>
          </div>
          
          {migrationResult.errors.length > 0 && (
            <div className="mt-4">
              <h5 className="font-medium text-red-600 mb-2">Errores:</h5>
              <ul className="text-sm text-red-600 space-y-1">
                {migrationResult.errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* SDM Information */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">¿Qué es SDM?</h4>
            <p className="text-sm text-blue-800 mt-1">
              Smart Data Models (SDM) proporciona esquemas estandarizados para entidades agrícolas,
              facilitando la interoperabilidad con APIs externas de meteorología y otros sistemas FIWARE.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
