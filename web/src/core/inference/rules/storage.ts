import type { ParsedCodebase } from "../../types/index.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

export function inferStorageServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const fileContents = codebase.files.map(f => f.content).join("\n");
  const deps = new Set(Object.keys((codebase.packageJson?.dependencies as Record<string, string>) ?? {}));

  const hasS3Usage = deps.has("@aws-sdk/client-s3") || deps.has("aws-sdk") ||
    fileContents.includes("S3Client") || fileContents.includes("s3.putObject") ||
    fileContents.includes("upload") || fileContents.includes("multer");

  const hasStaticAssets = codebase.files.some(f =>
    f.path.includes("public/") || f.path.includes("static/") || f.path.includes("assets/")
  );

  if (hasS3Usage || hasStaticAssets) {
    if (provider === "aws") {
      recs.push({
        serviceId: "s3", serviceName: "S3", category: "storage", provider: "aws",
        reason: hasS3Usage ? "S3 SDK usage or file upload patterns detected" : "Static assets directory found",
        confidence: hasS3Usage ? "high" : "medium", config: {}, dependsOn: [],
      });
    } else {
      recs.push({
        serviceId: "gcs", serviceName: "Cloud Storage", category: "storage", provider: "gcp",
        reason: "File storage or static assets detected",
        confidence: "medium", config: {}, dependsOn: [],
      });
    }
  }

  return recs;
}
