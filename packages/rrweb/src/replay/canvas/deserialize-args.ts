import { decode } from 'base64-arraybuffer';
import type { Replayer } from '../';
import type { CanvasArg, SerializedCanvasArg } from '@rrweb/types';

// TODO: add ability to wipe this list
type GLVarMap = Map<string, any[]>;
const webGLVarMap: Map<
  CanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext,
  GLVarMap
> = new Map();
export function variableListFor(
  ctx:
    | CanvasRenderingContext2D
    | WebGLRenderingContext
    | WebGL2RenderingContext,
  ctor: string,
) {
  let contextMap = webGLVarMap.get(ctx);
  if (!contextMap) {
    contextMap = new Map();
    webGLVarMap.set(ctx, contextMap);
  }
  if (!contextMap.has(ctor)) {
    contextMap.set(ctor, []);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return contextMap.get(ctor) as any[];
}

export function isSerializedArg(arg: unknown): arg is SerializedCanvasArg {
  return Boolean(arg && typeof arg === 'object' && 'rr_type' in arg);
}

export type CanvasResources = {
  bitmaps: Set<ImageBitmap>;
  isActive: () => boolean;
  onImageLoad?: (cancel?: () => void) => void;
};

export function deserializeArg(
  imageMap: Replayer['imageMap'],
  ctx:
    | CanvasRenderingContext2D
    | WebGLRenderingContext
    | WebGL2RenderingContext
    | null,
  resources?: CanvasResources,
): (arg: CanvasArg) => Promise<any> {
  return async (arg: CanvasArg): Promise<any> => {
    if (resources && !resources.isActive()) return undefined;
    if (arg && typeof arg === 'object' && 'rr_type' in arg) {
      if (arg.rr_type === 'ImageBitmap' && 'args' in arg) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const args = await deserializeArg(imageMap, ctx, resources)(arg.args);
        if (resources && !resources.isActive()) return undefined;
        // eslint-disable-next-line prefer-spread
        const bitmap = await createImageBitmap.apply(null, args);
        resources?.bitmaps.add(bitmap);
        return bitmap;
      } else if ('index' in arg) {
        if (ctx === null) return arg;
        const { rr_type: name, index } = arg;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return variableListFor(ctx, name)[index];
      } else if ('args' in arg) {
        const { rr_type: name, args } = arg;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const ctor = window[name as keyof Window];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return new ctor(
          ...(await deserializeArg(imageMap, ctx, resources)(args)),
        );
      } else if ('base64' in arg) {
        return decode(arg.base64);
      } else if ('src' in arg) {
        let image = imageMap.get(arg.src);
        if (!image) {
          image = new Image();
          image.src = arg.src;
          imageMap.set(arg.src, image);
        }
        // With lazy decoding, the image is no longer loaded ahead of its draw.
        // decode() also rejects broken sources so later commands can continue.
        if (image.decode) {
          let cancel: (() => void) | undefined;
          const cancelled = new Promise<never>((_, reject) => {
            cancel = () => {
              image.src = '';
              imageMap.delete(arg.src);
              reject(
                new DOMException('Canvas image load cancelled', 'AbortError'),
              );
            };
            resources?.onImageLoad?.(cancel);
          });
          try {
            await Promise.race([image.decode(), cancelled]);
          } finally {
            resources?.onImageLoad?.();
          }
        }
        return image;
      } else if ('data' in arg && arg.rr_type === 'Blob') {
        const blobContents = (await deserializeArg(
          imageMap,
          ctx,
          resources,
        )(arg.data)) as BlobPart[];
        const blob = new Blob(blobContents, {
          type: arg.type,
        });
        return blob;
      }
    } else if (Array.isArray(arg)) {
      const result = [];
      for (const item of arg) {
        result.push(await deserializeArg(imageMap, ctx, resources)(item));
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result;
    }
    return arg;
  };
}
