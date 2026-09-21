---
"@junify-app/rrweb": patch
---

Prevent long canvas recordings from exhausting renderer memory during seeks. Decode canvas commands in order on demand, close temporary ImageBitmaps, and cancel stale drawing or image loads when playback is replaced or destroyed.
