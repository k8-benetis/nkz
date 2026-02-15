import React from 'react';

interface ProgressBarProps {
  value: number;
  max?: number | null;
  percentage?: number;
  label?: string;
  className?: string;
  barClassName?: string;
  showLabel?: boolean;
  labelClassName?: string;
  valueClassName?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max,
  percentage,
  label,
  className = '',
  barClassName = 'bg-gradient-to-r from-emerald-400 to-emerald-600',
  showLabel = true,
  labelClassName = 'text-gray-500 dark:text-gray-400',
  valueClassName = 'text-gray-700 dark:text-gray-300',
}) => {
  const computedPercentage = React.useMemo(() => {
    if (typeof percentage === 'number') {
      return Math.min(Math.max(percentage, 0), 100);
    }
    if (typeof max === 'number' && max > 0) {
      return Math.min(Math.max((value / max) * 100, 0), 100);
    }
    return 0;
  }, [percentage, max, value]);

  const formattedPercentage = `${computedPercentage.toFixed(1)}%`;

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className={`flex items-center justify-between text-xs mb-1 ${labelClassName}`}>
          <span>{label ?? 'Progreso'}</span>
          <span className={`font-medium ${valueClassName}`}>{formattedPercentage}</span>
        </div>
      )}
      <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barClassName}`}
          style={{ width: `${computedPercentage}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
