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

| Patch ID       | State                            | Reason / Junify contract                                                                                                                                                               | Source reference                                                                                                                                                                                          | Required tests/gate                                                                                                                               | Upstream status                                                                                                                                    | Delete when                                                                                                       |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `BND-001`      | implemented; release-gated       | Publish only `@junify-app/rrweb@2.1.1-junify.0`; preserve official internal identities (`junify.package-boundary.rrweb`)                                                               | approved integration design; old namespace rewrite `af62ec15` is negative reference only                                                                                                                  | `G-PKG-RRWEB`; packed artifact export/name inspection; Task 3 evidence below                                                                      | Junify package boundary is not an upstream concern                                                                                                 | Junify no longer publishes a forked rrweb boundary                                                                |
| `BND-002`      | implemented; release-gated       | Publish `@junify-app/rrweb-player@2.1.1-junify.0` and force it to bundle the patched local replayer (`junify.package-boundary.player`)                                                 | approved integration design; old scoped player package is behavior reference only                                                                                                                         | `G-PKG-PLAYER`; prove packed player does not resolve unpatched official replay; Task 3 evidence below                                             | Junify package boundary is not an upstream concern                                                                                                 | player can consume an upstream release that includes every required Junify replayer patch, or the fork is retired |
| `SEEK-001`     | implemented; upstream-candidate  | First synchronization after explicit forward/backward seek must use correct real DOM (`junify.replay.seek-visible-dom`)                                                                | Junify `8d0afa80f6fdf94226c914964a7a647c7f44f9c5`; upstream PR 1806 evaluated as a narrower separate issue                                                                                                | `G-SEEK`; focused RED/GREEN plus eight authenticated historical seeks and 13.6 MB timing                                                          | absent from 2.1.1; suitable for a focused upstream correctness PR with the behavior fixture                                                        | an upstream stable release passes the same forward/backward fixture without this patch                            |
| `CANVAS-001`   | implemented; cross-repo verified | Preserve consumer-used injected ImageBitmap processor, packaged MV3 worker, inline fallback, transfer/close, and non-destructive capture (`junify.canvas.*`)                           | Junify `45ea914e78f70f54d386bf341f7d55567f200b68`; Sentry PR 307 / `027138c9`; upstream Vite PR 1762 / `22bc4c33` does not replace packaged worker                                                        | `G-CANVAS-PROCESSOR`, `G-CANVAS-PIXELS`; Tasks 5/9/11 local, MV3, and cross-repo evidence                                                         | injectable API absent from 2.1.1; upstream Vite 6 still uses an inline-worker import                                                               | upstream exposes an equivalent tested injectable/packaged-worker API and passes Junify MV3/pixel/cleanup gates    |
| `PRIV-001`     | implemented; cross-repo verified | Mask hidden input values in initial and mutated persisted payloads (`junify.privacy.persisted-sentinels`)                                                                              | Mixpanel PR 4 / `c68ae046`; upstream open PR 1745                                                                                                                                                         | Tasks 6/9/11 `G-PRIVACY`; raw IDB/V1/V2/gzip verified                                                                                             | absent from 2.1.1                                                                                                                                  | upstream stable masks hidden inputs under the Junify policy and passes the same persisted sentinel gate           |
| `PRIV-002`     | implemented; cross-repo verified | Mask placeholders for masked inputs/textareas, including mutations while preserving removal as `null` (`junify.privacy.persisted-sentinels`)                                           | Mixpanel PR 18 / `2a8326d0`                                                                                                                                                                               | Tasks 6/9/11 `G-PRIVACY`; raw IDB/V1/V2/gzip verified                                                                                             | absent from 2.1.1                                                                                                                                  | upstream stable provides equivalent placeholder masking and passes the persisted sentinel gate                    |
| `PRIV-003`     | implemented; cross-repo verified | Always protect values for sensitive autocomplete tokens, even with an identity mask function (`junify.privacy.persisted-sentinels`)                                                    | Sentry PR 166 / `432fe1f9`                                                                                                                                                                                | Tasks 6/9/11 `G-PRIVACY`; raw IDB/V1/V2/gzip verified                                                                                             | absent from 2.1.1                                                                                                                                  | upstream stable provides equivalent sensitive-autocomplete handling and passes the persisted sentinel gate        |
| `PRIV-004`     | implemented; upstream-candidate  | Preserve password masking across same-batch type/value orders and synchronous property/setAttribute/removeAttribute Input before observer flush (`junify.privacy.persisted-sentinels`) | Task 6 differential against upstream 2.1.1                                                                                                                                                                | Tasks 6/9/11 `G-PRIVACY`; raw IDB/V1/V2/gzip verified                                                                                             | absent from 2.1.1; suitable for a focused upstream correctness PR                                                                                  | upstream stable passes same-batch and synchronous property/attribute-method fixtures without this patch           |
| `LIFE-REC-001` | implemented; upstream-candidate  | Stop must release MutationObserver, iframe, stylesheet, shadow-root, Canvas RAF/worker, and mirror resources (`junify.lifecycle.recorder-stop`)                                        | PostHog PRs 91 / `2d29f2b`, 94 / `a2ae149`, 142 / `1b1ab0a`, 157 / `6540468`, 159 / `6c3fc6b`, 162 / `20b53c4`, 163 / `89320d3`; Mixpanel PRs 8 / `eebcd63`, 12 / `23d0e1f`; upstream PR 1791 / `78b1bdd` | Task 7 fix-round `G-RECORDER-LIFECYCLE`; 50-cycle churn, pending-link ownership, pagehide generation, final stylesheet owner, cleanup-throw sinks | behavior absent/incomplete in 2.1.1; `9a48eb58` plus review correction `4c79346a`, without shared resets, anonymous handlers, or recursive walkers | upstream stable passes the complete 50-cycle/generation/retention/WebKit gate without this adaptation             |
| `LIFE-REP-001` | implemented; upstream-candidate  | Destroy must release timers, subscriptions, pending callbacks, iframe maps, and roots (`junify.lifecycle.replayer-destroy`)                                                            | PostHog PR 92 / `f3bdcfe`; PRs 121-123 rejected as cross-origin scope                                                                                                                                     | Task 8 fix-round `G-REPLAYER-LIFECYCLE`; 50-cycle ownership/silence census and cleanup-throw sink                                                 | absent/incomplete in 2.1.1; implemented by `970cc0ce` and review correction `ccf6c1f3` beyond PR 92's partial teardown                             | upstream stable passes the complete 50-cycle lifecycle gate without Junify adaptation                             |
| `DEF-001`      | implemented; upstream-candidate  | Malformed legacy media nodes must not abort replay matrix (`junify.compatibility.historical-replay`)                                                                                   | Mixpanel PR 10 / `dfeeb602`; upstream open PR 1673                                                                                                                                                        | Task 8 `G-REPLAYER-LIFECYCLE` plus malformed legacy and following-valid-video sinks in persisted matrix                                           | absent from 2.1.1; exact guard implemented by `d34d4760`                                                                                           | upstream stable contains the guard and passes the legacy fixture                                                  |
| `DEF-002`      | implemented; upstream-candidate  | Missing/null style `rules` must not abort legacy replay (`junify.compatibility.historical-replay`)                                                                                     | Sentry PR 162 / `4a91d24c`, merge `0b0e26db`                                                                                                                                                              | Task 8 `G-REPLAYER-LIFECYCLE` plus missing-rules and following-valid-style sinks in persisted matrix                                              | absent from 2.1.1; exact guard implemented by `d34d4760`                                                                                           | upstream stable contains the guard and passes the legacy fixture                                                  |

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
- Canonical packaging: `yarn pack:junify-boundaries --output <new-empty-dir>
--runs 2` requires Node 20.9, forces `NODE_ENV=production`, starts each run
  from fresh boundary outputs, and uses one resolved `npm pack` process per run
  with both absolute package directories and one shared empty destination. It
  accepts exactly two matching name/version/filename results and fails closed
  unless consecutive archive SHA-256, SHA-512, integrity, size, regular-file
  count, census, and unpacked-tree digests are exact. Before any output or
  cleanup, and after each clean/build/pack stage, it requires one unchanged HEAD,
  an empty tracked/untracked status, and zero retained boundary `types`, Svelte
  declarations, or tsbuildinfo residue. The collected source-preflight fixture
  covers five boundary residues plus the two Git-ignored upstream player
  surfaces (`src/*.svelte.d.ts` and root `tsconfig.tsbuildinfo`). Removing the
  upstream scan root fails on the first missing exact diagnostic; all seven
  paths remain after rejection and no canonical output is created. The CSS
  provenance mutation remains isolated and leaves the live 18-file player tree
  unchanged.
- Public privacy type boundary: the exact browser policy literal with
  `password`, `textarea`, and `hidden` compiles from the packed `record()`
  parameter. The public rrweb type intersects official
  `rrweb-snapshot@2.1.1` with `hidden?: boolean`; no internal package is renamed
  or duplicated, and runtime/wire behavior is unchanged.
- Current artifact census after the retained patch stack: core has 19 files,
  1,422,347 packed bytes, SHA-256
  `cb3d29c6d7552710a5fa377a8e68ba7e7d5930ba80e4df25a24873efe737a7a3`;
  player has 18 files, 1,454,910 packed bytes, SHA-256
  `b317a39f16ce786aeabe70aa107195643c2e4602b094bbc896cc3a658f7f6a23`.
- Supersession: Task 11's core `e075ed25...` archive used a noncanonical pack
  path even though its unpacked tree was `b9ff62b0...`; player
  `c4bd708d...`/`6b8aaaf9...` was the production-dependency/test-player hybrid.
  Neither belongs to the canonical set. Fix round 3 manifest `592f305c...` is
  also superseded: its package bytes were deterministic, but source cleanliness
  was only reported at the end and it used separate core/player npm processes.
  Fix round 4 package bytes remain deterministic but its manifest is superseded
  for evidence lineage because its commit lacks the ignored-upstream-residue
  mutation sentinel. Consumer evidence derived from any prior set is stale until
  browser and Rails reinstall and rerun against the round 5 manifest. No
  publish, registry install, or consumer edit occurs here.
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
- GREEN: the processor suite passes 13/13 and the focused record/replay WebGL
  suites pass 17/17 and 1/1 respectively under Node 20.9.0 and Chrome
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
- Fix round 1: two independent-review Important findings have authentic REDs.
  A throwing public error observer previously interrupted worker settlement,
  timer/listener cleanup, and termination for both worker-error and silent-
  timeout paths. A throwing injected disposer previously escaped stop before
  processed-node destruction, inactive recording state, and error-handler
  removal. Cleanup now precedes and contains error notification; real Chrome
  proves disposer failure containment, first-stop completion, idempotence,
  restart/stop, and late-result suppression.
- Upstream plan: propose the injectable processor/factory contract,
  non-destructive WebGL warm-up, and focused tests without Junify package
  names. Delete the patch after upstream stable passes the same gates.
- Consumer closure: Tasks 7, 9, and 11 run the packaged worker, natural
  bridge/Blob strict-CSP fallback, repeated-recorder cleanup, exact pixels, and
  visible downstream sinks. Both Canvas inventory rows are `covered`.

## Task 6 Privacy Evidence

Task 6 keeps the rrweb event schema and official `@rrweb/types` unchanged. It
adapts only the narrow behavior proved missing by an authentic stable RED; the
general attribute-masking callback remains deferred.

- `PRIV-001`: `8d0d5ffe` adapts Mixpanel's hidden-input policy. Unmodified
  2.1.1 failed 1/1 focused snapshot case and 1/1 real-Chrome case. The candidate
  passes both focused gates and the temporary persisted-JSON scan. Follow-up
  `2d392acc` also retains old hidden sensitivity when either the value or type
  attribute changes first in one observer batch.
- `PRIV-002`: `e9472203` adapts placeholder masking. Unmodified 2.1.1 failed
  1/1 focused snapshot case and 1/1 real-Chrome case. The candidate masks
  initial and mutated placeholders while preserving attribute removal as
  `null` and leaving normal text placeholders visible.
- `PRIV-003`: `0da4b388` adapts Sentry's sensitive-autocomplete rule with
  whitespace tokenization and case folding. Unmodified 2.1.1 failed 7/7
  focused snapshot cases and 1/1 real-Chrome case. The first implementation
  exposed a second Input-event leak; the final candidate protects all approved
  tokens, mixed-case and compound forms, even with an identity mask function,
  while a non-sensitive `name` control remains visible. Follow-up `2d392acc`
  retains old sensitivity when autocomplete removal and value mutation occur
  in either order and keeps the removal payload `null`.
- `PRIV-004`: `ce6ee88e` is a Task 6 differential. Unmodified 2.1.1 failed the
  leaking value-before-type same-batch order in 1/1 real-Chrome case and leaked
  synchronous Input before MutationObserver flush in a separate 1/1 case. The
  candidate premarks password nodes for the entire batch and keeps a local
  input-observer marker. Follow-up `78ecd7ee` covers post-start password nodes
  and temporary text-password-text state, limits the marker to the associated
  observer interval, and proves that normal text is visible after the batch.
  Fix round 2 commit `aee70828` covers page-realm `setAttribute` and
  `removeAttribute` transitions for assigned and unassigned nodes. Its shared
  short-lived classification masks both exact Input events and newly added
  node serialization, expires before the same node returns to normal text,
  restores exact method identities across idempotent stop/restart, and does
  not overwrite a later third-party patch. Fix round 3 `93ba20d3` makes any
  retained inner rrweb proxy inactive before cleanup continues. Post-stop
  set/remove calls delegate only to the captured target, schedule zero timers,
  and leave no transient classification for a restarted recorder.
- Textarea: `313fd37b` adds characterization only. Upstream 2.1.1 already
  protects initial, dynamically added, value-attribute, child-text, and Input
  payloads under the explicit masking policy, so no duplicate production patch
  is retained.
- Persisted compatibility: each run creates distinct `randomUUID`-based
  synthetic sentinels, serializes a candidate recording to a temporary JSON
  file, scans it, and removes the temporary directory. No privacy secret or
  generated privacy artifact is tracked, and no authenticated fixture hash is
  changed.
- Fix round 1: `78ecd7ee` retains password classification for post-start nodes
  and temporary text-password-text state only through the corresponding
  observer batch; synchronous Input is masked while the same node returns to
  visible normal-text behavior after the batch. `2d392acc` retains the batch's
  old hidden/autocomplete sensitivity for both mutation orders and preserves
  autocomplete removal as `null`. `44b2ad41` gives every private source a
  unique mask length and asserts exact FullSnapshot/add/attribute/Input node,
  source, and value sinks. Three missing-event probes reject false substitution
  by another masked value. The fixture failed against the pre-fix `9d9f2763`
  bundle and passes against the candidate. `9abed2d8` removes an event-loop race
  from the existing dynamic-input snapshot gate by waiting until both deferred
  property-hook records exist with their exact node/source/value before starting
  the following attribute batch; it does not alter the snapshot. `e6ea1474`
  invokes the saved native type accessors through typed receiver-preserving
  wrappers, keeping runtime behavior unchanged and the package lint gate at
  zero errors. Fix round 2 `aee70828` extends the unique persisted fixture with
  four attribute-method sentinels and exact added-node/Input sinks. The final
  candidate passes rrweb real-Chrome integration 60/60,
  persisted compatibility 4/4, and the focused snapshot suite 32/32.
- Upstream plan: submit `PRIV-001`, `PRIV-002`, and `PRIV-003` as focused
  behavior/test proposals based on their cited sources; submit `PRIV-004` as a
  focused correctness proposal. Delete each patch when upstream stable passes
  its exact sentinel gate without the patch.
- Consumer closure: Tasks 9 and 11 use the same policy and 16 distinct
  sentinels to prove absence from real extension Chrome storage, decoded V1,
  V2 raw/reassembled bodies, and gzip. The cross-repository privacy row is
  `covered`.

## Task 7 Recorder Lifecycle Evidence

`LIFE-REC-001` changes recorder resource ownership only. It does not change
event schema, wire format, package identity, cross-origin iframe policy, or the
production MV3 worker boundary.

- RED: unmodified 2.1.1 starts from zero tracked listeners,
  MutationObservers, RAFs, and timers. The first start/stop leaves two
  listeners and two Canvas RAFs, and late activity grows emitted events from
  four to six. After 50 cycles it retains 100 listeners and 100 RAFs. Removing
  an iframe also lets its old stylesheet emit one stale `StyleSheetRule` event
  and retains the old document.
- Implementation: `9a48eb58` gives each recorder explicit, idempotent
  ownership of mutation buffers, listeners, generation observers, timers,
  Canvas work, shadow roots, stylesheet hosts, and mirror metadata. Disposal
  is a single iterative queue; shared constructed sheets use host refcounts;
  every cleanup step contains exceptions so later resources still release.
- Vendor boundary: PostHog's global/shared resets, anonymous handlers, and
  realm-sensitive exception test were deliberately not copied. Mixpanel's and
  upstream PR 1791's recursive removed-tree walkers were replaced by the
  bounded traversal. Stable's hidden untainted MutationObserver remains
  refcounted and live across stop/restart.
- Independent review: the first evidence commit was not approvable. It found
  five Major gaps: pending link load resources, recorder-scope cleanup throws,
  the pagehide-to-replacement interval, a final-owner stylesheet false-green,
  and a nonexistent documented WebKit target. Authentic REDs reproduced all
  three missing source behaviors; the old command exited 1 with no test files.
  A no-op `releaseHost` mutation made the strengthened stylesheet test fail.
- Fix round 1: `4c79346a` owns pending link listeners/timers through the
  stylesheet manager, makes Canvas and recorder cleanup independently
  exception-safe with guaranteed finalization, and releases an exact iframe
  generation on its captured window's `pagehide` while preserving the
  persistent load listener.
- GREEN: the real-Chrome 50-cycle test keeps baseline, first, last, and final
  listener/MutationObserver/RAF/timer counts at zero, keeps events at four
  after stop, and stores no dynamic-password sentinel. Ten pending-link cycles
  also remain at zero. The complete lifecycle file passes 6/6 in 56.23 seconds,
  including pagehide/navigation/removal, shadow replacement, final stylesheet
  owner release/re-adoption, permanent mirror release, and throwing cleanup.
  The executable WebKit stop/restart fixture passes 1/1. Focused Canvas
  and replayer suites pass 78/78; rrweb privacy integration passes 60/60;
  compatibility record fixtures pass 4/4; snapshot passes 32/32; the remaining
  record suites pass 86 with two pre-existing skips.
- Upstream plan: offer the externally observable 50-cycle and generation/
  retention fixtures with focused ownership changes. Preserve the fixture and
  delete the Junify patch only when an unmodified stable release passes the
  complete gate; similarly named cleanup commits are insufficient.
- Residual boundary: Task 9 still proves the production-packed extension MV3
  worker and transport sinks. Task 8 owns replayer teardown. Neither is part
  of the recorder lifecycle promotion.

## Task 8 Replayer Lifecycle And Defensive Evidence

`LIFE-REP-001`, `DEF-001`, and `DEF-002` change replay resource ownership and
defensive handling only. They do not change the event schema, serialized wire
format, package identity, live-time semantics, sandbox policy, or cross-origin
iframe behavior.

- RED: unmodified 2.1.1 retained Running player and speed services, fifteen
  emitter handlers, replay/live RAFs, 77 timeouts by cycle 49, pending
  stylesheet/media listeners, and populated image/Canvas/new-document maps.
  Late traffic changed StateChange from 22 to 28 and EventCast from 16 to 19;
  double destroy threw. The malformed media and style fixture failed 2/2: the
  first bad target aborted replay before its following valid sink.
- Implementation: `970cc0ce` owns and releases internal emitter handlers,
  player/speed/media subscriptions, Timer actions/RAF, all replayer timeouts,
  exact stylesheet and metadata listeners, mirror/style/virtual DOM state,
  image/Canvas/new-document/legacy maps and queues, cache, and wrapper. Cleanup
  is idempotent and per-operation exception-contained. `d34d4760` adds the
  exact Mixpanel `dfeeb602` media target check and Sentry `4a91d24c` optional
  virtual-style rules access.
- Independent review: no Critical and one Major finding. A host wrapper that
  throws from `cancelAnimationFrame` could interrupt `Timer.clear()` before it
  invalidated RAF state/actions, allowing one action after destroy. The
  authentic RED observed `lateTimerActions=1` and `timerActive=true`.
- Fix round 1: `ccf6c1f3` invalidates a Timer generation and clears RAF/action
  state before cancellation. An uncancelled native RAF captures the stale
  generation and exits without work. The focused GREEN observes zero late
  actions, inactive Timer, empty actions, and complete remaining teardown.
- GREEN: the real-Chrome lifecycle suite passes 2/2. Each of 50 cycles starts
  with four nested iframes, one explicit Timer action, one stylesheet load
  listener, one media metadata listener, fifteen handlers, and populated map/
  mirror sinks. After destroy and late activity every count returns to the zero
  baseline, both services are stopped, the wrapper is detached, Destroy fires
  once, and callback/event/DOM-mutation counts do not change. The complete
  replayer suite passes 49/49; focused seek passes 2/2; WebGL replay passes 1/1.
- Compatibility: replay matrix passes 3/3. It retains all four authenticated
  historical producers and eight seek combinations, and writes/reads the exact
  malformed legacy events through a temporary JSON artifact. The following
  valid video reaches time 4.25, volume 0.5, muted true; the following valid
  stylesheet reaches computed color `rgb(17, 34, 51)`.
- Vendor boundary: PostHog PR 92 / `f3bdcfe` is adapted as an ownership design,
  not cherry-picked; it omits several proven owners. PRs 121-123 are rejected
  because their cross-origin attached-iframe feature is disabled and excluded.
  The WebGL strong-map census remained zero, so no unproven WeakMap conversion
  is retained.
- Upstream plan: offer the malformed media and style guards as narrow
  correctness patches with their negative controls. Offer teardown as
  behavior-first ownership slices where maintainable. Delete each patch only
  when an unmodified stable release passes the exact corresponding gate.
- Artifact hashes: authenticated historical fixture bytes and manifest hashes
  are unchanged; the malformed artifact is temporary and deleted by the test.
- Residual blocker: none inside `G-REPLAYER-LIFECYCLE`. Rails surface rollout
  and extension persistence remain their existing later-task gates.

## Task 11 Cross-Repository Evidence

- Source heads: rrweb `f35dc648`, browser `dd860378`, Rails `a49a1c9`.
- Package provenance: combined manifest SHA-256 `b76c7793...`; core
  archive/tree `cb3d29c6...`/`b9ff62b0...`; player archive/tree
  `b317a39f...`/`c9929b76...`. Two fresh runs are byte/tree identical and both
  consumer policies resolve this same content set.
- Candidate lineage: `candidate-recordings-dd86037` manifest SHA-256
  `bed8c2a0...`; committed raw IDB reaches decoded V1 and V2 raw/reassembled
  artifacts, Rails parsers/loaders/routes, and scoped/direct/legacy visible
  players with exact count/index/payload parity.
- Privacy: all 16 candidate sentinels are absent from raw IDB, V1, V2 raw and
  reassembled bodies, and gzip. Historical leaks remain compatibility-only
  characterization and are not accepted as privacy evidence.
- Large contract: exactly 13,600,000 UTF-8 CSS bytes, 22 persisted events,
  FullSnapshot source index 1/transport index 2, 13,613,603 body bytes, and 137
  contiguous V2 fragments reassemble and gzip round-trip exactly.
- Sensitivity: package identity, independent producer census, privacy,
  fragment/index/hash, and visible-player sink mutations each reach expected
  RED before restored GREEN. No guarded assertion or skip is accepted.
- Residual release blocker: the scoped package versions are unpublished, so
  frozen registry/CDN byte/tree installation is not testable yet. No publish,
  release, push, deploy, staging, or external write occurred.
- Review boundary: standard `build:all` generates six ignored Svelte DTS files
  that canonical preflight rejects until exact cleanup. Task 11 records the
  order and final zero residue; independent review decides merge/release impact.

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
