#!/usr/bin/env bash
# Builds a fresh database from supabase/migrations, re-runs the hand-applied
# migrations to prove they're idempotent, and asserts the security and data
# properties the app relies on.
# Uses the standard PG* environment variables (PGHOST, PGPORT, PGUSER, ...).
set -euo pipefail
cd "$(dirname "$0")/../.."

export PGOPTIONS="-c client_min_messages=warning"
DB="politicon_test_$$"
PSQL=(psql -X -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "create database $DB;"
trap '"${PSQL[@]}" -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true' EXIT

"${PSQL[@]}" -d "$DB" -f supabase/tests/bootstrap.sql 2>&1 | grep -v "wal_level\|logical" || true
apply() { "${PSQL[@]}" -d "$DB" -f "$1" >/dev/null 2>/tmp/migration_err || { echo "FAIL applying $1 ($2)"; cat /tmp/migration_err; exit 1; }; }
for f in $(ls supabase/migrations/*.sql | sort); do apply "$f" "fresh build"; done
echo "migrations build a fresh database"
# Migrations from the revamp onwards are pasted into the SQL editor by hand, so
# each must be safe to run twice.
for f in $(ls supabase/migrations/*.sql | sort); do
  if [[ "$(basename "$f")" > "20261007" ]]; then apply "$f" "re-run"; fi
done
echo "revamp migrations are re-runnable"

"${PSQL[@]}" -d "$DB" -f supabase/tests/security.sql
echo "security assertions passed"

# Data migration: build the schema as it was before the vocabulary change,
# insert profiles as the old screens stored them, then migrate forward.
LEGACY="politicon_legacy_$$"
"${PSQL[@]}" -d postgres -c "create database $LEGACY;"
trap '"${PSQL[@]}" -d postgres -c "drop database if exists $DB;" -c "drop database if exists $LEGACY;" >/dev/null 2>&1 || true' EXIT
"${PSQL[@]}" -d "$LEGACY" -f supabase/tests/bootstrap.sql 2>&1 | grep -v "wal_level\|logical" || true
for f in $(ls supabase/migrations/*.sql | sort); do
  if [[ "$(basename "$f")" > "20261007130000" ]]; then break; fi
  "${PSQL[@]}" -d "$LEGACY" -f "$f" >/dev/null
done
"${PSQL[@]}" -d "$LEGACY" -f supabase/tests/legacy_profiles_seed.sql
for f in $(ls supabase/migrations/*.sql | sort); do
  if [[ "$(basename "$f")" > "20261007130000" ]]; then "${PSQL[@]}" -d "$LEGACY" -f "$f" >/dev/null; fi
done
"${PSQL[@]}" -d "$LEGACY" -f supabase/tests/legacy_profiles_check.sql
echo "legacy profile data migrated correctly"
