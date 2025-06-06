import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Square } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { ValidationJob, Account } from '@shared/schema';

export function ValidationControl() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [settings, setSettings] = useState({
    concurrentThreads: 10,
    timeoutSeconds: 30,
    retries: 3,
  });

  const { data: job } = useQuery<ValidationJob | null>({
    queryKey: ['/api/validation/status'],
    refetchInterval: 2000,
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['/api/accounts'],
    refetchInterval: 2000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/validation/start', settings);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/validation/status'] });
      toast({
        title: 'Validación iniciada',
        description: 'El proceso de validación ha comenzado',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Error al iniciar la validación',
        variant: 'destructive',
      });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/validation/pause');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/validation/status'] });
      toast({
        title: 'Validación pausada',
        description: 'El proceso se ha pausado correctamente',
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/validation/resume');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/validation/status'] });
      toast({
        title: 'Validación reanudada',
        description: 'El proceso ha sido reanudado',
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/validation/stop');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/validation/status'] });
      toast({
        title: 'Validación detenida',
        description: 'El proceso se ha detenido completamente',
      });
    },
  });

  const totalAccounts = accounts.length;
  const pendingAccounts = accounts.filter(a => a.status === 'pending').length;
  const isRunning = job?.status === 'running';
  const isPaused = job?.status === 'paused';
  const canStart = pendingAccounts > 0 && !isRunning && !isPaused;
  const canPause = isRunning;
  const canResume = isPaused;
  const canStop = isRunning || isPaused;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5 text-primary" />
          Control de Validación
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-sm font-medium">Hilos Concurrentes</Label>
            <Select
              value={settings.concurrentThreads.toString()}
              onValueChange={(value) => 
                setSettings(prev => ({ ...prev, concurrentThreads: parseInt(value) }))
              }
              disabled={isRunning || isPaused}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 hilos</SelectItem>
                <SelectItem value="10">10 hilos</SelectItem>
                <SelectItem value="20">20 hilos</SelectItem>
                <SelectItem value="50">50 hilos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label className="text-sm font-medium">Timeout (seg)</Label>
            <Input
              type="number"
              value={settings.timeoutSeconds}
              onChange={(e) => 
                setSettings(prev => ({ ...prev, timeoutSeconds: parseInt(e.target.value) || 30 }))
              }
              disabled={isRunning || isPaused}
              min="5"
              max="120"
            />
          </div>
          
          <div>
            <Label className="text-sm font-medium">Reintentos</Label>
            <Input
              type="number"
              value={settings.retries}
              onChange={(e) => 
                setSettings(prev => ({ ...prev, retries: parseInt(e.target.value) || 3 }))
              }
              disabled={isRunning || isPaused}
              min="0"
              max="10"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            {canStart && (
              <Button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Play className="h-4 w-4 mr-2" />
                Iniciar Validación
              </Button>
            )}
            
            {canPause && (
              <Button
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                <Pause className="h-4 w-4 mr-2" />
                Pausar
              </Button>
            )}
            
            {canResume && (
              <Button
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Play className="h-4 w-4 mr-2" />
                Reanudar
              </Button>
            )}
            
            {canStop && (
              <Button
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                variant="destructive"
              >
                <Square className="h-4 w-4 mr-2" />
                Detener
              </Button>
            )}
          </div>
          
          <div className="text-sm text-gray-500">
            {totalAccounts.toLocaleString()} cuentas totales
            {pendingAccounts > 0 && (
              <span className="text-primary ml-2">
                ({pendingAccounts.toLocaleString()} pendientes)
              </span>
            )}
          </div>
        </div>

        {job && (
          <div className="text-sm text-gray-600 p-3 bg-gray-50 rounded-md">
            <div className="flex justify-between items-center">
              <span>Estado: <span className="font-medium">{job.status}</span></span>
              {job.status === 'running' && (
                <span className="text-green-600 font-medium">● En ejecución</span>
              )}
              {job.status === 'paused' && (
                <span className="text-yellow-600 font-medium">⏸ Pausado</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
