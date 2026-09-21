import type { Replayer } from '../';
import type { CanvasArg, canvasMutationCommand } from '@junify-app/types';
import { deserializeArg } from './deserialize-args';

export default async function canvasMutation({
  mutations,
  target,
  imageMap,
  errorHandler,
  isActive = () => true,
  onImageLoad,
}: {
  event: Parameters<Replayer['applyIncremental']>[0];
  mutations: canvasMutationCommand[];
  target: HTMLCanvasElement;
  imageMap: Replayer['imageMap'];
  errorHandler: Replayer['warnCanvasMutationFailed'];
  isActive?: () => boolean;
  onImageLoad?: (cancel?: () => void) => void;
}): Promise<void> {
  const ctx = target.getContext('2d');

  if (!ctx) {
    errorHandler(mutations[0], new Error('Canvas context is null'));
    return;
  }

  // Decode one command at a time; decoded bitmap storage must not grow with
  // the recording length or with the number of commands in a seek.
  for (const mutation of mutations) {
    if (!isActive()) return;
    const resources = {
      bitmaps: new Set<ImageBitmap>(),
      isActive,
      onImageLoad,
    };
    try {
      const args: unknown[] = (await deserializeArg(
        imageMap,
        ctx,
        resources,
      )(mutation.args as CanvasArg[])) as unknown[];
      if (!isActive()) return;
      if (mutation.setter) {
        (ctx as unknown as Record<string, unknown>)[mutation.property] =
          args[0];
      } else {
        const original = ctx[
          mutation.property as Exclude<keyof typeof ctx, 'canvas'>
        ] as (ctx: CanvasRenderingContext2D, args: unknown[]) => void;
        original.apply(ctx, args);
      }
    } catch (error) {
      if (
        isActive() &&
        !(error instanceof DOMException && error.name === 'AbortError')
      )
        errorHandler(mutation, error);
    } finally {
      for (const bitmap of resources.bitmaps) bitmap.close();
    }
  }
}
