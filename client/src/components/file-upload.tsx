import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, File, X, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { UploadedFile } from '@shared/schema';

export function FileUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: files = [], isLoading } = useQuery<UploadedFile[]>({
    queryKey: ['/api/files'],
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      
      const res = await apiRequest('POST', '/api/files/upload', formData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      toast({
        title: 'Archivos subidos',
        description: 'Los archivos se han procesado correctamente',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Error al subir los archivos',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      toast({
        title: 'Archivo eliminado',
        description: 'El archivo y sus cuentas han sido eliminados',
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    // Manejar archivos rechazados
    if (rejectedFiles.length > 0) {
      rejectedFiles.forEach(file => {
        toast({
          title: 'Archivo no válido',
          description: 'Solo se permiten archivos .txt de hasta 10MB',
          variant: 'destructive',
        });
      });
      return;
    }

    const txtFiles = acceptedFiles.filter(file => file.name.toLowerCase().endsWith('.txt'));
    
    if (txtFiles.length === 0) {
      toast({
        title: 'Error',
        description: 'Solo se permiten archivos .txt',
        variant: 'destructive',
      });
      return;
    }

    if (txtFiles.length > 100) {
      toast({
        title: 'Error',
        description: 'Máximo 100 archivos permitidos',
        variant: 'destructive',
      });
      return;
    }

    // Verificar el contenido de los archivos
    const fileReadPromises = txtFiles.map(file => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const content = reader.result as string;
          // Verificar que el archivo tenga al menos una línea con formato válido
          const hasValidLine = content.split('\n').some(line => {
            const trimmedLine = line.trim();
            return trimmedLine.includes('@') && trimmedLine.includes(':');
          });
          resolve({ file, isValid: hasValidLine });
        };
        reader.onerror = () => reject(new Error(`Error al leer ${file.name}`));
        reader.readAsText(file);
      });
    });

    Promise.all(fileReadPromises)
      .then((results: any[]) => {
        const validFiles = results.filter(r => r.isValid).map(r => r.file);
        const invalidFiles = results.filter(r => !r.isValid).map(r => r.file);

        if (invalidFiles.length > 0) {
          toast({
            title: 'Archivos no válidos',
            description: 'Algunos archivos no contienen cuentas en formato válido (email:password)',
            variant: 'destructive',
          });
        }

        if (validFiles.length > 0) {
          setUploading(true);
          uploadMutation.mutate(validFiles);
        }
      })
      .catch(error => {
        toast({
          title: 'Error',
          description: 'Error al procesar los archivos',
          variant: 'destructive',
        });
      });
  }, [uploadMutation, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt']
    },
    maxFiles: 100,
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: true
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      processed: 'bg-green-100 text-green-800',
      processing: 'bg-blue-100 text-blue-800',
      error: 'bg-red-100 text-red-800',
      pending: 'bg-gray-100 text-gray-800',
    };

    const labels = {
      processed: 'Procesado',
      processing: 'Procesando...',
      error: 'Error',
      pending: 'En cola',
    };

    return (
      <Badge className={variants[status as keyof typeof variants] || variants.pending}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          Subir Archivos de Cuentas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            isDragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-gray-300 hover:border-primary'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            {isDragActive ? 'Suelta los archivos aquí' : 'Arrastra archivos .txt aquí'}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Los archivos deben contener cuentas en formato email:password
          </p>
          <Button 
            variant="outline" 
            disabled={uploading}
            className="mb-2"
          >
            {uploading ? 'Subiendo...' : 'Seleccionar Archivos'}
          </Button>
          <p className="text-xs text-gray-400">Máximo 100 archivos, 10MB cada uno</p>
        </div>

        {files.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Archivos Cargados ({files.length})
            </h3>
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                >
                  <div className="flex items-center gap-3">
                    <File className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {file.lineCount.toLocaleString()} líneas • {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(file.status)}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(file.id)}
                      disabled={deleteMutation.isPending}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}