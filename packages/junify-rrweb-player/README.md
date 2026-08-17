# `@junify-app/rrweb-player`

This package is Junify's narrow consumer-facing boundary for rrweb-player. Its
build reuses the upstream Svelte implementation and resolves the replay module
and replay CSS to the patched local rrweb source with ordered exact aliases.
Official internal package identities remain unchanged.

The nominal boundary `src/index.ts` is intentionally omitted. Using the
upstream `packages/rrweb-player/src/main.ts` entry preserves Svelte declaration
generation without copying the player implementation or leaving a dead wrapper
file.

Version `2.1.1-junify.0` is release-gated. This repository task builds and
packs local artifacts for verification only; it does not publish them.
