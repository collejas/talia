.PHONY: check-all

check-all:
	cd backend && poetry install --with dev --no-root --quiet
	cd backend && poetry run ruff check
	cd backend && poetry run pytest
