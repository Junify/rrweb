<!-- markdownlint-disable MD013 MD043 -->

# Junify rrweb Integration

This directory is the source of truth for rebuilding the Junify rrweb fork
from the exact `rrweb@2.1.1` peeled tag commit
`3deb6e7da4528ddb33b5b7ff6a3e805d4ed14930`.

The integration preserves the serialized rrweb event format, the two Junify
package boundaries, the virtual-DOM seek correction, and the MV3 Canvas
processor while replacing the old global package rename with a small patch
stack. Nothing in these documents authorizes publishing, pushing, deploying,
staging work, customer-data use, cross-origin iframe expansion, or a wire-format
change.

## Read First

| Document                                               | Purpose                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| [Contract inventory](contracts/contract-inventory.md)  | Human-readable compatibility contracts and consumer/fixture census |
| [Machine inventory](contracts/contract-inventory.json) | Deterministic contract records with stable IDs                     |
| [Coverage matrix](contracts/contract-coverage.md)      | Current status by risk and recommended test layer                  |
| [Test gates runbook](contracts/test-gates-runbook.md)  | Exact commands, environments, and blockers                         |
| [Audit loop](contracts/audit-loop.md)                  | Fresh-context review prompts and verdict history                   |
| [Patch ledger](patch-ledger.md)                        | One row per retained or planned Junify patch                       |
| [Vendor adoption](vendor-adoption.md)                  | Upstream/fork candidate decisions and deletion plans               |
| [Upstream sync](upstream-sync.md)                      | Tag-bump and patch-replay procedure                                |

## Status Vocabulary

The inventory uses only `covered`, `must-cover`,
`accepted-current-behavior`, `red-known-risk`, `not-testable-yet`, and
`out-of-scope`. `covered` requires executable evidence plus a documented or
executed gate. Mock-only Jest tests and README claims do not cover browser,
persisted-artifact, MV3, privacy, Canvas, or lifecycle contracts.

## Repository Boundaries

- rrweb worktree: this repository, branch `codex/rrweb-upstream-2.1.1`.
- recorder worktree: `../browser-extension-rrweb-2.1.1`, read-only during the
  inventory task.
- Rails replayer worktree: `../junify-rails-rrweb-2.1.1`, read-only during the
  inventory task.
- `session_recording_service` was inspected read-only at
  `/Users/takashihamada/dev/session_recording_service` solely to verify the
  unused dependency census. It is not an upgrade worktree.
