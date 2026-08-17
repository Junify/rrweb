<!-- markdownlint-disable MD013 MD043 -->

# Contract Inventory Audit Loop

This audit loop keeps the human and machine inventories honest as the rebuild
progresses. It is evidence governance, not a substitute for running the gates
in [`test-gates-runbook.md`](test-gates-runbook.md).

## Status Taxonomy

Only these statuses are valid:

- `covered`: an executable gate observes the stated source-to-sink contract.
- `must-cover`: the contract is feasible and required, but the needed gate is
  absent or insufficient.
- `accepted-current-behavior`: the current behavior is deliberately accepted
  with an explicit owner and rationale; acceptance is not test coverage.
- `red-known-risk`: a known high-risk gap or current weakness is neither
  accepted nor closed.
- `not-testable-yet`: a specific external blocker makes the gate infeasible;
  the blocker and the command to run after it clears must be recorded.
- `out-of-scope`: the behavior is explicitly excluded from this upgrade. This
  status must not be used to hide an active consumer or production boundary.

The authoritative machine list is the `contracts` array in
[`contract-inventory.json`](contract-inventory.json). The Markdown matrix must
contain the same IDs, statuses, layers, sources, observable effects, gates, and
risks. Status changes require evidence in both files in the same commit.

## Review Prompts

Run these prompts after every implementation task and before any release
decision:

1. Which user-visible, persisted, emitted, or resource-lifetime behavior can
   change in this diff, and does it have a stable contract ID?
2. Does each contract trace from a real source or entrypoint to an observable
   sink, rather than stopping at a mocked collaborator?
3. Is every `covered` claim backed by an executable command that observes the
   whole claimed boundary? A passing unit test cannot close an E2E claim.
4. Do fixtures vary the values whose survival matters, and do they record
   producer package/version, browser/version, creation command, hashes, event
   count, and FullSnapshot indexes?
5. Can a same-literal or default-only fixture pass while a transform, ordering,
   persistence, or privacy regression is present?
6. Do V1 and V2 gates compare the decoded logical event stream, including
   fragmentation, ordering, and the recording-end marker?
7. Do privacy gates search persisted FullSnapshot, IncrementalSnapshot,
   storage, and ingest payloads for distinct synthetic sentinels?
8. Do lifecycle gates prove post-stop/post-destroy silence and resource release,
   rather than only wrapper removal or absence of an exception?
9. Are the Monitors V1/V2 and legacy static-player claims exercised in a real
   browser route? Mocked Jest tests and README statements do not qualify.
10. Has a consumer, package lock, CDN literal, transport format, extension
    default, fixture, or deployment artifact changed since the last census?
11. Is every patch-ledger row still necessary after the latest upstream base,
    and is its deletion condition executable?
12. Are external actions and explicitly excluded architecture changes still
    absent from the patch stack?

## Deterministic Reconciliation

From the repository root, run:

```sh
node docs/junify/contracts/reconcile-contract-inventory.mjs
node -e "JSON.parse(require('fs').readFileSync('docs/junify/contracts/contract-inventory.json','utf8'))"
git diff --check
```

The reconciliation command treats JSON as the source of truth and compares a
deterministically generated Markdown matrix containing all 11 required fields.
It also verifies that each gate has exactly one runbook heading and compares
status counts. Prove gate and non-gate descriptive-field sensitivity with
`node docs/junify/contracts/reconcile-contract-inventory.mjs --simulate-gate-divergence`;
and
`node docs/junify/contracts/reconcile-contract-inventory.mjs --simulate-description-divergence`.
Both commands must fail with a generated-matrix mismatch. The layer summary
is non-exclusive: one contract may count in more than one layer.

## Evidence And Verdict Log

Append one row per audit. Findings must name the affected contract ID and use
one of: `blocking`, `non-blocking`, or `clear`.

| Date | Scope | Reviewer | Evidence checked | Verdict and follow-up |
| --- | --- | --- | --- | --- |
| 2026-08-17 | Task 1 initial census | implementing agent | approved design; rrweb baseline and cached fork history; dedicated extension and Rails worktrees; read-only service source/build/zip census; fixture metadata | Initial documentation committed at `ff1f9236`; independent reconciliation checkpoint required before the next implementation task or merge. |
| 2026-08-17 | Task 1 fix round 1 | independent reviewer plus implementing agent | human/JSON gate fields; candidate ledger; service artifact labels; audit checkpoint | Important findings fixed: stable gate IDs now reconcile through a sensitivity-checked script; PR 1806 and non-candidate boundaries are explicit; artifact evidence is accurately labeled. |
| 2026-08-17 | Task 1 fix round 2 | scoped re-review plus implementing agent | all 11 required inventory fields; generated Markdown matrix; gate and descriptive mutation probes | JSON is the single source of truth; deterministic generation/comparison rejects drift in any required human-readable field before the next implementation task or merge. |
| 2026-08-17 | Task 2 real-browser characterization | implementing agent self-review | authentic named producer bundles and registry integrity; deterministic synthetic local page; gzip/raw hashes; scenario evidence; four-artifact official 2.1.1 Chrome replay; exact 13,600,000-byte CSS; privacy scan; zero skips | Package-local evidence is clear. No contract is promoted: Rails candidate surfaces, extension fragmentation, future candidate producer, and end-to-end privacy sinks remain blocking obligations. Synthetic privacy leaks are recorded as release-blocking Task 6 input. |

## Promotion And Escalation Rules

- Promote to `covered` only after the exact gate exists, runs successfully, and
  observes every effect claimed by that contract.
- Keep a feasible missing gate as `must-cover`; use `red-known-risk` when the
  evidence shows a known high-risk weakness. Do not downgrade risk to make the
  count look healthier.
- Use `not-testable-yet` only with a concrete blocker and an executable command
  for the moment it clears. Dependency setup work alone is not a blocker.
- A failed or flaky gate blocks the corresponding promotion. Record the exact
  command, failure, owner, and next action in this log.
- Any privacy sentinel reaching a persisted payload, any historical fixture
  becoming unreadable, any V1/V2 logical-stream difference, or any post-stop
  event is release-blocking.
- Changing an `out-of-scope` boundary requires an approved design change before
  implementation.
