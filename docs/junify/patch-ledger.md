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

| Patch ID       | State                      | Reason / Junify contract                                                                                                                                     | Source reference                                                                                                                                   | Required tests/gate                                                                                   | Upstream status                                                                                          | Delete when                                                                                                       |
| -------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `BND-001`      | implemented; release-gated | Publish only `@junify-app/rrweb@2.1.1-junify.0`; preserve official internal identities (`junify.package-boundary.rrweb`)                                     | approved integration design; old namespace rewrite `af62ec15` is negative reference only                                                           | `G-PKG-RRWEB`; packed artifact export/name inspection; Task 3 evidence below                          | Junify package boundary is not an upstream concern                                                       | Junify no longer publishes a forked rrweb boundary                                                                |
| `BND-002`      | implemented; release-gated | Publish `@junify-app/rrweb-player@2.1.1-junify.0` and force it to bundle the patched local replayer (`junify.package-boundary.player`)                       | approved integration design; old scoped player package is behavior reference only                                                                  | `G-PKG-PLAYER`; prove packed player does not resolve unpatched official replay; Task 3 evidence below | Junify package boundary is not an upstream concern                                                       | player can consume an upstream release that includes every required Junify replayer patch, or the fork is retired |
| `SEEK-001`     | planned                    | First synchronization after explicit forward/backward seek must use correct real DOM (`junify.replay.seek-visible-dom`)                                      | Junify `8d0afa80f6fdf94226c914964a7a647c7f44f9c5`; evaluate upstream PR 1806 differentially                                                        | `G-SEEK`; RED and GREEN must assert visible DOM/current time                                          | absent from 2.1.1; PR 1806 is evaluation input, not an automatic stack                                   | an upstream stable release passes the same forward/backward fixture without this patch                            |
| `CANVAS-001`   | planned                    | Preserve consumer-used injected ImageBitmap processor, packaged MV3 worker, inline fallback, transfer/close, and non-destructive capture (`junify.canvas.*`) | Junify `45ea914e78f70f54d386bf341f7d55567f200b68`; Sentry PR 307 / `027138c9`; upstream Vite PR 1762 / `22bc4c33` does not replace packaged worker | `G-CANVAS-PROCESSOR`, `G-CANVAS-PIXELS`; RED/GREEN plus production MV3 evidence                       | injectable API absent from 2.1.1; upstream Vite 6 still uses an inline-worker import                     | upstream exposes an equivalent tested injectable/packaged-worker API and passes Junify MV3/pixel/cleanup gates    |
| `PRIV-001`     | planned                    | Mask hidden input values in initial and mutated persisted payloads (`junify.privacy.persisted-sentinels`)                                                    | Mixpanel PR 4 / `c68ae046`; upstream open PR 1745                                                                                                  | `G-PRIVACY`; unique hidden-value sentinels absent from Full/Incremental/storage/V1/V2                 | absent from 2.1.1                                                                                        | upstream stable masks hidden inputs under the Junify policy and passes the same persisted sentinel gate           |
| `PRIV-002`     | planned                    | Mask placeholders for masked inputs/textareas, including mutations (`junify.privacy.persisted-sentinels`)                                                    | Mixpanel PR 18 / `2a8326d0`                                                                                                                        | `G-PRIVACY`; unique initial/mutated placeholder sentinels                                             | absent from 2.1.1                                                                                        | upstream stable provides equivalent placeholder masking and passes the persisted sentinel gate                    |
| `PRIV-003`     | planned                    | Always protect values for sensitive autocomplete tokens (`junify.privacy.persisted-sentinels`)                                                               | Sentry PR 166 / `432fe1f9`                                                                                                                         | `G-PRIVACY`; distinct autocomplete sentinels absent from all persisted sinks                          | absent from 2.1.1                                                                                        | upstream stable provides equivalent sensitive-autocomplete handling and passes the persisted sentinel gate        |
| `LIFE-REC-001` | planned                    | Stop must release MutationObserver, iframe, stylesheet, shadow-root, Canvas RAF/worker, and mirror resources (`junify.lifecycle.recorder-stop`)              | PostHog PRs 91, 94, 142, 157, 159, 162, 163 as a coherent train; Mixpanel PRs 8 and 12 / upstream PR 1791 as design references                     | `G-RECORDER-LIFECYCLE`; record churn count/duration/retention assertions                              | coherent cleanup behavior absent/incomplete in 2.1.1; isolated PostHog PR 142 has follow-up shadow fixes | upstream stable passes the full bounded-churn gate without Junify adaptation                                      |
| `LIFE-REP-001` | planned                    | Destroy must release timers, subscriptions, pending callbacks, iframe maps, and roots (`junify.lifecycle.replayer-destroy`)                                  | PostHog PRs 92, 121, 122, 123                                                                                                                      | `G-REPLAYER-LIFECYCLE`; no callback/reference after repeated destroy                                  | 2.1.1 destroy test proves wrapper removal only                                                           | upstream stable passes the complete lifecycle gate without Junify adaptation                                      |
| `DEF-001`      | planned                    | Malformed legacy media nodes must not abort replay matrix (`junify.compatibility.historical-replay`)                                                         | Mixpanel PR 10 / `dfeeb602`; upstream open PR 1673                                                                                                 | `G-REPLAYER-LIFECYCLE` plus malformed legacy fixture in replay matrix                                 | absent from 2.1.1                                                                                        | upstream stable contains the guard and passes the legacy fixture                                                  |
| `DEF-002`      | planned                    | Missing/null style `rules` must not abort legacy replay (`junify.compatibility.historical-replay`)                                                           | Sentry PR 162 / `0b0e26db`                                                                                                                         | `G-REPLAYER-LIFECYCLE` plus missing-rules legacy fixture in replay matrix                             | absent from 2.1.1                                                                                        | upstream stable contains the guard and passes the legacy fixture                                                  |

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
  (7/7) and player (8/8), covering ESM, CJS, browser UMD globals, CSS, strict
  consumer source, declaration resolution, `record`/`Replayer`, the player
  constructor, export/file metadata, local source maps, and namespace hygiene.
- Source boundary: the core bundle records its exact local `rrweb` source map.
  The player uses ordered exact aliases for replay CSS first and replay module
  second, with both mapped to the patched local `packages/rrweb` source.
- Player design deviation: the boundary build entry is upstream
  `packages/rrweb-player/src/main.ts`. A nominal wrapper is intentionally
  omitted because it breaks the Svelte declaration rollup and would be dead
  code; no player implementation is copied.
- Build isolation: direct dependency-order workspace builds replace the root
  Turbo prepublish path, whose root reference update modified unrelated plugin
  tsconfigs. Fresh boundary builds leave those files and generated Svelte
  ambient declarations clean.
- Artifact census: core has 19 files, 1,319,574 packed bytes, SHA-256
  `29952b4d906d1d72cba88060851c4c05ddefd6c3de1851f0a8dcf6c77b0e9e2a`;
  player has 18 files, 1,431,080 packed bytes, SHA-256
  `6407d54f0db172e3592102f7e25fc38187e65d46b2c769ef5d60a33d89f77792`.
- Residual upstream declaration blocker: a no-`skipLibCheck` diagnostic pass
  is required to contain only pinned upstream 2.1.1 errors `TS1254`, `TS2395`,
  `TS2663`, and `TS2717` in rrweb, rrdom, and css-font-loading declarations.
  The test then verifies strict ESM/CJS consumer code and boundary declaration
  resolution with those upstream library diagnostics isolated.

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
