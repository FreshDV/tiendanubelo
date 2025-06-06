import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import multer from "multer";
import { storage } from "./storage";
import {
  insertUploadedFileSchema,
  insertValidationJobSchema,
  validationSettingsSchema,
} from "@shared/schema";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// WebSocket for real-time updates
let wss: WebSocketServer;

function broadcast(data: any) {
  if (wss) {
    wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(data));
      }
    });
  }
}

// Real Tienda Nube validation with direct web login
async function validateTiendaNubeAccount(email: string, password: string, storeUrl?: string): Promise<{
  valid: boolean;
  storeUrl?: string;
  error?: string;
}> {
  try {
    // Si no tenemos URL, intentamos encontrarla primero
    if (!storeUrl) {
      const discoveryResult = await discoverTiendaNubeStore(email);
      if (!discoveryResult.success) {
        return { valid: false, error: "No se encontró tienda asociada al email" };
      }
      storeUrl = discoveryResult.storeUrl;
    }

    // Primer paso: Obtener la página de login para obtener tokens CSRF
    const loginPageUrl = `${storeUrl}/admin/login`;
    const loginPageResponse = await fetch(loginPageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!loginPageResponse.ok) {
      return { valid: false, error: "No se pudo acceder a la página de login" };
    }

    const loginPageHtml = await loginPageResponse.text();
    const cookies = loginPageResponse.headers.get('set-cookie') || '';

    // Extraer token CSRF si existe
    const csrfMatch = loginPageHtml.match(/name="authenticity_token"[^>]*value="([^"]*)"/) || 
                     loginPageHtml.match(/name="_token"[^>]*value="([^"]*)"/) ||
                     loginPageHtml.match(/csrf-token"[^>]*content="([^"]*)"/) ||
                     loginPageHtml.match(/"_token":"([^"]*)"/) ||
                     loginPageHtml.match(/window\.csrf_token\s*=\s*"([^"]*)"/) ||
                     loginPageHtml.match(/data-csrf="([^"]*)"/) ||
                     loginPageHtml.match(/csrfToken:\s*"([^"]*)"/) ||
                     loginPageHtml.match(/csrf_token.*?value="([^"]*)"/) ||
                     loginPageHtml.match(/authenticity_token.*?value="([^"]*)"/) ||
                     loginPageHtml.match(/_token.*?value="([^"]*)"/) ||
                     ['', ''];
    
    const csrfToken = csrfMatch[1] || '';

    // Preparar datos del formulario de login
    const formData = new URLSearchParams();
    formData.append('email', email);
    formData.append('password', password);
    
    // Agregar token CSRF si se encontró
    if (csrfToken) {
      formData.append('authenticity_token', csrfToken);
      formData.append('_token', csrfToken);
    }

    // Realizar el login
    const loginResponse = await fetch(loginPageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Referer': loginPageUrl,
        'Cookie': cookies,
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData,
      redirect: 'manual'
    });

    const responseText = await loginResponse.text();
    const location = loginResponse.headers.get('location') || '';
    const status = loginResponse.status;

    // Verificar si el login fue exitoso
    if (status === 302 || status === 301) {
      // Redirección - verificar si va al dashboard
      if (location.includes('/admin') && 
          (location.includes('dashboard') || 
           location.includes('home') || 
           location.includes('panel') ||
           !location.includes('login'))) {
        return { 
          valid: true, 
          storeUrl: storeUrl 
        };
      }
    }

    // Verificar contenido de respuesta para indicadores de éxito
    if (responseText.includes('dashboard') || 
        responseText.includes('admin-panel') ||
        responseText.includes('Cerrar sesión') ||
        responseText.includes('Log out') ||
        responseText.includes('Mi tienda') ||
        responseText.includes('Panel de control')) {
      return { 
        valid: true, 
        storeUrl: storeUrl 
      };
    }

    // Verificar errores específicos
    if (responseText.includes('contraseña incorrecta') ||
        responseText.includes('invalid') ||
        responseText.includes('error') ||
        responseText.includes('incorrecto')) {
      return { valid: false, error: "Credenciales incorrectas" };
    }

    return { valid: false, error: "No se pudo verificar el acceso al dashboard" };
    
  } catch (error: any) {
    return { 
      valid: false, 
      error: `Error de conexión: ${error.message}` 
    };
  }
}

// Función para descubrir la URL de la tienda basada en el email
async function discoverTiendaNubeStore(email: string): Promise<{
  success: boolean;
  storeUrl?: string;
  error?: string;
}> {
  const username = email.split('@')[0];
  const commonDomains = [
    '.mitiendanube.com',
    '.nuvemshop.com.br', 
    '.nuvemshop.com.ar',
    '.nuvemshop.com.mx',
    '.nuvemshop.com.co'
  ];

  // Intentar encontrar la tienda en diferentes dominios
  for (const domain of commonDomains) {
    const potentialUrl = `https://${username}${domain}`;
    try {
      const response = await fetch(potentialUrl, { 
        method: 'HEAD',
        timeout: 5000 
      });
      if (response.status === 200) {
        return { success: true, storeUrl: potentialUrl };
      }
    } catch (error) {
      // Continuar con el siguiente dominio
      continue;
    }
  }

  return { success: false, error: "Tienda no encontrada" };
}

let validationQueue: Array<{ id: number; email: string; password: string }> = [];
let isValidating = false;
let validationSettings = { concurrentThreads: 10, timeoutSeconds: 30, retries: 3 };

async function processValidationQueue() {
  if (isValidating || validationQueue.length === 0) return;
  
  isValidating = true;
  const currentJob = await storage.getCurrentJob();
  if (!currentJob || currentJob.status !== "running") {
    isValidating = false;
    return;
  }

  const batchSize = Math.min(validationSettings.concurrentThreads, validationQueue.length);
  const batch = validationQueue.splice(0, batchSize);
  
  const promises = batch.map(async (account) => {
    try {
      await storage.addLog({
        level: "info",
        message: `Validando ${account.email}...`
      });

      // Obtener la información completa de la cuenta incluyendo storeUrl
      const fullAccount = await storage.getAllAccounts().then(accounts => 
        accounts.find(a => a.id === account.id)
      );
      
      const result = await validateTiendaNubeAccount(
        account.email, 
        account.password, 
        fullAccount?.storeUrl || undefined
      );
      
      if (result.valid) {
        await storage.updateAccountStatus(account.id, "valid", result.storeUrl);
        await storage.addLog({
          level: "success",
          message: `Login exitoso para ${account.email}`
        });
      } else {
        await storage.updateAccountStatus(account.id, "invalid", undefined, result.error);
        await storage.addLog({
          level: "error",
          message: `${result.error} para ${account.email}`
        });
      }
    } catch (error) {
      await storage.updateAccountStatus(account.id, "error", undefined, "Error interno");
      await storage.addLog({
        level: "error",
        message: `Error interno validando ${account.email}`
      });
    }
  });

  await Promise.all(promises);

  // Update job progress
  const allAccounts = await storage.getAllAccounts();
  const processed = allAccounts.filter(a => a.status !== "pending").length;
  const valid = allAccounts.filter(a => a.status === "valid").length;
  const invalid = allAccounts.filter(a => a.status === "invalid").length;
  const errors = allAccounts.filter(a => a.status === "error").length;

  await storage.updateJobProgress(currentJob.id, processed, valid, invalid, errors);

  // Broadcast progress update
  broadcast({
    type: "progress",
    data: { processed, valid, invalid, errors, total: allAccounts.length }
  });

  isValidating = false;

  // Continue processing if there are more items and job is still running
  const updatedJob = await storage.getCurrentJob();
  if (updatedJob && updatedJob.status === "running" && validationQueue.length > 0) {
    setTimeout(processValidationQueue, 1000); // Rate limiting
  } else if (validationQueue.length === 0 && updatedJob) {
    await storage.updateJobStatus(updatedJob.id, "completed");
    broadcast({ type: "jobCompleted" });
  }
}

function parseAccountFile(content: string): Array<{ email: string; password: string; storeUrl?: string }> {
  const lines = content.split('\n').filter(line => line.trim());
  const accounts: Array<{ email: string; password: string; storeUrl?: string }> = [];
  
  // Detectar URLs de Tienda Nube en el archivo
  const tiendaNubeUrlRegex = /https?:\/\/[a-zA-Z0-9-]+\.(mitiendanube\.com|nuvemshop\.com\.br|nuvemshop\.com\.ar|nuvemshop\.com\.mx|nuvemshop\.com\.co)/gi;
  
  for (const line of lines) {
    let email = '', password = '', storeUrl = '';
    
    // Buscar URLs de Tienda Nube en la línea
    const urlMatches = line.match(tiendaNubeUrlRegex);
    if (urlMatches && urlMatches.length > 0) {
      storeUrl = urlMatches[0].replace(/\/$/, ''); // Remover barra final
    }
    
    // Extraer email y password con diferentes separadores
    const separators = [':', '|', ' ', ',', '\t'];
    const cleanLine = line.replace(tiendaNubeUrlRegex, '').trim(); // Remover URLs para facilitar parsing
    
    for (const sep of separators) {
      if (cleanLine.includes(sep)) {
        const parts = cleanLine.split(sep).map(p => p.trim()).filter(p => p);
        if (parts.length >= 2) {
          // Buscar email (contiene @)
          const emailPart = parts.find(p => p.includes('@'));
          if (emailPart) {
            email = emailPart;
            // Password es el otro elemento que no es email ni URL
            const passwordPart = parts.find(p => p !== email && !p.includes('http') && !p.includes('.com'));
            if (passwordPart) {
              password = passwordPart;
            }
          }
          break;
        }
      }
    }
    
    // Si no encontramos separadores, intentar detectar por patrones
    if (!email || !password) {
      const emailMatch = cleanLine.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        email = emailMatch[0];
        // El resto de la línea podría ser la password
        password = cleanLine.replace(email, '').trim().split(/\s+/)[0] || '';
      }
    }
    
    if (email && password && email.includes('@')) {
      const account: { email: string; password: string; storeUrl?: string } = { email, password };
      if (storeUrl) {
        account.storeUrl = storeUrl;
      }
      accounts.push(account);
    }
  }
  
  return accounts;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize WebSocket server on a different path
  wss = new WebSocketServer({ 
    server: httpServer,
    path: '/api/ws'
  });
  
  wss.on('connection', (ws) => {
    console.log('Validation WebSocket client connected');
    
    ws.on('close', () => {
      console.log('Validation WebSocket client disconnected');
    });
  });

  // Upload files
  app.post('/api/files/upload', upload.array('files', 100), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
      }

      const uploadedFiles = [];
      
      for (const file of files) {
        if (!file.originalname.endsWith('.txt')) {
          continue; // Skip non-txt files
        }

        const content = file.buffer.toString('utf-8');
        const accounts = parseAccountFile(content);
        
        const uploadedFile = await storage.createFile({
          name: file.originalname,
          size: file.size,
          lineCount: accounts.length,
          status: 'processed'
        });

        // Create accounts for this file
        const accountsToInsert = accounts.map(account => ({
          fileId: uploadedFile.id,
          email: account.email,
          password: account.password,
          storeUrl: account.storeUrl || null,
          status: 'pending' as const
        }));

        await storage.createAccountsBatch(accountsToInsert);
        uploadedFiles.push(uploadedFile);

        await storage.addLog({
          level: 'info',
          message: `Archivo ${file.originalname} procesado: ${accounts.length} cuentas encontradas`
        });
      }

      res.json({ files: uploadedFiles });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ message: 'Error uploading files' });
    }
  });

  // Get all files
  app.get('/api/files', async (req, res) => {
    try {
      const files = await storage.getFiles();
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching files' });
    }
  });

  // Delete file
  app.delete('/api/files/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteFile(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting file' });
    }
  });

  // Get accounts
  app.get('/api/accounts', async (req, res) => {
    try {
      const { status, fileId } = req.query;
      let accounts;
      
      if (status) {
        accounts = await storage.getAccountsByStatus(status as string);
      } else if (fileId) {
        accounts = await storage.getAccountsByFileId(parseInt(fileId as string));
      } else {
        accounts = await storage.getAllAccounts();
      }
      
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching accounts' });
    }
  });

  // Start validation
  app.post('/api/validation/start', async (req, res) => {
    try {
      const settings = validationSettingsSchema.parse(req.body);
      validationSettings = settings;
      
      const allAccounts = await storage.getAllAccounts();
      const pendingAccounts = allAccounts.filter(account => account.status === 'pending');
      
      if (pendingAccounts.length === 0) {
        return res.status(400).json({ message: 'No hay cuentas pendientes para validar' });
      }

      const job = await storage.createValidationJob({
        status: 'running',
        settings: settings as any,
        totalAccounts: pendingAccounts.length,
        processedAccounts: 0,
        validAccounts: 0,
        invalidAccounts: 0,
        errorAccounts: 0
      });

      await storage.updateJobStatus(job.id, 'running');
      
      // Add accounts to validation queue
      validationQueue = pendingAccounts.map(account => ({
        id: account.id,
        email: account.email,
        password: account.password
      }));

      await storage.addLog({
        level: 'info',
        message: `Iniciando validación de ${pendingAccounts.length} cuentas con ${settings.concurrentThreads} hilos`
      });

      // Start processing
      processValidationQueue();
      
      res.json({ job, message: 'Validación iniciada' });
    } catch (error) {
      console.error('Start validation error:', error);
      res.status(500).json({ message: 'Error iniciando validación' });
    }
  });

  // Pause validation
  app.post('/api/validation/pause', async (req, res) => {
    try {
      const currentJob = await storage.getCurrentJob();
      if (currentJob && currentJob.status === 'running') {
        await storage.updateJobStatus(currentJob.id, 'paused');
        await storage.addLog({
          level: 'warn',
          message: 'Validación pausada por el usuario'
        });
        res.json({ message: 'Validación pausada' });
      } else {
        res.status(400).json({ message: 'No hay validación en curso' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Error pausando validación' });
    }
  });

  // Resume validation
  app.post('/api/validation/resume', async (req, res) => {
    try {
      const currentJob = await storage.getCurrentJob();
      if (currentJob && currentJob.status === 'paused') {
        await storage.updateJobStatus(currentJob.id, 'running');
        await storage.addLog({
          level: 'info',
          message: 'Validación reanudada'
        });
        processValidationQueue();
        res.json({ message: 'Validación reanudada' });
      } else {
        res.status(400).json({ message: 'No hay validación pausada' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Error reanudando validación' });
    }
  });

  // Stop validation
  app.post('/api/validation/stop', async (req, res) => {
    try {
      const currentJob = await storage.getCurrentJob();
      if (currentJob && (currentJob.status === 'running' || currentJob.status === 'paused')) {
        await storage.updateJobStatus(currentJob.id, 'stopped');
        validationQueue = [];
        await storage.addLog({
          level: 'warn',
          message: 'Validación detenida por el usuario'
        });
        res.json({ message: 'Validación detenida' });
      } else {
        res.status(400).json({ message: 'No hay validación activa' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Error deteniendo validación' });
    }
  });

  // Get current job status
  app.get('/api/validation/status', async (req, res) => {
    try {
      const job = await storage.getCurrentJob();
      res.json(job || null);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching validation status' });
    }
  });

  // Get activity logs
  app.get('/api/logs', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getLogs(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching logs' });
    }
  });

  // Clear logs
  app.delete('/api/logs', async (req, res) => {
    try {
      await storage.clearLogs();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: 'Error clearing logs' });
    }
  });

  // Export results
  app.get('/api/export', async (req, res) => {
    try {
      const { format, status } = req.query;
      let accounts;
      
      if (status && status !== 'all') {
        accounts = await storage.getAccountsByStatus(status as string);
      } else {
        accounts = await storage.getAllAccounts().then(accounts => 
          accounts.filter(account => account.status !== 'pending')
        );
      }

      if (format === 'csv') {
        const csv = [
          'Email,Password,Status,Store URL,Error Message,Validated At',
          ...accounts.map(account => 
            `${account.email},${account.password},${account.status},${account.storeUrl || ''},${account.errorMessage || ''},${account.validatedAt || ''}`
          )
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=results_${Date.now()}.csv`);
        res.send(csv);
      } else {
        const txt = accounts.map(account => 
          account.status === 'valid' ? `${account.email}:${account.password}` : 
          `${account.email}:${account.password} // ${account.status}: ${account.errorMessage || ''}`
        ).join('\n');
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename=results_${Date.now()}.txt`);
        res.send(txt);
      }
    } catch (error) {
      res.status(500).json({ message: 'Error exporting results' });
    }
  });

  return httpServer;
}
