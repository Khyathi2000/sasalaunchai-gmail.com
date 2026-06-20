#!/usr/bin/env bash
# M1 GCP bootstrap: provisions Cloud SQL Postgres + Cloud KMS keyring/key.
#
# Usage:
#   GCP_PROJECT_ID=my-proj REGION=us-central1 ./scripts/gcp-bootstrap-m1.sh
#
# Idempotent: safe to re-run. Skips resources that already exist.
#
# After this finishes, set in your env (or Secret Manager):
#   DATABASE_URL=postgres://launch:<password>@<ip>:5432/launch
#   LAUNCH_KMS_PROVIDER=gcp
#   LAUNCH_GCP_KMS_KEY_NAME=projects/$GCP_PROJECT_ID/locations/global/keyRings/launch/cryptoKeys/credentials

set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID before running}"
REGION="${REGION:-us-central1}"
INSTANCE="${INSTANCE:-launch-pg}"
DB_NAME="${DB_NAME:-launch}"
DB_USER="${DB_USER:-launch}"
KMS_LOCATION="${KMS_LOCATION:-global}"
KMS_KEYRING="${KMS_KEYRING:-launch}"
KMS_KEY="${KMS_KEY:-credentials}"

echo "[bootstrap] project=$GCP_PROJECT_ID region=$REGION"

echo "[bootstrap] enabling required APIs"
gcloud services enable \
  sqladmin.googleapis.com \
  cloudkms.googleapis.com \
  secretmanager.googleapis.com \
  --project="$GCP_PROJECT_ID"

echo "[bootstrap] ensuring Cloud SQL instance $INSTANCE"
if gcloud sql instances describe "$INSTANCE" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "  instance exists, skipping create"
else
  gcloud sql instances create "$INSTANCE" \
    --project="$GCP_PROJECT_ID" \
    --database-version=POSTGRES_16 \
    --region="$REGION" \
    --tier=db-f1-micro \
    --storage-size=10GB \
    --storage-auto-increase \
    --backup \
    --no-deletion-protection
fi

echo "[bootstrap] ensuring database $DB_NAME"
if gcloud sql databases describe "$DB_NAME" --instance="$INSTANCE" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "  database exists, skipping"
else
  gcloud sql databases create "$DB_NAME" --instance="$INSTANCE" --project="$GCP_PROJECT_ID"
fi

echo "[bootstrap] ensuring user $DB_USER (random password generated if creating)"
if gcloud sql users list --instance="$INSTANCE" --project="$GCP_PROJECT_ID" --format='value(name)' | grep -q "^$DB_USER$"; then
  echo "  user exists, skipping (rotate via gcloud sql users set-password)"
else
  PW=$(LC_ALL=C tr -dc 'A-Za-z0-9!@#%^&*_+=' </dev/urandom | head -c 32)
  gcloud sql users create "$DB_USER" \
    --instance="$INSTANCE" \
    --password="$PW" \
    --project="$GCP_PROJECT_ID"
  echo "  created. password (store in Secret Manager NOW):"
  echo "    $PW"
  printf -- "  storing as secret 'launch-db-password' in Secret Manager... "
  if echo -n "$PW" | gcloud secrets create launch-db-password \
    --data-file=- --project="$GCP_PROJECT_ID" 2>/dev/null; then
    echo "ok"
  else
    echo -n "$PW" | gcloud secrets versions add launch-db-password \
      --data-file=- --project="$GCP_PROJECT_ID"
    echo "rotated"
  fi
fi

echo "[bootstrap] ensuring KMS keyring $KMS_KEYRING in $KMS_LOCATION"
if gcloud kms keyrings describe "$KMS_KEYRING" \
  --location="$KMS_LOCATION" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "  keyring exists, skipping"
else
  gcloud kms keyrings create "$KMS_KEYRING" \
    --location="$KMS_LOCATION" --project="$GCP_PROJECT_ID"
fi

echo "[bootstrap] ensuring KMS key $KMS_KEY"
if gcloud kms keys describe "$KMS_KEY" \
  --keyring="$KMS_KEYRING" --location="$KMS_LOCATION" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "  key exists, skipping"
else
  gcloud kms keys create "$KMS_KEY" \
    --keyring="$KMS_KEYRING" \
    --location="$KMS_LOCATION" \
    --purpose=encryption \
    --rotation-period=90d \
    --next-rotation-time="$(date -u -d '+90 days' '+%Y-%m-%dT%H:%M:%SZ')" \
    --project="$GCP_PROJECT_ID"
fi

KEY_NAME="projects/$GCP_PROJECT_ID/locations/$KMS_LOCATION/keyRings/$KMS_KEYRING/cryptoKeys/$KMS_KEY"
echo
echo "[bootstrap] done."
echo
echo "Next: grant your runtime SA the cloudkms.cryptoKeyEncrypterDecrypter role on the key:"
echo "  gcloud kms keys add-iam-policy-binding $KMS_KEY \\"
echo "    --keyring=$KMS_KEYRING --location=$KMS_LOCATION --project=$GCP_PROJECT_ID \\"
echo "    --member='serviceAccount:<RUNTIME_SA>' \\"
echo "    --role='roles/cloudkms.cryptoKeyEncrypterDecrypter'"
echo
echo "Run migrations once your DATABASE_URL is set:"
echo "  DATABASE_URL=postgres://$DB_USER:<password>@<host>:5432/$DB_NAME npm run db:migrate"
echo
echo "App env to set on Cloud Run:"
echo "  DATABASE_URL=postgres://$DB_USER:<password>@<host>:5432/$DB_NAME"
echo "  LAUNCH_KMS_PROVIDER=gcp"
echo "  LAUNCH_GCP_KMS_KEY_NAME=$KEY_NAME"
