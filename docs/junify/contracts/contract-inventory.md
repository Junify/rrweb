<!-- markdownlint-disable MD013 MD043 -->

# Junify rrweb Compatibility Contract Inventory

## Scope And Evidence Date

This inventory covers the recorder/replayer compatibility boundary for the
clean rebuild from `rrweb@2.1.1^{}` at
`3deb6e7da4528ddb33b5b7ff6a3e805d4ed14930`. Evidence was inspected on
2026-08-17 in the three dedicated worktrees. The service dependency census was
read-only.

The machine-readable source is
[`contract-inventory.json`](contract-inventory.json). It contains the same 24
stable IDs, statuses, recommended layers, entrypoints, sinks, behaviors,
risks, and gates summarized here. The exact commands behind every gate are in
[`test-gates-runbook.md`](test-gates-runbook.md).

Status counts at Task 1 are:

| Status | Count |
| --- | ---: |
| `covered` | 1 |
| `must-cover` | 13 |
| `red-known-risk` | 6 |
| `out-of-scope` | 4 |
| `accepted-current-behavior` | 0 |
| `not-testable-yet` | 0 |

`red-known-risk` identifies a known high-risk gap that is neither accepted nor
closed. `must-cover` identifies feasible missing coverage without asserting a
known current failure. The one `covered` contract has an executable browser
test and a recorded gate; Task 1 did not rerun that expensive Rails E2E gate.

## Contract Matrix

The “gate” value is the stable gate ID from the runbook. Layer counts are
non-exclusive because a source-to-sink risk may require more than one layer.

| ID | Source | Observable sink | Status | Recommended layer | Exact gate | Risk if broken |
| --- | --- | --- | --- | --- | --- | --- |
| `junify.canvas.mv3-processor` | explicit doc, code, extension boundary | packaged worker, inline fallback, Canvas mutations | `red-known-risk` | integration, E2E | `G-CANVAS-PROCESSOR` | MV3 Canvas recording fails or changes schema |
| `junify.canvas.non-destructive-capture` | design, current Canvas code | application/replay pixels, bitmap and worker lifetime | `red-known-risk` | integration, E2E | `G-CANVAS-PIXELS` | recording mutates pages or leaks GPU resources |
| `junify.compatibility.candidate-recorder` | design, consumer boundary | DOM/Canvas in both candidate players | `must-cover` | E2E, golden/replay | `G-COMPAT-CANDIDATE` | new recordings cannot be reviewed |
| `junify.compatibility.historical-replay` | design, persisted boundary | alpha.4/.19/.20 replay DOM/Canvas | `must-cover` | E2E, golden/replay | `G-COMPAT-HISTORICAL` | stored customer sessions become unreadable |
| `junify.compatibility.large-snapshot` | design, V2 boundary | count, indexes, reassembly, payload/gzip digest | `must-cover` | integration, golden/replay | `G-LARGE-SNAPSHOT` | large recordings truncate or reorder |
| `junify.compatibility.wire-format` | design, recorder/service boundary | decoded rrweb event JSON | `must-cover` | integration, golden/replay | `G-WIRE-FORMAT` | service/replayers reject candidate events |
| `junify.extension.persistence` | extension code, Chrome boundary | CustomEvent, runtime port, Chrome storage | `must-cover` | integration, E2E, workflow-contract | `G-EXT-PERSISTENCE` | events disappear or reorder before ingest |
| `junify.lifecycle.recorder-stop` | recorder code, design | post-stop events and retained resources | `red-known-risk` | integration, E2E | `G-RECORDER-LIFECYCLE` | privacy leak and long-session resource growth |
| `junify.lifecycle.replayer-destroy` | replayer code, design | timers, maps, callbacks, DOM roots | `red-known-risk` | integration, E2E | `G-REPLAYER-LIFECYCLE` | Rails navigation retains recordings/resources |
| `junify.package-boundary.player` | package design | packed player exports and bundled replayer | `must-cover` | static analysis, integration | `G-PKG-PLAYER` | player bypasses the Junify seek fix |
| `junify.package-boundary.rrweb` | package design | packed rrweb exports and dependency names | `must-cover` | static analysis, integration | `G-PKG-RRWEB` | global rename recreates mechanical divergence |
| `junify.privacy.persisted-sentinels` | design, snapshot/extension code | Full/Incremental JSON, storage, V1/V2 body | `red-known-risk` | integration, E2E | `G-PRIVACY` | sensitive input values are persisted |
| `junify.rails.legacy-static-player` | static bridge code | EVENTS input and META/TIME/SKIP output, visible replay | `must-cover` | E2E | `G-RAILS-STATIC` | retained bridge silently breaks |
| `junify.rails.monitors-v1-player` | Rails V1 code | production-shaped fetch/decode/replay route | `must-cover` | E2E | `G-RAILS-MONITORS-V1` | mocked tests hide a blank/broken route |
| `junify.rails.monitors-v2-player` | Rails V2 code | replay-plan chunks/hot pages and visible replay | `must-cover` | E2E, workflow-contract | `G-RAILS-MONITORS-V2` | sessions are gapped, duplicated, or stuck |
| `junify.rails.password-rotation-artifact` | executable E2E, player code | artifact fetch, decode, visible DOM, controls | `covered` | E2E, workflow-contract | `G-RAILS-PASSWORD-ARTIFACT` | rotation evidence cannot be reviewed |
| `junify.replay.seek-visible-dom` | Junify patch intent, replayer code | first visible DOM/current time after seek | `red-known-risk` | integration, golden/replay | `G-SEEK` | reviewer sees the wrong moment |
| `junify.scope.no-compact-serializer` | approved design | event format and codec architecture | `out-of-scope` | none | `G-NO-COMPACT-SERIALIZER` | upgrade becomes a storage migration |
| `junify.scope.no-cross-origin-expansion` | design, extension options | `recordCrossOriginIframes` | `out-of-scope` | none | `G-NO-CROSS-ORIGIN` | capture scope expands without approval |
| `junify.scope.no-external-release` | approved design | registry, remotes, deployment, staging | `out-of-scope` | none | `G-NO-EXTERNAL-RELEASE` | unverified content reaches production |
| `junify.service.unused-rrweb-dependency` | source/build/zip census | service import graph and deployment package | `out-of-scope` | static analysis | `G-SRS-UNUSED` | a real consumer is omitted from rollout |
| `junify.transport.v1` | extension flusher code | deflate/base64 V1 request event | `must-cover` | integration | `G-TRANSPORT-V1` | legacy ingest receives corrupt events |
| `junify.transport.v1-v2-parity` | design, both flushers | decoded logical stream after transport | `must-cover` | integration, golden/replay, workflow-contract | `G-TRANSPORT-PARITY` | feature flag changes recorded behavior |
| `junify.transport.v2` | extension V2 flusher code | indexes, type, eventString, fragments, end event | `must-cover` | integration | `G-TRANSPORT-V2` | V2 data cannot be reassembled or replayed |

## Current Consumer Matrix

“Locked” means the dependency resolution in the checked-in lockfile or the
literal CDN URL, not merely the manifest range.

| Consumer at inspected head | Declaration and exact lock | Active entrypoints | Persisted/transport format | Current coverage conclusion |
| --- | --- | --- | --- | --- |
| browser extension `1d8b3345ec9aee8d0c6c5d56d74c805a623b2a1a` | `@junify-app/rrweb@^2.0.0-alpha.20` resolves exactly `2.0.0-alpha.20`; transitive `@junify-app/rrweb-snapshot` resolves exactly alpha.20 | `src/injected/sessionRecordingClient/index.ts`, `imageBitmapProcessor.ts`, `canvasBitmapWorker.ts`; `SessionRecorder`; storage repository; V1/V2 flushers | Per-recorder CustomEvent to runtime port; Chrome storage stores JSON arrays keyed by timestamp/index/session. V1 deflates and base64-encodes each JSON event. V2 keeps raw JSON `eventString`, assigns monotonic indexes and types, and fragments oversized UTF-8 bodies with hashes. | Integration does not yet observe packaged-worker execution, real storage, or final ingest payload; `must-cover` |
| Rails main SPA `2c1377da10f4db737e36be2cb59c663056132aee` | `@junify-app/rrweb@^2.0.0-alpha.19` and `@junify-app/rrweb-player@^2.0.0-alpha.19` both resolve exactly `2.0.0-alpha.19` | Monitors route player, inline `RrwebPlayer`, direct `PlayerFrame`/`Replayer`, V1 parser, V2 replay-plan loader | V1 API pages contain raw or deflate/base64 compatibility records. V2 reads hot records and NDJSON chunks from a replay plan. All Monitors player implementations enable `UNSAFE_replayCanvas`. | Parser/player Jest tests are mocked/local; Monitors V1 and V2 browser coverage are `must-cover` |
| Rails password-rotation artifact player at the same head | same alpha.19 rrweb/player lock | `SessionRecordingPlayerModal.tsx`; capability-run artifact endpoint | `session_recording_data.txt` is Base64 text wrapping a gzip-compressed JSON event array | Real Playwright flow fetches, decompresses, visibly renders, and exercises controls; narrowly `covered`, without producer provenance |
| Rails legacy static player at the same head | literal CDN `rrweb@2.0.0-alpha.4` | `frontend_rrweb_replayer/index.html`, `replay.js` | Parent sends `EVENTS`; bridge emits `META`, time, and skip messages; `UNSAFE_replayCanvas` enabled | README/build are not browser compatibility evidence; `must-cover`. No current source reference proves the documented S3 deployment is active |
| proposed candidate packages | `@junify-app/rrweb@2.1.1-junify.0` and `@junify-app/rrweb-player@2.1.1-junify.0` | narrow packages to be created in Task 3 | unchanged rrweb event format | not built or packed yet; `must-cover` |
| `session_recording_service` read-only shared checkout | manifest declares `rrweb@^0.9.14`; lock resolves exactly `0.9.14` | no rrweb source entrypoint found | service persists/transforms raw rrweb JSON independently of the npm runtime | no source import/require/dynamic import; `.serverless/build/package.json` has empty dependencies; deployment zip lists no rrweb. Runtime participation is strongly disproved, so dependency cleanup is `out-of-scope` |

### Recorder Defaults That Must Stay Explicit

The inspected extension enables Canvas by default at 5 fps using WebP quality
0.6, records after `load`, takes a full snapshot every five minutes, disables
cross-origin iframe recording, and currently masks only password inputs. SPA
`pushState` and `popstate` force full snapshots. The limited privacy policy is
why persisted-payload privacy is a red known risk, not covered by upstream unit
tests.

## Existing Fixture Matrix

| Fixture/source | What is known | Provenance gap | Contract use |
| --- | --- | --- | --- |
| service `real-cloudflare-recording-1209-events.json.gz` | 1,209 events, one FullSnapshot at transport index 2, largest `eventString` 535,950 bytes; gzip SHA-256 `1c428ef54bdf45b5b218f1450bbbfe41fe1eac68841df4b7dfb2ace1368690cb` | no producer package/version, browser/version, creation command, uncompressed digest, or privacy assertions | useful service pipeline input only; not an alpha fixture |
| service `real-cloudflare-recording-1227-events.json.gz` | 1,227 events, FullSnapshots at indexes 2 and 1225, largest `eventString` 1,432,290 bytes; gzip SHA-256 `5e317c740381bfb5a8e5a704bf11c313251851653cdfbeb9a8cd615279ed1a6f` | same missing provenance | largest current artifact, still far below roughly 13.6 MB CSS requirement |
| service `real-cloudflare-recording-1907-events.json.gz` | 1,907 events, FullSnapshots at indexes 2 and 1905, largest `eventString` 1,385,765 bytes; gzip SHA-256 `8bb33b9b0d4b688f91a861766d9f07a11e486371b23594fbccb8ec2e0dd17b24` | same missing provenance | contains DOM/CSS/Canvas/Shadow markers, but is not a privacy or producer-version fixture |
| Rails password-rotation generated artifact | deterministic two-event Meta + FullSnapshot payload; Base64 wrapping gzip; visible sentinel text | hand-built event JSON has no producer package/browser provenance | proves one persisted artifact browser flow only |
| upstream rrweb event/test fixtures | broad synthetic replay, input masking, Canvas/WebGL, iframe, Shadow DOM, stylesheet, and seek coverage | not Junify consumer configuration, not persisted through extension/service/Rails | supports focused local regression tests but cannot close cross-repository contracts |

New compatibility fixtures must record producer package and exact version,
scenario, browser/version, creation command, uncompressed and gzip SHA-256,
event count, FullSnapshot indexes, and privacy assertions. They must use only
synthetic data and must cover alpha.4, alpha.19, alpha.20, official 2.1.1 as
the unmodified baseline, and candidate `2.1.1-junify.0`.

## Repository/Fork Evidence

- The peeled stable tag is exactly
  `3deb6e7da4528ddb33b5b7ff6a3e805d4ed14930`.
- The merge base with the cached Junify fork is
  `76df9799ecc14930fa914e5623a73ea7726e3747`.
- Local no-fetch refs have `master` and `origin/master` at
  `8824d8f34e7b93597b5c90d9075d183aea111794`, 7 commits ahead and 62 behind
  stable. The coordinator’s independent remote census reports the later remote
  tip `bad4613d6ed...` and 11/62. That object is not present in this no-fetch
  worktree, so the remote claim remains attributed rather than locally
  reverified.
- `af62ec15` changes 315 files for the global namespace rewrite. It is reference
  material, not a replay unit.
- Behavioral reference commits are seek `8d0afa80`, Canvas `45ea914e`, and
  alpha.20 stabilization `8824d8f3`. Raw commits are not cherry-picked.

## Explicit Boundaries

This inventory excludes wire-format changes, Datadog compact serialization,
cross-origin iframe expansion, publishing/releasing/pushing/PRs/deployment/
staging, and cleanup of the service’s unused npm declaration. The legacy static
player remains in compatibility scope until ownership explicitly removes it;
absence of an active-deployment source reference is not evidence that it is
dead.
