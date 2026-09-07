import { afterEach, expect, it, vi } from "vitest";
import { getTruApi, toHex } from "@parity/product-sdk-host";
import {
  decodeWireMessage,
  encodeWireMessage,
  VersionedRemoteStatementStoreSubscribeItem,
} from "@parity/truapi";
import { STATEMENT_STORE_SUBSCRIBE } from "@parity/truapi/wire-table";
import { createSharedHostTransport } from "./sharedHostTransport";

afterEach(() => vi.unstubAllGlobals());

it("keeps Celerity receiving on the mobile port while wallet host calls start", async () => {
  const sent: Uint8Array[] = [];
  const port = {
    onmessage: null as ((event: { data: Uint8Array }) => void) | null,
    start() {},
    close: vi.fn(),
    postMessage: (message: Uint8Array) => sent.push(message),
  };
  const mobile = { __HOST_WEBVIEW_MARK__: true, __HOST_API_PORT__: port, top: null as unknown };
  mobile.top = mobile;
  vi.stubGlobal("window", mobile);
  const transport = await createSharedHostTransport();
  const received = vi.fn();
  const subscription = transport.subscribe("any", received, vi.fn());
  await Promise.resolve();
  const handler = port.onmessage;
  expect(handler).toBeTypeOf("function");

  // This initializes the same host API that payment uses. With the SDK's
  // default Celerity transport it replaces port.onmessage with another client.
  const walletHost = await getTruApi();
  expect(walletHost).not.toBeNull();
  await Promise.resolve();
  expect(port.onmessage).toBe(handler);

  const start = sent.map((frame) => decodeWireMessage(frame)._unsafeUnwrap())
    .find((frame) => frame.payload.id === STATEMENT_STORE_SUBSCRIBE.start)!;
  const data = new TextEncoder().encode('{"type":"env"}');
  const frame = encodeWireMessage({
    requestId: start.requestId,
    payload: {
      id: STATEMENT_STORE_SUBSCRIBE.receive,
      value: VersionedRemoteStatementStoreSubscribeItem.enc({
        tag: "V1",
        value: {
          statements: [{
            topics: [],
            data: toHex(data),
            proof: { tag: "Sr25519", value: { signer: `0x${"00".repeat(32)}`, signature: `0x${"00".repeat(64)}` } },
          }],
          isComplete: true,
        },
      }),
    },
  })._unsafeUnwrap();
  port.onmessage!({ data: frame });
  expect(received).toHaveBeenCalledWith([expect.objectContaining({ data })]);
  subscription.unsubscribe();
  transport.destroy();
  expect(port.close).not.toHaveBeenCalled();
  expect(await getTruApi()).toBe(walletHost);
});
