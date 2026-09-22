# `@junify-app/rrweb-player`

This package is Junify's narrow consumer-facing boundary for rrweb-player. Its
build reuses the upstream Svelte implementation and resolves the replay module
and replay CSS to the patched local rrweb source with ordered exact aliases.
Official internal package identities remain unchanged.

The nominal boundary `src/index.ts` is intentionally omitted. Using the
upstream `packages/rrweb-player/src/main.ts` entry preserves Svelte declaration
generation without copying the player implementation or leaving a dead wrapper
file.

Version `2.1.1-junify.1` includes the bounded Canvas replay memory and seek
fix from Junify/rrweb#9. Rebuild and release it together with
`@junify-app/rrweb@2.1.1-junify.1`: the player bundles the replay implementation,
so updating only the core package does not update the player runtime.

Follow the [core boundary release instructions](../junify-rrweb/README.md).
