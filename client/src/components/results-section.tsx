import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Account } from '@shared/schema';

export function ResultsSection() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('all');

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['/api/accounts'],
    refetchInterval: 2000,
  });

  const allAccounts = accounts.filter(a => a.status !== 'pending');
  const validAccounts = accounts.filter(a => a.status === 'valid');
  const invalidAccounts = accounts.filter(a => a.status === 'invalid');
  const errorAccounts = accounts.filter(a => a.status === 'error');

  const getFilteredAccounts = () => {
    switch (activeTab) {
      case 'valid':
        return validAccounts;
      case 'invalid':
        return invalidAccounts;
      case 'error':
        return errorAccounts;
      default:
        return allAccounts;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'invalid':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      valid: 'bg-green-100 text-green-800',
      invalid: 'bg-red-100 text-red-800',
      error: 'bg-yellow-100 text-yellow-800',
      pending: 'bg-gray-100 text-gray-800',
    };

    const labels = {
      valid: 'Válida',
      invalid: 'Inválida',
      error: 'Error',
      pending: 'Pendiente',
    };

    return (
      <Badge className={variants[status as keyof typeof variants] || variants.pending}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  const handleExport = (format: 'csv' | 'txt', status: string = 'all') => {
    const url = `/api/export?format=${format}&status=${status}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `results_${status}_${Date.now()}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: 'Exportación iniciada',
      description: 'La descarga comenzará en breve',
    });
  };

  const formatTimestamp = (timestamp: Date | null) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString('es-ES');
  };

  if (allAccounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Resultados de Validación
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            No hay resultados de validación disponibles
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Resultados de Validación
          </CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={() => handleExport('csv', 'valid')}
              className="bg-green-600 hover:bg-green-700"
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar Válidas (CSV)
            </Button>
            <Button
              onClick={() => handleExport('txt', 'all')}
              variant="secondary"
              size="sm"
            >
              <FileText className="h-4 w-4 mr-2" />
              Exportar Todo (TXT)
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">
              Todas ({allAccounts.length})
            </TabsTrigger>
            <TabsTrigger value="valid">
              Válidas ({validAccounts.length})
            </TabsTrigger>
            <TabsTrigger value="invalid">
              Inválidas ({invalidAccounts.length})
            </TabsTrigger>
            <TabsTrigger value="error">
              Errores ({errorAccounts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Tienda</TableHead>
                    <TableHead>Último Check</TableHead>
                    <TableHead>Detalles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getFilteredAccounts().slice(0, 50).map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-mono text-sm">
                        {account.email}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(account.status)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {account.storeUrl || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatTimestamp(account.validatedAt)}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {account.errorMessage || (account.status === 'valid' ? 'Login exitoso' : '-')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {getFilteredAccounts().length > 50 && (
              <div className="mt-4 text-center text-sm text-gray-500">
                Mostrando 50 de {getFilteredAccounts().length} resultados
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
