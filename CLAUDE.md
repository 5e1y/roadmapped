<!-- >>> roadmapped >>> -->
## Roadmapped

This repo uses **Roadmapped** (flat-file project management, agent-driven).

- **At session start**: if the Roadmapped dashboard is not already open, run
  `npx roadmapped dashboard` (idempotent — no-op if it's already running, otherwise opens the browser).
- Every task creation/update goes through the roadmapped skill or `npx roadmapped <cmd>`
  (never edit the YAML files under `docs/tasks/` by hand).
<!-- <<< roadmapped <<< -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
