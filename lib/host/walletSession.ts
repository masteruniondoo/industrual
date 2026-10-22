/**
 * Establishing the host wallet session before any signing call is made.
 *
 * The Products host does not hand an app an account just because the app is
 * inside the container. `isInsideContainer()` only reports the environment - it
 * sends nothing to the host - so it can succeed while no wallet is connected at
 * all. The account arrives through the accounts provider, and the host puts the
 * "approve wallet access" prompt in front of the user the first time something
 * needs it.
 *
 * That prompt fires either way: the statement, chain and preimage submit
 * permissions are triggered implicitly by the corresponding business calls when
 * they have not been granted yet. Leaving it implicit means the prompt appears
 * partway through a publish, with the app already committed and waiting on a
 * timer it did not choose. Asking up front, in the order the host expects,
 * turns the same prompt into a step the app can report on and retry.
 *
 * The sequence follows the official starter: detect the container, take the
 * accounts provider, make sure a user is logged in, resolve the product account
 * for this page's DotNS name, then request the permission the app actually
 * needs.
 */

import {
  getAccountsProvider as sdkGetAccountsProvider,
  isInsideContainer as sdkIsInsideContainer,
  requestPermission as sdkRequestPermission,
  type AccountsProvider,
  type HostSubscription,
  type ProductAccount,
} from "@parity/product-sdk-host";

/** The host calls this app needs. Injected so the flow can be tested without a host. */
export type HostAccountsApi = {
  isInsideContainer: typeof sdkIsInsideContainer;
  getAccountsProvider: typeof sdkGetAccountsProvider;
  requestPermission: typeof sdkRequestPermission;
};

const defaultApi: HostAccountsApi = {
  isInsideContainer: sdkIsInsideContainer,
  getAccountsProvider: sdkGetAccountsProvider,
  requestPermission: sdkRequestPermission,
};

export type WalletSession = {
  provider: AccountsProvider;
  account: ProductAccount;
  /** The host's primary username for the logged-in user. */
  username: string;
  /**
   * Whether the host granted StatementSubmit up front. False is not fatal - the
   * host may still fulfil it implicitly on the first submission - but it does
   * mean a prompt is still owed.
   */
  statementSubmitGranted: boolean;
};

export type WalletConnectOutcome =
  /** A wallet is connected and the product account is resolved. */
  | { status: "connected"; session: WalletSession }
  /** No Products host, so there is no wallet to connect. Not a failure. */
  | { status: "unsupported"; detail: string }
  /** The host is there but the user has not approved wallet access. */
  | { status: "login-required"; detail: string }
  | { status: "error"; detail: string };

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Connect the host wallet and resolve the product account for `dotNsIdentifier`.
 *
 * Never throws: every outcome the caller can act on differently is a distinct
 * status, because "no host" and "user declined" and "the host errored" all look
 * the same from a rejected promise and call for different words on screen.
 */
export async function connectWallet(
  dotNsIdentifier: string,
  options: { reason?: string; api?: HostAccountsApi } = {},
): Promise<WalletConnectOutcome> {
  const api = options.api ?? defaultApi;
  const reason = options.reason ?? `Publish sensor readings as ${dotNsIdentifier}`;

  try {
    if (!(await api.isInsideContainer())) {
      return {
        status: "unsupported",
        detail: "Not inside a Polkadot Products host, so no wallet can be connected.",
      };
    }

    const provider = await api.getAccountsProvider();
    if (!provider) {
      return {
        status: "unsupported",
        detail: "The Products host exposed no accounts provider.",
      };
    }

    // getUserId() failing is the ordinary "nobody is logged in yet" answer, not
    // a fault - requestLogin is what puts the approval prompt on screen.
    let username = await provider
      .getUserId()
      .match((value) => value.primaryUsername, () => null);

    if (username === null) {
      const login = await provider
        .requestLogin(reason)
        .match((response) => response, (error) => describe(error));

      if (login === "Rejected") {
        return { status: "login-required", detail: "Wallet access was declined." };
      }
      if (login !== "Success" && login !== "AlreadyConnected") {
        return { status: "error", detail: `Login failed: ${login}` };
      }

      username = await provider
        .getUserId()
        .match((value) => value.primaryUsername, () => null);

      if (username === null) {
        return {
          status: "login-required",
          detail: "The host reported a login but still exposes no user.",
        };
      }
    }

    const account = await provider
      .getProductAccount(dotNsIdentifier, 0)
      .match(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error: describe(error) }),
      );

    if (!account.ok) {
      return { status: "error", detail: `No product account for ${dotNsIdentifier}: ${account.error}` };
    }

    // Asked for explicitly so the prompt lands here rather than inside a publish.
    const permission = await api.requestPermission({
      tag: "StatementSubmit",
      value: undefined,
    });

    return {
      status: "connected",
      session: {
        provider,
        account: account.value,
        username,
        statementSubmitGranted: permission.ok ? permission.value : false,
      },
    };
  } catch (error) {
    return { status: "error", detail: describe(error) };
  }
}

/**
 * Watch the host's account connection. The host drops the wallet on its own -
 * the phone goes away, the session expires - and nothing else tells the app.
 */
export function watchWalletConnection(
  session: WalletSession,
  onChange: (connected: boolean) => void,
): HostSubscription {
  return session.provider.subscribeAccountConnectionStatus((status) => {
    onChange(status === "Connected");
  });
}
