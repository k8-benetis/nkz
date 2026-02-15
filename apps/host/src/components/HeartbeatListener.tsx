/**
 * HeartbeatListener - Real-time connection status indicator
 * 
 * Polls the backend to detect when a device connects for the first time.
 * Used in credential modals to provide immediate feedback after setup.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wifi, WifiOff, Loader2, Check, AlertCircle } from 'lucide-react';
import api from '@/services/api';

export type ConnectionStatus = 'waiting' | 'connecting' | 'connected' | 'error';

interface HeartbeatListenerProps {
  /**
   * The device or entity ID to monitor
   */
  entityId: string;
  
  /**
   * Type of entity: 'sensor', 'robot', or 'device'
   */
  entityType: 'sensor' | 'robot' | 'device';
  
  /**
   * Polling interval in milliseconds (default: 3000)
   */
  pollInterval?: number;
  
  /**
   * Maximum time to wait in milliseconds (default: 300000 = 5 minutes)
   */
  timeout?: number;
  
  /**
   * Callback when connection is detected
   */
  onConnected?: () => void;
  
  /**
   * Callback when timeout is reached without connection
   */
  onTimeout?: () => void;
  
  /**
   * Show compact version (just the icon)
   */
  compact?: boolean;
  
  /**
   * Custom className for styling
   */
  className?: string;
}

export const HeartbeatListener: React.FC<HeartbeatListenerProps> = ({
  entityId,
  entityType,
  pollInterval = 3000,
  timeout = 300000,
  onConnected,
  onTimeout,
  compact = false,
  className = '',
}) => {
  const [status, setStatus] = useState<ConnectionStatus>('waiting');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const checkConnection = useCallback(async () => {
    if (status === 'connected') return;
    
    try {
      setStatus('connecting');
      const response = await api.checkEntityHeartbeat(entityId, entityType);
      
      setLastCheck(new Date());
      
      if (response.connected) {
        setStatus('connected');
        if (onConnected) onConnected();
        
        // Clear intervals
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      } else {
        setStatus('waiting');
      }
    } catch (error) {
      console.error('Heartbeat check error:', error);
      setStatus('waiting'); // Keep waiting, don't show error for transient failures
    }
  }, [entityId, entityType, status, onConnected]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    
    // Initial check
    checkConnection();
    
    // Set up polling
    intervalRef.current = setInterval(() => {
      checkConnection();
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, pollInterval);
    
    // Set up timeout
    timeoutRef.current = setTimeout(() => {
      if (status !== 'connected') {
        setStatus('error');
        if (onTimeout) onTimeout();
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, timeout);
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [entityId, pollInterval, timeout]);

  // Update elapsed time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'waiting':
        return {
          icon: WifiOff,
          color: 'text-gray-400',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200',
          text: 'Esperando conexión...',
          subtext: `Configurando ${entityType}. Conecta el dispositivo.`,
        };
      case 'connecting':
        return {
          icon: Loader2,
          color: 'text-blue-500',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          text: 'Verificando...',
          subtext: 'Comprobando estado de conexión',
          animate: true,
        };
      case 'connected':
        return {
          icon: Check,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-300',
          text: '¡Conectado!',
          subtext: 'El dispositivo está online y enviando datos.',
        };
      case 'error':
        return {
          icon: AlertCircle,
          color: 'text-amber-500',
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          text: 'Sin respuesta',
          subtext: 'El dispositivo no se ha conectado aún. Verifica la configuración.',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`} title={config.text}>
        <Icon className={`w-5 h-5 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
        {status === 'waiting' && (
          <span className="text-xs text-gray-500">{formatTime(elapsedTime)}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${config.bgColor} ${config.borderColor} ${className}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${config.bgColor}`}>
          <Icon className={`w-6 h-6 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className={`font-medium ${status === 'connected' ? 'text-green-800' : 'text-gray-900'}`}>
              {config.text}
            </p>
            {status === 'waiting' && (
              <span className="text-xs text-gray-500 tabular-nums">
                {formatTime(elapsedTime)}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-0.5">{config.subtext}</p>
          
          {/* Progress indicator for waiting state */}
          {status === 'waiting' && (
            <div className="mt-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 bg-gray-300 rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-blue-500 rounded-full animate-pulse"
                      style={{
                        animationDelay: `${i * 200}ms`,
                        width: '100%',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Success animation */}
          {status === 'connected' && (
            <div className="mt-2 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">
                Primer heartbeat recibido
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HeartbeatListener;

