import type { Replayer } from '..';
import {
  CanvasContext,
  type canvasMutationCommand,
  type canvasMutationData,
  type canvasMutationParam,
  type eventWithTime,
} from '@junify-app/types';
import webglMutation from './webgl';
import canvas2DMutation from './2d';

export default async function canvasMutation({
  event,
  mutation,
  target,
  imageMap,
  isActive = () => true,
  onImageLoad,
  errorHandler,
}: {
  event: Parameters<Replayer['applyIncremental']>[0];
  mutation: canvasMutationData;
  target: HTMLCanvasElement;
  imageMap: Replayer['imageMap'];
  /** @deprecated Decoded events are no longer cached. */
  canvasEventMap?: Map<eventWithTime, canvasMutationParam>;
  isActive?: () => boolean;
  onImageLoad?: (cancel?: () => void) => void;
  errorHandler: Replayer['warnCanvasMutationFailed'];
}): Promise<void> {
  try {
    const commands: canvasMutationCommand[] =
      'commands' in mutation ? mutation.commands : [mutation];

    if ([CanvasContext.WebGL, CanvasContext.WebGL2].includes(mutation.type)) {
      for (let i = 0; i < commands.length; i++) {
        if (!isActive()) return;
        const command = commands[i];
        await webglMutation({
          mutation: command,
          type: mutation.type,
          target,
          imageMap,
          errorHandler,
          isActive,
          onImageLoad,
        });
      }
      return;
    }
    // default is '2d' for backwards compatibility (rrweb below 1.1.x)
    await canvas2DMutation({
      event,
      mutations: commands,
      target,
      imageMap,
      errorHandler,
      isActive,
      onImageLoad,
    });
  } catch (error) {
    errorHandler(mutation, error);
  }
}
