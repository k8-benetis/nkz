/**
 * Copyright 2025 NKZ Platform (Nekazari)
 * Licensed under Apache-2.0
 * 
 * Viewer Context Hook for Remote Modules
 * 
 * This hook provides access to the ViewerContext from remote modules.
 * It uses window.__nekazariViewerContext which is exposed by the host application.
 */

// Type definitions for ViewerContext
export interface ViewerContextValue {
  // Entity selection
  selectedEntityId: string | null;
  selectedEntityType: string | null;

  // Temporal state
  currentDate: Date;
  isTimelinePlaying: boolean;

  // Layer visibility
  activeLayers: Set<string>;
  isLayerActive: (layer: string) => boolean;
  setLayerActive: (layer: string, active: boolean) => void;
  toggleLayer: (layer: string) => void;

  // Panel states
  isLeftPanelOpen: boolean;
  isRightPanelOpen: boolean;
  isBottomPanelOpen: boolean;

  // Active module context
  activeContextModule: string | null;

  // Cesium viewer reference
  cesiumViewer: any;

  // Entity selection handlers
  selectEntity: (id: string | null, type?: string | null) => void;
  clearSelection: () => void;

  // Temporal control handlers
  setCurrentDate: (date: Date) => void;
  toggleTimelinePlayback: () => void;

  // Panel control handlers
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setLeftPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setActiveContextModule: (module: string | null) => void;
  setCesiumViewer: (viewer: any) => void;
}

/**
 * Hook to access the ViewerContext from remote modules.
 * 
 * This hook uses the ViewerContext exposed by the host application.
 * It uses React's useContext directly with the shared context instance.
 * 
 * @throws {Error} If ViewerContext is not available (host app not loaded or not within ViewerProvider)
 * 
 * @example
 * ```tsx
 * import { useViewer } from '@nekazari/sdk';
 * 
 * function MyComponent() {
 *   const { selectedEntityId, toggleLayer } = useViewer();
 *   // ...
 * }
 * ```
 */
export function useViewer(): ViewerContextValue {
  if (typeof window === 'undefined') {
    throw new Error('useViewer can only be used in a browser environment');
  }

  // Import React from window (shared by host)
  const React = (window as any).React;
  if (!React || !React.useContext) {
    throw new Error('React is not available. Make sure the host application has exposed React globally.');
  }

  // Get the ViewerContext instance from the host
  const ViewerContext = (window as any).__nekazariViewerContextInstance;
  if (!ViewerContext) {
    throw new Error(
      'ViewerContext is not available. Make sure you are using this hook within the Nekazari platform ' +
      'and that the ViewerProvider is mounted in the host application.'
    );
  }

  // Use React's useContext directly with the shared context
  const context = React.useContext(ViewerContext);
  if (context === undefined) {
    throw new Error('useViewer must be used within a ViewerProvider');
  }

  return context as ViewerContextValue;
}

/**
 * Optional hook that returns null if ViewerContext is not available.
 * Useful for components that may be used outside the platform context.
 */
export function useViewerOptional(): ViewerContextValue | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // Import React from window (shared by host)
  const React = (window as any).React;
  if (!React || !React.useContext) {
    return null;
  }

  // Get the ViewerContext instance from the host
  const ViewerContext = (window as any).__nekazariViewerContextInstance;
  if (!ViewerContext) {
    return null;
  }

  // Use React's useContext directly with the shared context
  const context = React.useContext(ViewerContext);
  return (context ?? null) as ViewerContextValue | null;
}

