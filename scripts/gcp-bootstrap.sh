#!/usr/bin/env bash
# One-time GCP project bootstrap for sasa-web on Cloud Run.
# Idempotent: re-running is safe.
#
# Usage:
#   PROJECT_ID=<your-project-id> ./scripts/gcp-bootstrap.sh
set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID env var required}"
REGION="${REGION:-us-central1}"
AR_REPO="${AR_REPO:-sasa-images}"
RUNTIME_SA="${RUNTIME_SA:-sasa-runtime}"
CLOUDBUILD_SA="${CLOUDBUILD_SA:-sasa-cloudbuild}"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUDBUILD_EMAIL="${CLOUDBUILD_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Project: $PROJECT_ID ($PROJECT_NUMBER), region: $REGION"

echo "==> Enable APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  cloudtrace.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project="$PROJECT_ID"

echo "==> Service accounts"
for sa in "$RUNTIME_SA" "$CLOUDBUILD_SA"; do
  if ! gcloud iam service-accounts describe "${sa}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$sa" \
      --display-name="$sa" \
      --project="$PROJECT_ID"
  fi
done

echo "==> IAM bindings — Cloud Build SA"
for role in roles/cloudbuild.builds.builder roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer roles/logging.logWriter roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

echo "==> IAM bindings — Cloud Run runtime SA"
for role in roles/secretmanager.secretAccessor roles/logging.logWriter roles/cloudtrace.agent roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

echo "==> Allow Cloud Build SA to actAs Runtime SA (deploy step)"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_EMAIL" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role=roles/iam.serviceAccountUser \
  --project="$PROJECT_ID" \
  --quiet >/dev/null

echo "==> Artifact Registry repo"
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID"
fi

echo
echo "Bootstrap complete."
echo "  Runtime SA:    $RUNTIME_EMAIL"
echo "  Cloud Build SA: $CLOUDBUILD_EMAIL"
echo "  Image repo:    ${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"
