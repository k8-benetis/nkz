// =============================================================================
// Skeleton Components - Loading Placeholders
// =============================================================================
// Reusable skeleton components for consistent loading states across the app

import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

/**
 * Base Skeleton component
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse',
}) => {
  const baseClasses = 'bg-gray-200 dark:bg-gray-700 rounded';
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  };
  const animationClasses = {
    pulse: 'animate-pulse-slow',
    wave: 'animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700',
    none: '',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
      aria-label="Loading..."
      role="status"
    />
  );
};

/**
 * Skeleton for Card components
 */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4 ${className}`}>
    <Skeleton variant="rectangular" height={24} width="60%" />
    <Skeleton variant="text" width="100%" />
    <Skeleton variant="text" width="80%" />
    <Skeleton variant="rectangular" height={40} width="30%" />
  </div>
);

/**
 * Skeleton for Table rows
 */
export const SkeletonTableRow: React.FC<{ columns?: number }> = ({ columns = 4 }) => (
  <tr>
    {Array.from({ length: columns }).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <Skeleton variant="text" width="80%" />
      </td>
    ))}
  </tr>
);

/**
 * Skeleton for Table
 */
export const SkeletonTable: React.FC<{
  rows?: number;
  columns?: number;
  className?: string;
}> = ({ rows = 5, columns = 4, className = '' }) => (
  <div className={`overflow-x-auto ${className}`}>
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 dark:bg-gray-800">
        <tr>
          {Array.from({ length: columns }).map((_, i) => (
            <th key={i} className="px-4 py-3 text-left">
              <Skeleton variant="text" width="60%" height={16} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} columns={columns} />
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * Skeleton for List items
 */
export const SkeletonList: React.FC<{
  items?: number;
  className?: string;
}> = ({ items = 5, className = '' }) => (
  <div className={`space-y-3 ${className}`}>
    {Array.from({ length: items }).map((_, i) => (
      <div key={i} className="flex items-center space-x-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="60%" />
        </div>
      </div>
    ))}
  </div>
);

/**
 * Skeleton for Dashboard metric cards
 */
export const SkeletonMetricCard: React.FC = () => (
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
    <div className="flex items-center justify-between mb-4">
      <Skeleton variant="text" width={100} height={14} />
      <Skeleton variant="circular" width={40} height={40} />
    </div>
    <Skeleton variant="text" width={80} height={32} className="mb-2" />
    <Skeleton variant="text" width={120} height={12} />
  </div>
);

/**
 * Skeleton for Page header
 */
export const SkeletonPageHeader: React.FC = () => (
  <div className="mb-8 space-y-3">
    <Skeleton variant="text" width={200} height={32} />
    <Skeleton variant="text" width={400} height={16} />
  </div>
);

