#!/usr/bin/env bash
# =========================================================================
#  HP Analytics Trading System -- setup & connectivity check
#
#  Creates a virtual environment, installs dependencies, prepares a .env file,
#  and runs the connectivity check to confirm broker + data connections before
#  you ever start trading.
#
#  Usage:  ./setup.sh              full setup (venv + deps + .env + check)
#          ./setup.sh --env-only   only create .env from .env.example, then stop
# =========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON="${PYTHON:-python3}"
VENV_DIR="${VENV_DIR:-.venv}"

# ----- argument parsing ---------------------------------------------------
ENV_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --env-only) ENV_ONLY=1 ;;
    -h|--help)
      echo "Usage: ./setup.sh [--env-only]"
      echo "  (no args)    full setup: venv + deps + .env + connectivity check"
      echo "  --env-only   only create .env from .env.example, then exit"
      exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

# Create .env from the template unless one already exists (never clobber keys).
make_env() {
  if [ ! -f ".env" ]; then
    echo "==> Creating .env from .env.example (edit it to add your API keys)"
    cp .env.example .env
  else
    echo "==> .env already exists -- leaving it untouched"
  fi
}

# Fast path: just scaffold .env and print where each key goes. No venv / deps /
# network -- handy when all you want is a file to paste Supabase or Alpaca keys into.
if [ "$ENV_ONLY" -eq 1 ]; then
  make_env
  echo
  echo "==> .env is ready. Open it and paste your keys:"
  echo "      * Alpaca (paper):  ALPACA_API_KEY / ALPACA_SECRET_KEY"
  echo "      * Supabase login:  set AUTH_ENABLED=true, then SUPABASE_URL,"
  echo "                         SUPABASE_ANON_KEY and SUPABASE_JWT_SECRET"
  echo "          (Supabase dashboard -> Project Settings -> API for the URL"
  echo "           and anon key; API -> JWT Settings for the JWT secret.)"
  exit 0
fi

echo "==> Using Python: $($PYTHON --version 2>&1)"

# 1. Virtual environment ---------------------------------------------------
if [ ! -d "$VENV_DIR" ]; then
  echo "==> Creating virtual environment in $VENV_DIR"
  "$PYTHON" -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# 2. Dependencies ----------------------------------------------------------
echo "==> Upgrading pip"
python -m pip install --quiet --upgrade pip

echo "==> Installing requirements (this can take a minute)"
python -m pip install -r requirements.txt

# 3. .env ------------------------------------------------------------------
make_env

# 4. Connectivity check ----------------------------------------------------
echo "==> Running connectivity check"
echo
if python main.py check; then
  echo
  echo "==> Setup complete."
  echo "    Next steps:"
  echo "      1. Edit .env and add your Alpaca PAPER keys."
  echo "      2. (Optional) Enable the Supabase login gate: set AUTH_ENABLED=true"
  echo "         plus SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_JWT_SECRET."
  echo "      3. Validate the strategy:  python main.py backtest --ticker AAPL --start 2022-01-01"
  echo "      4. Start paper trading:    python main.py run"
  echo "      5. Watch it:               python main.py dashboard"
else
  echo
  echo "==> Connectivity check reported problems above."
  echo "    Add your API keys to .env and re-run ./setup.sh (or: python main.py check)."
fi
