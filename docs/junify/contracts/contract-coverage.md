<!-- markdownlint-disable MD013 MD043 -->

# Contract Coverage Matrix

## Honest Baseline

Task 1 establishes obligations; it does not create compatibility fixtures or
run the expensive cross-repository gates. A contract is not `covered` because
an adjacent unit test, a mocked Jest test, a README, or a build exists.

Task 2 adds package-local real-browser evidence without prematurely promoting
the cross-repository contracts. Authentic alpha.4, Junify alpha.19, Junify
alpha.20, and official 2.1.1 recordings now carry producer/browser provenance,
raw and gzip hashes, event counts, FullSnapshot indexes/payload digests, and
source-derived scenario coverage. Official 2.1.1 replays all four comprehensive
artifacts in Chrome with no skips; a separate official 2.1.1 artifact contains
exactly 13,600,000 bytes of deterministic CSS. Rails candidate surfaces,
extension fragmentation/reassembly, and the future Junify candidate producer
remain outside this package-local proof, so the status counts do not change.

The only currently `covered` inventory row is
`junify.rails.password-rotation-artifact`: a recorded Playwright gate crosses
artifact metadata, a production-shaped file URL, Base64+gzip decoding, a real
rrweb-player iframe, visible DOM, and interactive controls. Its synthetic
fixture still cannot prove alpha producer compatibility or either Monitors
pipeline.

## Status Summary

| Status | Count | Meaning here |
| --- | ---: | --- |
| `covered` | 1 | executable boundary evidence exists and its exact gate is recorded |
| `must-cover` | 13 | important, feasible contract lacks adequate boundary evidence |
| `red-known-risk` | 6 | P0/P1 behavior is known to require a fix or stronger proof and is not accepted |
| `out-of-scope` | 4 | explicit boundary with reason; not silently omitted |
| `accepted-current-behavior` | 0 | no surprising behavior was accepted as a permanent contract |
| `not-testable-yet` | 0 | missing future harnesses are feasible work, so they remain `must-cover`/`red-known-risk` with exact blockers |

## Recommended Layer Summary

Layer counts are non-exclusive.

| Recommended layer | Total contracts | `covered` | `must-cover` | `red-known-risk` | `out-of-scope` |
| --- | ---: | ---: | ---: | ---: | ---: |
| static analysis | 3 | 0 | 2 | 0 | 1 |
| integration | 14 | 0 | 8 | 6 | 0 |
| E2E | 12 | 1 | 6 | 5 | 0 |
| workflow-contract | 4 | 1 | 3 | 0 | 0 |
| golden/replay | 6 | 0 | 5 | 1 | 0 |

## Risk-First Closure Order

| Priority | Contract IDs | Required evidence before status changes |
| --- | --- | --- |
| P0 privacy | `junify.privacy.persisted-sentinels` | failing-first initial/mutation sentinels plus absence from extension storage and V1/V2 request bodies |
| P0 compatibility | `junify.compatibility.wire-format`, `junify.compatibility.historical-replay`, `junify.compatibility.candidate-recorder` | provenance-locked real-browser fixtures replayed across both candidate surfaces |
| P1 seek | `junify.replay.seek-visible-dom` | forward/backward visible DOM assertions at the first post-seek sync |
| P1 Canvas | both `junify.canvas.*` IDs | packaged MV3 worker, fallback, transfer/close, application/replay pixel, and long-session cleanup evidence |
| P1 lifecycle | both `junify.lifecycle.*` IDs | repeated real-browser churn with retained-resource and no-post-stop/destroy assertions |
| P1 transport | `junify.extension.persistence` and all `junify.transport.*` IDs | real storage plus decoded V1/V2 parity including oversized UTF-8 fragmentation |
| P1 Rails | Monitors V1/V2 and legacy static IDs | production-shaped browser routes; mocks and README do not qualify |
| build boundary | both `junify.package-boundary.*` IDs | packed-artifact imports/exports and proof that internal names remain upstream |

## Existing Evidence That Is Useful But Insufficient

| Evidence | Protects | Does not protect |
| --- | --- | --- |
| upstream rrweb snapshot/input tests | local masking and serialization branches | Junify recorder configuration or final persisted payloads |
| upstream replay/seek tests | broad synthetic seek behavior | Junify trace visible DOM immediately after an explicit offset change |
| upstream destroy test | visible wrapper removal | pending timers, image/stylesheet callbacks, iframe maps, retained roots |
| upstream cross-origin stop test | stop does not throw in one iframe transition | no post-stop events, repeated churn, Canvas worker/RAF cleanup |
| browser-extension Jest tests | local queue/flusher branches | real MV3 worker, Chrome storage, and ingest artifact |
| Rails parser/loader/player Jest tests | local compatibility parsing and component wiring | Monitors V1/V2 browser route through persisted reads |
| static-player README/build | intended message protocol and packaging | any accepted fixture rendered in a browser |
| service real recordings | service pipeline scale and varied rrweb markers | producer version, privacy provenance, 13.6 MB CSS, Rails playback |
| Task 2 provenance-locked fixtures | exact named producer bundles, browser recording, package-local official 2.1.1 replay, DOM/SPA/Shadow/stylesheet/Canvas/seek-ready markers, hashes, and 13.6 MB CSS | future Junify candidate output, Rails main/static consumers, extension storage/transport/fragmentation, or privacy acceptance |

## Task 2 Privacy Characterization

The fixtures contain only distinct synthetic values. Scans are assertions of
observed historical behavior, not privacy acceptance: password and dynamic
password sentinels are absent; placeholder, hidden, and sensitive-autocomplete
sentinels occur in all four comprehensive artifacts; alpha.4 additionally
contains the textarea sentinel. `junify.privacy.persisted-sentinels` therefore
remains `red-known-risk`, and Task 6 must prove absence through Chrome storage
and both ingest request bodies.

## Status Transition Rules

1. Move a row to `covered` only after its exact gate exists, runs without a
   hidden skip, observes the documented sink, and records pass/fail/skip counts
   or deterministic artifact hashes.
2. A local mock may supplement but never replace the real MV3, privacy,
   Canvas, persisted-artifact, or lifecycle boundary.
3. A behavior intentionally frozen despite risk moves to
   `accepted-current-behavior` only with explicit owner approval and an
   executable characterization test.
4. A missing credential/environment does not erase the obligation. Record the
   exact command, missing prerequisite, owner, and next action in the runbook;
   use `not-testable-yet` only when the blocker makes the contract genuinely
   untestable rather than merely not yet implemented.
5. Every task that closes a row updates both inventory files, this matrix, the
   gate evidence, and any corresponding patch-ledger entry in the same commit.
