import { errAsync, okAsync } from "neverthrow";
import { describe, expect, test, vi } from "vitest";

import type { AccountsProvider } from "@parity/product-sdk-host";

import { connectWallet, type HostAccountsApi } from "./walletSession";

const account = { dotNsIdentifier: "industrial.dot", derivationIndex: 0, publicKey: new Uint8Array(32) };

function provider(overrides: Partial<Record<keyof AccountsProvider, unknown>> = {}) {
  return {
    getUserId: () => okAsync({ primaryUsername: "alice.dot" }),
    requestLogin: () => okAsync("Success"),
    getProductAccount: () => okAsync(account),
    subscribeAccountConnectionStatus: () => ({ unsubscribe() {}, onInterrupt: () => () => {} }),
    ...overrides,
  } as unknown as AccountsProvider;
}

function api(overrides: Partial<HostAccountsApi> = {}): HostAccountsApi {
  return {
    isInsideContainer: async () => true,
    getAccountsProvider: async () => provider(),
    requestPermission: async () => ({ ok: true, value: true }),
    ...overrides,
  } as HostAccountsApi;
}

describe("connectWallet", () => {
  test("reports an absent host as unsupported rather than an error", async () => {
    const outcome = await connectWallet("industrial.dot", {
      api: api({ isInsideContainer: async () => false }),
    });
    expect(outcome.status).toBe("unsupported");
  });

  test("treats a host without an accounts provider as unsupported", async () => {
    const outcome = await connectWallet("industrial.dot", {
      api: api({ getAccountsProvider: async () => null }),
    });
    expect(outcome.status).toBe("unsupported");
  });

  test("resolves the product account for an already logged-in user", async () => {
    const outcome = await connectWallet("industrial.dot", { api: api() });
    expect(outcome.status).toBe("connected");
    if (outcome.status !== "connected") return;
    expect(outcome.session.username).toBe("alice.dot");
    expect(outcome.session.statementSubmitGranted).toBe(true);
  });

  test("asks the user to log in when no user is exposed yet", async () => {
    const requestLogin = vi.fn(() => okAsync("Success"));
    const getUserId = vi
      .fn()
      .mockReturnValueOnce(errAsync({ tag: "NotLoggedIn" }))
      .mockReturnValueOnce(okAsync({ primaryUsername: "bob.dot" }));

    const outcome = await connectWallet("industrial.dot", {
      api: api({ getAccountsProvider: async () => provider({ getUserId, requestLogin }) }),
    });

    expect(requestLogin).toHaveBeenCalledOnce();
    expect(outcome.status).toBe("connected");
  });

  test("surfaces a declined approval as login-required, not an error", async () => {
    const outcome = await connectWallet("industrial.dot", {
      api: api({
        getAccountsProvider: async () =>
          provider({
            getUserId: () => errAsync({ tag: "NotLoggedIn" }),
            requestLogin: () => okAsync("Rejected"),
          }),
      }),
    });
    expect(outcome.status).toBe("login-required");
  });

  test("reports a missing product account as an error", async () => {
    const outcome = await connectWallet("industrial.dot", {
      api: api({
        getAccountsProvider: async () =>
          provider({ getProductAccount: () => errAsync({ tag: "Unknown" }) }),
      }),
    });
    expect(outcome.status).toBe("error");
  });

  // A denied permission still connects: the host may fulfil StatementSubmit
  // implicitly on the first submission, so refusing to proceed here would block
  // a path that actually works.
  test("connects with the permission flagged when the host denies it", async () => {
    const outcome = await connectWallet("industrial.dot", {
      api: api({ requestPermission: (async () => ({ ok: true, value: false })) as HostAccountsApi["requestPermission"] }),
    });
    expect(outcome.status).toBe("connected");
    if (outcome.status !== "connected") return;
    expect(outcome.session.statementSubmitGranted).toBe(false);
  });

  test("never throws when the host call itself blows up", async () => {
    const outcome = await connectWallet("industrial.dot", {
      api: api({
        isInsideContainer: async () => {
          throw new Error("port closed");
        },
      }),
    });
    expect(outcome).toEqual({ status: "error", detail: "port closed" });
  });
});
