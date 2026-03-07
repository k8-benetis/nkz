
import React, { useState } from 'react';
import { 
  Plus, Trash2, Clock, ShieldAlert, Layers, X, 
  ChevronRight, Save, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { 
  RiskCondition, RiskConditionGroup, CustomRiskRule, 
  LogicalOperator, ComparisonOperator 
} from '@/types';
import api from '@/services/api';

interface CustomRiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (riskCode: string) => void;
  availableAttributes: string[];
}

export const CustomRiskModal: React.FC<CustomRiskModalProps> = ({ 
  isOpen, onClose, onSuccess, availableAttributes 
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<CustomRiskRule['severity']>('medium');
  const [logicTree, setLogicTree] = useState<RiskConditionGroup>({
    logical_operator: 'AND',
    conditions: [
      { attribute: availableAttributes[0] || 'airTemperature', operator: '<', value: 0, duration_minutes: 0 }
    ]
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('El nombre del riesgo es obligatorio');
      return;
    }
    
    setIsSaving(true);
    setError(null);
    try {
      const payload: CustomRiskRule = {
        name,
        description,
        severity,
        logic_tree: logicTree
      };
      const result = await api.createCustomRisk(payload);
      onSuccess(result.risk_code);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar el modelo de riesgo');
    } finally {
      setIsSaving(false);
    }
  };

  const updateGroup = (path: number[], updates: Partial<RiskConditionGroup>) => {
    const newTree = { ...logicTree };
    let current: any = newTree;
    for (let i = 0; i < path.length; i++) {
      current = current.conditions[path[i]];
    }
    Object.assign(current, updates);
    setLogicTree(newTree);
  };

  const addCondition = (path: number[]) => {
    const newTree = { ...logicTree };
    let current: any = newTree;
    for (let i = 0; i < path.length; i++) {
      current = current.conditions[path[i]];
    }
    current.conditions.push({ 
      attribute: availableAttributes[0] || 'airTemperature', 
      operator: '<', 
      value: 0, 
      duration_minutes: 0 
    });
    setLogicTree(newTree);
  };

  const addSubgroup = (path: number[]) => {
    const newTree = { ...logicTree };
    let current: any = newTree;
    for (let i = 0; i < path.length; i++) {
      current = current.conditions[path[i]];
    }
    current.conditions.push({
      logical_operator: 'AND',
      conditions: [{ attribute: availableAttributes[0] || 'airTemperature', operator: '<', value: 0, duration_minutes: 0 }]
    });
    setLogicTree(newTree);
  };

  const removeItem = (path: number[], index: number) => {
    const newTree = { ...logicTree };
    let current: any = newTree;
    for (let i = 0; i < path.length; i++) {
      current = current.conditions[path[i]];
    }
    current.conditions.splice(index, 1);
    setLogicTree(newTree);
  };

  const updateCondition = (path: number[], index: number, updates: Partial<RiskCondition>) => {
    const newTree = { ...logicTree };
    let current: any = newTree;
    for (let i = 0; i < path.length; i++) {
      current = current.conditions[path[i]];
    }
    current.conditions[index] = { ...current.conditions[index], ...updates };
    setLogicTree(newTree);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <ShieldAlert className="h-7 w-7 text-green-200" />
              Constructor de Inteligencia Agronómica
            </h2>
            <p className="text-green-50 opacity-90 text-sm mt-1">
              Define reglas multivariable con persistencia temporal para eliminar falsos positivos.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto">
          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Nombre del Modelo</label>
              <input 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej: Helada de Radiación Crítica"
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-gray-700 focus:border-green-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Severidad del Riesgo</label>
              <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                {(['low', 'medium', 'high', 'critical'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSeverity(s)}
                    className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${
                      severity === s 
                        ? 'bg-white text-green-700 shadow-sm' 
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Descripción</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Explica cuándo se dispara este riesgo y qué acciones se recomiendan..."
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 text-sm text-gray-600 focus:border-green-500 outline-none transition-all h-20"
              />
            </div>
          </div>

          {/* Logic Builder */}
          <div className="space-y-4">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
              Lógica del Algoritmo
              <div className="h-px bg-gray-100 flex-1" />
            </label>
            <div className="bg-gray-50 rounded-2xl p-6 border-2 border-dashed border-gray-200">
              <RuleGroupView 
                group={logicTree} 
                level={0} 
                path={[]}
                onUpdateGroup={updateGroup}
                onAddCondition={addCondition}
                onAddSubgroup={addSubgroup}
                onRemoveItem={removeItem}
                onUpdateCondition={updateCondition}
                availableAttributes={availableAttributes}
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 text-red-700 text-sm font-medium">
              <AlertTriangle className="w-5 h-5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-4">
          <button 
            onClick={onClose}
            className="px-6 py-3 text-gray-500 font-bold hover:text-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-8 py-3 bg-green-600 text-white rounded-xl font-black shadow-lg shadow-green-200 hover:bg-green-700 transition-all transform hover:-translate-y-1 flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            GUARDAR Y ACTIVAR MODELO
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente recursivo para Grupos (AND/OR)
const RuleGroupView = ({ 
  group, level, path, onUpdateGroup, onAddCondition, onAddSubgroup, 
  onRemoveItem, onUpdateCondition, availableAttributes 
}: any) => {
  return (
    <div className={`space-y-4 ${level > 0 ? 'ml-6 md:ml-10 border-l-4 border-green-200 pl-4 md:pl-6 py-2' : ''}`}>
      <div className="flex items-center gap-4">
        <div className="bg-white border-2 border-green-600 rounded-lg px-3 py-1 shadow-sm">
          <select 
            value={group.logical_operator}
            onChange={(e) => onUpdateGroup(path, { logical_operator: e.target.value as LogicalOperator })}
            className="text-[10px] font-black text-green-700 uppercase bg-transparent outline-none cursor-pointer"
          >
            <option value="AND">TODAS SE CUMPLEN (AND)</option>
            <option value="OR">UNA O VARIAS (OR)</option>
          </select>
        </div>
        <div className="h-px bg-gray-200 flex-1" />
      </div>

      <div className="space-y-3">
        {group.conditions.map((item: any, idx: number) => {
          if ('logical_operator' in item) {
            return (
              <div key={idx} className="relative group">
                <RuleGroupView 
                  group={item} 
                  level={level + 1} 
                  path={[...path, idx]}
                  onUpdateGroup={onUpdateGroup}
                  onAddCondition={onAddCondition}
                  onAddSubgroup={onAddSubgroup}
                  onRemoveItem={onRemoveItem}
                  onUpdateCondition={onUpdateCondition}
                  availableAttributes={availableAttributes}
                />
                <button 
                  onClick={() => onRemoveItem(path, idx)}
                  className="absolute -left-2 top-0 bg-white text-gray-300 hover:text-red-500 p-1 rounded-full shadow-sm border border-gray-100 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          }
          return (
            <ConditionRow 
              key={idx} 
              condition={item} 
              onUpdate={(updates: any) => onUpdateCondition(path, idx, updates)}
              onRemove={() => onRemoveItem(path, idx)}
              availableAttributes={availableAttributes}
            />
          );
        })}
      </div>

      <div className="flex gap-3 pt-2">
        <button 
          onClick={() => onAddCondition(path)}
          className="text-[10px] font-black bg-green-100 text-green-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-200 transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" /> AÑADIR CONDICIÓN
        </button>
        <button 
          onClick={() => onAddSubgroup(path)}
          className="text-[10px] font-black bg-blue-50 text-blue-600 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-100 transition-all active:scale-95"
        >
          <Layers className="w-3.5 h-3.5" /> AÑADIR SUBGRUPO
        </button>
      </div>
    </div>
  );
};

const ConditionRow = ({ condition, onUpdate, onRemove, availableAttributes }: any) => {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm group hover:border-green-300 transition-all">
      <select 
        value={condition.attribute}
        onChange={e => onUpdate({ attribute: e.target.value })}
        className="bg-gray-50 border-none rounded-xl text-sm font-bold px-4 py-2 w-full md:w-48 outline-none focus:ring-2 focus:ring-green-500"
      >
        {availableAttributes.map((attr: string) => (
          <option key={attr} value={attr}>{attr}</option>
        ))}
      </select>

      <select 
        value={condition.operator}
        onChange={e => onUpdate({ operator: e.target.value })}
        className="bg-gray-50 border-none rounded-xl text-sm font-black px-3 py-2 w-20 text-center outline-none focus:ring-2 focus:ring-green-500"
      >
        <option value="<">&lt;</option>
        <option value=">">&gt;</option>
        <option value="<=">&le;</option>
        <option value=">=">&ge;</option>
        <option value="==">==</option>
        <option value="!=">!=</option>
      </select>

      <input 
        type="number" 
        value={condition.value}
        onChange={e => onUpdate({ value: parseFloat(e.target.value) })}
        className="bg-gray-50 border-none rounded-xl text-sm font-bold w-full md:w-24 px-4 py-2 outline-none focus:ring-2 focus:ring-green-500" 
      />

      <div className="flex items-center gap-3 bg-blue-50/50 px-4 py-2 rounded-xl border border-blue-100 ml-auto w-full md:w-auto">
        <Clock className="w-4 h-4 text-blue-600" />
        <span className="text-[10px] font-black text-blue-700 uppercase tracking-tighter">Persistencia:</span>
        <input 
          type="number" 
          value={condition.duration_minutes}
          onChange={e => onUpdate({ duration_minutes: parseInt(e.target.value) })}
          className="bg-transparent border-none w-12 text-sm font-black text-blue-800 text-center focus:ring-0 p-0" 
        />
        <span className="text-[10px] font-bold text-blue-700">min</span>
      </div>

      <button 
        onClick={onRemove}
        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  );
};

const Loader2 = ({ className }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);
