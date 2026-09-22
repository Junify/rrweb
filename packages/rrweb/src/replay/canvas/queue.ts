/** Serializes decoding across events, including across cancelled seeks. */
export class CanvasMutationQueue {
  private pending: Array<() => Promise<void>> = [];
  private cursor = 0;
  private running = false;
  private generation = 0;
  private active?: { cancelImage?: () => void; target?: HTMLCanvasElement };
  private canvasResets = new WeakMap<HTMLCanvasElement, number>();

  enqueue(
    apply: (
      isActive: () => boolean,
      onImageLoad: (cancel?: () => void) => void,
    ) => Promise<void>,
    target?: HTMLCanvasElement,
  ) {
    const generation = this.generation;
    const canvasReset = target ? this.canvasResets.get(target) : undefined;
    this.pending.push(async () => {
      const active: { cancelImage?: () => void; target?: HTMLCanvasElement } = {
        target,
      };
      this.active = active;
      try {
        await apply(
          () =>
            generation === this.generation &&
            (!target || this.canvasResets.get(target) === canvasReset),
          (cancel) => {
            active.cancelImage = cancel;
          },
        );
      } finally {
        this.active = undefined;
      }
    });
    if (!this.running) void this.drain();
  }

  resetCanvas(target: HTMLCanvasElement) {
    if (this.active?.target === target) this.active.cancelImage?.();
    this.canvasResets.set(target, (this.canvasResets.get(target) || 0) + 1);
  }

  cancelImageLoad() {
    // Unlike createImageBitmap, URL image loading can be interrupted without
    // letting another native bitmap decode overlap the active pump.
    this.active?.cancelImage?.();
  }

  reset() {
    this.active?.cancelImage?.();
    this.generation++;
    this.pending = [];
    this.cursor = 0;
    // An in-flight browser decode cannot be aborted. Keep the same pump until
    // it settles, otherwise repeated seeks start overlapping native allocations.
  }

  private async drain() {
    this.running = true;
    try {
      while (this.cursor < this.pending.length) {
        const apply = this.pending[this.cursor++];
        await apply();
      }
    } finally {
      this.pending = [];
      this.cursor = 0;
      this.running = false;
    }
  }
}
