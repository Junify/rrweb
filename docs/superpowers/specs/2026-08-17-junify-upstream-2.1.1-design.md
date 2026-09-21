<!-- markdownlint-disable MD043 -->

# Junify rrweb Upstream 2.1.1 Integration Design

## Context

Junify records browser sessions with a fork of rrweb and replays the persisted
events in two Rails frontends. The fork diverged near upstream commit
`76df9799`: Junify remote `master` is `bad4613d6`, while the current stable
upstream release is `rrweb@2.1.1` at `3deb6e7d`. The fork contains a global
`@junify-app/*` namespace rewrite plus two behaviorally important changes: a
virtual-DOM seek correction and an injectable Canvas bitmap processor used by
the MV3 browser extension.

The global rename makes every upstream sync expensive. At the same time,
updating only the recorder would widen the existing version skew: the browser
extension records with alpha.20, the main Rails replayers use alpha.19, and the
legacy static replayer loads alpha.4. The upgrade therefore has to be treated
as one recorder/replayer compatibility change even though it spans multiple
repositories.

## Goals

- Rebuild the Junify fork from the exact `rrweb@2.1.1` stable commit.
- Keep only small, independently reviewable Junify patches.
- Preserve the consumer-facing `@junify-app/rrweb` package name.
- Preserve the Junify seek behavior and the MV3 injectable Canvas processor.
- Prove compatibility with real recorded artifacts, including alpha.4,
  alpha.19, alpha.20, and the new candidate.
- Add privacy, Canvas, large-snapshot, lifecycle, and persisted-artifact gates.
- Make the next upstream sync a tag bump plus a short patch replay.

## Non-Goals

- Do not change the rrweb event or serialization wire format.
- Do not introduce Datadog's compact serializer, semantic streams, or a codec
  framework.
- Do not expand Junify's disabled cross-origin iframe support.
- Do not publish packages, create releases, push branches, create pull
  requests, deploy, or test on staging.
- Do not clean up the unused `rrweb@^0.9.14` declaration in
  `session_recording_service`; that is unrelated cleanup.
- Do not eliminate the fork before its remaining patches are accepted
  upstream or no longer needed by Junify.

## Chosen Integration Strategy

Create a new linear branch from `rrweb@2.1.1^{}` rather than merging upstream
into the old fork. The old fork is 11 Junify commits ahead and 62 upstream
commits behind stable, and the namespace commit touches 315 files. A merge
would preserve that mechanical divergence and obscure the few behavioral
patches that matter.

The integration branch begins at `3deb6e7d` and adds one concern per commit:

1. Junify publish boundary and patch ledger.
2. Virtual-DOM seek regression test and minimal correction.
3. MV3 Canvas processor contract and minimal injected implementation.
4. Evidence-backed P0/P1 privacy patches.
5. Evidence-backed P0/P1 lifecycle and defensive patches.
6. Compatibility fixtures, runbook, and verification evidence.

Raw Junify commits are reference material, not cherry-pick units. Each
behavioral patch is reimplemented against 2.1.1 after a failing test proves
the gap.

## Package Boundary

Publish only the two packages that need Junify behavior under the Junify
scope:

- `@junify-app/rrweb`, proposed version `2.1.1-junify.0`;
- `@junify-app/rrweb-player`, proposed version `2.1.1-junify.0`.

The player remains scoped because upstream `rrweb-player` bundles the upstream
replayer; using it would bypass the Junify seek correction. Its source must
resolve the patched Junify replayer entry rather than silently bundling an
official unpatched copy.

Unmodified internals keep their upstream identities, including
`@rrweb/types`, `@rrweb/packer`, `@rrweb/replay` where it is not a player
boundary, `@rrweb/utils`, `rrweb-snapshot`, and `rrdom`. Junify does not
duplicate those packages under `@junify-app/*`.

No package is published during this work. Cross-repository verification uses
locally packed tarballs and records their SHA-256 digests. Consumer dependency
bumps are isolated release-gated commits so the exact same package content can
be published later without changing the verified source.

## Repository And Worktree Boundaries

All changes occur in dedicated worktrees:

- rrweb: branch `codex/rrweb-upstream-2.1.1`, based on `3deb6e7d`;
- browser_extension: branch `codex/rrweb-2.1.1-recorder`, based on the latest
  remote `development` head;
- junify_rails: branch `codex/rrweb-2.1.1-replayers`, based on the latest remote
  `development` head.

No `session_recording_service` worktree is created unless later evidence shows
that its npm dependency participates at runtime. Current evidence is that it
does not: no source import/require exists, serverless entry bundles do not
contain rrweb, and packaged service dependencies omit it.

Shared worktrees may have user changes and must never be edited, cleaned,
reset, or used for commits.

## Junify Patch Policy

### Seek correctness

Port the behavioral intent of `8d0afa8`: an explicit play at a different
offset must not build a virtual DOM that is then used for the first sync after
the seek. Add forward and backward seek fixtures and compare the replay DOM at
the post-seek boundary. The test must fail against unmodified 2.1.1 before the
fix is written.

Evaluate upstream PR 1806 only through differential tests. Do not stack two
seek fixes without evidence that they address distinct failures.

### MV3 Canvas processor

Retain only the consumer-used API from `45ea914`:

- injection of an `ImageBitmap` processor into recording;
- packaged worker creation for MV3 strict CSP;
- inline fallback for non-extension consumers;
- worker message handling and transferable bitmaps;
- non-destructive WebGL capture and cleanup of bitmap resources.

Keep these types in the Junify rrweb package instead of forking
`@rrweb/types`. Upstream Vite 6 still imports an inline worker and is therefore
not a replacement for the extension's packaged worker.

WebGPU fallback and broad shadow-canvas traversal are retained only if a
failing Junify scenario demonstrates that they are required. Reuse of an
`OffscreenCanvas` is an implementation candidate only after a long-session
test establishes the allocation/cleanup contract.

### Vendor patches

Adopt only P0/P1 changes that remain absent from 2.1.1 and whose Junify-facing
contract can be reproduced first. Initial candidates are:

- hidden input masking, including dynamic value mutations;
- placeholder masking for masked inputs and textareas;
- always-sensitive autocomplete values;
- consistent attribute masking if a narrow API review supports it;
- recorder MutationObserver, stylesheet, iframe, and shadow-root cleanup;
- replayer teardown and iframe-map cleanup;
- media-node and missing-style-rule defensive guards.

The PostHog recorder cleanup changes must be evaluated as a coherent train;
isolated commits contain known follow-up fixes. Mixpanel cleanup patches are
design references rather than raw cherry-picks because their recursive
walking requires complexity and performance review.

Upstream 2.1.1 already supplies the requested Safari/WebKit observer,
nested-CSS, empty stylesheet replacement, absent-WebGL, relative-URL-fragment,
live-time, sandboxed-rebuild, and Vite 6 changes. No duplicate patches are
added.

## Compatibility Contracts

The serialized rrweb event format is immutable in this upgrade. For a fixed
recording scenario, decoded event order, event count, full-snapshot payload,
V2 index classification, chunk reassembly, and gzip round-trip must remain
equivalent except for explicitly documented upstream correctness changes.

The candidate replayers must consume fixtures recorded by:

- upstream `rrweb@2.0.0-alpha.4`;
- `@junify-app/rrweb@2.0.0-alpha.19`;
- `@junify-app/rrweb@2.0.0-alpha.20`;
- `@junify-app/rrweb@2.1.1-junify.0`.

The candidate recorder must be replayed by both candidate Junify replayers.
Legacy replayers are compatibility inputs, not a reason to constrain the new
recorder to undocumented broken behavior.

Each fixture has a provenance manifest containing producer package and exact
version, scenario, browser/version, creation command, uncompressed and gzip
SHA-256, event count, full-snapshot indexes, and privacy assertions. Generated
fixtures contain no real customer or credential data.

Required scenario coverage is:

- normal DOM and mutations;
- a full snapshot with approximately 13.6 MB of CSS;
- gzip event/index/payload parity;
- Canvas 2D and WebGL;
- seek immediately followed by replay;
- SPA `pushState` and `popstate`;
- Shadow DOM;
- password, textarea, placeholder, dynamic `type=password`, hidden input, and
  sensitive autocomplete privacy;
- `CSSStyleSheet.replace()` and `replaceSync()`, including empty replacement;
- repeated record/stop plus iframe, stylesheet, shadow-root, and Canvas churn.

## Test Layers

Use the thinnest layer that can observe the real risk:

- rrweb unit/integration tests for seek state, serialization/masking branches,
  worker fallback, defensive guards, and deterministic lifecycle cleanup;
- a real-browser rrweb fixture generator and replay matrix for DOM, CSS,
  Canvas, WebGL, SPA, Shadow DOM, privacy, and stylesheet behavior;
- an unpacked production MV3 extension in Chrome for strict-CSP packaged worker
  behavior and persisted payload output;
- the Rails main player and legacy static player against the same persisted
  fixtures;
- Rails Playwright coverage through the production-shaped fetch, decompress,
  parse, and replay boundary;
- long-session or repeated-churn measurements that assert cleanup, not merely
  that stop callbacks were invoked.

Mocks may support local error paths but cannot be the sole evidence for MV3,
privacy payloads, Canvas rendering, persisted-artifact replay, or lifecycle
retention.

## Implementation And Release Order

1. Characterize current alpha fixture behavior and unmodified 2.1.1 gaps.
2. Build the minimal Junify patch stack with red-green-refactor evidence.
3. Pack local artifacts and record content hashes.
4. Update and verify both Rails replayers.
5. Update and verify the browser extension recorder and real MV3 worker.
6. Run the full cross-version matrix and large-snapshot parity gates.
7. Run a fresh-context P0/P1 review and close each finding by a fix or an
   evidence-backed rejection.

In a future release operation outside this task, publish the verified package
content, deploy replayers first, and enable the new recorder last. This task
does none of those external state changes.

## Documentation And Upstream Sync

The rrweb branch will contain:

- a machine- and human-readable compatibility contract inventory;
- a patch ledger listing source, reason, tests, upstream status, and deletion
  condition for every Junify patch;
- an upstream sync runbook that starts from an exact stable tag and reapplies
  the ledger in order;
- verification commands and evidence, including blocked environment gates.

The browser extension documentation will define the recorder package, MV3
worker boundary, persistence formats, privacy policy, and compatibility gate.
The Rails session-recording documentation will define both replayers, accepted
producer versions, persisted artifact shapes, and rollout ordering.

Each upstream sync should:

1. fetch and verify the latest stable tag and remote heads;
2. create a fresh integration branch from the peeled tag commit;
3. run the compatibility fixtures against unmodified upstream;
4. remove ledger patches already covered upstream;
5. reapply remaining patches one at a time with their focused gates;
6. verify local package tarball hashes across all consumers;
7. obtain independent P0/P1 review before any release operation.

## Risks And Controls

- **Version-skew regression:** gate every producer fixture against both
  replayers and update replayers before recorder rollout.
- **Privacy leakage:** inspect persisted event payloads for sentinel secrets;
  rendered masking alone is insufficient.
- **Canvas page mutation:** compare application canvas pixels before and after
  recording and close transferred `ImageBitmap` objects.
- **False cleanup confidence:** use repeated real lifecycle churn and retention
  evidence rather than callback mocks alone.
- **Large fixture bloat:** generate deterministic CSS and record provenance;
  store compressed fixture artifacts only where repository policy permits.
- **Release dependency:** keep version-bump commits separate and verify local
  tarballs; publishing remains an explicit later operation.

## Acceptance Criteria

- The patch stack is based exactly on `3deb6e7d` and contains no global
  internal-package namespace rewrite.
- Every retained Junify patch has a failing-first regression test, ledger row,
  and upstream deletion plan.
- All required alpha and candidate fixtures replay in the main and legacy
  surfaces, or an exact environment blocker is recorded without claiming the
  contract covered.
- Privacy sentinels are absent from persisted payloads.
- The production-packed MV3 extension records Canvas 2D and WebGL through its
  packaged worker under strict CSP and exercises fallback behavior.
- Large-snapshot event count, index, payload, reassembly, and gzip parity pass.
- Required repository tests, builds, lints, and real-browser E2E gates are run
  with pass/fail/skip evidence.
- Independent review has no unresolved P0/P1 findings.
- No publish, release, push, PR, deploy, staging action, shared-worktree edit,
  or wire-format breaking change occurs.
