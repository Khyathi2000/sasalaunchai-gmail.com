import type { ParsedCodebase } from "../../types/index.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

/**
 * CI/CD inference. Adds a managed-CI service when the repo has a
 * Dockerfile / package.json scripts indicating a build pipeline. We
 * skip when GitHub Actions workflows are present — the user already has
 * a CI story and adding CodePipeline / Cloud Build on top is wasteful.
 */
export function inferCIServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];

  const hasDockerfile = codebase.files.some((f) => /(^|\/)Dockerfile$/.test(f.path));
  const hasGithubActions = codebase.files.some((f) => f.path.startsWith(".github/workflows/"));
  const hasPkgJsonBuild =
    codebase.packageJson?.scripts &&
    typeof (codebase.packageJson.scripts as Record<string, string>).build === "string";

  // Already running CI on GitHub Actions — don't double-bill.
  if (hasGithubActions) return recs;
  // Nothing buildable detected — skip.
  if (!hasDockerfile && !hasPkgJsonBuild) return recs;

  if (provider === "aws") {
    recs.push({
      serviceId: "codebuild",
      serviceName: "CodeBuild",
      category: "cicd",
      provider: "aws",
      reason: hasDockerfile
        ? "Dockerfile detected — CodeBuild for container image builds + ECR push"
        : "Build script detected — CodeBuild for managed builds",
      confidence: "high",
      config: { privilegedMode: true },
      dependsOn: hasDockerfile ? ["ecr"] : [],
    });
    recs.push({
      serviceId: "codepipeline",
      serviceName: "CodePipeline",
      category: "cicd",
      provider: "aws",
      reason: "Wires GitHub source → CodeBuild → deploy",
      confidence: "high",
      config: {},
      dependsOn: ["codebuild"],
    });
  } else if (provider === "gcp") {
    // Cloud Build is handled by the existing cloud-build agent — emit
    // the recommendation here so it shows up when the rest of the
    // pipeline doesn't pull it in.
    recs.push({
      serviceId: "cloud-build",
      serviceName: "Cloud Build",
      category: "cicd",
      provider: "gcp",
      reason: hasDockerfile
        ? "Dockerfile detected — Cloud Build for container image builds + Artifact Registry push"
        : "Build script detected — Cloud Build for managed builds",
      confidence: "high",
      config: {},
      dependsOn: hasDockerfile ? ["artifact-registry"] : [],
    });
  }

  return recs;
}
