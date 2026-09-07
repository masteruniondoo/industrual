import { beforeEach, describe, expect, it, vi } from "vitest";

// The host SDK only exists inside a Products container, so the module is faked
// here. What is under test is the adapter, not the host.
const store = {
  subscribe: vi.fn(),
  createProofAuthorized: vi.fn(),
  submit: vi.fn(),
};
const getStatementStore = vi.fn(async () => store as unknown);

vi.mock("@parity/product-sdk-host", () => ({
  getStatementStore: () => getStatementStore(),
  toHex: (bytes: Uint8Array) =>
    `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`,
}));

const { createSharedHostTransport } = await import("./sharedHostTransport");

function subscriptionStub() {
  return { onInterrupt: vi.fn(), unsubscribe: vi.fn() };
}

describe("shared host statement transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStatementStore.mockResolvedValue(store as unknown);
  });

  it("fails loudly when the host exposes no statement store", async () => {
    getStatementStore.mockResolvedValue(null as unknown);
    await expect(createSharedHostTransport()).rejects.toThrow(/statement store unavailable/i);
  });

  // The whole point of this module. Two copies of the host SDK were attaching
  // to the same mobile MessagePort and overwriting each other's onmessage, so
  // Celerity stopped receiving as soon as the payment flow ran. Everything must
  // go through the single application host singleton.
  it("subscribes through the shared host store rather than its own connection", async () => {
    store.subscribe.mockReturnValue(subscriptionStub());
    const transport = await createSharedHostTransport();

    transport.subscribe("any", vi.fn(), vi.fn());

    expect(getStatementStore).toHaveBeenCalledTimes(1);
    expect(store.subscribe).toHaveBeenCalledTimes(1);
  });

  // "any" is the SDK's own spelling and has no host equivalent. Every other
  // filter is already the host's shape - the client hashes topic2 into a topic
  // hash before the transport ever sees it - so it must pass through untouched.
  it("translates 'any' into matchAny and passes topic filters through unchanged", async () => {
    store.subscribe.mockReturnValue(subscriptionStub());
    const transport = await createSharedHostTransport();

    transport.subscribe("any", vi.fn(), vi.fn());
    expect(store.subscribe.mock.calls[0][0]).toEqual({ matchAny: [] });

    const topics: { matchAll: `0x${string}`[] } = { matchAll: ["0xdeadbeef"] };
    transport.subscribe(topics, vi.fn(), vi.fn());
    expect(store.subscribe.mock.calls[1][0]).toEqual(topics);
  });

  it("decodes hex statement data into bytes and leaves absent data absent", async () => {
    store.subscribe.mockReturnValue(subscriptionStub());
    const transport = await createSharedHostTransport();
    const onStatements = vi.fn();

    transport.subscribe("any", onStatements, vi.fn());
    const deliver = store.subscribe.mock.calls[0][1] as (page: unknown) => void;
    deliver({ statements: [{ id: "a", data: "0x0102" }, { id: "b", data: undefined }] });

    const [statements] = onStatements.mock.calls[0];
    expect(statements[0].data).toEqual(new Uint8Array([1, 2]));
    expect(statements[1].data).toBeUndefined();
  });

  it("reports a host-side interruption as a transport error", async () => {
    const subscription = subscriptionStub();
    store.subscribe.mockReturnValue(subscription);
    const transport = await createSharedHostTransport();
    const onError = vi.fn();

    transport.subscribe("any", vi.fn(), onError);
    const interrupt = subscription.onInterrupt.mock.calls[0][0] as (reason?: unknown) => void;

    interrupt(new Error("host went away"));
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("host went away");

    // A bare reason still has to surface as an Error, not as undefined.
    interrupt(undefined);
    expect(onError.mock.calls[1][0]).toBeInstanceOf(Error);
  });

  it("signs and submits through the host, hex-encoding the payload once", async () => {
    store.createProofAuthorized.mockResolvedValue("proof-1");
    const transport = await createSharedHostTransport();

    await transport.signAndSubmit(
      { topic2: "warehouse-01", data: new Uint8Array([0xab]) } as never,
      { mode: "host" } as never,
    );

    expect(store.createProofAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({ data: "0xab" }),
    );
    expect(store.submit).toHaveBeenCalledWith(
      expect.objectContaining({ data: "0xab", proof: "proof-1" }),
    );
  });

  it("refuses credentials that are not host credentials", async () => {
    const transport = await createSharedHostTransport();

    await expect(
      transport.signAndSubmit({ topic2: "x" } as never, { mode: "key" } as never),
    ).rejects.toThrow(/host credentials/i);
    expect(store.submit).not.toHaveBeenCalled();
  });

  // Regression guard. The host connection is shared with wallet signing and the
  // payment flow, so replacing the Statement Store client must not close it.
  // A destroy() that tears the connection down reintroduces the original bug in
  // the opposite direction: payment would break instead of Celerity.
  it("leaves the shared host connection alive when the client is destroyed", async () => {
    const subscription = subscriptionStub();
    store.subscribe.mockReturnValue(subscription);
    const transport = await createSharedHostTransport();
    transport.subscribe("any", vi.fn(), vi.fn());

    transport.destroy();

    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    expect(getStatementStore).toHaveBeenCalledTimes(1);
  });

  it("still lets the caller unsubscribe its own subscription", async () => {
    const subscription = subscriptionStub();
    store.subscribe.mockReturnValue(subscription);
    const transport = await createSharedHostTransport();

    transport.subscribe("any", vi.fn(), vi.fn()).unsubscribe();
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
