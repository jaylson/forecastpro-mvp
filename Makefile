SHELL := /usr/bin/env bash

.PHONY: dev migrate seed lint test

dev:
	docker compose up --build

migrate:
	docker compose run --rm api pnpm prisma:migrate

seed:
	docker compose run --rm api node dist/seed.js

lint:
	npx pnpm -r lint

test:
	npx pnpm -r test
