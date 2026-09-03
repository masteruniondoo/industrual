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
});
