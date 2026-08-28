import { Clock } from './Clock.js';

interface ScheduledTask {
  wakeTime: number;
  resolve: () => void;
  reject: (reason?: any) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
}

function createAbortError(message?: string): Error {
  const error = new Error(message ?? 'The operation was aborted');
  error.name = 'AbortError';
  return error;
}

export class TestClock implements Clock {
  private currentTime: number;
  private tasks: ScheduledTask[] = [];

  constructor(initialTime: number = 0) {
    this.currentTime = initialTime;
  }

  now(): number {
    return this.currentTime;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms < 0) {
      return Promise.reject(new Error(`Invalid sleep duration: ${ms}ms is negative`));
    }

    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? createAbortError());
    }

    return new Promise((resolve, reject) => {
      const wakeTime = this.currentTime + ms;
      const task: ScheduledTask = { wakeTime, resolve, reject, signal };

      if (signal) {
        task.abortListener = () => {
          this.tasks = this.tasks.filter((t) => t !== task);
          reject(signal.reason ?? createAbortError());
        };
        signal.addEventListener('abort', task.abortListener, { once: true });
      }

      this.tasks.push(task);
      this.tasks.sort((a, b) => a.wakeTime - b.wakeTime);
    });
  }

  async advance(ms: number): Promise<void> {
    if (ms < 0) {
      throw new Error(`Cannot advance time by negative duration: ${ms}`);
    }
    await this.advanceTo(this.currentTime + ms);
  }

  async advanceTo(targetTime: number): Promise<void> {
    if (targetTime < this.currentTime) {
      throw new Error(`Cannot advance time backwards to: ${targetTime}`);
    }

    while (this.tasks.length > 0 && this.tasks[0].wakeTime <= targetTime) {
      const task = this.tasks.shift()!;
      this.currentTime = task.wakeTime;
      
      if (task.signal && task.abortListener) {
        task.signal.removeEventListener('abort', task.abortListener);
      }
      
      task.resolve();
      // Allow microtasks to execute (e.g. continuations of resolved sleep promises)
      await Promise.resolve();
    }

    this.currentTime = targetTime;
  }
}
