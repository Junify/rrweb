<!-- markdownlint-disable MD013 MD043 -->

# Test Gates Runbook

## Rules

- Run commands from the rrweb worktree root unless a command starts with
  `cd ../...`.
- Use the repository lockfiles. rrweb declares Yarn `1.22.19`; use a supported
  Node LTS and the pinned dependencies already installed by the repository.
- Real-browser rrweb gates require Chromium/Puppeteer and
  `PUPPETEER_HEADLESS=true`. CI may additionally need Xvfb and an explicit
  `PUPPETEER_EXECUTABLE_PATH`.
- MV3 gates require Chrome capable of loading the production-packed unpacked
  extension. A Jest Worker mock is not a substitute.
- Rails Playwright gates require the documented local Rails/E2E stack and
  debug auto-login. Use `--workers=1` for changed specs.
- Never use customer recordings or credentials. Fixtures use distinct
  synthetic privacy sentinels.
- Record command, commit, environment/browser version, pass/fail/skip counts,
  artifact hashes, and blocker text. A skipped or missing suite never closes a
  row.

## Task 1 Documentation Gate

### `G-DOCS-INVENTORY`

```sh
node -e "JSON.parse(require('fs').readFileSync('docs/junify/contracts/contract-inventory.json','utf8'))"
git diff --check
```

Expected: JSON parses and no whitespace errors. This gate validates artifact
syntax only; it does not upgrade any behavioral contract to `covered`.

## Package Boundary Gates

### `G-PKG-RRWEB`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify-app/rrweb build
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify-app/rrweb test
```

Assert packed ESM, CJS/UMD, types, CSS/global exports, `record`, and `Replayer`;
inspect the tarball to prove there are no Junify-renamed internal packages.
Task 3 passes 9/9 tests from an exact freshly packed tarball installed in an
isolated consumer. The gate pins complete upstream declaration diagnostic
tuples and fresh declaration digests, rejects same-code occurrence/path drift,
then runs the strict consumer stage. The emitted provenance map contains only
actually loaded local source paths and SHA-256 digests. Publication remains a
separate release-gated action.

### `G-PKG-PLAYER`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify-app/rrweb-player build
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify-app/rrweb-player test
```

Assert player construction, CSS/types/exports, and that the packed player
resolves the patched local replayer. Task 3 passes 9/9 tests after installing
both exact freshly packed artifacts in an isolated consumer. Ordered exact
aliases resolve replay CSS before the replay module; resolver evidence plus
actual load/transform paths and SHA-256 digests prove both came from the local
patched rrweb source. A collected official-CSS mutation fails the build. The
entrypoint is upstream `packages/rrweb-player/src/main.ts`; no dead wrapper or
copied player implementation exists. Publication remains release-gated.

## Compatibility And Replay Gates

### `G-COMPAT-HISTORICAL`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace @junify/rrweb-compatibility test -- replay-matrix
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/monitors/session-recording.spec.ts scenarios/monitors/session-recording-static-player.spec.ts --workers=1
```

Assert provenance-locked alpha.4, alpha.19, and alpha.20 fixtures visibly
replay in both candidate surfaces. Task 2 passes the package-local first command
for all three historical artifacts under official rrweb@2.1.1 in Google Chrome
151.0.7922.138 with no skips. It authenticates loaded UMD bytes against the
integrity-locked registry tarball, recollects normalized events in temporary
storage, and asserts marker-terminated SPA and stylesheet replay sinks. Task 3
builds and packs the candidate package boundaries. Task 4 closes explicit
candidate seek for all four accepted artifacts. Both Monitors browser specs
remain the cross-repository blockers.

### `G-COMPAT-CANDIDATE`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace @junify/rrweb-compatibility test -- record-fixtures replay-matrix
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/monitors/session-recording.spec.ts scenarios/monitors/session-recording-static-player.spec.ts --workers=1 --grep '2.1.1-junify.0'
```

Assert candidate recorder output in both candidate replayers. Task 2's official
2.1.1 baseline is not a substitute. Task 3 creates and package-tests the
candidate boundaries; candidate-produced fixtures and both cross-repository
browser surfaces remain the blocker.

### `G-WIRE-FORMAT`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace @junify/rrweb-compatibility test -- record-fixtures replay-matrix large-snapshot
```

Compare decoded order, count, FullSnapshot indexes/payloads, and deterministic
digests. Permit only an explicitly documented upstream correctness delta.
Task 2 passes the package-local fixture integrity and official 2.1.1 replay
checks. Current blocker: the future Junify candidate differential and both
consumer surfaces remain untested.

### `G-LARGE-SNAPSHOT`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace @junify/rrweb-compatibility test -- large-snapshot
cd ../browser-extension-rrweb-2.1.1 && yarn test src/background/command/sessionRecording/v2SessionRecordingFlusher.test.ts
```

Assert roughly 13.6 MB deterministic CSS, event count/index/payload digest,
UTF-8 fragmentation and reassembly, and gzip round trip. Task 2 passes the
13,600,000-byte CSS event/index/payload/raw/gzip checks. Current blocker:
extension UTF-8 fragmentation and reassembly remain untested.

### `G-SEEK`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace rrweb build
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/replay/seek-virtual-dom.test.ts test/replayer.test.ts
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace @junify/rrweb-compatibility test -- replay-matrix large-snapshot
```

Assert visible iframe DOM and current time after both forward and backward
explicit seeks. Task 4 passes a focused two-direction real-Chrome gate and eight
candidate seeks across authenticated alpha.4, Junify alpha.19, Junify alpha.20,
and official 2.1.1 recordings. The large-snapshot gate preserves the exact
13.6 MB fixture's CSSOM rule count and visible marker while recording official
2.1.1 versus candidate seek timing. No case is skipped.

## Canvas Gates

### `G-CANVAS-PROCESSOR`

```sh
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/record/image-bitmap-data-url-processor.test.ts test/record/webgl.test.ts test/replay/webgl.test.ts
yarn workspace @junify/rrweb-compatibility test -- record-fixtures
```

Task 5 plus fix round 1 passes 31/31 focused rrweb tests and 3/3 compatibility
tests under
Node 20.9.0 and Chrome 151.0.7922.138. They assert injected processor use,
worker transfer/result, post failure, `error`/`messageerror`, silent timeout,
throwing error-observer containment, dispose/late reply, transparent and
unchanged suppression, strict-CSP inline fallback, dimension/MIME/quality
behavior, and absent OffscreenCanvas/WebGL constructors. A real-Chrome
throwing-disposer sentinel verifies non-throwing idempotent stop, inactive
recording state, restart/stop, and no late emit. The compatibility test
serializes a candidate artifact to JSON and visibly replays exact
Canvas2D/WebGL pixels. Current blocker: Task 9 must exercise
browser_extension's packaged worker under production MV3.

### `G-CANVAS-PIXELS`

Run `G-CANVAS-PROCESSOR`, then the production extension gate:

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn build-prod
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingCompatibility.integration.test.ts
```

Task 5's package-local portion proves byte-identical application WebGL
screenshots before/after numeric sampling, exact replayed Canvas2D/WebGL pixels,
locally owned bitmap closure, worker termination/listener removal, and no late
Canvas event after stop. Load the production-packed extension in Chrome and
record Canvas 2D/WebGL to close the remaining boundary: real packaged-worker
execution, replay pixels, bridge/Blob URL cleanup, and worker/RAF shutdown.

## Privacy And Lifecycle Gates

### `G-PRIVACY`

```sh
yarn workspace rrweb-snapshot test
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/integration.test.ts
yarn workspace @junify/rrweb-compatibility test -- record-fixtures
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingCompatibility.integration.test.ts
```

Scan emitted FullSnapshot and IncrementalSnapshot JSON, Chrome storage, and V1/
V2 requests for distinct password, textarea, placeholder, dynamic password,
hidden, and sensitive-autocomplete sentinels. Task 2 characterizes emitted
artifacts: placeholder, hidden, and sensitive-autocomplete leak in all four;
alpha.4 also leaks textarea. Task 6 passes the package-local snapshot,
real-Chrome recorder, and temporary persisted-JSON portions under Node 20.9.0
and Chrome 151. The final rrweb integration gate passes 60/60 and the persisted
compatibility gate passes 4/4. They cover FullSnapshot, Mutation, Input, and
added-node payloads; both same-batch password type orders; post-start assigned
and unassigned password state reached through the type property or page-realm
`setAttribute`/`removeAttribute`; synchronous Input before observer flush;
exact method-hook restoration across idempotent stop/restart without clobbering
a later third-party patch; zero privacy timers or transient state through any
retained inner rrweb proxy after both stop cycles; fresh-recorder masking after
restart; hidden-to-text and autocomplete
removal/value mutations in both orders; all approved sensitive autocomplete
tokens with compound/mixed-case forms and an identity mask function;
placeholder/autocomplete removal as `null`; and post-batch visible negative
controls. The persisted fixture assigns a unique mask length to every private
source and asserts the exact FullSnapshot/add/attribute/Input source and node;
missing-event probes prevent an unrelated field's stars from satisfying a
case. Current blocker: Task 9 must scan real extension Chrome storage and
decoded V1/V2 request bodies with the same policy and sentinels.

### Task 2 Fixture Regeneration

Install from the locked registry tarballs without running unrelated workspace
install scripts, then regenerate one named artifact at a time:

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn install --ignore-scripts --frozen-lockfile
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify/rrweb-compatibility fixtures:generate --producer rrweb-alpha4-historical
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify/rrweb-compatibility fixtures:generate --producer junify-alpha19-historical
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify/rrweb-compatibility fixtures:generate --producer junify-alpha20-historical
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify/rrweb-compatibility fixtures:generate --producer rrweb-2.1.1-baseline
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace @junify/rrweb-compatibility fixtures:generate --producer rrweb-2.1.1-large-snapshot
```

`fixtures/manifest.json` is authoritative for producer package/version and
registry tarball URL/integrity/SHA-256, loaded bundle path/SHA-256, Chrome
version/user agent, creation command, event count, FullSnapshot indexes/payload
digests, raw/gzip bytes and SHA-256, scenario evidence, privacy scan, and the
exact large-CSS digest. Generation fetches the locked tarball, validates its
SHA-512, extracts its published UMD, and refuses to record unless that digest
matches the installed bytes loaded into Chrome. The test suite also recollects
the four comprehensive artifacts into temporary storage and compares the
producer-created events after removing only top-level rrweb timestamps. Only
gzip fixtures are tracked; generation never uses customer data.

### `G-RECORDER-LIFECYCLE`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace rrweb build
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/record/lifecycle.test.ts
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/integration.test.ts
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH BROWSER=webkit yarn workspace rrweb vitest run --config vitest.config.webkit.ts
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/record/image-bitmap-data-url-processor.test.ts test/record/webgl.test.ts test/replay/webgl.test.ts test/replayer.test.ts
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace @junify/rrweb-compatibility test -- record-fixtures
```

The authentic stable RED starts at zero tracked resources; cycle 0 retains two
listeners and two RAFs and emits two late events, while cycle 49 retains 100
listeners and 100 RAFs. A removed iframe's old sheet emits one stale event and
its old document remains retained. Task 7 fix-round GREEN passes 6/6 in 56.23 seconds:
all 50 cycles keep listeners/MutationObservers/RAFs/timers at zero after stop,
events remain unchanged at four, the dynamic-password sentinel is absent, and
ten pending-stylesheet cycles retain zero listeners/timers. Iframe `pagehide`
silences and releases the old generation before replacement load; shadow
replacement, final stylesheet-owner release plus re-adoption, permanent mirror
release, Canvas shutdown, and independently throwing cleanup are observed
through explicit sinks. A no-op `releaseHost` mutation fails the final-owner
case. The executable WebKit restart gate passes 1/1 and observes the hidden
untainted-observer iframe count transition from one while active to zero after
each stop. Supplemental regression evidence is Canvas/replayer 78/78,
privacy integration 60/60, compatibility record fixtures 4/4, snapshot 32/32,
and remaining record suites 86 passed with two pre-existing skips. WeakRef or
unit-spy evidence alone does not close this gate.

### `G-REPLAYER-LIFECYCLE`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH yarn workspace rrweb build
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/replay/lifecycle.test.ts test/replayer.test.ts
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace @junify/rrweb-compatibility test -- replay-matrix
```

Assert repeated create/play/seek/destroy clears timers, subscriptions, pending
image/stylesheet/addEvent callbacks, iframe maps, and DOM roots. Current
Task 8 evidence is GREEN: lifecycle plus replayer passes 51/51 and the
candidate replay matrix passes 3/3, including all four historical producers,
eight seek direction/producer combinations, and the temporary persisted
malformed-legacy artifact.

The lifecycle fixture performs 50 real-Chrome cycles with four nested iframes,
explicit forward and backward seek, an owned pending Timer action/RAF,
stylesheet `load`, media `loadedmetadata`, live mode, image/canvas/new-document/
legacy maps, and idempotent destroy. Before destroy the ownership sinks are
nonzero. After destroy, both state machines are stopped; all handlers, maps,
queues, mirror IDs, listeners, RAFs, timeouts, intervals, and DOM roots are
zero. Late link/media events, service sends, speed changes, `addEvent`, and a
second destroy produce no callback, event-count, or DOM-mutation change. A
separate case injects throwing Pause/Destroy consumers, media cleanup, and host
`cancelAnimationFrame`. It waits for the uncancelled native RAF and still
observes zero late actions, inactive/empty Timer state, and complete global
finalization.

The unmodified 2.1.1 RED retained the Running player/speed services, fifteen
emitter handlers, image/canvas/new-document maps, media metadata and stylesheet
listeners, 77 timeouts by cycle 49, and a live RAF. Late traffic grew
StateChange from 22 to 28 and EventCast from 16 to 19; double destroy threw.
WeakRef or GC-only evidence does not close this gate. The malformed-media and
absent-style-rules cases must retain their following valid-event sinks: video
`currentTime` 4.25, volume 0.5, muted true, and computed color
`rgb(17, 34, 51)`.

## Browser Extension Persistence And Transport Gates

### `G-EXT-PERSISTENCE`

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn test src/foreground/service/sso/sessionRecorder.test.ts src/background/repository/SessionRecordingEventRepository.test.ts
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingBridgeIntegration.integration.test.ts integration-tests/sessionRecordingCompatibility.integration.test.ts
```

Assert the per-recorder bridge, runtime port, real Chrome storage ordering,
delete-on-pop, and retry/requeue behavior. Current blocker: storage-boundary
integration assertions and the repository test named above are added in Task 9.

### `G-TRANSPORT-V1`

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn test src/background/command/sessionRecording/flushSesssionRecordingEventsToServer.test.ts
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingCompatibility.integration.test.ts
```

Assert event-by-event JSON → fflate level-6 deflate → base64 round trip plus
timestamp, index, `firstEvent`, and request metadata at the persisted boundary.
Current blocker: the existing unit suite does not close the real artifact path.

### `G-TRANSPORT-V2`

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn test src/background/command/sessionRecording/v2SessionRecordingFlusher.test.ts
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingCompatibility.integration.test.ts
```

Assert sort/order, monotonic 1-based index assignment, event classification,
plain eventString, UTF-8-safe fragment/hash/reassembly, rotation, and
recording_end. Current blocker: a production-shaped persisted-artifact check is
still missing.

### `G-TRANSPORT-PARITY`

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingCompatibility.integration.test.ts
yarn workspace @junify/rrweb-compatibility test -- large-snapshot replay-matrix
```

Decode both pipelines and compare the logical stream, excluding only V2
transport metadata and its synthetic recording_end. Current blocker: no real
V1/V2 artifact differential gate exists.

### `G-NO-CROSS-ORIGIN`

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn test src/injected/sessionRecordingClient/index.test.ts
```

Assert `recordCrossOriginIframes` remains `false`. Current blocker: focused
recorder-option test is added in Task 9; scope expansion remains forbidden.

## Rails Player Gates

### `G-RAILS-MONITORS-V1`

```sh
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/monitors/session-recording.spec.ts --workers=1 --grep 'V1'
```

Assert production-shaped fetch, deflate/base64 decode, visible DOM/Canvas,
seek, play, and teardown. Current blocker: no Monitors browser spec exists.

### `G-RAILS-MONITORS-V2`

```sh
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/monitors/session-recording.spec.ts --workers=1 --grep 'V2'
```

Assert replay-plan segment order, hot pagination, NDJSON chunk parsing,
incremental `addEvents`, visible DOM/Canvas, and no duplicate/gap. Current
blocker: no Monitors browser spec exists.

### `G-RAILS-PASSWORD-ARTIFACT`

```sh
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/application/member-password-rotation-requests.spec.ts --workers=1
```

Existing browser test asserts artifact metadata/file fetch, Base64+gzip decode,
visible recorded DOM, and interactive controls. Task 1 records the command but
does not rerun the Rails environment.

### `G-RAILS-STATIC`

```sh
cd ../junify-rails-rrweb-2.1.1/frontend_rrweb_replayer && yarn build
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/monitors/session-recording-static-player.spec.ts --workers=1
```

Assert `EVENTS` input plus META/TIME/SKIP output and visible replay for accepted
fixtures. Current blockers: browser spec absent; no source reference proves the
documented S3 deployment is active. Do not convert that uncertainty into a
“dead code” claim.

## Read-Only Service Census Gate

### `G-SRS-UNUSED`

```sh
cd /Users/takashihamada/dev/session_recording_service
rg -n -i "from ['\"]rrweb|require\(['\"]rrweb|import\(['\"]rrweb" . --glob '!node_modules/**' --glob '!.git/**'
rg -n "rrweb" .serverless/build/package.json
unzip -l .serverless/session-recording.zip | rg -i "rrweb"
```

Expected for all three: no match (exit 1). On 2026-08-17 the source census,
built manifest, and zip listing all had no rrweb runtime entry. The declaration
in `package.json`/`yarn.lock` remains intentionally unchanged.

## Human Release/Architecture Gates

### `G-NO-COMPACT-SERIALIZER`

Review `vendor-adoption.md` and the final dependency/source diff. Datadog
compact serialization, semantic streams, and generalized codecs must remain
absent. Any proposal is a separate architecture decision.

### `G-NO-EXTERNAL-RELEASE`

Publishing, release creation, pushing, PR creation, deployment, and staging
require separate explicit authorization after local tarball hashes and the
full compatibility matrix are reviewed. No command in this runbook performs
those actions.

## Blocker Recording Template

```text
Gate:
Commit/worktree:
Command:
Environment/browser:
Result: pass | fail | blocked
Pass/fail/skip counts:
Artifact hashes:
Exact blocker:
Owner/next action:
```
