import { describe, expect, it } from "vitest";
import {
  ActuatorInsufficientFundsError,
  assertSufficientBalance,
  formatNative,
  requiredBalance,
  spendableBalance,
} from "./balance";
import { ACTUATOR_FEE_BUFFER_NATIVE, ACTUATOR_PRICE_NATIVE } from "./config";

const ED = 100_000_000n; // 0.01 PAS on Asset Hub

describe("actuator balance guard", () => {
  it("subtracts locked funds from the free balance", () => {
    expect(spendableBalance({ free: 50_000_000_000n, frozen: 20_000_000_000n })).toBe(
      30_000_000_000n,
    );
    expect(spendableBalance({ free: 1n, frozen: 5n })).toBe(0n);
  });

  it("requires the payment plus fees and the existential deposit", () => {
    expect(requiredBalance(ACTUATOR_PRICE_NATIVE, ACTUATOR_FEE_BUFFER_NATIVE, ED)).toBe(
      ACTUATOR_PRICE_NATIVE + ACTUATOR_FEE_BUFFER_NATIVE + ED,
    );
  });

  it("passes when the account can cover the activation", () => {
    expect(() =>
      assertSufficientBalance(
        { free: 20_000_000_000n, frozen: 0n },
        ACTUATOR_PRICE_NATIVE,
        ACTUATOR_FEE_BUFFER_NATIVE,
        ED,
      ),
    ).not.toThrow();
  });

  it("throws before signing when funds are short", () => {
    expect(() =>
      assertSufficientBalance(
        { free: ACTUATOR_PRICE_NATIVE, frozen: 0n },
        ACTUATOR_PRICE_NATIVE,
        ACTUATOR_FEE_BUFFER_NATIVE,
        ED,
      ),
    ).toThrow(ActuatorInsufficientFundsError);
  });

  it("counts locked funds as unavailable", () => {
    expect(() =>
      assertSufficientBalance(
        { free: 100_000_000_000n, frozen: 99_000_000_000n },
        ACTUATOR_PRICE_NATIVE,
        ACTUATOR_FEE_BUFFER_NATIVE,
        ED,
      ),
    ).toThrow(/Insufficient funds/);
  });

  it("formats planck as PAS", () => {
    expect(formatNative(10_000_000_000n)).toBe("1.0000 PAS");
    expect(formatNative(12_345_000_000n)).toBe("1.2345 PAS");
    expect(formatNative(0n)).toBe("0.0000 PAS");
  });
});
