<!-- markdownlint-disable MD013 MD043 -->

# Vendor And Upstream Adoption Decisions

## Decision Vocabulary

- `adopt`: take behavior through the exact upstream 2.1.1 baseline; add no
  duplicate patch.
- `adapt`: reproduce the Junify-facing failure first, then implement the
  smallest 2.1.1-compatible behavior; do not blind-cherry-pick.
- `defer`: keep as an evidence candidate until a named Junify gate proves need.
- `reject`: intentionally exclude from this upgrade.

The `2.1.1` column was checked against peeled commit
`3deb6e7da4528ddb33b5b7ff6a3e805d4ed14930`. Every locally available upstream
commit below is an ancestor of that commit. Vendor PR numbers are the exact
source reference when the coordinator census did not provide a commit object.

## Already Present In Upstream 2.1.1

| Severity | Candidate and exact source                                                                                                                                 | In 2.1.1 | Decision | Junify contract                                                 | Tests/gate                                                                              | Deletion/upstream plan                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | WebKit/Safari monkey-patched MutationObserver tolerance: rrweb PR 1854, `5f52d63636b3246bd5b6ba99a93cba41c5d981cb`                                         | yes      | `adopt`  | recorder remains usable on affected WebKit pages                | upstream focused tests plus `G-RECORDER-LIFECYCLE`                                      | never add a Junify duplicate; inherit stable upstream                                                                                |
| P1       | nested CSS grouping: rrweb PR 1775, `b149cf31ed28cac7b6627972b423d29723524d87`                                                                             | yes      | `adopt`  | nested rules serialize/replay without loss                      | upstream CSS tests plus `G-WIRE-FORMAT`                                                 | no ledger patch; inherit stable upstream                                                                                             |
| P1       | empty `replace`/`replaceSync`: rrweb PR 1774, `ad5ac17422f4cbc450915c5dd6e0c0b0eb6c13a6`                                                                   | yes      | `adopt`  | empty replacement clears stylesheet in recorded/replayed output | upstream stylesheet tests plus compatibility fixture                                    | no ledger patch; inherit stable upstream                                                                                             |
| P1       | absent WebGL constructor guard: rrweb PR 1777, `3b8daa6034414dcb74877fb42cea720949e89549`                                                                  | yes      | `adopt`  | Canvas capture does not throw when WebGL APIs are absent        | `G-CANVAS-PROCESSOR`                                                                    | no ledger patch; inherit stable upstream                                                                                             |
| P1       | relative URL fragment correction: rrweb PR 1865, `b08a06f8f5445e7779fe0744d301a7ceb8d857c3`                                                                | yes      | `adopt`  | replayed fragment URLs remain correct                           | upstream URL tests plus replay matrix                                                   | no ledger patch; inherit stable upstream                                                                                             |
| P2       | live current-time correction: rrweb PR 1864, `7f0f75f14d96fc7043ab6cfb52dfe8bbb73b499e`                                                                    | yes      | `adopt`  | current time does not stick after the last live event           | upstream test; exercised incidentally by player gates                                   | no ledger patch; inherit stable upstream                                                                                             |
| P1       | sandboxed rebuild factory: rrweb PR 1834, `43e4f5b4ad4bb0525a874a545d69443bc58bc47e`                                                                       | yes      | `adopt`  | replay rebuild uses the supported sandbox boundary              | upstream rebuild tests plus Rails player gates                                          | no ledger patch; inherit stable upstream                                                                                             |
| P1       | Vite 6 worker/build migration: rrweb PR 1762, `22bc4c334e88f0b8ee5488d9e1e95cd8093a15c8`                                                                   | yes      | `adopt`  | stable package builds on Vite 6                                 | package build gates                                                                     | retain upstream build; separately adapt `CANVAS-001` because `?worker&inline` is not the MV3 packaged-worker contract                |
| P0       | password type-transition marker: rrweb PRs 1170/1184, `d2582e9a81197130cd93bc1dd778e16fddfb0be3` and `aa79db7568578ea3a413292450cd64f07481e5dd`            | yes      | `adopt`  | password inputs stay marked after a normal observed transition  | `G-PRIVACY`; same-batch property/attribute-method gaps separately adapted as `PRIV-004` | inherit marker; retain `PRIV-004` until upstream passes same-batch and synchronous property/setAttribute/removeAttribute Input gates |
| P0       | textarea serialization/masking corrections: rrweb PRs 1351/1599, `a2be77b82826c4be0e7f3c7c9f7ee50476d5f6f8` and `9cd28b703ec08a77dc6b790dbffb20dfb8e9a513` | yes      | `adopt`  | initial and mutated textarea secrets remain absent              | `G-PRIVACY`; Task 6 covers initial/add/value-attribute/child/Input payloads             | no duplicate patch; keep persisted sentinel even after adoption                                                                      |

## Absent Vendor And Open-Upstream Candidates

| Severity | Candidate and exact source                                                                                                                              | In 2.1.1                                                          | Decision                                                                                                                | Junify contract                                                                                                                                                                                                                          | Tests/gate                                                                                                                                                                            | Deletion/upstream plan                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | backward virtual-DOM skip correction: rrweb closed, unmerged PR 1806; page-listed fix commit `5a99ce0`                                                  | no                                                                | `defer` pending differential evidence; do not stack with Junify seek behavior                                           | `junify.replay.seek-visible-dom`                                                                                                                                                                                                         | `G-SEEK` must reproduce forward and backward visible DOM on unmodified 2.1.1, PR 1806, and the minimal Junify candidate                                                               | retain no PR-1806 patch unless it fixes a distinct failing fixture; delete any adaptation when upstream stable passes the same gate                                    |
| P0       | hidden input masking: Mixpanel PR 4, `c68ae046`; rrweb open PR 1745                                                                                     | no                                                                | `adapt`                                                                                                                 | hidden input values never enter Full/Incremental/storage/V1/V2 payloads; extension explicitly enables the policy                                                                                                                         | Task 6 plus fix round 1 cover both hidden-to-text value orders with unique exact persisted sentinels; ledger `PRIV-001`; Tasks 9/11 raw IDB/V1/V2/gzip GREEN                          | delete when upstream stable exposes equivalent behavior and passes the same persisted sentinel                                                                         |
| P1       | placeholder masking: Mixpanel PR 18, `2a8326d0`                                                                                                         | no                                                                | `adapt`                                                                                                                 | placeholders for masked input/textarea nodes and mutations contain no sentinel; removal remains `null`                                                                                                                                   | Task 6 package-local `G-PRIVACY` GREEN; ledger `PRIV-002`; Tasks 9/11 raw IDB/V1/V2/gzip GREEN                                                                                        | delete when upstream stable passes the initial/mutated/removal placeholder sentinel                                                                                    |
| P1       | general attribute masking callback: rrweb open PR 1257, `74819490`; Sentry PR 107                                                                       | no                                                                | `defer`                                                                                                                 | only add an API if narrow placeholder/sensitive policies leave an evidenced attribute leak                                                                                                                                               | Task 6's narrow `G-PRIVACY` cases leave no such leak, so no public API is added                                                                                                       | no patch exists; if later adapted, remove once upstream API semantics and Junify sentinel agree                                                                        |
| P0       | always-sensitive autocomplete handling: Sentry PR 166, `432fe1f9`                                                                                       | no                                                                | `adapt`                                                                                                                 | values associated with sensitive autocomplete tokens are absent from persisted payloads even with an identity mask function                                                                                                              | Task 6 plus fix round 1 cover compound/mixed-case tokens and both autocomplete-removal/value orders with exact `null` removal; ledger `PRIV-003`; Tasks 9/11 raw IDB/V1/V2/gzip GREEN | delete when upstream stable passes the same autocomplete sentinel matrix                                                                                               |
| P0       | same-batch and pre-observer-flush dynamic password masking: Task 6 differential against upstream 2.1.1                                                  | no                                                                | `adapt`                                                                                                                 | both same-batch type/value mutation orders plus assigned/unassigned temporary password Input through the type property or setAttribute/removeAttribute remain masked before observer flush, without stale or post-stop masking afterward | Task 6 plus fix rounds 1-3 package-local `G-PRIVACY`; ledger `PRIV-004`; Tasks 9/11 raw IDB/V1/V2/gzip GREEN                                                                          | upstream correctness candidate; delete when upstream stable passes all focused lifecycle and method-hook partitions without the patch                                  |
| P1       | recorder cleanup train: PostHog PRs 91 / `2d29f2b`, 94 / `a2ae149`, 142 / `1b1ab0a`, 157 / `6540468`, 159 / `6c3fc6b`, 162 / `20b53c4`, 163 / `89320d3` | no/incomplete                                                     | `adapt` implemented in `9a48eb58`, corrected in `4c79346a`                                                              | stop releases observers/maps/RAF/workers and shadow restarts stay live                                                                                                                                                                   | Task 7 fix-round `G-RECORDER-LIFECYCLE` GREEN; ledger `LIFE-REC-001`                                                                                                                  | retain exact ownership rather than global/shared resets or anonymous handlers; delete only when upstream stable passes the full churn gate                             |
| P1       | stylesheet/iframe cleanup: Mixpanel PR 8 / `eebcd63`, PR 12 / `23d0e1f`; rrweb open PR 1791 / `78b1bdd`                                                 | no/incomplete                                                     | `adapt` implemented in `9a48eb58`, corrected in `4c79346a`                                                              | removed stylesheets/documents/iframes leave no retained mirror/observer state                                                                                                                                                            | Task 7 fix-round `G-RECORDER-LIFECYCLE` GREEN; ledger `LIFE-REC-001`                                                                                                                  | retain single iterative disposal, pending-load ownership, and host refcounts, not the recursive walkers; delete when upstream stable passes the bounded retention gate |
| P1       | replayer teardown: PostHog PR 92 / `f3bdcfe`; PRs 121-123 evaluated separately                                                                          | no/incomplete                                                     | `adapt` PR 92 ownership concept, implemented in `970cc0ce`, corrected in `ccf6c1f3`; reject PRs 121-123 from this scope | destroy clears timers/subscriptions/pending callbacks/iframe maps/roots                                                                                                                                                                  | Task 8 fix-round `G-REPLAYER-LIFECYCLE` GREEN; ledger `LIFE-REP-001`                                                                                                                  | retain the complete owned-resource teardown rather than PR 92's partial map/handler set; delete when upstream stable passes the 50-cycle gate                          |
| P1       | reusable OffscreenCanvas: PostHog PR 139, `1124435e`                                                                                                    | no                                                                | `defer`                                                                                                                 | allocation reuse is allowed only if long-session evidence proves bounded lifetime and preserved pixels                                                                                                                                   | `G-CANVAS-PIXELS` with allocation/cleanup measurement                                                                                                                                 | no patch exists; if later adapted, delete when upstream provides equivalent bounded implementation                                                                     |
| P1       | malformed media-node guard: Mixpanel PR 10, `dfeeb602`; rrweb open PR 1673                                                                              | no                                                                | `adapt` implemented in `d34d4760`                                                                                       | malformed accepted legacy artifacts do not abort replay                                                                                                                                                                                  | exact malformed-media fixture plus valid video sink through `G-REPLAYER-LIFECYCLE` and temporary persisted replay matrix; ledger `DEF-001`                                            | delete when upstream stable includes the guard and fixture passes unmodified                                                                                           |
| P1       | missing style `rules` guard: Sentry PR 162 / `4a91d24c`, merge `0b0e26db`                                                                               | no                                                                | `adapt` implemented in `d34d4760`                                                                                       | absent/null style rules in accepted legacy artifacts do not abort replay                                                                                                                                                                 | exact missing-rules fixture plus valid computed-style sink through `G-REPLAYER-LIFECYCLE` and temporary persisted replay matrix; ledger `DEF-002`                                     | delete when upstream stable includes the guard and fixture passes unmodified                                                                                           |
| P1       | non-destructive WebGL capture: Sentry PR 307, `027138c9`                                                                                                | concept in old Junify Canvas patch, not a complete 2.1.1 contract | `adapt`                                                                                                                 | recording leaves application WebGL pixels unchanged and closes bitmap resources                                                                                                                                                          | `G-CANVAS-PIXELS`; ledger `CANVAS-001`                                                                                                                                                | retain as regression-backed behavior, not a duplicate patch; delete when upstream stable passes Junify pixel/cleanup gate                                              |
| P0 scope | Datadog browser-sdk experimental compact DOM-mutation encoding: [DataDog/browser-sdk PR 4060](https://github.com/DataDog/browser-sdk/pull/4060)         | no; separate wire format and implementation lineage               | `reject`                                                                                                                | `junify.scope.no-compact-serializer`; rrweb event wire format remains unchanged                                                                                                                                                          | `G-NO-COMPACT-SERIALIZER`                                                                                                                                                             | separate architecture story only; never revisit as part of this patch stack without a new approved design                                                              |

## Task 7 Recorder Lifecycle Adaptation

Task 7 used the vendor train as design evidence, not cherry-pick units.
PostHog PR 91's global mutation-buffer reset is replaced by recorder-owned
idempotent disposers. PR 142's observer-local reset of shared Shadow/Canvas
managers is rejected in light of its PR 162 follow-up; manager lifetime belongs
to the recorder. PR 157's anonymous `pagehide`/removed-node handlers are
replaced by exact registered callbacks, and PR 163's realm-sensitive
`instanceof DOMException` check is adapted to `SecurityError` by name. PR 159's
WebKit method classification is retained with a consumer refcount so one stop
cannot invalidate another recorder.

Mixpanel PRs 8/12 and upstream PR 1791 informed the removed-tree behavior, but
their recursive walkers were not copied. The implementation performs one
iterative queue traversal, permanently releases mirror metadata, and tracks
constructed stylesheets by host with shared-sheet refcounts. No cross-origin
iframe recording or wire-format behavior was added.

## Task 8 Replayer Lifecycle And Defensive Adaptation

PostHog PR 92 / `f3bdcfe` supplied useful evidence that a replayer owns its
constructor callbacks, internal emitter handlers, service subscriptions, and
image/Canvas maps. It is not sufficient as a patch unit: it does not release
the player and speed services, media subscriptions and metadata listeners,
stylesheet/adopted-sheet/mouse-tail timers, live RAF, stylesheet load handlers,
new-document/legacy queues, mirror/style/virtual DOM state, or all late
callbacks. Task 8 therefore adapts the ownership principle in `970cc0ce` and
proves the complete set with the 50-cycle source-to-sink gate. Teardown is
idempotent and exception-contained, and Destroy is delivered exactly once
before external handlers are released. Review correction `ccf6c1f3` makes the
Timer fail closed before a host `cancelAnimationFrame` wrapper can throw and
uses a generation token to keep any uncancelled RAF inert.

PostHog PRs 121-123 concern cross-origin `attachedIframes` behavior. Junify has
that feature disabled, the approved upgrade excludes its broad introduction,
and the lifecycle RED did not require it. Those changes are rejected from this
patch stack rather than being silently bundled with PR 92. The stable live-time
and sandbox hardening fixes are already present and were not duplicated.

Mixpanel `dfeeb602` and Sentry `4a91d24c` are adopted exactly as the two narrow
guards in `d34d4760`. The tests first pass a malformed text/div target, then
assert the following valid video and stylesheet events still change visible
sinks; guard-based event dropping cannot make the fixture green. The same
events survive a temporary JSON persistence round trip in the candidate replay
matrix. No schema or wire-format change is introduced. The lifecycle census
observed zero retained strong WebGL-context map entries, so no speculative
WeakMap conversion was added.

## Task 11 Consumer Verification

The vendor decisions do not change in Task 11; their final consumers now have
the missing boundary evidence. The committed MV3 extension exercises
`CANVAS-001` under packaged-worker and strict-CSP fallback paths, then preserves
exact Canvas2D and compositor-visible WebGL/ImageBitmap sinks through storage,
transport, and replay. All four `PRIV-*` adaptations keep 16 distinct candidate
sentinels absent from raw IDB, decoded V1, V2 raw/reassembled, and gzip. The
Rails V1/V2/scoped/direct/static players accept every applicable authenticated
producer with visible DOM, Shadow DOM, Canvas, seek, and lifecycle assertions.

The cross-repository proof does not weaken deletion criteria: each adaptation
remains until an unmodified upstream stable release passes the same exact
source-to-sink gate. Historical fixtures that contain characterized privacy
sentinels are replay compatibility inputs only. The compact serializer,
cross-origin expansion, reusable OffscreenCanvas, WebGPU fallback, and broad
shadow-canvas traversal remain rejected/deferred exactly as recorded above.
No package was published and the unpublished registry/CDN install remains a
separate release blocker.

## Documented Non-Candidate Boundaries

- WebGPU fallback has no approved source patch and no failing Junify fixture.
  It is not a vendor candidate or ledger patch in this upgrade. Reconsider only
  after `G-CANVAS-PIXELS` gains a required WebGPU scenario that fails without
  it; any resulting candidate must receive its own exact source and decision.
- Broad shadow-canvas traversal likewise has no approved source patch or
  failing Junify fixture. Shadow DOM remains a compatibility-fixture concern,
  but expanding Canvas traversal is not a candidate until a named fixture
  demonstrates the need and bounded privacy/performance behavior.

## Candidate Review Rules

1. Reproduce the Junify-facing failure against unmodified 2.1.1.
2. Prefer the smallest narrow behavior compatible with stable source; do not
   copy a fork train blindly.
3. Preserve the event schema and use persisted/output assertions.
4. For cleanup trains, measure bounded real-browser churn rather than callback
   mocks alone.
5. Record RED/GREEN commands and implementation commit in the patch ledger.
6. On every upstream tag bump, run the fixture against unmodified upstream
   first and delete any redundant Junify patch.
