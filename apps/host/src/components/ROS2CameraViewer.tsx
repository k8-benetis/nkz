import React from 'react';

interface ROS2CameraViewerProps {
  robotId: string;
  width?: number;
  height?: number;
  autoStart?: boolean;
}

export const ROS2CameraViewer: React.FC<ROS2CameraViewerProps> = () => (
  <div className="p-4 text-gray-500">ROS2 Camera Viewer (stub)</div>
);
