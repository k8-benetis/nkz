// =============================================================================
// 3D Map Visualization Page - Advanced Cesium with Multiple Layers
// =============================================================================

import React from 'react';
import { Layout } from '@/components/Layout';
import { CesiumMapAdvanced } from '@/components/CesiumMapAdvanced';
import { Layers } from 'lucide-react';

export const Map3D: React.FC = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center mb-2">
            <Layers className="h-6 w-6 text-blue-600 mr-2" />
            <h1 className="text-3xl font-bold text-gray-900">Visualización 3D</h1>
          </div>
          <p className="text-gray-600">
            Explora tus parcelas, NDVI, robots y sensores en un mapa 3D interactivo
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <CesiumMapAdvanced 
            title="Mapa 3D Completo"
            height="h-[calc(100vh-200px)]"
            showControls={true}
          />
        </div>
      </div>
    </Layout>
  );
};

