import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sensorRequest } from "./sensorRequest";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("releases a stalled request even when fetch ignores abort, then permits recovery", async () => {
  let signal: AbortSignal | undefined;
  const pending = sensorRequest((requestSignal) => {
    signal = requestSignal;
    return new Promise<string>(() => {});
  });
  const rejected = expect(pending).rejects.toThrow("ESP32 HTTP request timed out after 8s");
  await vi.advanceTimersByTimeAsync(8_000);
  await rejected;
  expect(signal?.aborted).toBe(true);
  await expect(sensorRequest(async () => "T=30.2,H=32.8,N=22,S=OFF"))
    .resolves.toBe("T=30.2,H=32.8,N=22,S=OFF");
});

it("also times out while waiting for a response body", async () => {
  const pending = sensorRequest(async () => {
    const response = await Promise.resolve({ text: () => new Promise<string>(() => {}) });
    return response.text();
  });
  const rejected = expect(pending).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(8_000);
  await rejected;
});

it("does not replace a timeout with a late successful sensor response", async () => {
  let finish!: (text: string) => void;
  const received = vi.fn();
  const pending = sensorRequest(() => new Promise<string>((resolve) => { finish = resolve; }));
  const handled = pending.then(received, () => undefined);
  await vi.advanceTimersByTimeAsync(8_000);
  finish("T=30,H=33");
  await handled;
  await Promise.resolve();
  expect(received).not.toHaveBeenCalled();
});

it("clears the deadline after successful reads and reports immediate failures", async () => {
  await expect(sensorRequest(async () => "T=30,H=33")).resolves.toBe("T=30,H=33");
  await expect(sensorRequest(async () => { throw new Error("HTTP 503"); })).rejects.toThrow("HTTP 503");
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});
