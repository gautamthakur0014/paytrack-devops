#!/usr/bin/env bash
# =============================================================================
# FILE: scripts/put-secrets.sh
# OVERVIEW: Uploads your local server .env file into AWS Secrets Manager as ONE
# JSON secret (paytrack/<env>/server). Run it from your laptop, once per env.
# Skips keys that live in the Kubernetes ConfigMap instead (NODE_ENV, PORT,
# CLIENT_URL, JWT expiries) so local values can't override the cluster ones.
# Values are never printed - only the key names.
#
# USAGE:  ./scripts/put-secrets.sh <dev|prod> <path-to-env-file>
# NEEDS:  aws cli (logged in), jq. The secret container must already exist
#         (created by terraform apply).
# =============================================================================
set -euo pipefail

# Read the two arguments; abort with a usage message if missing.
ENV_NAME="${1:?usage: $0 <dev|prod> <env-file>}"
ENV_FILE="${2:?usage: $0 <dev|prod> <env-file>}"
REGION="${AWS_REGION:-ap-south-1}"
SECRET_ID="paytrack/${ENV_NAME}/server"

# Convert KEY=VALUE lines to a JSON object: drop comments/blank lines, strip
# Windows line endings (\r) and surrounding quotes, skip ConfigMap-owned keys.
JSON=$(jq -Rn '
  ["NODE_ENV","PORT","CLIENT_URL","JWT_ACCESS_EXPIRY","JWT_REFRESH_EXPIRY"] as $deny
  | [ inputs
      | rtrimstr("\r")
      | select(length > 0 and (startswith("#") | not) and contains("="))
      | capture("^(?<k>[^=]+)=(?<v>.*)$")
      | .k |= gsub("\\s"; "")
      | .k as $k
      | select(($deny | index($k)) == null)
      | {key: .k, value: (.v | sub("^\""; "") | sub("\"$"; ""))}
    ] | from_entries' "$ENV_FILE")

# Safety check: the API cannot boot without these.
echo "$JSON" | jq -e 'has("MONGO_URI") and has("REDIS_URL") and has("JWT_ACCESS_SECRET") and has("JWT_REFRESH_SECRET")' >/dev/null \
  || { echo "ERROR: MONGO_URI / REDIS_URL / JWT_* missing in $ENV_FILE"; exit 1; }

# Upload. Keys only are printed.
aws secretsmanager put-secret-value --region "$REGION" \
  --secret-id "$SECRET_ID" --secret-string "$JSON" >/dev/null
echo "Uploaded to $SECRET_ID with keys:"
echo "$JSON" | jq -r 'keys[]' | sed 's/^/  - /'
