import { getStatementStore, toHex } from "@parity/product-sdk-host";
import {
  fromHex,
  StatementConnectionError,
  type StatementTransport,
} from "@parity/product-sdk-statement-store";

// Statement Store now resolves to the same host SDK build as the app, so the
// two TrUAPI copies that used to fight over the mobile MessagePort are gone.
// This still routes through the application's host singleton on purpose: the
// shared connection has to outlive any single StatementStoreClient, so wallet
// requests keep working when a client is replaced (see destroy() below).
export async function createSharedHostTransport(): Promise<StatementTransport> {
  const store = await getStatementStore();
  if (!store) throw new StatementConnectionError("Host statement store unavailable.");

  return {
    subscribe(filter, onStatements, onError) {
      const subscription = store.subscribe(
        filter === "any" ? { matchAny: [] } : filter,
        (page) => onStatements(page.statements.map((statement) => ({
          ...statement,
          data: statement.data === undefined ? undefined : fromHex(statement.data),
        }))),
      );
      subscription.onInterrupt((reason) => onError(
        reason instanceof Error ? reason : new Error("Host ended the statement subscription"),
      ));
      return { unsubscribe: () => subscription.unsubscribe() };
    },
    async signAndSubmit(statement, credentials) {
      if (credentials.mode !== "host") {
        throw new StatementConnectionError("Shared host transport requires host credentials.");
      }
      const wireStatement = {
        ...statement,
        data: statement.data === undefined ? undefined : toHex(statement.data),
      };
      const proof = await store.createProofAuthorized(wireStatement);
      await store.submit({ ...wireStatement, proof });
    },
    // StatementStoreClient owns its subscription; the shared host connection
    // must remain alive for wallet requests when this client is replaced.
    destroy() {},
  };
}
