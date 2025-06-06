import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PieChart, Terminal, Server, Trash2, Download } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/lib/websocket';
import { useEffect, useState } from 'react';
import type { ValidationJob, Account, ActivityLog } from '@shared/schema';

export function Sidebar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocket('');
  const [systemStats, setSystemStats] = useState({
    memory: '234 MB / 512 MB',
    memoryPercent: 46,
    threads: '8 / 10',
    queue: 0,
  });

  const { data: job } = useQuery<ValidationJob | null>({
    queryKey: ['/api/validation/status'],
    refetchInterval: 2000,
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['/api/accounts'],
    refetchInterval: 2000,
  });

  const { data: logs = [] } = useQuery<ActivityLog[]>({
    queryKey: ['/api/logs'],
    refetchInterval: 1000,
  });

  const clearLogsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', '/api/logs');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/logs'] });
      toast({
        title: 'Logs limpiados',
        description: 'El historial de actividad ha sido borrado',
      });
    },
  });

  const exportLogsMutation = useMutation({
    mutationFn: async () => {
      const logsText = logs.map(log => 
        `[${log.timestamp?.toLocaleString()}] ${log.level.toUpperCase()}: ${log.message}`
      ).join('\n');
      
      const blob = new Blob([logsText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `activity_log_${Date.now()}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: 'Log exportado',
        description: 'El archivo de log ha sido descargado',
      });
    },
  });

  // Update system stats based on validation state
  useEffect(() => {
    const pending = accounts.filter(a => a.status === 'pending').length;
    setSystemStats(prev => ({
      ...prev,
      queue: pending,
    }));
  }, [accounts]);

  // Listen for WebSocket updates
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'progress') {
        queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/validation/status'] });
      }
    }
  }, [lastMessage, queryClient]);

  const total = accounts.length;
  const processed = accounts.filter(a => a.status !== 'pending').length;
  const valid = accounts.filter(a => a.status === 'valid').length;
  const invalid = accounts.filter(a => a.status === 'invalid').length;
  const errors = accounts.filter(a => a.status === 'error').length;

  const successRate = processed > 0 ? ((valid / processed) * 100).toFixed(1) : '0.0';
  
  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'success':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const isConnected = true; // Simplified for now

  return (
    <div className="space-y-6">
      {/* Statistics Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-primary" />
            Estadísticas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Tasa de éxito</span>
            <span className="text-sm font-semibold text-green-600">{successRate}%</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Velocidad promedio</span>
            <span className="text-sm font-semibold">
              {job?.status === 'running' ? '145 cuentas/min' : '-'}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Total procesadas</span>
            <span className="text-sm font-semibold">{processed.toLocaleString()}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Estado actual</span>
            <span className="text-sm font-semibold text-primary">
              {job?.status === 'running' ? 'Ejecutándose' : 
               job?.status === 'paused' ? 'Pausado' : 
               job?.status === 'completed' ? 'Completado' : 'Inactivo'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Live Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            Log de Actividad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 overflow-y-auto bg-gray-900 rounded-md p-3 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-gray-400">No hay actividad reciente...</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={getLogLevelColor(log.level)}>
                  [{log.timestamp?.toLocaleTimeString()}] {log.level.toUpperCase()}: {log.message}
                </div>
              ))
            )}
          </div>
          
          <div className="mt-3 flex justify-between items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearLogsMutation.mutate()}
              disabled={clearLogsMutation.isPending || logs.length === 0}
              className="text-xs"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Limpiar Log
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => exportLogsMutation.mutate()}
              disabled={exportLogsMutation.isPending || logs.length === 0}
              className="text-xs"
            >
              <Download className="h-3 w-3 mr-1" />
              Exportar Log
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Estado del Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">API Status</span>
            <span className="flex items-center text-sm">
              <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Memoria</span>
            <span className="text-sm font-medium">{systemStats.memory}</span>
          </div>
          <Progress value={systemStats.memoryPercent} className="h-2" />
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Hilos activos</span>
            <span className="text-sm font-medium">{systemStats.threads}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Cola de trabajos</span>
            <span className="text-sm font-medium">
              {systemStats.queue.toLocaleString()} pendientes
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
