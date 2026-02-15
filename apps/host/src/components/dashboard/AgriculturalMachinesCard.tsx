import React from 'react';
import { Tractor, Plus } from 'lucide-react';
import type { AgriculturalMachine } from '@/types';

interface AgriculturalMachinesCardProps {
  machines: AgriculturalMachine[];
  canManageDevices: boolean;
  onOpenWizard: (entityType: string) => void;
}

export const AgriculturalMachinesCard: React.FC<AgriculturalMachinesCardProps> = ({ machines, canManageDevices, onOpenWizard }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Tractor className="w-6 h-6" />
          Maquinaria Agrícola
        </h2>
      </div>

      <div className="p-6">
        {machines.length === 0 ? (
          <div className="text-center py-12">
            <Tractor className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No hay maquinaria registrada</p>
            {canManageDevices && (
              <button
                onClick={() => onOpenWizard('AgriculturalTractor')}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Añadir Maquinaria
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 force-grid">
            {machines.slice(0, 4).map((machine) => (
              <div key={machine.id} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 hover:shadow-md transition">
                <div className="flex items-center gap-2 mb-3">
                  <Tractor className="w-5 h-5 text-orange-600" />
                  <span className="text-xs font-medium text-gray-600 truncate">
                    {machine.name?.value || machine.id}
                  </span>
                </div>
                {machine.operationType && (
                  <div className="mb-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {typeof machine.operationType === 'string' ? machine.operationType : machine.operationType.value}
                    </p>
                    <p className="text-xs text-gray-500">Operación</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
