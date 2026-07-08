# Roadmapped — execution, subagent delegation, guardrails

## 3. Execution

### Solo (you, directly)

The SKILL.md cycle: `take`/`next` → `start` → work → verify the artefact → `done --commit --outcome --verification`. Plus the cross-cutting guardrails (§4).

### Delegated (subagents — formerly subagent-driven-development)

For a multi-task effort, dispatch **one fresh subagent per task**:
- **Brief** = the output of `npx roadmapped brief <id>` + the spec's path + neighboring tasks' interfaces. Nothing else (not the session history).
- **NEVER two implementers in parallel** on the same working tree. Parallelism means dep-free tasks in separate worktrees — otherwise sequential.
- **Lock vs. worktrees (#83)**: the mutation lock (`docs/tasks/.lock`) serializes concurrent writes WITHIN A SINGLE working tree — several agents can write to it without id collisions. It guarantees NOTHING across branches: two worktrees can allocate the same id, revealed when `_meta.yaml` is merged (validation refuses the merged tree). Doctrine: concurrent multi-agent work shares one tree (the lock does the work); worktrees stay isolated efforts that merge their tickets like code, id conflicts included.
- **Review before `done`** for any M/L task: a fresh reviewer subagent, given the diff (`git diff base..head` written to a file, not pasted), returns two verdicts — compliance with the task (nothing more, nothing less) AND quality. Critical/Important findings → fix → re-review. The implementer (or a fixer) does the fixing, not the reviewer.
- **Receiving a review** (either direction): check every finding against the REAL code before implementing — never performative agreement ("you're absolutely right!"), never blind implementation of an unverified suggestion.
- **Progress tracking = task statuses.** `in_progress` = dispatched, `done` + `verification` = reviewed and verified. No parallel ledger file: after an interruption, `list --status in_progress` + `git log` get you back in the saddle.
- Model choice: the least powerful one that suffices (well-specified mechanics → small model; integration/judgment → medium; architecture/final review → the strongest).

### End of effort (formerly finishing-a-development-branch)

When every task of the effort is `done`: (1) re-run the FULL test suite + artefact verification — red tests = not done, period; (2) offer the user exactly: **merge locally / push a PR / keep the branch / discard** (discard = explicit confirmation, never the default); (3) after merging, verify every task of the effort is `done` with `commit`/`outcome` logged — the done backlog is the changelog.

## 4. Cross-cutting guardrails (short versions of the superpowers disciplines)

- **TDD** when the task creates logic: red test first, minimal code to green, then refactor. Code written before its test gets deleted and rewritten — it doesn't get "kept for reference".
- **Bug encountered → root cause BEFORE any fix** (instrument, read the real logs/artefacts, compare with what works). A fix without an understood cause is forbidden. **3 failed fixes on the same approach → STOP, question the approach** — never stack a 4th patch.
- **No claim of success without fresh proof**: identify the verification command → run it → READ its output → only then assert. "Should work", "probably fine" = forbidden. A subagent's report is a claim, not proof: verify the diff yourself.
- **Working branch**: never a multi-commit effort directly on main without explicit agreement.
