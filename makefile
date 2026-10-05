.PHONY: setup verify reset soft-reset status logs logs-ditto logs-connector \
        logs-mongodb pair rebuild models install_uv uv_init uv_sync uv_update lint

# The local stack runs on a kind (Kubernetes-in-Docker) cluster — see scripts/.
# Cloud/Kanopy deployment is internal-only; see docs/INTERNAL_DEPLOY_MAINTENANCE.md.
KIND_CLUSTER ?= tak-situational-demo
NS_APP       ?= tak
NS_DITTO     ?= ditto
NS_DB        ?= mongodb

## Bring the whole local stack up (idempotent, ~25-35 min on first run).
setup:
	./scripts/setup.sh

## End-to-end smoke test, including a MongoDB -> Ditto round-trip.
verify:
	./scripts/verify.sh

## Delete the kind cluster and all local state.
reset:
	./scripts/reset.sh

## Keep Ops Manager + MongoDB EA, rebuild only the Ditto + app layer.
soft-reset:
	./scripts/reset.sh --soft

## What is running, across all three namespaces.
status:
	@echo "── $(NS_APP) (dashboard) ──"
	@kubectl -n $(NS_APP) get pods,svc,ingress 2>/dev/null || true
	@echo "\n── $(NS_DITTO) (Ditto Big Peer) ──"
	@kubectl -n $(NS_DITTO) get bigpeer,bigpeerapp,bigpeerdatabridge,pods 2>/dev/null || true
	@echo "\n── $(NS_DB) (MongoDB EA + Ops Manager) ──"
	@kubectl -n $(NS_DB) get opsmanager,mongodb,pods 2>/dev/null || true

## Tail the dashboard logs (backend + frontend).
## `app=web-app` is the label the mongodb/web-app chart puts on its pods; it
## matches both releases without also catching Ollama (app=ollama).
logs:
	kubectl -n $(NS_APP) logs -l app=web-app --all-containers --tail=200 -f --prefix

## Tail the Big Peer logs (store, subscription, api).
logs-ditto:
	kubectl -n $(NS_DITTO) logs -l ditto.live/big-peer=tak --all-containers --tail=200 -f --prefix

## Tail the MongoDB Connector logs — where sync problems actually surface.
logs-connector:
	kubectl -n $(NS_DITTO) logs -l ditto.live/app=tak-situational --all-containers --tail=200 -f --prefix

## Tail the MCK operator logs (EA provisioning problems show up here).
logs-mongodb:
	kubectl -n $(NS_DB) logs deploy/mongodb-kubernetes-operator --tail=200 -f

## Reprint the ATAK pairing details (App ID, URLs, playground token).
pair:
	@echo "App ID:           $$(kubectl -n $(NS_DITTO) get bigpeerapp tak-situational -o jsonpath='{.spec.appId}' 2>/dev/null)"
	@echo "Auth URL:         $$(kubectl -n $(NS_APP) get secret tak-ditto -o jsonpath='{.data.DITTO_AUTH_URL}' 2>/dev/null | base64 -d)"
	@echo "Websocket URL:    $$(kubectl -n $(NS_APP) get secret tak-ditto -o jsonpath='{.data.DITTO_WS_URL}' 2>/dev/null | base64 -d)"
	@echo "Playground token: $$(kubectl -n $(NS_APP) get secret tak-ditto -o jsonpath='{.data.DITTO_PLAYGROUND_TOKEN}' 2>/dev/null | base64 -d)"

## Rebuild both images, load them into kind and restart the deployments.
## Use this after a code change instead of a full `make setup`.
rebuild:
	docker build -t tak-situational-demo-backend:local  -f Dockerfile.backend  .
	docker build -t tak-situational-demo-frontend:local -f Dockerfile.frontend .
	kind load docker-image tak-situational-demo-backend:local  --name $(KIND_CLUSTER)
	kind load docker-image tak-situational-demo-frontend:local --name $(KIND_CLUSTER)
	kubectl -n $(NS_APP) rollout restart deploy/tak-situational-demo-backend-web-app
	kubectl -n $(NS_APP) rollout restart deploy/tak-situational-demo-frontend-web-app

## (Re)pull the Ollama model used by the AI panel.
models:
	./scripts/pull-models.sh

# ── backend Python tooling (uv) ────────────────────────────────────────────
install_uv:
	curl -LsSf https://astral.sh/uv/install.sh | sh

uv_init:
	cd backend && uv venv

uv_sync:
	cd backend && uv sync

uv_update:
	cd backend && uv lock --upgrade

## Lint the backend the same way CI does. ruff is not a project dependency, so
## it is fetched on demand rather than baked into the runtime image.
lint:
	cd backend && uv run --with ruff ruff check .
