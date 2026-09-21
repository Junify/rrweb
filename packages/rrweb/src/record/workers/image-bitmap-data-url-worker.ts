import type {
  ImageBitmapDataURLWorkerParams,
  ImageBitmapDataURLWorkerResponse,
} from '@rrweb/types';
import { createWorkerMessageHandler } from './image-bitmap-data-url-processor';

export interface ImageBitmapDataURLRequestWorker {
  postMessage(
    message: ImageBitmapDataURLWorkerParams,
    transfer: Transferable[],
  ): void;
  onmessage:
    | null
    | ((message: MessageEvent<ImageBitmapDataURLWorkerResponse>) => void);
  onmessageerror: null | ((message: MessageEvent<unknown>) => void);
  onerror: null | ((event: ErrorEvent) => void);
  addEventListener?: (
    type: 'message' | 'messageerror' | 'error',
    listener: EventListenerOrEventListenerObject,
  ) => void;
  removeEventListener?: (
    type: 'message' | 'messageerror' | 'error',
    listener: EventListenerOrEventListenerObject,
  ) => void;
  terminate?: () => void;
}

interface ImageBitmapDataURLResponseWorker {
  onmessage:
    | null
    | ((message: MessageEvent<ImageBitmapDataURLWorkerParams>) => void);
  postMessage(e: ImageBitmapDataURLWorkerResponse): void;
}

const worker = self as unknown as ImageBitmapDataURLResponseWorker;
const handler = createWorkerMessageHandler((message) =>
  worker.postMessage(message),
);

worker.onmessage = (event) => {
  void handler(event);
};
