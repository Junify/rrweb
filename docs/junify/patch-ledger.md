<!-- markdownlint-disable MD013 MD043 -->

# Junify Patch Ledger

## Policy

The integration branch starts from exact upstream stable
`3deb6e7da4528ddb33b5b7ff6a3e805d4ed14930`. Each retained concern is
reimplemented only after a failing test demonstrates the gap. Raw Junify or
vendor commits are evidence, not cherry-pick units. Every implementation
commit updates this ledger with RED/GREEN evidence and remains independently
revertible.

`planned` means approved for failing-first evaluation; it does not claim the
patch is already present or that coverage is green.

## Ledger

| Patch ID       | State                           | Reason / Junify contract                                                                                                                                     | Source reference                                                                                                                                   | Required tests/gate                                                                                   | Upstream status                                                                                          | Delete when                                                                                                       |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `BND-001`      | implemented; release-gated      | Publish only `@junify-app/rrweb@2.1.1-junify.0`; preserve official internal identities (`junify.package-boundary.rrweb`)                                     | approved integration design; old namespace rewrite `af62ec15` is negative reference only                                                           | `G-PKG-RRWEB`; packed artifact export/name inspection; Task 3 evidence below                          | Junify package boundary is not an upstream concern                                                       | Junify no longer publishes a forked rrweb boundary                                                                |
| `BND-002`      | implemented; release-gated      | Publish `@junify-app/rrweb-player@2.1.1-junify.0` and force it to bundle the patched local replayer (`junify.package-boundary.player`)                       | approved integration design; old scoped player package is behavior reference only                                                                  | `G-PKG-PLAYER`; prove packed player does not resolve unpatched official replay; Task 3 evidence below | Junify package boundary is not an upstream concern                                                       | player can consume an upstream release that includes every required Junify replayer patch, or the fork is retired |
| `SEEK-001`     | implemented; upstream-candidate | First synchronization after explicit forward/backward seek must use correct real DOM (`junify.replay.seek-visible-dom`)                                      | Junify `8d0afa80f6fdf94226c914964a7a647c7f44f9c5`; upstream PR 1806 evaluated as a narrower separate issue                                         | `G-SEEK`; focused RED/GREEN plus eight authenticated historical seeks and 13.6 MB timing              | absent from 2.1.1; suitable for a focused upstream correctness PR with the behavior fixture              | an upstream stable release passes the same forward/backward fixture without this patch                            |
| `CANVAS-001`   | implemented; consumer-gated     | Preserve consumer-used injected ImageBitmap processor, packaged MV3 worker, inline fallback, transfer/close, and non-destructive capture (`junify.canvas.*`) | Junify `45ea914e78f70f54d386bf341f7d55567f200b68`; Sentry PR 307 / `027138c9`; upstream Vite PR 1762 / `22bc4c33` does not replace packaged worker | `G-CANVAS-PROCESSOR`, `G-CANVAS-PIXELS`; Task 5 local RED/GREEN plus Task 9 production MV3 evidence   | injectable API absent from 2.1.1; upstream Vite 6 still uses an inline-worker import                     | upstream exposes an equivalent tested injectable/packaged-worker API and passes Junify MV3/pixel/cleanup gates    |
| `PRIV-001`     | planned                         | Mask hidden input values in initial and mutated persisted payloads (`junify.privacy.persisted-sentinels`)                                                    | Mixpanel PR 4 / `c68ae046`; upstream open PR 1745                                                                                                  | `G-PRIVACY`; unique hidden-value sentinels absent from Full/Incremental/storage/V1/V2                 | absent from 2.1.1                                                                                        | upstream stable masks hidden inputs under the Junify policy and passes the same persisted sentinel gate           |
| `PRIV-002`     | planned                         | Mask placeholders for masked inputs/textareas, including mutations (`junify.privacy.persisted-sentinels`)                                                    | Mixpanel PR 18 / `2a8326d0`                                                                                                                        | `G-PRIVACY`; unique initial/mutated placeholder sentinels                                             | absent from 2.1.1                                                                                        | upstream stable provides equivalent placeholder masking and passes the persisted sentinel gate                    |
| `PRIV-003`     | planned                         | Always protect values for sensitive autocomplete tokens (`junify.privacy.persisted-sentinels`)                                                               | Sentry PR 166 / `432fe1f9`                                                                                                                         | `G-PRIVACY`; distinct autocomplete sentinels absent from all persisted sinks                          | absent from 2.1.1                                                                                        | upstream stable provides equivalent sensitive-autocomplete handling and passes the persisted sentinel gate        |
| `LIFE-REC-001` | planned                         | Stop must release MutationObserver, iframe, stylesheet, shadow-root, Canvas RAF/worker, and mirror resources (`junify.lifecycle.recorder-stop`)              | PostHog PRs 91, 94, 142, 157, 159, 162, 163 as a coherent train; Mixpanel PRs 8 and 12 / upstream PR 1791 as design references                     | `G-RECORDER-LIFECYCLE`; record churn count/duration/retention assertions                              | coherent cleanup behavior absent/incomplete in 2.1.1; isolated PostHog PR 142 has follow-up shadow fixes | upstream stable passes the full bounded-churn gate without Junify adaptation                                      |
| `LIFE-REP-001` | planned                         | Destroy must release timers, subscriptions, pending callbacks, iframe maps, and roots (`junify.lifecycle.replayer-destroy`)                                  | PostHog PRs 92, 121, 122, 123                                                                                                                      | `G-REPLAYER-LIFECYCLE`; no callback/reference after repeated destroy                                  | 2.1.1 destroy test proves wrapper removal only                                                           | upstream stable passes the complete lifecycle gate without Junify adaptation                                      |
| `DEF-001`      | planned                         | Malformed legacy media nodes must not abort replay matrix (`junify.compatibility.historical-replay`)                                                         | Mixpanel PR 10 / `dfeeb602`; upstream open PR 1673                                                                                                 | `G-REPLAYER-LIFECYCLE` plus malformed legacy fixture in replay matrix                                 | absent from 2.1.1                                                                                        | upstream stable contains the guard and passes the legacy fixture                                                  |
| `DEF-002`      | planned                         | Missing/null style `rules` must not abort legacy replay (`junify.compatibility.historical-replay`)                                                           | Sentry PR 162 / `0b0e26db`                                                                                                                         | `G-REPLAYER-LIFECYCLE` plus missing-rules legacy fixture in replay matrix                             | absent from 2.1.1                                                                                        | upstream stable contains the guard and passes the legacy fixture                                                  |

## Task 3 Boundary Evidence

`BND-001` and `BND-002` add only consumer-facing package boundaries. All
monorepo package names, source imports, and production dependency names remain
official upstream identities. Both manifests use the exact prerelease version
`2.1.1-junify.0`; neither artifact was published, pushed, deployed, or added to
the upstream fixed changeset group. Publication remains release-gated.

- RED: Node 20.9.0 rejected both boundary workspace commands as unknown, and
  the direct packed-artifact tests failed because both manifests/artifacts were
  absent.
- GREEN: Node 20.9.0 builds and isolated packed-artifact tests pass for core
  (9/9) and player (9/9), covering ESM, CJS, browser UMD globals, CSS, strict
  consumer source, declaration resolution, `record`/`Replayer`, the player
  constructor, export/file metadata, local source maps, and namespace hygiene.
- Source boundary: both bundles record only source IDs actually seen by their
  load/transform hooks, including SHA-256 digests. The player uses ordered exact
  aliases for replay CSS first and replay module second; resolver evidence and
  loaded IDs must both match the patched local `packages/rrweb` source. An
  official-CSS alias mutation fails the build.
- Player design deviation: the boundary build entry is upstream
  `packages/rrweb-player/src/main.ts`. A nominal wrapper is intentionally
  omitted because it breaks the Svelte declaration rollup and would be dead
  code; no player implementation is copied.
- Build isolation: direct dependency-order workspace builds replace the root
  Turbo prepublish path, whose root reference update modified unrelated plugin
  tsconfigs. Fresh boundary builds leave those files and generated Svelte
  ambient declarations clean.
- Artifact census: core has 19 files, 1,319,872 packed bytes, SHA-256
  `a0f8f5115ad12077bc88daa292c89813ca5443878bc76ed8bb41d21d98f32fbd`;
  player has 18 files, 1,431,304 packed bytes, SHA-256
  `fc65cecb98202d6cfffeec8ee79ec04a0376d3694b2a7ed7b0efca51bbf74085`.
- Residual upstream declaration blocker: a no-`skipLibCheck` diagnostic pass
  must exactly match pinned upstream 2.1.1 path/code/line/column/message tuples,
  occurrence counts, and fresh declaration digests. Collected same-code and
  path/count drift probes must fail before the test verifies strict ESM/CJS
  consumer code with those upstream library diagnostics isolated.

## Task 4 Seek Evidence

`SEEK-001` changes only replay synchronization state; it does not change event
serialization, the wire format, fixture bytes, or package identities.

- Implementation commit: the focused Task 4 commit containing this ledger
  update, titled `fix(replay): preserve DOM correctness after seek`.
- RED: on the unmodified 2.1.1 replay source, the focused real-Chrome suite
  failed 2/2. Both explicit directions reached public current time at or after
  the target event, but the visible iframe text was `before-seek` instead of
  `after-seek`.
- GREEN: after the minimal state transition, the focused suite passes 2/2 and
  the existing `test/replayer.test.ts` regression suite remains green.
- Compatibility: the candidate bundle passes forward and backward seek for
  each authenticated alpha.4, Junify alpha.19, Junify alpha.20, and official
  2.1.1 artifact (eight direction/producer combinations, no skips).
- Large snapshot: the exact 13,600,000-byte CSS fixture rebuilds the same CSSOM
  rule count and visible marker after an explicit seek. The final focused-gate
  differential was official 2.1.1 106.6 ms versus candidate
  102.3 ms (ratio 0.960); this is correctness evidence and a timing record, not
  a general performance claim.
- Upstream plan: submit the minimal flag/reset plus behavior fixture as a
  correctness PR. Delete this patch after an upstream stable release passes
  the same focused, historical, and large-snapshot gates without it. PR 1806
  remains separate because it changes legacy missing-node destroy ordering;
  no independent differential RED justified adding that change here.
- Artifact hashes: no fixture was regenerated and no persisted artifact hash
  changed.
- Residual blocker: none inside `G-SEEK`; consumer rollout remains gated by the
  later cross-repository tasks.

## Task 5 Canvas Evidence

`CANVAS-001` keeps the official `@rrweb/types` request/response wire types and
adds only an rrweb-local callable processor type with optional `dispose()`.
The old monorepo namespace rewrite, WebGPU fallback, broad shadow traversal,
and response `reason` field are not retained.

- Implementation commit: the focused Task 5 commit containing this ledger
  update, titled `feat(canvas): inject MV3-compatible bitmap processing`.
- RED: unmodified 2.1.1 failed 8/9 focused processor tests because the three
  public factories were absent. A separate real-Chrome stop case failed with
  zero disposer calls when `recordDOM: false`.
- GREEN: the processor suite passes 11/11 and the focused record/replay WebGL
  suites pass 16/16 and 1/1 respectively under Node 20.9.0 and Chrome
  151.0.7922.138. Coverage includes transfer/result, synchronous post failure,
  worker `error`/`messageerror`, silent timeout, dispose/late response,
  per-instance caches, transparent/identical suppression, dimension and
  MIME/quality changes, missing OffscreenCanvas/context, conversion errors,
  and exactly-once bitmap close for locally owned paths.
- Real-browser behavior: injected numeric-FPS processing is used; strict CSP
  worker failure continues through inline processing; stop suppresses a late
  result and disposes with DOM recording disabled; unavailable WebGL
  constructors remain guarded; a pre-existing
  `preserveDrawingBuffer: false` WebGL canvas has byte-identical screenshots
  before/after sampling.
- Persisted compatibility: a local candidate real-browser recording is
  serialized to a temporary JSON artifact, read back, and replayed. Canvas2D
  `[255, 0, 0, 255]` and WebGL `[0, 128, 0, 255]` pixels survive, while
  Canvas mutations retain the upstream clearRect/drawImage ImageBitmap wire
  shape.
- Upstream plan: propose the injectable processor/factory contract,
  non-destructive WebGL warm-up, and focused tests without Junify package
  names. Delete the patch after upstream stable passes the same gates.
- Residual blocker: Task 9 must run the packaged extension worker and its
  bridge/Blob strict-CSP fallbacks in real MV3, and Task 7 must close the
  broader repeated-recorder lifecycle contract. Both Canvas inventory rows
  therefore remain `red-known-risk` rather than being over-promoted.

## Deferred Or Rejected Candidates

These are not retained patches and therefore are not implementation ledger
rows:

- General `maskAttributeFn` (upstream PR 1257 / `74819490`, Sentry PR 107) is
  deferred until narrow privacy sentinels prove a remaining Junify need.
- Reusable OffscreenCanvas (PostHog PR 139 / `1124435e`) is deferred until a
  bounded long-session test proves the allocation/cleanup need.
- WebGPU fallback and broad shadow-canvas traversal are deferred until a
  required Junify fixture fails without them.
- Datadog compact serialization is rejected from this upgrade.

See [`vendor-adoption.md`](vendor-adoption.md) for the complete candidate
matrix, including changes already supplied by upstream 2.1.1.

## Per-Patch Evidence Template

Append to the relevant row or a short evidence section when implemented:

```text
Patch ID:
Implementation commit:
RED command/result:
GREEN command/result:
Compatibility gate/result:
Artifact hashes:
Residual blocker:
```
