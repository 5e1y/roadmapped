# Repo discoverability — GitHub metadata to apply at publish (#13)

GitHub search and Google both weight the repo **About** blurb and **topics** heavily —
more than the README body. Set these when the repo goes public. Keep it factual (the
voice guide bans superlatives); these are for search, not for show.

## About (the repo description field, ~120 chars max)

> Project management as flat files in your repo. YAML tasks, a computed roadmap,
> driven by your AI agent. No database, no SaaS. MIT.

Website field: `https://roadmapped.dev`

## Topics (GitHub topics — lowercase, hyphenated)

```
project-management  ai-agents  claude  claude-code  local-first
flat-file  yaml  cli  roadmap  backlog  developer-tools
open-source  agentic  no-database
```

These mirror `package.json` `keywords` and the terms a developer would actually
search: "local-first project management", "AI agent project management", "flat file
tasks", "Claude project management".

## README keyword coverage (already present, keep it that way)

The README naturally carries the high-value phrases without stuffing: *project
management tool*, *flat files / YAML*, *AI agent*, *Claude skill*, *local*, *no
database / no SaaS*, *MIT*, *CLI*. Do not add a keyword list — GitHub does not reward
it and the voice guide forbids it. The About + topics above are where discoverability
is won.

## Note

Applying About/topics requires the public remote, so it is part of #13 (publish repo),
not a standalone change. This file is the checklist to run at that moment.
