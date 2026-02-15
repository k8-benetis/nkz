// =============================================================================
// Parcel Context Menu - Right-click menu for saving drawn parcels
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Save, X, Ruler } from 'lucide-react';
import type { GeoPolygon } from '@/types';
import { useI18n } from '@/context/I18nContext';

interface ParcelContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  geometry: GeoPolygon | null;
  areaHectares: number | null;
  onSave: (name: string, description?: string) => void;
  onClose: () => void;
}

export const ParcelContextMenu: React.FC<ParcelContextMenuProps> = ({
  isOpen,
  position,
  geometry,
  areaHectares,
  onSave,
  onClose,
}) => {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [parcelName, setParcelName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setParcelName('');
      setDescription('');
      return;
    }

    // Generate default name
    const defaultName = `Parcela ${new Date().toLocaleDateString()}`;
    setParcelName(defaultName);

    // Close menu when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Close menu on escape key
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !geometry) return null;

  const handleSave = () => {
    if (parcelName.trim()) {
      onSave(parcelName.trim(), description.trim() || undefined);
      onClose();
    }
  };

  // Calculate menu position (ensure it stays within viewport)
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${Math.min(position.x, window.innerWidth - 320)}px`,
    top: `${Math.min(position.y, window.innerHeight - 300)}px`,
    zIndex: 1000,
  };

  // Use Portal to render outside of any container context (avoiding clipping)
  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      style={menuStyle}
      className="bg-white rounded-lg shadow-xl border border-gray-200 w-80 p-4 space-y-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Save className="w-4 h-4 text-emerald-600" />
          {t('parcels.save_parcel')}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {areaHectares !== null && (
        <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-200">
          <p className="text-xs text-emerald-700 flex items-center gap-1">
            <Ruler className="w-3 h-3" />
            {t('parcels.area')}: <span className="font-semibold">{areaHectares.toFixed(2)} {t('ndvi.hectares')}</span>
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t('parcels.parcel_name')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={parcelName}
            onChange={(e) => setParcelName(e.target.value)}
            placeholder={t('parcels.parcel_name_placeholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && parcelName.trim()) {
                handleSave();
              }
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t('parcels.description')} <span className="text-gray-400">({t('common.optional')})</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('parcels.description_placeholder')}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-gray-200">
        <button
          onClick={onClose}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={!parcelName.trim()}
          className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {t('parcels.save')}
        </button>
      </div>
    </div>,
    document.body
  );
};

