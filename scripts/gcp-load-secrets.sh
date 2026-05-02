#!/usr/bin/env bash
# Load .env values into GCP Secret Manager and grant the runtime SA access.
# Idempotent: existing secrets get a new version; existing IAM bindings are noops.
#
# Usage:
#   PROJECT_ID=<id> ENV_FILE=./.env ./scripts/gcp-load-secrets.sh
set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID env var required}"
ENV_FILE="${ENV_FILE:-./.env}"
RUNTIME_SA="${RUNTIME_SA:-sasa-runtime}"
RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

# Whitelist of vars that map to secrets. Everything else in .env is ignored.
WANTED=(
  ANTHROPIC_API_KEY
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_SESSION_TOKEN
  AWS_REGION
  AWS_DEFAULT_REGION
  GITHUB_TOKEN
  CLAUDE_MODEL
)

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }

upsert_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID" >/dev/null
    echo "  + version added: $name"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --project="$PROJECT_ID" >/dev/null
    echo "  + created:       $name"
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${RUNTIME_EMAIL}" \
    --role=roles/secretmanager.secretAccessor \
    --project="$PROJECT_ID" \
    --quiet >/dev/null
}

# Read .env, ignore comments/blank lines, strip optional surrounding quotes.
while IFS= read -r line || [ -n "$line" ]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  key="$(echo "$key" | tr -d '[:space:]')"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  for w in "${WANTED[@]}"; do
    if [ "$key" = "$w" ] && [ -n "$val" ]; then
      upsert_secret "$key" "$val"
      break
    fi
  done
done < "$ENV_FILE"

echo "done."
