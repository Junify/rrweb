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

| Date       | Scope                                | Reviewer                                     | Evidence checked                                                                                                                                                                                                                                         | Verdict and follow-up                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-17 | Task 1 initial census                | implementing agent                           | approved design; rrweb baseline and cached fork history; dedicated extension and Rails worktrees; read-only service source/build/zip census; fixture metadata                                                                                            | Initial documentation committed at `ff1f9236`; independent reconciliation checkpoint required before the next implementation task or merge.                                                                                                                                                                                                                                                          |
| 2026-08-17 | Task 1 fix round 1                   | independent reviewer plus implementing agent | human/JSON gate fields; candidate ledger; service artifact labels; audit checkpoint                                                                                                                                                                      | Important findings fixed: stable gate IDs now reconcile through a sensitivity-checked script; PR 1806 and non-candidate boundaries are explicit; artifact evidence is accurately labeled.                                                                                                                                                                                                            |
| 2026-08-17 | Task 1 fix round 2                   | scoped re-review plus implementing agent     | all 11 required inventory fields; generated Markdown matrix; gate and descriptive mutation probes                                                                                                                                                        | JSON is the single source of truth; deterministic generation/comparison rejects drift in any required human-readable field before the next implementation task or merge.                                                                                                                                                                                                                             |
| 2026-08-17 | Task 2 real-browser characterization | implementing agent self-review               | declared producer package/version and manifest integrity; deterministic synthetic local page; gzip/raw hashes; scenario markers; four-artifact official 2.1.1 Chrome replay; exact 13,600,000-byte CSS; privacy scan; zero skips                         | Initial package-local evidence was observed-only for producer authenticity and marker-sensitive scenarios; fix round 1 must authenticate loaded bytes and add mutation-sensitive sinks. No contract is promoted. Synthetic privacy leaks remain release-blocking Task 6 input.                                                                                                                       |
| 2026-08-17 | Task 2 fix round 1                   | implementing agent                           | yarn.lock integrity and live registry tarball SHA-512; tar-extracted versus loaded UMD SHA-256; temporary real-browser recollection; target-ID mutation rollback; marker-terminated SPA/seek-ready/stylesheet sinks                                      | Two Important findings closed package-locally. Explicit seek stays blocked on Task 4; Rails candidate surfaces, future candidate producer, extension transport, and privacy sinks remain unpromoted.                                                                                                                                                                                                 |
| 2026-08-17 | Task 3 fix round 1                   | implementing agent                           | exact declaration diagnostic tuples/counts/paths/messages and fresh declaration digests; isolated packed ESM/CJS/UMD/CSS/type consumers; observed local module paths/digests; collected same-code/path-drift/official-CSS mutations                      | Both package-boundary contracts are promoted to `covered`. Candidate producer/Rails surfaces remain `must-cover`; no publish, push, deploy, or external release occurred.                                                                                                                                                                                                                            |
| 2026-08-17 | Task 4 explicit-seek correction      | implementing agent                           | authentic stable RED; focused forward/backward public-time and visible-iframe sinks; eight historical candidate seeks; 13.6 MB CSSOM/visible-DOM rebuild and official/candidate timing; existing replayer regression suite                               | `junify.replay.seek-visible-dom` is promoted to `covered`. PR 1806 remains excluded because it targets a narrower destroy-order issue and no separate differential RED justified mixing it into SEEK-001. No fixture bytes or wire format changed.                                                                                                                                                   |
| 2026-08-17 | Task 5 Canvas processor              | implementing agent                           | authentic API and recordDOM-disabled-stop RED; processor transfer/error/timeout/dispose tests; real-Chrome injection/CSP/stop/WebGL screenshot tests; temporary persisted JSON Canvas2D/WebGL replay pixels                                              | `CANVAS-001` is implemented locally without changing official types or wire format. Both Canvas inventory rows stay `red-known-risk` until the real packaged MV3 worker and broader repeated-recorder lifecycle gates run in Tasks 9 and 7.                                                                                                                                                          |
| 2026-08-17 | Task 5 fix round 1                   | independent reviewer plus implementing agent | throwing error-observer worker-error and silent-timeout REDs; real-Chrome throwing-disposer stop/restart/late-result RED; focused recorder/replayer and persisted compatibility regression gates                                                         | Both Important findings are closed: observer notification cannot interrupt worker settlement/cleanup, and an injected disposer failure cannot escape or interrupt idempotent recorder stop cleanup. Canvas row status and residual Task 7/9 gates are unchanged.                                                                                                                                     |
| 2026-08-17 | Task 6 package-local privacy         | implementing agent                           | authentic hidden/placeholder/autocomplete/dynamic-password REDs; FullSnapshot/Mutation/Input/add payloads; temporary persisted JSON; textarea characterization; negative controls; null removal                                                          | `PRIV-001` through `PRIV-004` are implemented locally with no schema change. `junify.privacy.persisted-sentinels` remains `red-known-risk` because real extension storage and V1/V2 request scans remain Task 9 gates.                                                                                                                                                                               |
| 2026-08-17 | Task 6 fix round 1                   | independent reviewer plus implementing agent | post-start and temporary dynamic-password REDs; same-batch hidden/autocomplete old-state REDs; unique-length exact source/node/value persisted sentinels; missing-event probes; post-batch normal-text control                                           | Both Critical findings and the Important false-confidence finding are closed package-locally by `78ecd7ee`, `2d392acc`, and `44b2ad41`; `9abed2d8` makes the pre-existing deferred property-hook gate wait for exact node/source/value evidence, and `e6ea1474` preserves accessor receivers while satisfying the zero-error lint gate. The event schema and Task 9 residual boundary are unchanged. |
| 2026-08-17 | Task 6 fix round 2                   | scoped re-review plus implementing agent     | assigned/unassigned setAttribute and removeAttribute password transitions; exact Input/add-node persisted sinks; post-batch same-node and unrelated controls; page-realm hook stop/restart identity and third-party-patch guard                          | The remaining Critical attribute-method path is closed by `aee70828`: synchronous Input and added-node serialization are masked through the bounded observer interval, stale normal text remains visible, and exact prototype methods are restored without clobbering a later patch. The event schema and Task 9 residual boundary are unchanged.                                                    |
| 2026-08-17 | Task 6 fix round 3                   | scoped re-review plus implementing agent     | retained inner rrweb proxy after a later third-party wrapper; post-stop timer/state activity; double stop; restart active/inactive transitions; normal-value negative control                                                                            | The Important lifecycle finding is closed by `93ba20d3`: both owned attribute proxies become inert before cleanup continues, third-party identity remains intact, and a restarted recorder masks during only its active interval. The event schema and Task 9 residual boundary are unchanged.                                                                                                       |
| 2026-08-17 | Task 7 recorder lifecycle            | implementing agent                           | authentic stable 50-cycle listener/MO/RAF/timer and event-sink RED; iframe navigation/removal generations; iterative permanent mirror release; shared stylesheet host refcounts; shadow removal/replacement; Canvas and WebKit restart; throwing cleanup | `junify.lifecycle.recorder-stop` is promoted to `covered` by `9a48eb58`: candidate counts remain exactly zero and post-stop events remain unchanged across 50 real-Chrome cycles. No wire schema, cross-origin behavior, or production MV3 boundary changed; Tasks 8/9 remain separate.                                                                                                              |
| 2026-08-17 | Task 7 independent review            | independent reviewer                         | pending stylesheet load listener/timer; Canvas cancellation throw and recorder finalization; iframe pagehide interval; final constructed-sheet owner; copied WebKit runbook command                                                                      | No Critical and five Major findings; the initial promotion is not approvable until each source-to-sink partition is reproduced and fixed.                                                                                                                                                                                                                                                            |
| 2026-08-17 | Task 7 fix round 1                   | implementing agent                           | exact listener/timer RED over pending-link cycles; stale old-document mutation at pagehide; throwing cancelAnimationFrame/global state; no-op releaseHost mutation; actual WebKit config; full six-case Chrome lifecycle                                 | `4c79346a` closes the five Major findings: focused 4/4 and full lifecycle 6/6 GREEN, final resource counts zero, final-owner mutation sensitivity proven, and actual WebKit gate 1/1. The event schema and Tasks 8/9 boundaries remain unchanged; scoped re-review is required.                                                                                                                      |
| 2026-08-17 | Task 7 fix round 1 re-review         | scoped independent reviewer                  | correction `4c79346a`; pending-link ownership; Canvas/recorder exception finalization; captured-generation pagehide; final stylesheet owner/re-adopt sinks; copied WebKit command; Chrome lifecycle, WebKit, and typecheck                               | No Critical or Major findings. All five prior Major findings are closed; independent lifecycle 6/6, WebKit 1/1, and rrweb typecheck pass. Task 7 is approvable at P0/P1 scope.                                                                                                                                                                                                                       |
| 2026-08-17 | Task 8 replayer lifecycle and guards | implementing agent                           | authentic stable 50-cycle Timer/service/handler/listener/map/late-sink RED; cleanup-throw containment; exact Mixpanel/Sentry malformed-event RED/GREEN; persisted JSON candidate replay; historical seek and WebGL regressions                           | `junify.lifecycle.replayer-destroy` is promoted to `covered` by `970cc0ce`; `d34d4760` implements `DEF-001`/`DEF-002` without dropping following valid events. Cross-origin PRs 121-123, schema changes, and an unproven WebGL WeakMap change remain excluded. Independent P0/P1 review is required before Task 8 is approvable.                                                                     |
| 2026-08-17 | Task 8 independent review            | independent reviewer                         | full `724c85ac..e31fbaa6` production/test/docs diff; lifecycle sink preconditions; teardown ordering; throwing cleanup; malformed media/style negative controls and persisted replay                                                                     | No Critical and one Major finding. A throwing host `cancelAnimationFrame` can prevent Timer state/action invalidation and let a scheduled action run after destroy. The ownership census masking concern is closed by `e31fbaa6`; Task 8 remains unapprovable until the Timer RED/fix is verified.                                                                                                   |
| 2026-08-17 | Task 8 fix round 1 and re-review     | implementing agent plus scoped reviewer      | authentic throwing-`cancelAnimationFrame` late-action RED; Timer generation invalidation and fail-closed state clear in `ccf6c1f3`; lifecycle/replayer/seek/WebGL 54/54; persisted historical matrix 3/3; typecheck/lint                                 | The Major is closed: the RED observed one late action and an active Timer after destroy; the candidate observes zero late actions, inactive Timer, and empty actions while global teardown completes. Scoped re-review reports no Critical or Major findings and Ready: yes.                                                                                                                         |

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
