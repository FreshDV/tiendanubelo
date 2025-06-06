import {
  uploadedFiles,
  accounts,
  validationJobs,
  activityLogs,
  type UploadedFile,
  type InsertUploadedFile,
  type Account,
  type InsertAccount,
  type ValidationJob,
  type InsertValidationJob,
  type ActivityLog,
  type InsertActivityLog,
} from "@shared/schema";

export interface IStorage {
  // File operations
  createFile(file: InsertUploadedFile): Promise<UploadedFile>;
  getFiles(): Promise<UploadedFile[]>;
  updateFileStatus(id: number, status: string): Promise<void>;
  deleteFile(id: number): Promise<void>;

  // Account operations
  createAccount(account: InsertAccount): Promise<Account>;
  createAccountsBatch(accounts: InsertAccount[]): Promise<Account[]>;
  getAccountsByFileId(fileId: number): Promise<Account[]>;
  getAllAccounts(): Promise<Account[]>;
  updateAccountStatus(id: number, status: string, storeUrl?: string, errorMessage?: string): Promise<void>;
  getAccountsByStatus(status: string): Promise<Account[]>;

  // Validation job operations
  createValidationJob(job: InsertValidationJob): Promise<ValidationJob>;
  getCurrentJob(): Promise<ValidationJob | undefined>;
  updateJobStatus(id: number, status: string): Promise<void>;
  updateJobProgress(id: number, processed: number, valid: number, invalid: number, errors: number): Promise<void>;

  // Activity log operations
  addLog(log: InsertActivityLog): Promise<ActivityLog>;
  getLogs(limit?: number): Promise<ActivityLog[]>;
  clearLogs(): Promise<void>;
}

export class MemStorage implements IStorage {
  private files: Map<number, UploadedFile> = new Map();
  private accounts: Map<number, Account> = new Map();
  private jobs: Map<number, ValidationJob> = new Map();
  private logs: Map<number, ActivityLog> = new Map();
  private currentFileId = 1;
  private currentAccountId = 1;
  private currentJobId = 1;
  private currentLogId = 1;

  // File operations
  async createFile(insertFile: InsertUploadedFile): Promise<UploadedFile> {
    const file: UploadedFile = {
      ...insertFile,
      id: this.currentFileId++,
      uploadedAt: new Date(),
      status: insertFile.status || 'pending',
    };
    this.files.set(file.id, file);
    return file;
  }

  async getFiles(): Promise<UploadedFile[]> {
    return Array.from(this.files.values());
  }

  async updateFileStatus(id: number, status: string): Promise<void> {
    const file = this.files.get(id);
    if (file) {
      this.files.set(id, { ...file, status });
    }
  }

  async deleteFile(id: number): Promise<void> {
    this.files.delete(id);
    // Also delete related accounts
    const accountsToDelete: number[] = [];
    this.accounts.forEach((account, accountId) => {
      if (account.fileId === id) {
        accountsToDelete.push(accountId);
      }
    });
    accountsToDelete.forEach(accountId => this.accounts.delete(accountId));
  }

  // Account operations
  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    const account: Account = {
      ...insertAccount,
      id: this.currentAccountId++,
      validatedAt: null,
      status: insertAccount.status || 'pending',
      storeUrl: insertAccount.storeUrl || null,
      errorMessage: insertAccount.errorMessage || null,
      fileId: insertAccount.fileId || null,
    };
    this.accounts.set(account.id, account);
    return account;
  }

  async createAccountsBatch(insertAccounts: InsertAccount[]): Promise<Account[]> {
    const accounts: Account[] = [];
    for (const insertAccount of insertAccounts) {
      const account = await this.createAccount(insertAccount);
      accounts.push(account);
    }
    return accounts;
  }

  async getAccountsByFileId(fileId: number): Promise<Account[]> {
    return Array.from(this.accounts.values()).filter(account => account.fileId === fileId);
  }

  async getAllAccounts(): Promise<Account[]> {
    return Array.from(this.accounts.values());
  }

  async updateAccountStatus(id: number, status: string, storeUrl?: string, errorMessage?: string): Promise<void> {
    const account = this.accounts.get(id);
    if (account) {
      this.accounts.set(id, {
        ...account,
        status,
        storeUrl: storeUrl || account.storeUrl,
        errorMessage: errorMessage || account.errorMessage,
        validatedAt: new Date(),
      });
    }
  }

  async getAccountsByStatus(status: string): Promise<Account[]> {
    return Array.from(this.accounts.values()).filter(account => account.status === status);
  }

  // Validation job operations
  async createValidationJob(insertJob: InsertValidationJob): Promise<ValidationJob> {
    const job: ValidationJob = {
      ...insertJob,
      id: this.currentJobId++,
      startedAt: null,
      pausedAt: null,
      completedAt: null,
      status: insertJob.status || 'idle',
      totalAccounts: insertJob.totalAccounts || 0,
      processedAccounts: insertJob.processedAccounts || 0,
      validAccounts: insertJob.validAccounts || 0,
      invalidAccounts: insertJob.invalidAccounts || 0,
      errorAccounts: insertJob.errorAccounts || 0,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async getCurrentJob(): Promise<ValidationJob | undefined> {
    const jobs = Array.from(this.jobs.values());
    return jobs.find(job => job.status === "running" || job.status === "paused") || jobs[jobs.length - 1];
  }

  async updateJobStatus(id: number, status: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      const updatedJob = { ...job, status };
      if (status === "running") {
        updatedJob.startedAt = new Date();
        updatedJob.pausedAt = null;
      } else if (status === "paused") {
        updatedJob.pausedAt = new Date();
      } else if (status === "stopped" || status === "completed") {
        updatedJob.completedAt = new Date();
      }
      this.jobs.set(id, updatedJob);
    }
  }

  async updateJobProgress(id: number, processed: number, valid: number, invalid: number, errors: number): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      this.jobs.set(id, {
        ...job,
        processedAccounts: processed,
        validAccounts: valid,
        invalidAccounts: invalid,
        errorAccounts: errors,
      });
    }
  }

  // Activity log operations
  async addLog(insertLog: InsertActivityLog): Promise<ActivityLog> {
    const log: ActivityLog = {
      ...insertLog,
      id: this.currentLogId++,
      timestamp: new Date(),
    };
    this.logs.set(log.id, log);
    return log;
  }

  async getLogs(limit: number = 100): Promise<ActivityLog[]> {
    const logs = Array.from(this.logs.values()).sort((a, b) => b.timestamp!.getTime() - a.timestamp!.getTime());
    return logs.slice(0, limit);
  }

  async clearLogs(): Promise<void> {
    this.logs.clear();
  }
}

export const storage = new MemStorage();
