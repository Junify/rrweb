# Junify rrweb Upstream 2.1.1 Implementation Plan

> **Execution:** Use `superpowers:subagent-driven-development`. Give each task
> to a fresh implementer, require red-green evidence for behavior changes, and
> run a task-scoped spec/quality review before starting the next task.

**Goal:** Rebuild Junify's rrweb fork from exact upstream stable `3deb6e7d`,
retain only tested Junify patches, update every active recorder/replayer, and
prove cross-version compatibility without publishing, pushing, deploying, or
changing the rrweb wire format.

**Architecture:** Upstream packages keep their official names. Two new publish
boundary packages build the patched local source as `@junify-app/rrweb` and
`@junify-app/rrweb-player`; no internal package namespace rewrite is retained.
Versioned real-browser fixtures and persisted-artifact tests form the contract
between the rrweb, browser_extension, and junify_rails worktrees.

**Tech stack:** TypeScript, Vite 6, Vitest/Puppeteer, Yarn 1, Web Workers,
Chrome MV3, React/Jest, Playwright, gzip/deflate artifacts.

## Global Constraints

- rrweb worktree:
  `/Users/takashihamada/Documents/Codex/2026-08-17/junify-rrweb-fork-upstream-session-recording/work/worktrees/rrweb-upstream-2.1.1`
- browser_extension worktree:
  `/Users/takashihamada/Documents/Codex/2026-08-17/junify-rrweb-fork-upstream-session-recording/work/worktrees/browser-extension-rrweb-2.1.1`
- junify_rails worktree:
  `/Users/takashihamada/Documents/Codex/2026-08-17/junify-rrweb-fork-upstream-session-recording/work/worktrees/junify-rails-rrweb-2.1.1`
- Do not edit, clean, reset, commit in, or copy generated state into the shared
  checkouts under `/Users/takashihamada/dev/*`.
- Do not create a `session_recording_service` worktree unless executable
  evidence overturns the current unused-dependency conclusion.
- Do not publish packages, make a release, push, create a PR, deploy, or use
  staging.
- Do not change the rrweb event/wire format, add a compact serializer, or add a
  generalized codec framework.
- Do not expand cross-origin iframe recording.
- Do not commit real customer data or secrets. All privacy values are synthetic
  sentinels.
- Before changing tests, read the repository's routed docs and
  `test-driven-development/writing-good-tests.md`.
- Every production behavior change starts with a test that fails for the
  intended reason. Reports must include RED and GREEN commands/output.
- Tests assert final serialized payload, replayed DOM/pixels, or lifecycle
  state. Mock calls alone do not close a contract.
- Every task updates the contract inventory/coverage and patch ledger entries
  it closes.
- Commit one concern per commit; never squash independent Junify patches into a
  merge-like commit.

## Task 1: Establish The Contract Inventory And Patch Ledger

**Files:**

- Create: `docs/junify/index.md`
- Create: `docs/junify/contracts/contract-inventory.md`
- Create: `docs/junify/contracts/contract-inventory.json`
- Create: `docs/junify/contracts/contract-coverage.md`
- Create: `docs/junify/contracts/test-gates-runbook.md`
- Create: `docs/junify/contracts/audit-loop.md`
- Create: `docs/junify/patch-ledger.md`
- Create: `docs/junify/vendor-adoption.md`
- Create: `docs/junify/upstream-sync.md`

**Step 1: Normalize the three read-only censuses**

Record stable contract IDs for package boundaries, historical replay, seek,
Canvas, privacy, recorder stop, replayer destroy, extension persistence, V1/V2
transport parity, Rails main player, password-rotation artifact player, and the
legacy static player. Every entry names its source, observable sink, current
status, recommended layer, exact gate, and risk.

**Step 2: Record current consumer and fixture matrices**

Include exact locked versions, active entrypoints, persisted formats, existing
fixture provenance, and the strong evidence that the service's `rrweb@^0.9.14`
declaration is unused. Mark Monitors V1/V2 and static-player browser coverage as
`must-cover`; do not call them covered from mocked Jest tests or a README.

**Step 3: Record vendor adoption decisions**

For every requested upstream and Sentry/Datadog/Mixpanel/PostHog candidate,
record severity, exact source commit/PR, 2.1.1 presence, adopt/adapt/reject/
defer decision, Junify contract, tests, and deletion/upstream plan. Explicitly
exclude Datadog compact serialization.

**Step 4: Validate artifacts**

Run:

```sh
node -e "JSON.parse(require('fs').readFileSync('docs/junify/contracts/contract-inventory.json','utf8'))"
git diff --check
```

Expected: JSON parses and no whitespace errors.

**Step 5: Commit**

```sh
git add docs/junify
git commit -m "docs: inventory Junify rrweb compatibility contracts"
```

## Task 2: Create Historical Real-Browser Characterization Fixtures

**Files:**

- Create: `packages/junify-compatibility/package.json`
- Create: `packages/junify-compatibility/vitest.config.ts`
- Create: `packages/junify-compatibility/src/scenarios.ts`
- Create: `packages/junify-compatibility/src/provenance.ts`
- Create: `packages/junify-compatibility/test/record-fixtures.test.ts`
- Create: `packages/junify-compatibility/test/replay-matrix.test.ts`
- Create: `packages/junify-compatibility/test/large-snapshot.test.ts`
- Create: `packages/junify-compatibility/fixtures/manifest.json`
- Create: compressed generated fixtures beneath
  `packages/junify-compatibility/fixtures/`
- Modify: `yarn.lock`
- Modify: Task 1 contract/coverage/runbook artifacts

The private workspace aliases these exact producers:

- `rrweb@2.0.0-alpha.4`;
- `@junify-app/rrweb@2.0.0-alpha.19`;
- `@junify-app/rrweb@2.0.0-alpha.20`;
- official `rrweb@2.1.1` as the unmodified stable baseline.

**Step 1: Write the provenance and scenario tests first**

Tests require exact producer version, browser/version, creation command,
uncompressed/gzip SHA-256, event count, FullSnapshot indexes, and privacy
sentinel scan. The scenarios cover DOM, SPA history, Shadow DOM, password,
textarea, placeholder, dynamic password type, stylesheet replace/replaceSync,
Canvas 2D, WebGL, and seek-ready mutations.

**Step 2: Verify RED**

Run the new tests before fixture generation. Expected: failure for missing
manifest/artifacts, not dependency or syntax errors.

**Step 3: Generate real-browser fixtures**

Use a deterministic local page. Store gzip artifacts and manifests, not
customer recordings. Build the large FullSnapshot from approximately
13.6 MB of deterministic CSS and assert raw CSS size plus decoded event count,
indexes, and payload digest.

**Step 4: Verify GREEN**

```sh
yarn workspace @junify/rrweb-compatibility test
```

Expected: every historic producer artifact is generated/validated, 2.1.1
replays all accepted historic artifacts, and no test is skipped.

**Step 5: Commit**

```sh
git add packages/junify-compatibility yarn.lock docs/junify
git commit -m "test: characterize historical rrweb recordings"
```

## Task 3: Add Narrow Junify Publish Boundaries

**Files:**

- Create: `packages/junify-rrweb/package.json`
- Create: `packages/junify-rrweb/src/index.ts`
- Create: `packages/junify-rrweb/vite.config.ts`
- Create: `packages/junify-rrweb/test/package-boundary.test.ts`
- Create: `packages/junify-rrweb/README.md`
- Create: `packages/junify-rrweb-player/package.json`
- Create: `packages/junify-rrweb-player/src/index.ts`
- Create: `packages/junify-rrweb-player/vite.config.ts`
- Create: `packages/junify-rrweb-player/test/package-boundary.test.ts`
- Create: `packages/junify-rrweb-player/README.md`
- Modify: `yarn.lock`
- Modify: `docs/junify/patch-ledger.md`

The upstream `rrweb`, `rrweb-player`, `@rrweb/types`, `rrweb-snapshot`, and
other internal package names remain untouched. The new packages build local
source and expose version `2.1.1-junify.0`. The player build aliases its replay
implementation and replay CSS to patched local rrweb source without copying
the Svelte player implementation.

**Step 1: Write installed-package smoke tests**

Pack each boundary into a temporary directory, install/use the packed artifact,
and assert ESM, CJS/UMD, types, CSS, `record`, `Replayer`, player constructor,
and global name as applicable. The expected package tarball contains no
Junify-renamed internal packages.

**Step 2: Verify RED**

Run:

```sh
yarn workspace @junify-app/rrweb test
yarn workspace @junify-app/rrweb-player test
```

Expected: workspace/package missing before implementation.

**Step 3: Implement the minimal wrappers/build aliases**

Do not rename upstream manifests or imports. Do not add behavior beyond the
publish boundary.

**Step 4: Verify GREEN**

```sh
yarn workspace @junify-app/rrweb build
yarn workspace @junify-app/rrweb test
yarn workspace @junify-app/rrweb-player build
yarn workspace @junify-app/rrweb-player test
```

Expected: package import/pack smoke tests pass.

**Step 5: Commit**

```sh
git add packages/junify-rrweb packages/junify-rrweb-player yarn.lock docs/junify/patch-ledger.md
git commit -m "build: add narrow Junify package boundaries"
```

## Task 4: Reapply The Virtual-DOM Seek Correction

**Files:**

- Create or modify: `packages/rrweb/test/replay/seek-virtual-dom.test.ts`
- Modify: `packages/rrweb/src/replay/index.ts`
- Modify: `packages/junify-compatibility/test/replay-matrix.test.ts`
- Modify: `docs/junify/patch-ledger.md`
- Modify: contract/coverage artifacts for seek IDs

**Step 1: Write a failing behavior test**

Create forward and backward seek cases where the first sync after an explicit
offset would otherwise use stale virtual DOM. Assert the visible iframe DOM and
current time after the seek; do not assert a private flag.

**Step 2: Verify RED against unmodified 2.1.1**

```sh
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/replay/seek-virtual-dom.test.ts
```

Expected: DOM-equivalence assertion fails for the intended stale virtual-DOM
reason.

**Step 3: Implement the minimal state transition**

Port the intent of Junify `8d0afa8`, adapted to 2.1.1. Do not combine upstream
PR 1806 unless a separate differential test fails.

**Step 4: Verify GREEN and regression scope**

```sh
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/replay/seek-virtual-dom.test.ts test/replayer.test.ts
yarn workspace @junify/rrweb-compatibility test -- replay-matrix
```

**Step 5: Commit**

```sh
git add packages/rrweb packages/junify-compatibility docs/junify
git commit -m "fix(replay): preserve DOM correctness after seek"
```

## Task 5: Rebuild The MV3 Canvas Bitmap Processor

**Files:**

- Modify: `packages/rrweb/src/index.ts`
- Modify: `packages/rrweb/src/record/index.ts`
- Modify: `packages/rrweb/src/types.ts`
- Modify: `packages/rrweb/src/record/observers/canvas/canvas-manager.ts`
- Create: `packages/rrweb/src/record/workers/image-bitmap-data-url-processor.ts`
- Modify: `packages/rrweb/src/record/workers/image-bitmap-data-url-worker.ts`
- Create: `packages/rrweb/test/record/image-bitmap-data-url-processor.test.ts`
- Modify: `packages/rrweb/test/record/webgl.test.ts`
- Modify: `packages/junify-compatibility/test/record-fixtures.test.ts`
- Modify: `docs/junify/patch-ledger.md`

**Step 1: Write failing processor contract tests**

Cover injected processor use, worker transfer/result, transparent and unchanged
frame suppression, strict fallback, cancellation/cleanup, bitmap close,
dimension changes, MIME/quality, absent OffscreenCanvas/WebGL constructors, and
recording not changing application WebGL pixels.

**Step 2: Verify RED**

Run the new processor and WebGL tests. Expected: API/import assertions fail
because 2.1.1 exposes only the inline worker.

**Step 3: Implement the smallest injected API**

Expose `imageBitmapProcessor`, inline/worker processor factories, and worker
message handler from `rrweb`. Keep the types local to `packages/rrweb`; do not
fork `@rrweb/types`. Preserve packaged-worker and inline fallback. Add WebGPU or
broad shadow-canvas behavior only if a required fixture fails without it.

**Step 4: Verify GREEN**

```sh
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/record/image-bitmap-data-url-processor.test.ts test/record/webgl.test.ts test/replay/webgl.test.ts
yarn workspace @junify/rrweb-compatibility test -- record-fixtures
```

**Step 5: Commit**

```sh
git add packages/rrweb packages/junify-compatibility docs/junify
git commit -m "feat(canvas): inject MV3-compatible bitmap processing"
```

## Task 6: Add P0/P1 Privacy Sentinels And Fixes

**Files:**

- Modify: `packages/rrweb-snapshot/src/snapshot.ts`
- Modify as required: `packages/rrweb-snapshot/src/utils.ts`
- Modify as required: `packages/rrweb/src/record/mutation.ts`
- Modify as required: `packages/rrweb/src/types.ts`
- Modify as required: `packages/types/src/index.ts` only for an upstream-owned
  public option; Junify-only options stay in `packages/rrweb/src/types.ts`
- Modify: `packages/rrweb-snapshot/test/snapshot.test.ts`
- Modify: `packages/rrweb/test/integration.test.ts`
- Modify: `packages/junify-compatibility/test/record-fixtures.test.ts`
- Modify: `docs/junify/vendor-adoption.md`
- Modify: `docs/junify/patch-ledger.md`

**Step 1: Write failing payload-level tests**

Use distinct synthetic sentinels for initial and mutated values. Cover hidden
inputs, placeholders, password/text type transitions in both mutation orders,
textarea value/child mutations, and sensitive autocomplete values. Assert
plaintext is absent from emitted FullSnapshot and IncrementalSnapshot JSON.

Evaluate a general `maskAttributeFn` only after the narrow tests demonstrate a
Junify requirement not already closed by placeholder/sensitive policies.

**Step 2: Verify RED**

Run snapshot and recorder integration tests against the unmodified behavior.
Each adopted contract must fail for the intended leak before implementation.

**Step 3: Implement minimal policy**

Adapt the smallest stable-2.1.1-compatible behavior. Do not copy a vendor patch
blindly and do not alter event schema.

**Step 4: Verify GREEN**

```sh
yarn workspace rrweb-snapshot test
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/integration.test.ts
yarn workspace @junify/rrweb-compatibility test -- record-fixtures
```

**Step 5: Commit one privacy concern per commit**

Use commit messages such as:

```text
fix(privacy): mask hidden input values
fix(privacy): mask placeholder mutations
fix(privacy): protect sensitive autocomplete values
```

## Task 7: Close Recorder Lifecycle And Stylesheet Retention Gaps

**Files:**

- Modify: `packages/rrweb/src/record/index.ts`
- Modify: `packages/rrweb/src/record/observer.ts`
- Modify: `packages/rrweb/src/record/mutation.ts`
- Modify: `packages/rrweb/src/record/observers/canvas/canvas-manager.ts`
- Modify as required: `packages/rrweb-snapshot/src/mirror.ts`
- Modify as required: stylesheet/iframe observer modules identified by census
- Create: `packages/rrweb/test/record/lifecycle.test.ts`
- Modify: `packages/rrweb/test/record.test.ts`
- Modify: `docs/junify/vendor-adoption.md`
- Modify: `docs/junify/patch-ledger.md`

**Step 1: Write failing lifecycle tests**

Prove no events after stop, repeated start/stop does not duplicate listeners,
canvas RAF/worker activity stops, iframe navigation/removal releases observers,
shadow-root restarts remain live, and removed stylesheets/documents no longer
remain in mirrors. Use real browser lifecycle churn; local unit spies may only
supplement it.

**Step 2: Verify RED**

Run the new lifecycle file and record the exact retained listener/map/worker or
post-stop emission that fails.

**Step 3: Adapt coherent vendor changes**

Treat the PostHog recorder cleanup train as a unit when required; include its
follow-up shadow-DOM recursion fixes. Adapt Mixpanel mirror cleanup rather than
copying recursive walkers without bounded-complexity review.

**Step 4: Verify GREEN and bounded churn**

```sh
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/record/lifecycle.test.ts test/record.test.ts
```

Record iteration counts, duration, and retained-resource assertions in the
runbook.

**Step 5: Commit**

```sh
git add packages/rrweb packages/rrweb-snapshot docs/junify
git commit -m "fix(record): release observers and canvas resources"
```

## Task 8: Close Replayer Teardown And Defensive P1 Gaps

**Files:**

- Modify: `packages/rrweb/src/replay/index.ts`
- Modify as required: `packages/rrweb/src/replay/timer.ts`
- Modify as required: replay media and stylesheet modules
- Create: `packages/rrweb/test/replay/lifecycle.test.ts`
- Modify: `packages/rrweb/test/replayer.test.ts`
- Modify: `packages/junify-compatibility/test/replay-matrix.test.ts`
- Modify: `docs/junify/vendor-adoption.md`
- Modify: `docs/junify/patch-ledger.md`

**Step 1: Write failing tests**

Repeatedly create/play/seek/destroy iframe-heavy replayers. Assert timers,
subscriptions, pending image/stylesheet callbacks, iframe maps, and DOM roots
are cleared and no post-destroy callback runs. Add malformed legacy media-node
and absent/null style-rules fixtures for the small defensive guards.

**Step 2: Verify RED**

Run the lifecycle and legacy fixture tests against current code and record each
specific failure.

**Step 3: Implement minimal adapted fixes**

Port only proven P1 teardown/guard behavior. Do not generalize the replayer
lifecycle API.

**Step 4: Verify GREEN**

```sh
yarn workspace rrweb build
PUPPETEER_HEADLESS=true yarn workspace rrweb vitest run test/replay/lifecycle.test.ts test/replayer.test.ts
yarn workspace @junify/rrweb-compatibility test -- replay-matrix
```

**Step 5: Commit by concern**

Separate teardown from defensive guards.

## Task 9: Update And Verify The Browser Extension Recorder

**Files:**

- Modify: `package.json`
- Modify release-gated: `yarn.lock`
- Modify: `src/injected/sessionRecordingClient/index.ts`
- Modify: `src/injected/sessionRecordingClient/imageBitmapProcessor.ts`
- Modify: `src/injected/sessionRecordingClient/canvasBitmapWorker.ts`
- Modify: `src/injected/sessionRecordingClient/workerSource.ts`
- Create: `src/injected/sessionRecordingClient/index.test.ts`
- Create: `src/injected/sessionRecordingClient/imageBitmapProcessor.test.ts`
- Create: `src/background/repository/SessionRecordingEventRepository.test.ts`
- Modify: `integration-tests/sessionRecordingBridgeIntegration.integration.test.ts`
- Modify: `integration-tests/sessionRecordingCompatibility.integration.test.ts`
- Modify as required: `integration-tests/session-recording-compat-html/*`
- Create: `docs/features/session-recording/index.md`
- Modify: `docs/features/index.md`

**Step 1: Build local package artifacts**

Pack `@junify-app/rrweb@2.1.1-junify.0` from the rrweb worktree, record SHA-256,
and install it only in this dedicated worktree. Do not publish. Keep any
temporary local-file override out of the final commit; isolate the future npm
version bump as a release-gated commit.

**Step 2: Write failing extension tests**

Assert actual recorder options and raw emitted payload privacy; packaged worker
URL and transfer; strict-CSP/worker failure fallback; extension-origin checks;
real storage queue ordering/deletion/retry; V1 deflate/base64 round trip; V2
event index/type/payload parity; and approximately 13.6 MB CSS fragmentation/
reassembly.

**Step 3: Verify RED**

Run focused Jest/integration tests before source changes. Failures must be at
the missing candidate contract, not missing built assets.

**Step 4: Update recorder and docs**

Use `@junify-app/rrweb` only. Remove the direct
`@junify-app/rrweb-snapshot` dependency if source census proves it is no longer
imported; use official packages for any remaining unmodified APIs. Enable the
approved hidden-input/privacy policy explicitly.

**Step 5: Run real MV3 verification**

Build and load the production-shaped unpacked extension in Chrome. Record a
page with DOM, Canvas 2D, WebGL, SPA navigation, Shadow DOM, privacy sentinels,
and stylesheet replacements. Observe the real queued/persisted artifact and
assert no plaintext sentinels, correct canvas output, worker use, and fallback.

```sh
yarn lint
yarn test
yarn test:integration
yarn build
yarn build-prod
```

Also run the focused session-recording integration command documented in the
contract runbook. Report exact pass/fail/skip counts.

**Step 6: Commit**

Keep behavior/tests/docs in a merge-ready commit. Keep the future registry
dependency/lock bump in a distinct release-gated commit identified in the
handoff.

## Task 10: Update And Verify All Rails Replayers

**Files:**

- Modify: `frontend_v2/package.json`
- Modify release-gated: `frontend_v2/yarn.lock`
- Modify as required: `frontend_v2/src/lib/react-rrweb-player/*`
- Modify: relevant tests beneath `frontend_v2/src/lib/react-rrweb-player/`
- Modify: relevant Monitors player/parser/loader tests beneath
  `frontend_v2/src/pages/monitors/sessionRecording/`
- Modify: `frontend_rrweb_replayer/index.html`
- Modify: `frontend_rrweb_replayer/build.js`
- Create: `frontend_rrweb_replayer/replay.test.ts` or an equivalent real-browser
  static-player test using the repository's supported harness
- Modify: `e2e/scenarios/application/member-password-rotation-requests.spec.ts`
- Modify as required: `e2e/scenarios/application/coverage.md`
- Modify: `docs/features/application/session_recording/overview.md`

**Step 1: Install the exact local tarballs**

Use the same rrweb and player tarball SHA-256 values verified in Task 9. Keep
temporary local-file overrides out of the final commit; isolate future registry
bumps as release-gated commits.

**Step 2: Write failing compatibility tests**

Feed alpha.4, alpha.19, alpha.20, and candidate persisted fixtures into the
actual Rails parsing/decompression boundary and real player implementations.
Assert replayed DOM/canvas/seek-visible state, not just constructor calls. Add a
local real-browser static-player test for the `EVENTS`/`META-TIME-SKIP`
postMessage protocol and allow `build.js` to select the verified local UMD
artifact without changing the production default contract.

**Step 3: Verify RED then implement minimal consumer changes**

Keep both the main scoped player and direct `Replayer` path on the same
candidate implementation. Update the legacy static CDN target to the future
scoped version while retaining local-artifact verification.

**Step 4: Run focused and broad frontend gates**

```sh
env TZ=UTC NODE_ENV=test NODE_OPTIONS=--openssl-legacy-provider \
  ./node_modules/.bin/jest --config=configs/test/jest.json --runInBand \
  src/lib/react-rrweb-player \
  src/pages/monitors/sessionRecording \
  src/components/application/passwordRotation/SessionRecordingPlayerModal.test.tsx
yarn type-check
yarn build
cd ../frontend_rrweb_replayer && yarn build
```

**Step 5: Run scenario-faithful E2E**

Run the password-rotation persisted artifact scenario with `--workers=1` and
no skips. Add a real-browser harness around the actual Monitors `PlayerFrame`
and parser/loader boundary so V1 and V2 artifact shapes reach the candidate
`Replayer` and produce visible DOM. Exercise the Monitors route itself when the
existing scenario support can own deterministic data and cleanup without
contacting the external recording service. If the external V2 read service is
unavailable, substitute only that outbound boundary with a deterministic local
fixture server; do not mock the Rails/frontend parser, loader, or player. A
fixture-only direct-Replayer unit test does not close the Rails main-player
contract.

**Step 6: Commit**

Keep tests/docs/source merge-ready and the future registry version/lock bump in
a separate release-gated commit.

## Task 11: Run The Cross-Repository Compatibility Matrix

**Files:**

- Modify: `docs/junify/contracts/contract-coverage.md`
- Modify: `docs/junify/contracts/test-gates-runbook.md`
- Modify: `docs/junify/contracts/audit-loop.md`
- Modify: `docs/junify/patch-ledger.md`
- Modify: `docs/junify/vendor-adoption.md`
- Create: `docs/junify/verification/2026-08-17-results.md`

**Step 1: Repack and hash candidate packages**

Build from committed rrweb source, generate fresh tarballs, and prove their
SHA-256 equals the artifacts used by both consumers or reinstall/re-run until
all consumers use one exact content set.

**Step 2: Execute the matrix**

For every alpha.4/alpha.19/alpha.20/candidate producer, replay in the candidate
core replayer, scoped player, Rails main paths, and legacy static player where
the surface accepts the format. Record pass/fail/skip, fixture digest, browser,
and observable assertions.

**Step 3: Execute repository gates**

rrweb:

```sh
NODE_OPTIONS='--max-old-space-size=4096' yarn build:all
PUPPETEER_HEADLESS=true yarn test
yarn check-types
yarn lint
```

Run all browser_extension and Rails commands from Tasks 9 and 10 on their
committed heads. Confirm target tests ran and no target was skipped.

**Step 4: Close coverage statuses**

Change `must-cover` to `covered` only with executable evidence. Preserve exact
`not-testable-yet` blockers. Any remaining feasible P0/P1 contract returns to
implementation; it is not a documentation-only residual.

**Step 5: Commit evidence**

```sh
git add docs/junify
git commit -m "docs: record rrweb 2.1.1 compatibility evidence"
```

## Final Review Gate

After Task 11, generate one full diff package per repository and dispatch a
fresh, most-capable reviewer with only the approved design, plan, contract
inventory, ledger, and diff packages. The reviewer must classify only P0/P1
(`Critical`/`Important`) as blocking. Dispatch one consolidated fix agent for
all real findings, then one scoped re-review. Every finding ends as fixed or an
evidence-backed ruling in `audit-loop.md`; no unresolved P0/P1 may remain.

Finally rerun the exact affected commands from fresh committed heads before any
completion claim. Do not push, publish, release, deploy, or remove worktrees.
