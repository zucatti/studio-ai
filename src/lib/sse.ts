/**
 * Server-Sent Events (SSE) utilities for real-time progress tracking
 */

export type GenerationStatus = 'queued' | 'generating' | 'uploading' | 'completed' | 'error';

export interface GenerationProgressEvent {
  type: 'init' | 'progress' | 'image' | 'complete' | 'error';
  // For init event
  count?: number;
  aspectRatio?: string;
  // For progress event
  status?: GenerationStatus;
  imageIndex?: number;
  totalImages?: number;
  message?: string;
  progress?: number; // 0-100 percentage
  // For image event (when one image is ready)
  imageUrl?: string;
  shotId?: string;
  // For complete event
  shots?: any[];
  // For error event
  error?: string;
}

/**
 * Create a Server-Sent Events stream
 */
export function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      controller = null;
    },
  });

  const send = (event: GenerationProgressEvent) => {
    if (controller) {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      controller.enqueue(encoder.encode(data));
    }
  };

  const close = () => {
    if (controller) {
      controller.close();
      controller = null;
    }
  };

  return { stream, send, close };
}

/**
 * Create SSE Response headers
 */
export function createSSEHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  };
}
