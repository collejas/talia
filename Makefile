.PHONY: check-all backend-setup backend-lint backend-test

POETRY ?= poetry
POETRY_ENV ?= POETRY_VIRTUALENVS_CREATE=true POETRY_VIRTUALENVS_IN_PROJECT=true
POETRY_INSTALL_FLAGS ?= --no-root --no-interaction

backend-setup:
	cd backend && $(POETRY_ENV) $(POETRY) install $(POETRY_INSTALL_FLAGS)

backend-lint: backend-setup
	cd backend && $(POETRY_ENV) $(POETRY) run ruff check

backend-test: backend-setup
	cd backend && $(POETRY_ENV) $(POETRY) run pytest

check-all: backend-lint backend-test
