// =============================================================================
// useResizablePanel Hook - Panel Resize Management
// =============================================================================
// Manages resizable panel state with drag handle functionality.

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseResizablePanelOptions {
  /** Initial width in pixels */
  initialWidth?: number;
  /** Minimum width in pixels */
  minWidth?: number;
  /** Maximum width in pixels */
  maxWidth?: number;
  /** Storage key for persisting width (optional) */
  storageKey?: string;
}

export interface UseResizablePanelReturn {
  /** Current width in pixels */
  width: number;
  /** Set width programmatically */
  setWidth: (width: number) => void;
  /** Props for the drag handle element */
  dragHandleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    className: string;
  };
  /** Whether panel is currently being resized */
  isResizing: boolean;
}

export function useResizablePanel(options: UseResizablePanelOptions = {}): UseResizablePanelReturn {
  const {
    initialWidth = 320,
    minWidth = 280,
    maxWidth = 800,
    storageKey,
  } = options;

  // Load initial width from localStorage if available (lazy initializer for useState)
  const getInitialWidth = (): number => {
    if (storageKey && typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          return parsed;
        }
      }
    }
    return initialWidth;
  };

  const [width, setWidthState] = useState(getInitialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // Save width to localStorage when it changes
  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      localStorage.setItem(storageKey, width.toString());
    }
  }, [width, storageKey]);

  const setWidth = useCallback((newWidth: number) => {
    const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth));
    setWidthState(clamped);
  }, [minWidth, maxWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + deltaX;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width, setWidth]);

  const dragHandleProps = {
    onMouseDown: handleMouseDown,
    className: `group`,
  };

  return {
    width,
    setWidth,
    dragHandleProps,
    isResizing,
  };
}

export default useResizablePanel;

