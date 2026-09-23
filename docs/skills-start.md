# Skills Start

## Active Project Skills

- `agents-md`: root agent instructions live in `AGENTS.md`.
- `agent-manager-skill`: role map lives in `agents/project-team.md`.
- `graphify`: requested, but command is not installed in this shell yet.

## Graphify Start

Current state:

- `graphify-out/graph.json`: missing.
- `graphify` command: missing.
- No source app exists yet, only PDFs/docs/tasks.

When app code exists and graphify is installed:

```powershell
graphify update .
graphify query "What is the backend request flow?"
graphify explain "order confirmation"
```

## Agent Manager Start

Current state:

- Local `agent-manager` repo is not installed in this workspace.
- `tmux` workflow from the skill is not available in this Windows shell.

Use `agents/project-team.md` as the assignment map until a real multi-agent runner is installed.

## First Agent Run Order

1. Product/Spec Lead locks P0/P1 scope.
2. Backend Lead creates stack and tenant-safe foundation.
3. Data Integrity Lead designs schema constraints and audit rules.
4. Frontend Lead builds onboarding/product/storefront/order path.
5. AI Automation Lead adds suggest-only AI inbox/order extraction.
6. Integration Lead adds Meta/courier webhook retries.
7. QA/Security Lead gates launch with tenant, permission, audit, stock, payment tests.

