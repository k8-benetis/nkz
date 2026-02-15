/**
 * MODULE_DISPLAY_NAME - Main App Component
 * 
 * NOTE: This module is primarily designed to be used within the Unified Viewer.
 * This standalone app is provided as a fallback for development/testing purposes.
 * In production, the module integrates seamlessly into the viewer via slots.
 */

import React from 'react';
import { Info } from 'lucide-react';
import './index.css';

// Export viewerSlots for host integration
export { viewerSlots } from './slots/index';

// Export slot components (if any)
// export { ExampleSlot } from './components/slots/ExampleSlot';

const ModuleApp: React.FC = () => {
  return (
    <div className="w-full bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">MODULE_DISPLAY_NAME</h1>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full">
                <Info className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-blue-700">Modo Standalone (Fallback)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Welcome to MODULE_DISPLAY_NAME</h2>
          <p className="text-gray-600 mb-4">
            This is a template module. Replace this content with your module's functionality.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> This standalone view is for development/testing. 
              In production, your module will integrate into the Unified Viewer via slots.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// CRITICAL: Export as default - required for Module Federation
export default ModuleApp;

