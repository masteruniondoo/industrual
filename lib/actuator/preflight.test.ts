import { describe, expect, it } from "vitest";
import {
  ActuatorInsufficientFundsError,
  ActuatorPreflightError,
  preflightFailureError,
} from "./preflight";

describe("activation pre-flight", () => {
  it("reports insufficient funds for a TransferFailed dispatch error", () => {
    const dispatchError = {
      type: "Module",
      value: { type: "Revive", value: { type: "TransferFailed" } },
    };
    const error = preflightFailureError(dispatchError);
    expect(error).toBeInstanceOf(ActuatorInsufficientFundsError);
    expect(error.message).toMatch(/Insufficient funds/);
  });

  it("surfaces the contract revert reason", () => {
    const error = preflightFailureError({
      reason: "exactly 1 PAS required",
      data: "0x08c379a0",
    });
    expect(error).toBeInstanceOf(ActuatorPreflightError);
    expect(error.message).toMatch(/exactly 1 PAS required/);
  });

  it("keeps unknown failures readable", () => {
    const error = preflightFailureError({ type: "Module", value: { type: "Other" } });
    expect(error).toBeInstanceOf(ActuatorPreflightError);
    expect(error.message).toMatch(/Activation pre-flight failed/);
    expect(error.message).toMatch(/Other/);
  });

  it("never reports success as an error type", () => {
    expect(preflightFailureError("weird")).toBeInstanceOf(ActuatorPreflightError);
  });
});
