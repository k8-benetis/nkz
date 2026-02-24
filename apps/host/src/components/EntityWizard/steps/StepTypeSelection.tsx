import { useMemo, useState } from 'react';
import { Search, X, Activity, MapPin, ArrowRight } from 'lucide-react';
import { useWizard } from '../WizardContext';
import { ENTITY_TYPE_METADATA, MACRO_CATEGORIES, ENTITY_CATEGORIES } from '../entityTypes';
import { ChevronDown, ChevronRight } from 'lucide-react';

const COLOR_MAP: Record<string, { border: string; bg: string }> = {
  green:  { border: '#22c55e', bg: '#f0fdf4' },
  teal:   { border: '#14b8a6', bg: '#f0fdfa' },
  indigo: { border: '#6366f1', bg: '#eef2ff' },
  blue:   { border: '#3b82f6', bg: '#eff6ff' },
  purple: { border: '#a855f7', bg: '#faf5ff' },
  orange: { border: '#f97316', bg: '#fff7ed' },
  yellow: { border: '#eab308', bg: '#fefce8' },
  brown:  { border: '#92400e', bg: '#fef3c7' },
  gray:   { border: '#6b7280', bg: '#f9fafb' },
};

function getColorStyle(color: string, selected: boolean) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.gray;
  return selected
    ? { borderColor: c.border, backgroundColor: c.bg }
    : {};
}

export function StepTypeSelection() {
  const { entityType, setEntityType, goNext } = useWizard();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMacro, setActiveMacro] = useState<keyof typeof MACRO_CATEGORIES | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const handleQuickCreate = (type: string) => {
    setEntityType(type);
    goNext();
  };

  const filteredTypes = useMemo(() => {
    return Object.keys(ENTITY_TYPE_METADATA).filter(type => {
      const meta = ENTITY_TYPE_METADATA[type];
      if (activeMacro && meta.macroCategory !== activeMacro) return false;
      if (!searchTerm.trim()) return true;
      const s = searchTerm.toLowerCase();
      return (
        type.toLowerCase().includes(s) ||
        meta.keywords.some(k => k.toLowerCase().includes(s)) ||
        meta.description.toLowerCase().includes(s)
      );
    });
  }, [searchTerm, activeMacro]);

  const groupedTypes = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const [cat, types] of Object.entries(ENTITY_CATEGORIES)) {
      const filtered = types.filter(t => filteredTypes.includes(t));
      if (filtered.length > 0) groups[cat] = filtered;
    }
    return groups;
  }, [filteredTypes]);

  const toggleCategory = (cat: string) =>
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  return (
    <div className="space-y-5">
      {/* Quick actions — most common entities */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Acceso rápido</p>
        <button
          onClick={() => handleQuickCreate('AgriParcel')}
          className="w-full flex items-center justify-between px-5 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors shadow-sm"
        >
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 flex-shrink-0" />
            <div className="text-left">
              <div className="font-semibold">Crear nueva parcela</div>
              <div className="text-xs text-green-200">AgriParcel · Parcela agrícola</div>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 flex-shrink-0" />
        </button>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-lg font-semibold mb-1">Otros tipos de entidad</h3>
        <p className="text-sm text-gray-600">Busca por nombre, tipo o fabricante, o selecciona una categoría.</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Buscar: tractor, sensor humedad, Davis, John Deere..."
          className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-base"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Macro category filters */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(MACRO_CATEGORIES) as [keyof typeof MACRO_CATEGORIES, typeof MACRO_CATEGORIES[keyof typeof MACRO_CATEGORIES]][]).map(([key, macro]) => {
          const Icon = macro.icon;
          const isActive = activeMacro === key;
          return (
            <button
              key={key}
              onClick={() => setActiveMacro(isActive ? null : key)}
              style={isActive ? getColorStyle(macro.color, true) : {}}
              className={`p-4 rounded-xl border-2 text-left transition-all ${isActive ? '' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
            >
              <Icon className="w-6 h-6 mb-2 text-gray-500" style={isActive ? getColorStyle(macro.color, true) : {}} />
              <div className="font-semibold text-sm">{macro.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{macro.description}</div>
            </button>
          );
        })}
      </div>

      {/* Results */}
      {searchTerm.trim() ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">{filteredTypes.length} resultado{filteredTypes.length !== 1 ? 's' : ''} para "{searchTerm}"</p>
          {filteredTypes.length === 0 ? (
            <div className="p-6 text-center bg-gray-50 rounded-xl">
              <Search className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No se encontraron resultados</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {filteredTypes.map(type => <TypeCard key={type} type={type} selected={entityType === type} onSelect={setEntityType} />)}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {Object.entries(groupedTypes).map(([cat, types]) => (
            <div key={cat} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
              >
                <span className="font-medium text-sm text-gray-700">{cat}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{types.length}</span>
                  {expandedCategories.has(cat)
                    ? <ChevronDown className="w-4 h-4 text-gray-400" />
                    : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </button>
              {expandedCategories.has(cat) && (
                <div className="p-2 grid grid-cols-2 gap-2 bg-white">
                  {types.map(type => <TypeCard key={type} type={type} selected={entityType === type} onSelect={setEntityType} compact />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selection summary */}
      {entityType && (() => {
        const meta = ENTITY_TYPE_METADATA[entityType];
        const Icon = meta?.icon ?? Activity;
        return (
          <div className="p-4 bg-green-50 border-2 border-green-500 rounded-xl flex items-center gap-3">
            <Icon className="w-6 h-6 text-green-600" />
            <div>
              <div className="font-semibold text-green-900">{entityType}</div>
              <div className="text-sm text-green-700">{meta?.description}</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── TypeCard sub-component ───────────────────────────────────────────────────

interface TypeCardProps {
  type: string;
  selected: boolean;
  onSelect: (type: string) => void;
  compact?: boolean;
}

function TypeCard({ type, selected, onSelect, compact = false }: TypeCardProps) {
  const meta = ENTITY_TYPE_METADATA[type];
  const Icon = meta?.icon ?? Activity;
  const style = selected && meta ? getColorStyle(meta.color, true) : {};
  const baseClass = `rounded-lg border-2 text-left transition flex items-${compact ? 'center' : 'start'} gap-${compact ? '2' : '3'} p-${compact ? '2.5' : '3'}`;
  const borderClass = selected ? '' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50';

  return (
    <button
      key={type}
      onClick={() => onSelect(type)}
      style={style}
      className={`${baseClass} ${borderClass}`}
    >
      <Icon className={`w-${compact ? '4' : '5'} h-${compact ? '4' : '5'} flex-shrink-0 text-gray-400`} />
      <div className="min-w-0">
        <div className={`font-medium text-${compact ? 'xs' : 'sm'} truncate`}>{type}</div>
        {!compact && <div className="text-xs text-gray-500 truncate">{meta?.description}</div>}
      </div>
    </button>
  );
}
