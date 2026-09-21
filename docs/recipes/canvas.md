# Canvas

Canvas is a special HTML element, and will not be recorded by rrweb by default.
There are some options for recording and replaying Canvas.

Enable recording Canvas：

```js
rrweb.record({
  emit(event) {},
  recordCanvas: true,
});
```

Alternatively enable image snapshot recording of Canvas at a maximum of 15 frames per second：

```js
rrweb.record({
  emit(event) {},
  recordCanvas: true,
  sampling: {
    canvas: 15,
  },
  // optional image format settings
  dataURLOptions: {
    type: 'image/webp',
    quality: 0.6,
  },
});
```

Enable replaying Canvas：

```js
const replayer = new rrweb.Replayer(events, {
  UNSAFE_replayCanvas: true,
});
replayer.play();
```

**Enable replaying Canvas will remove the sandbox, which may cause a potential security issue.**

Alternatively you can stream canvas elements via webrtc with the [rrweb-plugin-canvas-webrtc-record](../../packages/plugins/rrweb-plugin-canvas-webrtc-record/) & [rrweb-plugin-canvas-webrtc-replay](../../packages/plugins/rrweb-plugin-canvas-webrtc-replay) plugins.
For more information see [canvas-webrtc documentation](../../packages/plugins/rrweb-plugin-canvas-webrtc-record/Readme.md)

## Replay memory and seeking

Canvas commands are decoded lazily when their events are cast. A replayer uses
one serial decode pump for both real DOM and virtual DOM replay. It does not
predecode or cache the recording's ImageBitmap arguments. Commands run in order;
bitmaps created while decoding a command are closed after use, failure, or
cancellation. Decoded bitmap retention is bounded by the arguments of one
command, rather than the number of events in the recording.

Full snapshot rebuilds, backward playback, and destruction invalidate queued
canvas work. An already-started native bitmap decode must settle before the
same pump starts replacement work, including across repeated seeks. A forward
seek within the same snapshot preserves prerequisite drawing commands, but
interrupts the active URL image wait. URL images are decoded before drawing;
cancelled URL waits cannot block replacement playback. Canvas width/height
mutations invalidate preceding 2D drawing work because they reset the context.
WebGL setup commands are preserved across dimension changes.

This bounds native bitmap allocations, not all replayer memory or seek latency.
Serialized events and DOM reconstruction still consume memory. Catching up from
a snapshot remains proportional to the commands that must be replayed. A seek
returns before asynchronous canvas drawing has settled. `pause()` preserves
pending drawing at the paused position; `destroy()` cancels it.

Regression coverage lives in `packages/rrweb/test/replay/canvas-memory.test.ts`:
real bitmap allocation/close counts and pixels cover future frames, long command
batches, both DOM paths, repeated seeks, cancellation, resize, and decode errors.
The exported `canvasMutation` function still accepts the legacy `canvasEventMap`
option for source compatibility, but ignores cached decoded events.
