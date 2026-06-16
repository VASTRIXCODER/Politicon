# =========================================================================
#  HP Analytics Trading System -- convenience targets
#
#  Run `make` (or `make help`) to see everything. The two you most likely
#  want first:
#    make setup   -- full one-time setup: venv + deps + .env + connectivity
#    make env     -- just create .env from .env.example (then paste your keys)
# =========================================================================

# Prefer the project venv's interpreter when it exists, else fall back to python3.
VENV ?= .venv
PYTHON := $(shell [ -x "$(VENV)/bin/python" ] && echo "$(VENV)/bin/python" || echo "python3")

.DEFAULT_GOAL := help
.PHONY: help setup env install check scan web run dashboard test

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2}'

setup:  ## Full setup: venv + deps + .env + connectivity check
	./setup.sh

env:  ## Create .env from .env.example (won't overwrite an existing .env)
	./setup.sh --env-only

install:  ## Install Python dependencies into the active environment
	$(PYTHON) -m pip install -r requirements.txt

check:  ## Pre-flight connectivity + config check (needs keys)
	$(PYTHON) main.py check

scan:  ## Print ranked signals in the terminal (no keys needed)
	$(PYTHON) main.py scan

web:  ## Launch the browser dashboard (http://127.0.0.1:5000)
	$(PYTHON) main.py web

run:  ## Start paper trading
	$(PYTHON) main.py run

dashboard:  ## Monitor the running engine
	$(PYTHON) main.py dashboard

test:  ## Run the test suite (uses pytest if installed, else runs files directly)
	@$(PYTHON) -m pytest -q tests || ( \
		echo "(pytest not found -- running test files directly)"; \
		for f in tests/test_*.py; do echo "--> $$f"; $(PYTHON) "$$f" || exit 1; done )
