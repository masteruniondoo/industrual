import { describe, expect, it } from "vitest";
import {
  ACTUATOR_NATIVE_DECIMALS,
  ACTUATOR_PRICE_EVM,
  ACTUATOR_PRICE_NATIVE,
  evmValueToNative,
} from "./config";

describe("actuator price units", () => {
  it("keeps the contract price in Solidity units", () => {
    expect(ACTUATOR_PRICE_EVM).toBe(1_000_000_000_000_000_000n);
  });

  it("sends one PAS as native planck, not as Solidity wei", () => {
    // Revive.call carries native balance. 1e18 planck would ask the chain to
    // move 100,000,000 PAS and fails with Revive.TransferFailed.
    expect(ACTUATOR_PRICE_NATIVE).toBe(10_000_000_000n);
    expect(ACTUATOR_PRICE_NATIVE).not.toBe(ACTUATOR_PRICE_EVM);
  });

  it("scales Solidity values down to the native decimals", () => {
    expect(evmValueToNative(ACTUATOR_PRICE_EVM, ACTUATOR_NATIVE_DECIMALS)).toBe(
      10_000_000_000n,
    );
    expect(evmValueToNative(1_000_000_000_000_000_000n, 18)).toBe(
      1_000_000_000_000_000_000n,
    );
    expect(evmValueToNative(0n, 10)).toBe(0n);
  });

  it("rejects values that cannot be represented on chain", () => {
    expect(() => evmValueToNative(1n, 10)).toThrow(/not representable/);
    expect(() => evmValueToNative(1_000_000_000_000_000_000n, 19)).toThrow(
      /Unsupported native decimals/,
    );
  });
});
