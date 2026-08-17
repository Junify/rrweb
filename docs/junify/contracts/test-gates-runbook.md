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
yarn workspace @junify-app/rrweb build
yarn workspace @junify-app/rrweb test
```

Assert packed ESM, CJS/UMD, types, CSS/global exports, `record`, and `Replayer`;
inspect the tarball to prove there are no Junify-renamed internal packages.
Current blocker: `packages/junify-rrweb` is created in Task 3.

### `G-PKG-PLAYER`

```sh
yarn workspace @junify-app/rrweb-player build
yarn workspace @junify-app/rrweb-player test
```

Assert player construction, CSS/types/exports, and that the packed player
resolves the patched local replayer. Current blocker:
`packages/junify-rrweb-player` is created in Task 3.

## Compatibility And Replay Gates

### `G-COMPAT-HISTORICAL`

```sh
yarn workspace @junify/rrweb-compatibility test -- replay-matrix
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/monitors/session-recording.spec.ts scenarios/monitors/session-recording-static-player.spec.ts --workers=1
```

Assert provenance-locked alpha.4, alpha.19, and alpha.20 fixtures visibly
replay in both candidate surfaces. Current blockers: compatibility workspace
and both Monitors browser specs are created later; the current recordings lack
producer provenance.

### `G-COMPAT-CANDIDATE`

```sh
yarn workspace @junify/rrweb-compatibility test -- record-fixtures replay-matrix
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/monitors/session-recording.spec.ts scenarios/monitors/session-recording-static-player.spec.ts --workers=1 --grep '2.1.1-junify.0'
```

Assert candidate recorder output in both candidate replayers. Current blocker:
candidate packages and fixtures do not exist before Tasks 2–3.

### `G-WIRE-FORMAT`

```sh
yarn workspace @junify/rrweb-compatibility test -- record-fixtures replay-matrix large-snapshot
```

Compare decoded order, count, FullSnapshot indexes/payloads, and deterministic
digests. Permit only an explicitly documented upstream correctness delta.
Current blocker: compatibility workspace/fixtures are created in Task 2.

### `G-LARGE-SNAPSHOT`

```sh
yarn workspace @junify/rrweb-compatibility test -- large-snapshot
cd ../browser-extension-rrweb-2.1.1 && yarn test src/background/command/sessionRecording/v2SessionRecordingFlusher.test.ts
```

Assert roughly 13.6 MB deterministic CSS, event count/index/payload digest,
UTF-8 fragmentation and reassembly, and gzip round trip. Current blocker: the
large fixture is created in Task 2. Existing service fixtures top out at a
1,432,290-byte eventString.

### `G-SEEK`

```sh
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/replay/seek-virtual-dom.test.ts test/replayer.test.ts
yarn workspace @junify/rrweb-compatibility test -- replay-matrix
```

Assert visible iframe DOM and current time after both forward and backward
explicit seeks. Current blocker: the focused failing-first test is added in
Task 4.

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
hidden, and sensitive-autocomplete sentinels. Current blocker: Junify
persisted-payload sentinels and the approved narrow fixes are added in Task 6.

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
