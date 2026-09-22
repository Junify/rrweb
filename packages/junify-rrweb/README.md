# `@junify-app/rrweb`

This package is Junify's narrow consumer-facing boundary for the patched local
rrweb source. It deliberately preserves every official internal package and
import name.

Version `2.1.1-junify.1` includes the bounded Canvas replay memory and seek
fix from Junify/rrweb#9. The previous `2.1.1-junify.0` artifacts were built
before that merge and do not contain the fix.

Build both Junify boundaries from the same clean commit with
`yarn pack:junify-boundaries --output <empty-directory>`. Publish the verified
tarballs under the `junify` dist-tag only with explicit release authorization;
leave `latest` unchanged. Consumers must pin the new exact version to adopt it.
