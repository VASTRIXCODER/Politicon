#!/usr/bin/env bash
# =========================================================================
#  HP Analytics Trading System -- setup & connectivity check
#
#  Creates a virtual environment, installs dependencies, prepares a .env file,
#  and runs the connectivity check to confirm broker + data connections before
#  you ever start trading.
#
#  Usage:  ./setup.sh
# =========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON="${PYTHON:-python3}"
VENV_DIR="${VENV_DIR:-.venv}"

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
if [ ! -f ".env" ]; then
  echo "==> Creating .env from .env.example (edit it to add your API keys)"
  cp .env.example .env
else
  echo "==> .env already exists -- leaving it untouched"
fi

# 4. Connectivity check ----------------------------------------------------
echo "==> Running connectivity check"
echo
if python main.py check; then
  echo
  echo "==> Setup complete."
  echo "    Next steps:"
  echo "      1. Edit .env and add your Alpaca PAPER keys."
  echo "      2. Validate the strategy:  python main.py backtest --ticker AAPL --start 2022-01-01"
  echo "      3. Start paper trading:    python main.py run"
  echo "      4. Watch it:               python main.py dashboard"
else
  echo
  echo "==> Connectivity check reported problems above."
  echo "    Add your API keys to .env and re-run ./setup.sh (or: python main.py check)."
fi
