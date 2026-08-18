<!-- markdownlint-disable MD013 MD043 -->

# Contract Coverage Matrix

## Honest Baseline

Task 1 establishes obligations; it does not create compatibility fixtures or
run the expensive cross-repository gates. A contract is not `covered` because
an adjacent unit test, a mocked Jest test, a README, or a build exists.

Task 2 adds package-local real-browser evidence without prematurely promoting
the cross-repository contracts. Alpha.4, Junify alpha.19, Junify alpha.20, and
official 2.1.1 recordings now carry producer/browser provenance, raw and gzip
hashes, event counts, FullSnapshot indexes/payload digests, and source-derived
scenario coverage. Fix round 1 authenticates the actually loaded UMD bytes
against integrity-locked registry tarballs and recollects all four comprehensive
artifacts into temporary storage for timestamp-normalized comparison. SPA and
seek-ready coverage now requires target-ID type-3 mutations; marker-terminated
replays assert SPA DOM, both seek-ready DOM states, and replaceSync/replace/empty
computed-style sinks. Official 2.1.1 full-replays all four artifacts in Chrome
with no skips; a separate official 2.1.1 artifact contains exactly 13,600,000
bytes of deterministic CSS. Explicit forward/backward seek, Rails candidate
surfaces, extension fragmentation/reassembly, and the future Junify candidate
producer remain outside this package-local proof.

Task 3 closes only the two package-boundary rows. Fresh tarballs are installed
in isolated consumers and exercised through ESM, CJS, real-browser UMD, CSS,
and strict TypeScript paths. The builds record actually loaded local source
paths and SHA-256 digests; collected mutations reject declaration diagnostic
count/path drift and an official replay CSS resolution. The previously covered
`junify.rails.password-rotation-artifact` remains narrow: its synthetic fixture
still cannot prove alpha producer compatibility or either Monitors pipeline.

Task 4 closes `junify.replay.seek-visible-dom`. An unmodified 2.1.1 candidate
fails both forward and backward cases after casting the target event: public
time advances past the mutation while the visible iframe stays at
`before-seek`. The minimal patch makes both directions render `after-seek`,
then the candidate bundle seeks all four authenticated historical producers in
both directions. The 13.6 MB FullSnapshot keeps its exact CSSOM rule count and
visible marker; an official/candidate timing differential is recorded without
turning one workstation sample into a bundle-performance claim.

Task 5 implements the local `CANVAS-001` patch without promoting either
cross-repository Canvas row. Unit and real-Chrome gates cover processor
injection, transfer/fallback/error/timeout/dispose, transparent and unchanged
suppression, format/dimension changes, bitmap closure, post-stop silence,
failure containment for injected error/dispose callbacks, non-destructive
WebGL screenshots, and a JSON-persisted candidate Canvas2D/WebGL
record-to-replay pixel round trip. Task 7 separately closes package-local
long-session/restart cleanup. The extension's packaged MV3 worker remains an
observable effect of both cross-repository Canvas rows, so production MV3 Task
9 evidence remains required.

Task 6 closes the package-local privacy gaps without over-promoting the
cross-repository contract. Authentic stable REDs cover hidden values,
placeholder values, all approved sensitive-autocomplete tokens, the leaking
value-before-type password mutation order, and synchronous Input emission
before the observer flush. Fix round 1 extends that proof to post-start password
nodes, temporary text-password-text state, both hidden-to-text value orders,
and both sensitive-autocomplete removal/value orders. Fix round 2 adds page-
realm `setAttribute` and `removeAttribute` password transitions for assigned
and newly added nodes, including exact method restoration on stop/restart and
non-destructive handling of a later third-party patch. Fix round 3 proves the
retained inner rrweb proxy becomes inert on stop: post-stop attribute calls
schedule no privacy timer, touch no transient classification, and a fresh
recorder masks only its own active interval. Candidate tests scan
serialized FullSnapshot, Mutation, Input, and dynamically added-node payloads
plus a temporary persisted JSON artifact. Every private source has a unique
mask length and an exact node/source/value assertion, so one field's stars
cannot substitute for another field or for a missing event. Textarea protection
remains inherited from upstream 2.1.1; removal remains `null`; same-node and
unrelated normal controls remain visible after classification expires.
`junify.privacy.persisted-sentinels`
stays `red-known-risk` until Task 9 observes real extension Chrome storage and
decoded V1/V2 request bodies.

Task 7 closes `junify.lifecycle.recorder-stop` with a real-Chrome source-to-
sink gate, not WeakRef-only evidence. Unmodified stable grows by two listeners
and two Canvas RAFs per cycle and emits two late events; after 50 cycles it
retains 100 listeners and 100 RAFs. The candidate keeps baseline, first, last,
and final listener/MutationObserver/RAF/timer counts at zero, emits nothing
after idempotent stop, and keeps dynamic-password literals out of the payload.
Separate fixtures prove iframe navigation/removal generation disposal,
iterative permanent mirror/metadata release, shared constructed-stylesheet
host refcounts, removed-shadow silence plus replacement liveness, cleanup-
throw containment, and WebKit untainted-MutationObserver stop/restart. The
packaged MV3 worker remains a Task 9 Canvas boundary; it does not prevent the
package-local recorder lifecycle row from closing.

Fix round 1 closes five Major review gaps before retaining that promotion: ten
pending-link cycles release their exact listener/timer ownership; iframe
`pagehide` releases the old generation before replacement load; Canvas and
recorder-scope cleanup exceptions cannot interrupt global finalization; the
constructed-sheet fixture releases its final owner and proves definition plus
rule events after re-adoption; and the runbook executes the actual WebKit
configuration. A collected no-op `releaseHost` mutation fails the strengthened
stylesheet gate.

## Status Summary

| Status                      | Count | Meaning here                                                                                                 |
| --------------------------- | ----: | ------------------------------------------------------------------------------------------------------------ |
| `covered`                   |     5 | executable boundary evidence exists and its exact gate is recorded                                           |
| `must-cover`                |    11 | important, feasible contract lacks adequate boundary evidence                                                |
| `red-known-risk`            |     4 | P0/P1 behavior is known to require a fix or stronger proof and is not accepted                               |
| `out-of-scope`              |     4 | explicit boundary with reason; not silently omitted                                                          |
| `accepted-current-behavior` |     0 | no surprising behavior was accepted as a permanent contract                                                  |
| `not-testable-yet`          |     0 | missing future harnesses are feasible work, so they remain `must-cover`/`red-known-risk` with exact blockers |

## Recommended Layer Summary

Layer counts are non-exclusive.

| Recommended layer | Total contracts | `covered` | `must-cover` | `red-known-risk` | `out-of-scope` |
| ----------------- | --------------: | --------: | -----------: | ---------------: | -------------: |
| static analysis   |               3 |         2 |            0 |                0 |              1 |
| integration       |              14 |         4 |            6 |                4 |              0 |
| E2E               |              12 |         2 |            6 |                4 |              0 |
| workflow-contract |               4 |         1 |            3 |                0 |              0 |
| golden/replay     |               6 |         1 |            5 |                0 |              0 |

## Risk-First Closure Order

| Priority         | Contract IDs                                                                                                            | Required evidence before status changes                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| P0 privacy       | `junify.privacy.persisted-sentinels`                                                                                    | failing-first initial/mutation sentinels plus absence from extension storage and V1/V2 request bodies                                      |
| P0 compatibility | `junify.compatibility.wire-format`, `junify.compatibility.historical-replay`, `junify.compatibility.candidate-recorder` | provenance-locked real-browser fixtures replayed across both candidate surfaces                                                            |
| P1 seek (closed) | `junify.replay.seek-visible-dom`                                                                                        | Task 4 authentic RED/GREEN, eight historical candidate seeks, public time/visible DOM, and 13.6 MB CSSOM/timing evidence                   |
| P1 Canvas        | both `junify.canvas.*` IDs                                                                                              | Task 5 closes local API/fallback/transfer/pixel behavior; packaged MV3 worker and long-session cleanup evidence remain                     |
| P1 recorder lifecycle (closed) | `junify.lifecycle.recorder-stop`                                                                                | Task 7 real-Chrome 50-cycle source-to-sink churn, generation/retention sinks, WebKit restart, and cleanup-throw containment                |
| P1 replayer lifecycle | `junify.lifecycle.replayer-destroy`                                                                                  | repeated real-browser create/play/seek/destroy churn with retained-resource and no-post-destroy assertions                                |
| P1 transport     | `junify.extension.persistence` and all `junify.transport.*` IDs                                                         | real storage plus decoded V1/V2 parity including oversized UTF-8 fragmentation                                                             |
| P1 Rails         | Monitors V1/V2 and legacy static IDs                                                                                    | production-shaped browser routes; mocks and README do not qualify                                                                          |
| build boundary   | both `junify.package-boundary.*` IDs                                                                                    | closed by Task 3 packed-artifact imports/exports, observed local-source provenance, strict declaration gates, and upstream namespace proof |

## Existing Evidence That Is Useful But Insufficient

| Evidence                              | Protects                                                                                                                                                                                                           | Does not protect                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| upstream rrweb snapshot/input tests   | local masking and serialization branches                                                                                                                                                                           | Junify recorder configuration or final persisted payloads                                                                               |
| upstream replay/seek tests            | broad synthetic seek behavior                                                                                                                                                                                      | Junify legacy-sibling trace by itself; Task 4 adds that focused public-time/visible-DOM gate                                            |
| upstream destroy test                 | visible wrapper removal                                                                                                                                                                                            | pending timers, image/stylesheet callbacks, iframe maps, retained roots                                                                 |
| upstream cross-origin stop test       | stop does not throw in one iframe transition                                                                                                                                                                       | no post-stop events, repeated churn, Canvas worker/RAF cleanup                                                                          |
| browser-extension Jest tests          | local queue/flusher branches                                                                                                                                                                                       | real MV3 worker, Chrome storage, and ingest artifact                                                                                    |
| Rails parser/loader/player Jest tests | local compatibility parsing and component wiring                                                                                                                                                                   | Monitors V1/V2 browser route through persisted reads                                                                                    |
| static-player README/build            | intended message protocol and packaging                                                                                                                                                                            | any accepted fixture rendered in a browser                                                                                              |
| service real recordings               | service pipeline scale and varied rrweb markers                                                                                                                                                                    | producer version, privacy provenance, 13.6 MB CSS, Rails playback                                                                       |
| Task 2 authenticated fixtures         | loaded UMD-to-registry-tarball integrity, temporary real-browser regeneration, target-ID mutation evidence, marker-terminated SPA/seek-ready/stylesheet sinks, full official 2.1.1 replay, hashes, and 13.6 MB CSS | future Junify candidate recording output, Rails main/static consumers, extension storage/transport/fragmentation, or privacy acceptance |
| Task 5 local Canvas gates             | injectable factories, worker failure/timeout/dispose, strict fallback, application/replay pixels, temporary JSON persistence, and post-stop silence                                                                | browser_extension packaged-worker execution under real MV3 or bridge/Blob URL cleanup                                                    |
| Task 7 recorder lifecycle gate        | 50-cycle post-stop silence and exact listener/MO/RAF/timer counts; iframe/shadow/stylesheet/mirror generation release; WebKit stop/restart; throwing cleanup containment                                             | production MV3 packaged-worker execution, extension persistence/transport, or replayer teardown                                          |

## Privacy Characterization And Local Fixes

The fixtures contain only distinct synthetic values. Scans are assertions of
observed historical behavior, not privacy acceptance: password and dynamic
password sentinels are absent; placeholder, hidden, and sensitive-autocomplete
sentinels occur in all four comprehensive artifacts; alpha.4 additionally
contains the textarea sentinel. `junify.privacy.persisted-sentinels` remains
`red-known-risk`. Task 6 proves candidate absence through snapshot,
real-recorder, and temporary persisted-JSON sinks; Task 9 must still prove real
Chrome storage and both ingest request bodies.

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
