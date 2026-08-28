import { describe, it, expect, vi } from 'vitest';
import { SystemClock, TestClock } from '../../src/time/index.js';

describe('SystemClock', () => {
  it('now() returns realistic timestamps', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('sleep() resolves after the given duration', async () => {
    const clock = new SystemClock();
    const before = Date.now();
    await clock.sleep(10);
    const after = Date.now();
    expect(after - before).toBeGreaterThanOrEqual(9); // Allow 1ms margin of error for timing issues
  });

  it('sleep() rejects invalid negative durations', async () => {
    const clock = new SystemClock();
    await expect(clock.sleep(-5)).rejects.toThrow('Invalid sleep duration: -5ms is negative');
  });

  it('sleep() rejects immediately if already aborted', async () => {
    const clock = new SystemClock();
    const controller = new AbortController();
    controller.abort(new Error('Manual abort'));
    await expect(clock.sleep(100, controller.signal)).rejects.toThrow('Manual abort');
  });

  it('sleep() can be aborted while sleeping', async () => {
    const clock = new SystemClock();
    const controller = new AbortController();
    const sleepPromise = clock.sleep(1000, controller.signal);
    controller.abort(new Error('Mid-sleep abort'));
    await expect(sleepPromise).rejects.toThrow('Mid-sleep abort');
  });
});

describe('TestClock', () => {
  it('now() returns the current mocked time', () => {
    const clock = new TestClock(1000);
    expect(clock.now()).toBe(1000);
  });

  it('advance() updates the mocked time', async () => {
    const clock = new TestClock(1000);
    await clock.advance(500);
    expect(clock.now()).toBe(1500);
  });

  it('sleep() resolves when time is advanced to or past the wake time', async () => {
    const clock = new TestClock(0);
    let resolved = false;
    clock.sleep(100).then(() => { resolved = true; });
    
    await clock.advance(50);
    expect(resolved).toBe(false);
    
    await clock.advance(50);
    expect(resolved).toBe(true);
  });

  it('multiple sleepers are resolved in chronological order', async () => {
    const clock = new TestClock(0);
    const order: string[] = [];
    
    clock.sleep(200).then(() => order.push('B'));
    clock.sleep(100).then(() => order.push('A'));
    clock.sleep(300).then(() => order.push('C'));
    clock.sleep(200).then(() => order.push('B2')); // Same time

    await clock.advance(150);
    expect(order).toEqual(['A']);
    
    await clock.advance(100);
    expect(order).toEqual(['A', 'B', 'B2']);
    
    await clock.advanceTo(300);
    expect(order).toEqual(['A', 'B', 'B2', 'C']);
  });

  it('advance() rejects negative durations', async () => {
    const clock = new TestClock();
    await expect(clock.advance(-10)).rejects.toThrow('Cannot advance time by negative duration: -10');
  });

  it('advanceTo() rejects backwards jumps', async () => {
    const clock = new TestClock(100);
    await expect(clock.advanceTo(90)).rejects.toThrow('Cannot advance time backwards to: 90');
  });

  it('sleep() rejects immediately if already aborted', async () => {
    const clock = new TestClock();
    const controller = new AbortController();
    controller.abort(new Error('Manual abort'));
    await expect(clock.sleep(100, controller.signal)).rejects.toThrow('Manual abort');
  });

  it('sleep() can be aborted while sleeping', async () => {
    const clock = new TestClock();
    const controller = new AbortController();
    const sleepPromise = clock.sleep(100, controller.signal);
    
    controller.abort(new Error('Mid-sleep abort'));
    await expect(sleepPromise).rejects.toThrow('Mid-sleep abort');
    
    // Advancing time should not crash or throw unhandled rejections
    await clock.advance(200);
  });
});
