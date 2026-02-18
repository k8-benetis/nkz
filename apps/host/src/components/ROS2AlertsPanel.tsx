import React from 'react';

interface ROS2AlertsPanelProps {
  robotId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const ROS2AlertsPanel: React.FC<ROS2AlertsPanelProps> = () => (
  <div className="p-4 text-gray-500">ROS2 Alerts Panel (stub)</div>
);
