import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const uploadedFiles = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  lineCount: integer("line_count").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, processed, error
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").references(() => uploadedFiles.id),
  email: text("email").notNull(),
  password: text("password").notNull(),
  storeUrl: text("store_url"), // URL de la tienda extraída del archivo
  status: text("status").notNull().default("pending"), // pending, valid, invalid, error
  errorMessage: text("error_message"),
  validatedAt: timestamp("validated_at"),
});

export const validationJobs = pgTable("validation_jobs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("idle"), // idle, running, paused, stopped
  settings: json("settings").notNull(),
  totalAccounts: integer("total_accounts").notNull().default(0),
  processedAccounts: integer("processed_accounts").notNull().default(0),
  validAccounts: integer("valid_accounts").notNull().default(0),
  invalidAccounts: integer("invalid_accounts").notNull().default(0),
  errorAccounts: integer("error_accounts").notNull().default(0),
  startedAt: timestamp("started_at"),
  pausedAt: timestamp("paused_at"),
  completedAt: timestamp("completed_at"),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  level: text("level").notNull(), // info, success, warn, error, debug
  message: text("message").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  uploadedAt: true,
});

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  validatedAt: true,
});

export const insertValidationJobSchema = createInsertSchema(validationJobs).omit({
  id: true,
  startedAt: true,
  pausedAt: true,
  completedAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  timestamp: true,
});

export const validationSettingsSchema = z.object({
  concurrentThreads: z.number().min(1).max(100).default(10),
  timeoutSeconds: z.number().min(5).max(120).default(30),
  retries: z.number().min(0).max(10).default(3),
});

export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type ValidationJob = typeof validationJobs.$inferSelect;
export type InsertValidationJob = z.infer<typeof insertValidationJobSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ValidationSettings = z.infer<typeof validationSettingsSchema>;
