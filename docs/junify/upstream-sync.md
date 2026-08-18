<!-- markdownlint-disable MD013 MD043 -->

# Upstream Sync Runbook

## Purpose

Each sync starts from a peeled exact stable tag and replays only the remaining
ledger patches. It never merges upstream into the old globally renamed fork.
The current baseline is `rrweb@2.1.1^{}` =
`3deb6e7da4528ddb33b5b7ff6a3e805d4ed14930`.

This runbook describes a future authorized sync. Task 1 does not fetch, create
refs, publish, push, open a PR, deploy, or use staging.

## 1. Preconditions

- Use a dedicated clean worktree; never use or clean a shared checkout.
- Confirm browser-extension and Rails dedicated worktrees and their intended
  remote heads before changing dependencies.
- Preserve the current contract inventory, fixture manifest, patch ledger, and
  prior tarball hashes as comparison inputs.
- Use synthetic fixtures only.

```sh
git status --short --branch
git remote -v
```

Stop if the worktree has unexplained changes.

## 2. Fetch And Peel The Stable Tag

After explicit authorization for the sync operation:

```sh
git fetch upstream --tags
git rev-parse 'rrweb@<stable-version>^{}'
git show -s --format='%H %D %s' 'rrweb@<stable-version>^{}'
```

Record the full 40-character peeled commit in the inventory and report. Never
base the branch on an unpeeled tag name or a moving remote branch.

Create a fresh branch/worktree through the project’s worktree workflow. If a
plain Git fallback is explicitly required, use the recorded full commit:

```sh
git switch -c codex/rrweb-upstream-<stable-version> <peeled-40-char-commit>
```

## 3. Run Compatibility Gates Against Unmodified Upstream

Before adding Junify code, run and record:

```sh
yarn workspace @junify/rrweb-compatibility test -- record-fixtures replay-matrix large-snapshot
```

Run `G-SEEK`, `G-CANVAS-PROCESSOR`, `G-PRIVACY`,
`G-RECORDER-LIFECYCLE`, and `G-REPLAYER-LIFECYCLE` against the unmodified
tag. Expected failures must identify the exact Junify gap. Unexpected passes
are candidates for patch deletion; unexpected failures are new upstream
compatibility findings.

## 4. Reconcile Vendor Decisions And Delete Redundant Patches

For every row in [`patch-ledger.md`](patch-ledger.md):

1. Search the new stable history and release notes for its source PR/commit.
2. Run the row’s focused fixture against unmodified stable.
3. Delete the ledger patch if unmodified stable passes the full Junify-facing
   gate, not merely because a similarly named upstream PR merged.
4. Update [`vendor-adoption.md`](vendor-adoption.md) from `adapt` to `adopt`
   with the exact upstream commit and stable version.
5. Keep the regression test after deleting a patch.

For `LIFE-REC-001`, require explicit pre/post counts from the real-Chrome
50-cycle gate, post-stop event silence, iframe/shadow generation liveness and
silence, constructed-stylesheet host refcounts, permanent mirror metadata
release, Canvas timer/RAF/worker shutdown, and WebKit stop/restart. WeakRef or
unit-spy evidence is supplemental only. Do not replace this proof with a blind
PostHog/Mixpanel cherry-pick: shared manager resets, anonymous handlers,
realm-sensitive exception checks, and recursive removed-tree walkers remain
rejected unless a new differential fixture requires them.

Datadog compact serialization remains rejected unless a separate approved
architecture decision changes the immutable-wire-format contract.

## 5. Reapply Remaining Ledger In Order

Use one concern per commit:

1. `BND-001` Junify rrweb package boundary.
2. `BND-002` Junify player package boundary.
3. `SEEK-001` virtual-DOM seek correction.
4. `CANVAS-001` injectable MV3 Canvas processor.
5. `PRIV-001`, `PRIV-002`, `PRIV-003`, `PRIV-004` as separate privacy commits.
6. `LIFE-REC-001` recorder cleanup.
7. `LIFE-REP-001` replayer teardown.
8. `DEF-001`, `DEF-002` as separate defensive commits.

For each concern:

- capture the failing command/output before implementation;
- implement the smallest compatible change;
- run the focused GREEN gate and relevant regression suite;
- update both inventories, coverage, vendor decision, ledger, and gate
  evidence in the same commit;
- do not combine unrelated patches or recreate the old global namespace
  rewrite.

## 6. Pack And Hash Local Artifacts

Build the two Junify boundaries, pack them into a temporary directory, and
record SHA-256 before any consumer update:

```sh
yarn workspace @junify-app/rrweb build
yarn workspace @junify-app/rrweb-player build
mkdir -p .artifacts/junify-rrweb
cd packages/junify-rrweb && npm pack --pack-destination ../../.artifacts/junify-rrweb
cd ../junify-rrweb-player && npm pack --pack-destination ../../.artifacts/junify-rrweb
cd ../..
shasum -a 256 .artifacts/junify-rrweb/*.tgz
```

`.artifacts/` is local evidence unless repository policy explicitly chooses a
tracked location. Do not publish. Install the exact tarballs in the two
dedicated consumer worktrees and verify that the recorded hashes are identical
to the files used by every consumer.

## 7. Verify Consumers In Release-Safe Order

1. Run all rrweb package, compatibility, privacy, Canvas, seek, and lifecycle
   gates.
2. Verify both Rails main-player paths, password-rotation artifact player, and
   legacy static player against the same fixture manifest.
3. Verify the production-packed MV3 extension, real worker/fallback, Chrome
   storage, V1/V2 transports, and privacy payloads.
4. Run the full cross-version matrix and the 13.6 MB large-snapshot gate.
5. Keep future registry-version dependency/lock updates in isolated,
   release-gated consumer commits. Replayer rollout precedes recorder rollout.

The exact commands and blocker rules are in
[`contracts/test-gates-runbook.md`](contracts/test-gates-runbook.md).

## 8. Independent Review

Give a fresh-context reviewer only the target repository and artifact paths.
Require review for missing externally observable contracts, too-local test
layers, unsupported `covered` claims, hidden risks, missing blockers, and
non-assertable entries. Resolve every P0/P1 finding or record an owner-visible
blocker before any release operation.

## 9. Explicit Stop Point

Successful local verification produces source commits, fixture/provenance
evidence, and local tarball hashes only. Publishing, release creation, pushing,
PR creation, deployment, staging, and customer-data testing are separate
human-authorized operations.
