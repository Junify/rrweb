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

The strict consumer must include this exact literal contract; assigning an
extra-property variable instead is not equivalent:

```ts
const maskInputOptions = {
  password: true,
  textarea: true,
  hidden: true,
} satisfies NonNullable<Parameters<typeof record>[0]>['maskInputOptions'];
```

The packed declaration may extend the official `rrweb-snapshot@2.1.1` public
type locally, but the manifest, tarball, imports, and dependencies must not add
or rename a Junify snapshot package.

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

### Canonical boundary artifact gate

Run from the rrweb repository root with a new, empty output directory:

```sh
export PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH
yarn test:junify-packaging
yarn pack:junify-boundaries \
  --output ../../verification/rrweb-2.1.1/packages-task11-f35dc648 \
  --runs 2
```

The pipeline rejects any runtime other than Node 20.9 and captures HEAD plus an
exact clean tracked/untracked and generated-residue census before creating
output or clearing build products. It rejects retained boundary `types`,
`.svelte.d.ts`, and `tsconfig.tsbuildinfo` paths rather than deleting them. Its
collected seven-path sentinel includes the Git-ignored upstream player
`src/*.svelte.d.ts` and root `tsconfig.tsbuildinfo` surfaces and mutation-proves
that removing the upstream scan root fails before output. The same HEAD and
clean policy are rechecked after every clean, core build, player build, shared
pack, and immediately before canonical emission.

Every targeted dependency/boundary build is forced to `NODE_ENV=production`.
Each run invokes exactly one resolved npm process as `npm pack <absolute-core>
<absolute-player> --pack-destination <shared-empty-dir> --ignore-scripts
--json`; exactly two matching package name/version/filename results are
required. Two consecutive archives must match in SHA-256, SHA-512, integrity,
byte size, regular-file count, file census, and unpacked-tree digest. Archive
bytes are mandatory; tree-only equality is not sufficient. No canonical file
is copied until every source, result-shape, and determinism check passes.

The player CSS mutation gate must fail while leaving the exact live 18-file
content and metadata tree unchanged, including on the expected Vite failure;
no generated `.svelte.d.ts`, `types`, nested absolute-path, or
`tsconfig.tsbuildinfo` artifact may remain. Never run `npm pack` after a
boundary test as an implicit production step.

The old shared `packages/` set remains invalid: core SHA-256 `e075ed25...` used
a different pack path, and player SHA-256 `c4bd708d...` / tree `6b8aaaf9...`
is a production/test hybrid. The round 3 manifest `592f305c...` is also
superseded because it did not fail closed on source state and used one pack
process per role. The round 4 manifest is also superseded for evidence lineage:
its production package bytes are unchanged, but its commit lacks the upstream
ignored-residue mutation sentinel. Install only the two tarballs named by the
round 5 combined manifest, verify their SHA-256, SHA-512, file counts, and tree
digests, then rerun browser and Rails gates. Publication and registry
installation remain separate release actions.

Task 11 reproduced the round-5 identity from committed HEAD `f35dc648` in a
new output directory. The combined manifest SHA-256 is
`b76c77938c8cafec8214bdc78c76644ad95c63825e9255e636b50a9d71221948`.
Core archive/tree SHA-256 are `cb3d29c6...`/`b9ff62b0...`; player archive/tree
SHA-256 are `b317a39f...`/`c9929b76...`. Both consumers' lock integrity and
installed-tree policy matched this one content set. The scoped versions remain
unpublished, so a frozen registry/CDN install is still a release blocker and
was not claimed successful.

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
candidate seek for all four accepted artifacts. Tasks 10 and 11 close both
Monitors browser surfaces and the retained legacy static surface.

### `G-COMPAT-CANDIDATE`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace @junify/rrweb-compatibility test -- record-fixtures replay-matrix
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/monitors/session-recording.spec.ts scenarios/monitors/session-recording-static-player.spec.ts --workers=1 --grep '2.1.1-junify.0'
```

Assert candidate recorder output in both candidate replayers. Task 2's official
2.1.1 baseline is not a substitute. Task 3 creates and package-tests the
candidate boundaries; Tasks 9-11 prove the committed candidate from raw IDB
through V1/V2 and every applicable visible consumer surface.

### `G-WIRE-FORMAT`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace @junify/rrweb-compatibility test -- record-fixtures replay-matrix large-snapshot
```

Compare decoded order, count, FullSnapshot indexes/payloads, and deterministic
digests. Permit only an explicitly documented upstream correctness delta.
Task 2 passes the package-local fixture integrity and official 2.1.1 replay
checks. Tasks 9-11 add the Junify candidate differential and both consumer
surfaces with exact count/index/payload/hash parity.

### `G-LARGE-SNAPSHOT`

```sh
PATH=/Users/takashihamada/.nvm/versions/node/v20.9.0/bin:$PATH PUPPETEER_HEADLESS=true yarn workspace @junify/rrweb-compatibility test -- large-snapshot
cd ../browser-extension-rrweb-2.1.1 && yarn test src/background/command/sessionRecording/v2SessionRecordingFlusher.test.ts
```

Assert roughly 13.6 MB deterministic CSS, event count/index/payload digest,
UTF-8 fragmentation and reassembly, and gzip round trip. Task 2 passes the
13,600,000-byte CSS event/index/payload/raw/gzip checks. Tasks 9-11 add 137
contiguous UTF-8-safe fragments, exact reassembly, Rails loading, and replay.

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
Canvas2D/WebGL pixels. Tasks 9 and 11 exercise the packaged worker, natural
strict-CSP fallback, real IDB/transport, replay pixels, and lifecycle under MV3.

### `G-CANVAS-PIXELS`

Run `G-CANVAS-PROCESSOR`, then the production extension gate:

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn build-prod
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingCompatibility.integration.test.ts
```

Task 5's package-local portion proves byte-identical application WebGL
screenshots before/after numeric sampling, exact replayed Canvas2D/WebGL pixels,
locally owned bitmap closure, worker termination/listener removal, and no late
Canvas event after stop. Tasks 9 and 11 close the remaining boundary in the
production-packed extension: real worker execution, replay pixels, bridge/Blob
URL cleanup, and worker/RAF shutdown.

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
case. Tasks 9 and 11 scan real extension Chrome storage, decoded V1, V2 raw and
reassembled bodies, and gzip with the same policy and sentinels.

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
delete-on-pop, and retry/requeue behavior. Tasks 9 and 11 close this gate with
the committed loaded-MV3 5/5 suite and exact candidate raw-IDB-to-V1/V2 parity.

### `G-TRANSPORT-V1`

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn test src/background/command/sessionRecording/flushSesssionRecordingEventsToServer.test.ts
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingCompatibility.integration.test.ts
```

Assert event-by-event JSON → fflate level-6 deflate → base64 round trip plus
timestamp, index, `firstEvent`, and request metadata at the persisted boundary.
Tasks 9-11 close the real-artifact path through raw IDB, V1 request decoding,
Rails V1 parsing/loading/routing, and a visible browser sink.

### `G-TRANSPORT-V2`

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn test src/background/command/sessionRecording/v2SessionRecordingFlusher.test.ts
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingCompatibility.integration.test.ts
```

Assert sort/order, monotonic 1-based index assignment, event classification,
plain eventString, UTF-8-safe fragment/hash/reassembly, rotation, and
recording_end. Tasks 9-11 close the production-shaped path, including exact
candidate hashes and the 137-fragment large-artifact reassembly.

### `G-TRANSPORT-PARITY`

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn test:integration integration-tests/sessionRecordingCompatibility.integration.test.ts
yarn workspace @junify/rrweb-compatibility test -- large-snapshot replay-matrix
```

Decode both pipelines and compare the logical stream, excluding only V2
transport metadata and its synthetic recording_end. Tasks 9-11 close this with
an independent producer ledger and exact count/index/payload parity.

### `G-NO-CROSS-ORIGIN`

```sh
cd ../browser-extension-rrweb-2.1.1 && yarn test src/injected/sessionRecordingClient/index.test.ts
```

Assert `recordCrossOriginIframes` remains `false`. Task 9 adds and passes the
focused recorder-option case; scope expansion remains forbidden.

## Rails Player Gates

### `G-RAILS-MONITORS-V1`

```sh
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/monitors/session-recording.spec.ts --workers=1 --grep 'V1'
```

Assert production-shaped fetch, deflate/base64 decode, visible DOM/Canvas,
seek, play, and teardown. Tasks 10 and 11 pass the fresh V1/V2 browser matrix
2/2 with no skipped, unexpected, flaky, or retried tests.

### `G-RAILS-MONITORS-V2`

```sh
cd ../junify-rails-rrweb-2.1.1/e2e && yarn test scenarios/monitors/session-recording.spec.ts --workers=1 --grep 'V2'
```

Assert replay-plan segment order, hot pagination, NDJSON chunk parsing,
incremental `addEvents`, visible DOM/Canvas, and no duplicate/gap. Tasks 10 and
11 pass the same fresh dedicated local-only VM matrix 2/2 with no skips.

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
fixtures. Tasks 10 and 11 pass 15/15 unit and 1/1 actual-Chromium cases with the
canonical core artifact. No source reference proves the documented S3
deployment is active; do not convert that uncertainty into a “dead code” claim.

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

## Task 11 Final Cross-Repository Order

Use Node 20.9 where the repository contract requires it. Run the browser
focused command with `NODE_ENV` unset; strict export mode is a separate command
that must receive the canonical manifest and tarball explicitly. The focused
set must include `candidatePackageTypes`:

```sh
env -u NODE_ENV yarn test --runInBand \
  src/injected/sessionRecordingClient/imageBitmapProcessor.test.ts \
  src/injected/sessionRecordingClient/index.test.ts \
  src/background/repository/SessionRecordingEventRepository.test.ts \
  src/background/command/sessionRecording/flushSesssionRecordingEventsToServer.test.ts \
  src/background/command/sessionRecording/v2SessionRecordingFlusher.test.ts \
  src/junify/candidatePackageTypes.test.ts \
  src/foreground/service/sso/sessionRecorder.test.ts
yarn test:integration
```

The exact final-head results were 7 suites/22 tests and 11 suites/70 tests,
both with zero failures and skips. The rrweb actual-browser compatibility set
passed 4 files/11 tests and the target recorder/replayer Chrome set passed
6 files/88 tests, also with zero skips. The fresh Rails local-only VM passed
69/69 RSpec, 122/122 E2E unit, V1/V2 2/2, password rotation 2/2, legacy unit
15/15, and legacy Chromium 1/1. Stop exact process groups, remove the four
Docker services/networks, restore `.bundle/config`, remove generated runtime
files, and delete the dedicated VM after the report gates pass.

Run `yarn build:all` before the focused boundaries, but account for its six
Git-ignored Svelte declaration outputs:

```text
packages/rrweb-player/src/Controller.svelte.d.ts
packages/rrweb-player/src/Player.svelte.d.ts
packages/rrweb-player/src/components/Switch.svelte.d.ts
packages/rrweb-player/types/Controller.svelte.d.ts
packages/rrweb-player/types/Player.svelte.d.ts
packages/rrweb-player/types/components/Switch.svelte.d.ts
```

The standard build generates all six; the unchanged canonical package
preflight rejects them. Remove only these resolved files after recording their
census and before `yarn test:junify-packaging` or canonical pack. `yarn
check-types` may regenerate the three `types/` paths, so repeat the exact census
and cleanup after type checking. Final residue count must be zero. Do not hide
the ordering requirement by reporting only the later 9/9 packed-boundary pass;
whether the standard-build interaction is merge/release blocking is left to
independent review.

Repository-wide `yarn lint` is not green at the final head: the 4 GiB concurrent
run reaches an ESLint OOM alongside existing non-Junify markdownlint findings;
an isolated 8 GiB ESLint run completes with 3 errors and 44 warnings, including
the focused Svelte parser-service failure at
`packages/rrweb-player/src/Controller.svelte:18`. Record that baseline openly.
The required evidence-doc gate is focused `markdownlint docs/junify`, contract
reconciliation, Prettier check, sensitivity probes, and `git diff --check`.

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
