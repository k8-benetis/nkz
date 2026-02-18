import React from 'react';

interface ROS2NodeMonitorProps {
  robotId: string;
  onNodeSelect?: (nodeName: string) => void;
  selectedNodes?: string[];
}

export const ROS2NodeMonitor: React.FC<ROS2NodeMonitorProps> = () => (
  <div className="p-4 text-gray-500">ROS2 Node Monitor (stub)</div>
);
