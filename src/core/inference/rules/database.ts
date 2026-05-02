import type { ParsedCodebase } from "../../types/index.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

export function inferDatabaseServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const deps = getAllDeps(codebase);
  const fileContents = codebase.files.map(f => f.content).join("\n");

  // PostgreSQL detection
  const hasPostgres = deps.has("pg") || deps.has("@prisma/client") || deps.has("prisma") ||
    deps.has("sequelize") || deps.has("knex") || deps.has("typeorm") ||
    fileContents.includes('provider = "postgresql"') || fileContents.includes("postgres");

  // MySQL detection
  const hasMysql = deps.has("mysql2") || deps.has("mysql") ||
    fileContents.includes('provider = "mysql"');

  // MongoDB detection
  const hasMongo = deps.has("mongoose") || deps.has("mongodb") ||
    fileContents.includes("mongodb+srv") || fileContents.includes("MONGODB_URI");

  // Redis detection (as database, not just cache)
  const hasRedisDb = deps.has("ioredis") || deps.has("redis");

  // DynamoDB detection
  const hasDynamo = deps.has("@aws-sdk/client-dynamodb") || deps.has("dynamoose") ||
    fileContents.includes("DynamoDB");

  if (provider === "aws") {
    if (hasPostgres) {
      recs.push({
        serviceId: "rds", serviceName: "RDS PostgreSQL", category: "database", provider: "aws",
        reason: "PostgreSQL dependency detected (Prisma/pg/TypeORM)",
        confidence: "high", config: { engine: "postgres", instanceClass: "db.t3.micro" }, dependsOn: ["vpc"],
      });
    } else if (hasMysql) {
      recs.push({
        serviceId: "rds", serviceName: "RDS MySQL", category: "database", provider: "aws",
        reason: "MySQL dependency detected",
        confidence: "high", config: { engine: "mysql", instanceClass: "db.t3.micro" }, dependsOn: ["vpc"],
      });
    }
    if (hasMongo) {
      recs.push({
        serviceId: "ec2", serviceName: "EC2 (MongoDB)", category: "database", provider: "aws",
        reason: "MongoDB detected — self-hosted on EC2 (or consider DocumentDB)",
        confidence: "medium", config: { purpose: "mongodb" }, dependsOn: ["vpc"],
      });
    }
    if (hasDynamo) {
      recs.push({
        serviceId: "dynamodb", serviceName: "DynamoDB", category: "database", provider: "aws",
        reason: "DynamoDB SDK usage detected",
        confidence: "high", config: {}, dependsOn: [],
      });
    }
  } else if (provider === "gcp") {
    if (hasPostgres || hasMysql) {
      recs.push({
        serviceId: "cloud-sql", serviceName: "Cloud SQL", category: "database", provider: "gcp",
        reason: `${hasPostgres ? "PostgreSQL" : "MySQL"} dependency detected`,
        confidence: "high", config: { engine: hasPostgres ? "postgres" : "mysql" }, dependsOn: ["vpc-gcp"],
      });
    }
    if (hasMongo) {
      recs.push({
        serviceId: "firestore", serviceName: "Firestore", category: "database", provider: "gcp",
        reason: "MongoDB patterns detected — Firestore as managed NoSQL alternative",
        confidence: "medium", config: {}, dependsOn: [],
      });
    }
  }

  return recs;
}

function getAllDeps(codebase: ParsedCodebase): Set<string> {
  const deps = new Set<string>();
  if (codebase.packageJson) {
    const d = codebase.packageJson.dependencies as Record<string, string> | undefined;
    const dd = codebase.packageJson.devDependencies as Record<string, string> | undefined;
    if (d) Object.keys(d).forEach(k => deps.add(k));
    if (dd) Object.keys(dd).forEach(k => deps.add(k));
  }
  return deps;
}
