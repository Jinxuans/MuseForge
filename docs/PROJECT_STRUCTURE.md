# Project Structure

MuseForge is a Go backend with a React/Vite frontend. Keep top-level folders aligned to deployable or runtime boundaries, and keep frontend code grouped by ownership rather than by file type alone.

## Top-level folders

- `cmd/server`: application entrypoint for the Go server.
- `internal`: private Go packages for HTTP, configuration, storage, task execution, providers, access control, and persistence.
- `migrations`: embedded PostgreSQL schema migrations.
- `scripts`: local development, verification, and release scripts.
- `web`: frontend application and build tooling.
- `data`, `tmp`, `web/dist`, `web/node_modules`: local runtime or build output; do not commit.

## Frontend folders

- `web/src/App.tsx`: app composition and top-level route/mode switching.
- `web/src/components`: product-level React components and feature surfaces.
- `web/src/components/<feature>`: complex component subparts owned by a feature surface, such as `input`, `settings`, `detail`, `agent`, `taskCard`, or `maskEditor`.
- `web/src/shared/ui`: reusable UI primitives and app-wide visual helpers. These components should not own business workflows.
- `web/src/hooks`: reusable React hooks that are not tied to a single feature.
- `web/src/lib`: shared non-React utilities and clients. Prefer feature-local helpers when logic is only used by one feature.
- `web/src/services`: orchestration code that coordinates store state, persistence, backend calls, or long-running workflows.
- `web/src/store`: store domain helpers, persistence helpers, and state types.
- `web/src/types`: shared TypeScript domain types.

## Placement rules

- Put reusable visual primitives in `shared/ui`, for example selects, checkboxes, toasts, dialogs, tooltips, and shared icons.
- Put workflow components in `components` or a feature subfolder. A component that reads several store fields or performs product actions is not a primitive.
- Put pure business helpers next to the feature that owns them when there is only one owner.
- Put truly cross-feature utilities in `lib`.
- Put code that coordinates async workflows, persistence, backend calls, or multiple store domains in `services`.
- Keep barrel files narrow. Use `types/index.ts` for domain type exports, but avoid broad component barrels until import cycles and ownership are clear.

## Refactoring priorities

1. Split `web/src/store.ts` into store slices while preserving the public `useStore` import.
2. Split `web/src/store.test.ts` by domain once the store slices exist.
3. Move feature-owned helpers out of `lib` when they only serve one feature.
4. Move page-sized feature surfaces from `components` into feature folders when the ownership is obvious.
