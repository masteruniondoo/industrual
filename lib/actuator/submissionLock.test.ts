import { describe, expect, it } from "vitest";
import {
  ActuatorSubmissionLock,
  DuplicateActuatorSubmissionError,
  StaleActuatorSubmissionError,
} from "./submissionLock";

describe("ActuatorSubmissionLock", () => {
  it("rejects a duplicate submission while the first is pending", async () => {
    const lock = new ActuatorSubmissionLock();
    let release!: () => void;
    const first = lock.run(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    await expect(lock.run(async () => undefined)).rejects.toBeInstanceOf(
      DuplicateActuatorSubmissionError,
    );
    release();
    await first;
  });

  it("unlocks after a failed submission", async () => {
    const lock = new ActuatorSubmissionLock();
    await expect(lock.run(async () => {
      throw new Error("rejected");
    })).rejects.toThrow("rejected");

    await expect(lock.run(async () => "accepted")).resolves.toBe("accepted");
  });

  // The reported failure: a payment begun on one device and abandoned never
  // settles, so without a reset the lock is held for the life of the page.
  it("frees a lock held by a submission that never settles", async () => {
    const lock = new ActuatorSubmissionLock();
    void lock.run(() => new Promise<void>(() => {}));
    expect(lock.isPending).toBe(true);

    await expect(lock.run(async () => "blocked")).rejects.toBeInstanceOf(
      DuplicateActuatorSubmissionError,
    );

    lock.reset();
    expect(lock.isPending).toBe(false);
    await expect(lock.run(async () => "accepted")).resolves.toBe("accepted");
  });

  it("disowns a superseded submission instead of reporting it as the outcome", async () => {
    const lock = new ActuatorSubmissionLock();
    let release!: (value: string) => void;
    const abandoned = lock.run(
      () => new Promise<string>((resolve) => {
        release = resolve;
      }),
    );

    lock.reset();
    release("late result from the abandoned attempt");

    await expect(abandoned).rejects.toBeInstanceOf(StaleActuatorSubmissionError);
  });

  it("keeps a straggler from unlocking a payment that started after the reset", async () => {
    const lock = new ActuatorSubmissionLock();
    let releaseAbandoned!: () => void;
    const abandoned = lock.run(
      () => new Promise<void>((resolve) => {
        releaseAbandoned = resolve;
      }),
    );

    lock.reset();

    let releaseCurrent!: () => void;
    const current = lock.run(
      () => new Promise<void>((resolve) => {
        releaseCurrent = resolve;
      }),
    );

    // The abandoned attempt finishing must not release the current one's lock.
    releaseAbandoned();
    await expect(abandoned).rejects.toBeInstanceOf(StaleActuatorSubmissionError);
    expect(lock.isPending).toBe(true);
    await expect(lock.run(async () => "blocked")).rejects.toBeInstanceOf(
      DuplicateActuatorSubmissionError,
    );

    releaseCurrent();
    await current;
    expect(lock.isPending).toBe(false);
  });
});
