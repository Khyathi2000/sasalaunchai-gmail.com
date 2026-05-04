// Drizzle schema for the Sasa Launch platform.
//
// Replaces the Firestore-only persistence layer. Postgres gives us relational
// integrity (per-user scoping), JSONB for the larger payloads (codebase,
// analysis, recommendations), and a simple migration story via drizzle-kit.

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  uuid,
  pgEnum,
  index,
  customType,
} from "drizzle-orm/pg-core";

// Postgres `bytea` for ciphertext + wrapped DEK. Drizzle has no first-class
// bytea helper — round-trip Buffer <-> bytea via a custom type.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const cloudProvider = pgEnum("cloud_provider", ["aws", "gcp"]);
export const runStatus = pgEnum("run_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "destroyed",
]);

// One row per Clerk user we've ever seen. Created lazily on first
// authenticated request via `ensureUser()`.
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk userId
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cloud credentials, envelope-encrypted. The ciphertext is the credential
// blob (AWS access keys / GCP service-account JSON) sealed with a per-row
// data encryption key (DEK). The DEK itself is wrapped by a KMS key whose
// reference we store in `kmsKeyRef`.
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: cloudProvider("provider").notNull(),
    label: text("label").notNull().default("default"),
    ciphertext: bytea("ciphertext").notNull(),
    wrappedDek: bytea("wrapped_dek").notNull(),
    kmsKeyRef: text("kms_key_ref").notNull(),
    // Non-sensitive metadata so the UI can show "AWS account 1234..."
    // without decrypting.
    awsAccountId: text("aws_account_id"),
    awsRegion: text("aws_region"),
    gcpProjectId: text("gcp_project_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("credentials_user_provider_label_idx").on(t.userId, t.provider, t.label)],
);

// Per-user analysis sessions. Replaces the old Firestore `sessions`
// collection. Big payloads (codebase, analysis output, recommendation list,
// chat history) live in JSONB so the schema doesn't have to chase Claude's
// response shape across migrations.
export const sessions = pgTable(
  "sessions",
  {
    sid: text("sid").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source"),
    codebase: jsonb("codebase"),
    analysis: jsonb("analysis"),
    recommendations: jsonb("recommendations"),
    plan: jsonb("plan"),
    planId: text("plan_id"),
    // M4 prep: chat history + the mutation log the architect agent applied.
    chatHistory: jsonb("chat_history").notNull().default([]),
    architectMutations: jsonb("architect_mutations").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// One row per deployment attempt. Lets us show a deployment history
// per user without keeping live orchestrators around.
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.sid, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: cloudProvider("provider").notNull(),
    region: text("region").notNull(),
    status: runStatus("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    selectedServices: jsonb("selected_services").notNull().default([]),
    costEstimate: jsonb("cost_estimate"),
  },
  (t) => [index("runs_user_idx").on(t.userId), index("runs_session_idx").on(t.sessionId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CredentialRow = typeof credentials.$inferSelect;
export type NewCredentialRow = typeof credentials.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type RunRow = typeof runs.$inferSelect;
export type NewRunRow = typeof runs.$inferInsert;
