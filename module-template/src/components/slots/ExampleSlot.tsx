/**
 * Example Slot Component with API Integration
 * 
 * This demonstrates:
 * - Accessing viewer context (selected entity, layers)
 * - Making API calls using the SDK
 * - Loading and error states
 * - Using UI Kit components
 * 
 * Slot components should:
 * - Be mobile-first (designed for 300-400px panels)
 * - Use UI Kit components for consistency
 * - Access viewer context via useViewer() hook
 * - Handle loading and error states gracefully
 */

import React, { useState, useEffect } from 'react';
import { useViewer, useAuth } from '@nekazari/sdk';
import { useUIKit } from '@/hooks/useUIKit';
import { useModuleApi } from '@/services/api';
import { RefreshCw, Plus, Trash2, AlertCircle } from 'lucide-react';

interface DataItem {
  id: string;
  name: string;
  description?: string;
  value: number;
}

interface ExampleSlotProps {
  className?: string;
}

export const ExampleSlot: React.FC<ExampleSlotProps> = ({ className }) => {
  const { Card, Button } = useUIKit();
  const { selectedEntityId, selectedEntityType, isLayerActive } = useViewer();
  const { user, isAuthenticated } = useAuth();
  const api = useModuleApi();

  // State
  const [items, setItems] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch data from the module API
   */
  const fetchData = async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.getData();
      setItems(response.items || []);
    } catch (err: any) {
      console.error('[ExampleSlot] Error fetching data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Create a new demo item
   */
  const createItem = async () => {
    setLoading(true);
    setError(null);

    try {
      const newItem = await api.createData({
        name: `Item ${Date.now()}`,
        description: 'Created from ExampleSlot',
        value: Math.random() * 100,
      });
      setItems(prev => [...prev, newItem]);
    } catch (err: any) {
      console.error('[ExampleSlot] Error creating item:', err);
      setError(err.message || 'Failed to create item');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Delete an item
   */
  const deleteItem = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      await api.deleteData(id);
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (err: any) {
      console.error('[ExampleSlot] Error deleting item:', err);
      setError(err.message || 'Failed to delete item');
    } finally {
      setLoading(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [isAuthenticated]);

  // Show login prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <Card padding="md" className={className}>
        <div className="flex items-center gap-2 text-amber-600">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">Please log in to use this module.</span>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="md" className={className}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            MODULE_DISPLAY_NAME
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="p-1"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={createItem}
              disabled={loading}
              className="p-1"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Viewer Context Info */}
        <div className="text-xs bg-slate-50 rounded p-2 space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Selected Entity:</span>
            <span className="text-slate-700 font-mono">
              {selectedEntityId || 'None'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Entity Type:</span>
            <span className="text-slate-700">
              {selectedEntityType || 'None'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">User:</span>
            <span className="text-slate-700 truncate max-w-[150px]">
              {user?.email || 'Unknown'}
            </span>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded p-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Data List */}
        <div className="space-y-2">
          {items.length === 0 && !loading && (
            <div className="text-sm text-slate-500 text-center py-4">
              No items yet. Click + to create one.
            </div>
          )}

          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between bg-slate-50 rounded p-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">
                  {item.name}
                </div>
                <div className="text-xs text-slate-500">
                  Value: {item.value.toFixed(2)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteItem(item.id)}
                disabled={loading}
                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default ExampleSlot;
