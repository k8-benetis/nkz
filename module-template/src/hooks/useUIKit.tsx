import React, { useState, useEffect } from 'react';

// Define the shape of our UI Kit (fallback interface)
interface UIKit {
  Card: any;
  Button: any;
  Input?: any;
  Select?: any;
}

/**
 * Safe hook to access UI Kit components from window.__nekazariUIKit
 * 
 * This hook handles the async nature of Host initialization by:
 * 1. Checking immediately if UIKit is available
 * 2. Polling with interval (50ms) with max timeout (5s)
 * 3. Providing fallback components if not loaded
 * 
 * This prevents React Error #130 (race condition) when components
 * try to access UI Kit before Host has initialized it.
 */
export function useUIKit() {
  const [uiKit, setUiKit] = useState<UIKit | null>(null);

  useEffect(() => {
    // Helper to find the global UIKit
    const getGlobal = () => (window as any).__nekazariUIKit;

    // 1. Immediate check
    if (getGlobal()) {
      setUiKit(getGlobal());
      return;
    }

    // 2. Polling Safety Net (Wait for Host to finish hydration)
    const startTime = Date.now();
    const maxWaitTime = 5000; // 5 seconds max
    const pollInterval = 50; // Check every 50ms

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      if (getGlobal()) {
        setUiKit(getGlobal());
        clearInterval(interval);
      } else if (elapsed >= maxWaitTime) {
        // Timeout reached, stop polling
        console.warn('[useUIKit] Timeout: window.__nekazariUIKit not available after 5s. Using fallbacks.');
        clearInterval(interval);
      }
    }, pollInterval);

    // Cleanup
    return () => clearInterval(interval);
  }, []);

  // 3. Safe Fallback (Prevents Error #130)
  // While waiting, return HTML primitives so React can render something.
  if (!uiKit) {
    return {
      Card: ({ children, className, padding }: any) => {
        const paddingClass = padding === 'sm' ? 'p-2' : padding === 'lg' ? 'p-6' : 'p-4';
        return (
          <div className={`border border-gray-200 rounded-lg bg-white ${paddingClass} ${className || ''}`}>
            {children}
          </div>
        );
      },
      Button: ({ children, variant, size, disabled, onClick, className, ...props }: any) => {
        const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm';
        const variantClass = variant === 'primary' 
          ? 'bg-blue-600 text-white hover:bg-blue-700' 
          : variant === 'danger'
          ? 'bg-red-600 text-white hover:bg-red-700'
          : variant === 'ghost'
          ? 'bg-transparent text-gray-700 hover:bg-gray-100'
          : 'bg-gray-200 text-gray-900 hover:bg-gray-300';
        
        return (
          <button
            {...props}
            onClick={onClick}
            disabled={disabled}
            className={`${sizeClass} ${variantClass} rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className || ''}`}
          >
            {children}
          </button>
        );
      },
      Input: (props: any) => (
        <input
          {...props}
          className={`border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${props.className || ''}`}
        />
      ),
      Select: (props: any) => (
        <select
          {...props}
          className={`border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${props.className || ''}`}
        />
      )
    };
  }

  // 4. Return the Real UI Kit once loaded
  // Note: Host only exports Card/Button. We polyfill Input/Select if missing.
  return {
    ...uiKit,
    // Ensure we always have Input/Select even if Host doesn't export them
    Input: uiKit.Input || ((props: any) => (
      <input
        {...props}
        className={`border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${props.className || ''}`}
      />
    )),
    Select: uiKit.Select || ((props: any) => (
      <select
        {...props}
        className={`border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${props.className || ''}`}
      />
    ))
  };
}

