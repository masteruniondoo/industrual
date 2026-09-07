import { describe, expect, it } from "vitest";
import {
  ActuatorSubmissionLock,
  DuplicateActuatorSubmissionError,
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

  // What replaced the reset control: triggerActuator bounds the whole
  // submission with its own timeout, so an abandoned signature rejects instead
  // of hanging, and the lock releases without anyone having to clear it.
  it("releases when a stalled submission finally rejects", async () => {
    const lock = new ActuatorSubmissionLock();
    let fail!: (reason: Error) => void;
    const stalled = lock.run(
      () => new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
    );

    expect(lock.isPending).toBe(true);
    await expect(lock.run(async () => "blocked")).rejects.toBeInstanceOf(
      DuplicateActuatorSubmissionError,
    );

    fail(new Error("Timed out after 150s waiting for the payment submission."));
    await expect(stalled).rejects.toThrow(/Timed out/);

    expect(lock.isPending).toBe(false);
    await expect(lock.run(async () => "accepted")).resolves.toBe("accepted");
  });

  it("reports the submission's own value and error untouched", async () => {
    const lock = new ActuatorSubmissionLock();
    await expect(lock.run(async () => "result")).resolves.toBe("result");

    const failure = new Error("chain rejected the payment");
    await expect(lock.run(async () => {
      throw failure;
    })).rejects.toBe(failure);
  });
});
