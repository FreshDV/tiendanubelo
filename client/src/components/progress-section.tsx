import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp } from 'lucide-react';
import type { ValidationJob, Account } from '@shared/schema';

export function ProgressSection() {
  const { data: job } = useQuery<ValidationJob | null>({
    queryKey: ['/api/validation/status'],
    refetchInterval: 1000,
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['/api/accounts'],
    refetchInterval: 2000,
  });

  const total = accounts.length;
  const processed = accounts.filter(a => a.status !== 'pending').length;
  const valid = accounts.filter(a => a.status === 'valid').length;
  const invalid = accounts.filter(a => a.status === 'invalid').length;
  const errors = accounts.filter(a => a.status === 'error').length;
  const remaining = total - processed;
  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Progreso de Validación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            No hay cuentas cargadas para validar
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Progreso de Validación
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Progreso General</span>
            <span className="text-sm text-gray-500">{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-3" />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{processed.toLocaleString()} procesadas</span>
            <span>{remaining.toLocaleString()} restantes</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {valid.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Válidas</div>
          </div>
          
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {invalid.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Inválidas</div>
          </div>
          
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {errors.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Errores</div>
          </div>
          
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {(total - processed).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Pendientes</div>
          </div>
        </div>

        {job && job.status === 'running' && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              Validando en proceso...
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
