// =============================================================================
// Global Loading Bar - Route Transition Indicator
// =============================================================================
// Top loading bar that shows during route transitions (similar to YouTube/Medium)

import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export const LoadingBar: React.FC = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Start loading when route changes
    setLoading(true);
    setProgress(0);

    // Simulate progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90; // Don't go to 100 until page is loaded
        }
        // Accelerating progress (faster at start, slower at end)
        const increment = prev < 30 ? 15 : prev < 70 ? 5 : 2;
        return Math.min(prev + increment, 90);
      });
    }, 100);

    // Complete when page is loaded
    const handleLoad = () => {
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 300); // Small delay to show completion
    };

    window.addEventListener('load', handleLoad);
    
    // Fallback: complete after timeout
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 300);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      window.removeEventListener('load', handleLoad);
    };
  }, [location.pathname]);

  if (!loading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gray-100">
      <div
        className="h-full bg-gradient-to-r from-green-500 via-green-600 to-green-700 transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          boxShadow: '0 0 10px rgba(34, 197, 94, 0.5)',
        }}
      />
    </div>
  );
};

