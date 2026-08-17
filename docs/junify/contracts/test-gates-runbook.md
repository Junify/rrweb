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
storage, and asserts marker-terminated SPA and stylesheet replay sinks. Current
blockers: explicit seek and both Monitors browser specs are created later. Task
3 builds and packs the candidate package boundaries but does not replace these
cross-repository replay gates.

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
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/replay/seek-virtual-dom.test.ts test/replayer.test.ts
yarn workspace @junify/rrweb-compatibility test -- replay-matrix
```

Assert visible iframe DOM and current time after both forward and backward
explicit seeks. Current blocker: the focused failing-first test is added in
Task 4. Task 2 full-plays independently terminated before/after slices to prove
the mutations are replayable; it does not perform or claim explicit seeking.

## Canvas Gates

### `G-CANVAS-PROCESSOR`

```sh
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/record/image-bitmap-data-url-processor.test.ts test/record/webgl.test.ts test/replay/webgl.test.ts
yarn workspace @junify/rrweb-compatibility test -- record-fixtures
```

Assert injected processor use, packaged worker transfer/result, transparent and
unchanged-frame suppression, strict fallback, dimension/MIME/quality behavior,
and absent OffscreenCanvas/WebGL constructors. Current blocker: injectable API
and focused tests are added in Task 5.

### `G-CANVAS-PIXELS`

Run `G-CANVAS-PROCESSOR`, then the production extension gate:

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn build-prod
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingCompatibility.integration.test.ts
```

Load the production-packed extension in Chrome and record Canvas 2D/WebGL.
Assert application pixels are unchanged, replay pixels match, transferred
bitmaps close, and worker/RAF activity stops. Current blocker: the integration
fixture does not yet observe real worker/pixel/cleanup outcomes.

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
alpha.4 also leaks textarea. Current blocker: Chrome storage and V1/V2 request
scans plus the approved narrow fixes are added in Task 6.

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
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/record/lifecycle.test.ts test/record.test.ts
```

Record iteration count and duration. Assert no events after stop, idempotent
repeated start/stop, worker/RAF shutdown, observer release, live shadow-root
restart, and no retained removed iframe/stylesheet/document mirrors. Current
blocker: `test/record/lifecycle.test.ts` is created in Task 7.

### `G-REPLAYER-LIFECYCLE`

```sh
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/replay/lifecycle.test.ts test/replayer.test.ts
yarn workspace @junify/rrweb-compatibility test -- replay-matrix
```

Assert repeated create/play/seek/destroy clears timers, subscriptions, pending
image/stylesheet/addEvent callbacks, iframe maps, and DOM roots. Current
blocker: `test/replay/lifecycle.test.ts` is created in Task 8.

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
