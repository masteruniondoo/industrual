import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchCelerityConnection } from "./connectionRecovery";

describe("Celerity recovery after returning from the host payment UI", () => {
  let page: EventTarget & { visibilityState: string };
  let hostWindow: EventTarget;
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    hostWindow = Object.assign(new EventTarget(), { setInterval, clearInterval });
    vi.stubGlobal("document", page);
    vi.stubGlobal("window", hostWindow);
  });

  afterEach(() => {
    stop?.();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reconnects once when the phone returns, even with several resume events", () => {
    const reconnect = vi.fn(() => true);
    stop = watchCelerityConnection({ reconnect, lastReceivedAt: () => 100_000 });
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(10_000);
    expect(reconnect).not.toHaveBeenCalled();
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    hostWindow.dispatchEvent(new Event("focus"));
    hostWindow.dispatchEvent(new Event("pageshow"));
    vi.advanceTimersByTime(5_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it("recovers a silently stopped subscription without lifecycle events", () => {
    const reconnect = vi.fn(() => true);
    stop = watchCelerityConnection({ reconnect, lastReceivedAt: () => 100_000 });
    vi.advanceTimersByTime(60_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(55_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it("leaves a healthy desktop stream connected", () => {
    const reconnect = vi.fn(() => true);
    stop = watchCelerityConnection({ reconnect, lastReceivedAt: () => Date.now() - 30_000 });
    vi.advanceTimersByTime(180_000);
    expect(reconnect).not.toHaveBeenCalled();
  });

  it("defers recovery until an ongoing publish or connection finishes", () => {
    const reconnect = vi.fn(() => false);
    stop = watchCelerityConnection({ reconnect, lastReceivedAt: () => Date.now() });
    vi.advanceTimersByTime(2_000);
    hostWindow.dispatchEvent(new Event("focus"));
    expect(reconnect).toHaveBeenCalledTimes(1);
    reconnect.mockReturnValue(true);
    vi.advanceTimersByTime(3_000);
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  it("does not reconnect in the background and removes listeners on cleanup", () => {
    const reconnect = vi.fn(() => true);
    stop = watchCelerityConnection({ reconnect, lastReceivedAt: () => 0 });
    page.visibilityState = "hidden";
    vi.advanceTimersByTime(120_000);
    expect(reconnect).not.toHaveBeenCalled();
    stop();
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    hostWindow.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(120_000);
    expect(reconnect).not.toHaveBeenCalled();
  });
});
