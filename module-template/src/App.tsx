/**
 * Standalone dev shell — only used by `npm run dev`.
 * In production the host loads nkz-module.js (IIFE) directly; this file is not bundled.
 */
import React from 'react';
import './index.css';

const App: React.FC = () => {
  return (
    <div className="w-full min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">MODULE_DISPLAY_NAME</h1>
        <p className="text-sm text-gray-500 mb-4">
          Development shell — not part of the production bundle.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
          Run <code className="font-mono bg-blue-100 px-1 rounded">npm run build:module</code> to
          produce <code className="font-mono bg-blue-100 px-1 rounded">dist/nkz-module.js</code>,
          then upload it to MinIO.
        </div>
      </div>
    </div>
  );
};

export default App;
