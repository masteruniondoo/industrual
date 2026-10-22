# Connecting a Polkadot Product app to the wallet

Reference procedure, written after debugging `industrial.dot` on Products Devnet
in September 2026. It is meant to be reusable across projects, so it describes
the model and the failure modes, not just the calls.

Verified against `@parity/product-sdk-host@0.19.1` and `@parity/truapi@0.13.1`.
Working implementation lives in [lib/host/walletSession.ts](lib/host/walletSession.ts)
and [lib/host/dotNsIdentifier.ts](lib/host/dotNsIdentifier.ts).

Official sources: the [dotli-starter](https://github.com/paritytech/dotli-starter)
template and the [developer quickstart](https://docs.polkadotcommunity.foundation/getting-started/developers/).

---

## 1. The model

**The app has no wallet of its own.** It runs inside a Products host — the
Polkadot Desktop or Mobile app, or the web gateway on `dev-dot.li` / `dot.li` —
and the host owns the wallet, the accounts and the signing. The app receives an
account only by asking for one.

Two consequences that cost the most time to learn:

**Being inside the container proves nothing about the wallet.**
`isInsideContainer()` is a synchronous environment check. It sends no message to
the host. It returns `true` on a page that has no wallet connected at all, so a
green "host detected" indicator says only "I am running in the right place".

**The approval prompt fires whether or not you ask for it.** From the `@parity/truapi`
docs on `RemotePermission`:

> `ChainSubmit`, `PreimageSubmit`, and `StatementSubmit` are also triggered
> implicitly by the corresponding business calls when not yet granted.

So an app that never establishes a session still gets "Approve wallet access" —
just at the worst moment, partway through a publish or a payment, while the app
sits on a timeout it did not choose. **Asking up front does not add a prompt. It
moves the same prompt to a step you can name, report and retry.**

## 2. The sequence

```ts
import {
  getAccountsProvider,
  isInsideContainer,
  requestPermission,
} from "@parity/product-sdk-host";

// 1. Is there a host at all?
if (!(await isInsideContainer())) return;          // no host → no wallet, not an error

// 2. Take the accounts provider.
const provider = await getAccountsProvider();
if (!provider) return;                              // host exposed none

// 3. Make sure a user is logged in. getUserId() failing is the ordinary
//    "nobody yet" answer — requestLogin() is what raises the approval prompt.
let user = await provider.getUserId().match((v) => v.primaryUsername, () => null);
if (user === null) {
  const login = await provider.requestLogin("why this app needs the wallet")
    .match((r) => r, (e) => String(e));
  // "Success" | "AlreadyConnected" | "Rejected"
  if (login === "Rejected") return;
  user = await provider.getUserId().match((v) => v.primaryUsername, () => null);
}

// 4. Resolve the product account, scoped to this page's DotNS name.
const account = await provider.getProductAccount("yourname.dot", 0)
  .match((v) => v, () => null);

// 5. Ask for the permission you will actually use, explicitly.
const granted = await requestPermission({ tag: "StatementSubmit", value: undefined });
```

Accounts-provider methods return **neverthrow** `ResultAsync` — use `.match(ok, err)`.
`requestPermission` and `requestResourceAllocation` return a plain
`{ ok, value | error }` result instead. Two different shapes in one SDK; mixing
them up is a common mistake.

### Product accounts are scoped to a DotNS name

`getProductAccount(dotNsIdentifier, derivationIndex)` derives a different account
per name. Derive the identifier from `location.hostname` rather than hardcoding
it, so a bundle served under another name gets its own account instead of
silently reusing this one's:

```
industrial.dev-dot.li  → industrial.dot
industrial.dot.li      → industrial.dot
app.industrial.dev-dot.li → app.industrial.dot
localhost              → null   (fall back to a configured name)
```

### Watch the connection

The host drops the wallet on its own — the phone goes away, the session expires —
and nothing else tells the app:

```ts
provider.subscribeAccountConnectionStatus((status) => {
  // "Connected" | "Disconnected"
});
```

## 3. Design rules that paid off

- **Never throw from the connect flow.** "No host", "user declined" and "the host
  errored" are indistinguishable in a rejected promise but call for three
  different messages on screen. Return a discriminated status instead.
- **A denied permission is not fatal.** The slot-table allowances
  (`StatementStoreAllowance`, `BulletinAllowance`, `SmartContractAllowance`) may
  still be fulfilled implicitly on first submission. Record the refusal, carry
  on. `AutoSigning` is the exception — it must be requested explicitly.
- **Inject the host calls.** Taking `isInsideContainer` / `getAccountsProvider` /
  `requestPermission` as a parameter makes the whole flow unit-testable with no
  host present. See [lib/host/walletSession.test.ts](lib/host/walletSession.test.ts).
- **Surface which step failed.** A single "connection timed out" tells the user
  nothing. Name the step in the UI.

## 4. Failure catalogue

| Symptom | Meaning |
|---|---|
| Prompt "Approve wallet access", then a ~30s timeout | Host-side. The app never established a session, so the host raised the prompt implicitly and gave up. Fix: do §2 up front. |
| Host detected, Statement Store times out | Detection is only an env sniff; there is no account. Same fix. |
| `getUserId()` errors | Normal when nobody is logged in. Call `requestLogin()`, do not treat as fatal. |
| `Publisher.publish reverted: NoPersonhood` | Not a wallet problem. The Publisher contract (Browse listing) requires Proof of Personhood for the signer, granted out of band by the `POP_RULES` owner. `polkadot-app-deploy` cannot upgrade a signer. |
| Deploy succeeds but app absent from Browse | Publisher registry is separate from name resolution. The app still loads by name. |

## 5. Package notes

Keep the SDK current — the host is updated independently of your bundle, and a
stale bundle is the first thing to suspect.

```
@parity/product-sdk-host            0.19.1
@parity/product-sdk-statement-store 0.6.9   (depends on host 0.19.1 exactly)
@parity/product-sdk-signer          0.14.4
@parity/product-sdk-chain-client    0.12.3
@parity/product-sdk-contracts       0.10.7
@parity/product-sdk-tx              0.4.7
@parity/product-sdk-descriptors     0.11.0
```

- `product-sdk-statement-store` pins `product-sdk-host` **exactly**. Match it and
  npm dedupes to one copy; drift and you get two TrUAPI instances fighting over
  the same MessagePort.
- Stay on `polkadot-api` 2.x — the SDK requires `^2.1.6`.
- **Breaking change to watch:** `DerivationIndex` became a tagged union.
  `value: 0` is now `value: { tag: "Index", value: 0 }`.

## 6. Checklist for a new app

1. Install the SDK packages above; let statement-store pin the host version.
2. Derive the DotNS identifier from `location.hostname`.
3. Run the §2 sequence before any signing, publishing or payment call.
4. Subscribe to the account connection status.
5. Show a per-step status in the UI, with a retry.
6. For anything paid or submitted, request the matching permission explicitly.
7. Test the flow with an injected fake host — no container needed.
