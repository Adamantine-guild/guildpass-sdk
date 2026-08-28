import { Clock } from './Clock.js';

function createAbortError(message?: string): Error {
  const error = new Error(message ?? 'The operation was aborted');
  error.name = 'AbortError';
  return error;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms < 0) {
      return Promise.reject(new Error(`Invalid sleep duration: ${ms}ms is negative`));
    }

    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? createAbortError());
    }

    return new Promise((resolve, reject) => {
      const handleAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? createAbortError());
      };

      if (signal) {
        signal.addEventListener('abort', handleAbort, { once: true });
      }

      const timer = setTimeout(() => {
        if (signal) {
          signal.removeEventListener('abort', handleAbort);
        }
        resolve();
      }, ms);
    });
  }
}
