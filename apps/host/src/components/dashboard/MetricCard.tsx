import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  icon: LucideIcon;
  accentIcon?: LucideIcon;
  gradientFrom?: string;
  gradientTo?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  description,
  icon: Icon,
  accentIcon: AccentIcon,
  gradientFrom = 'from-blue-500',
  gradientTo = 'to-blue-600',
  footer,
  children,
  className = '',
  contentClassName = '',
}) => {
  return (
    <div
      className={`rounded-2xl shadow-lg p-6 text-white transform hover:scale-[1.02] transition duration-200 ease-out bg-gradient-to-br ${gradientFrom} ${gradientTo} ${className}`}
    >
      <div className={`flex items-start justify-between gap-4 mb-4 ${contentClassName}`}>
        <div className="flex items-center justify-center w-12 h-12 bg-white bg-opacity-20 rounded-xl backdrop-blur-sm">
          <Icon className="w-6 h-6" />
        </div>
        {AccentIcon ? <AccentIcon className="w-5 h-5 opacity-80" /> : null}
      </div>

      <div>
        <h3 className="text-sm font-medium text-white text-opacity-80 mb-1">{title}</h3>
        <div className="text-3xl font-bold leading-tight">{value}</div>
        {description ? (
          <p className="mt-2 text-sm text-white text-opacity-80">{description}</p>
        ) : null}
      </div>

      {children ? <div className="mt-4 space-y-3">{children}</div> : null}

      {footer ? (
        <div className="mt-3 pt-3 border-t border-white border-opacity-20 text-xs text-white text-opacity-80">
          {footer}
        </div>
      ) : null}
    </div>
  );
};

export default MetricCard;
