/**
 * ExampleSlot — replace with your actual slot component.
 *
 * Slot components render inside host-provided containers.
 * - Access viewer context via useViewer() and useAuth() from @nekazari/sdk
 * - React, SDK and UI-Kit are externalized — do NOT import them from node_modules
 *   in production; they come from the host via window globals.
 * - Keep panels responsive (300–600px wide).
 */
import React, { useState } from 'react';
import { useViewer, useAuth } from '@nekazari/sdk';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ExampleSlotProps {
  className?: string;
}

export const ExampleSlot: React.FC<ExampleSlotProps> = ({ className }) => {
  const { selectedEntityId } = useViewer();
  const { isAuthenticated, user } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className={`flex items-center gap-2 text-amber-600 p-4 ${className ?? ''}`}>
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm">Authentication required.</span>
      </div>
    );
  }

  return (
    <div className={`p-4 space-y-3 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">MODULE_DISPLAY_NAME</h3>
        <button
          onClick={() => setLoading(l => !l)}
          className="p-1 rounded hover:bg-slate-100 text-slate-500"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="text-xs text-slate-500 space-y-1 bg-slate-50 rounded p-2">
        <div className="flex justify-between gap-2">
          <span>Entity:</span>
          <span className="font-mono text-slate-700 truncate">{selectedEntityId ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>User:</span>
          <span className="text-slate-700 truncate">{user?.email ?? '—'}</span>
        </div>
      </div>

      <p className="text-xs text-slate-400 italic">
        Replace this component with your module's functionality.
      </p>
    </div>
  );
};

export default ExampleSlot;
