import { describe, expect, test } from "vitest";

import { selfDotNsIdentifier } from "./dotNsIdentifier";

describe("selfDotNsIdentifier", () => {
  test("maps the devnet gateway host to its .dot name", () => {
    expect(selfDotNsIdentifier("industrial.dev-dot.li")).toBe("industrial.dot");
  });

  test("maps the production gateway host to its .dot name", () => {
    expect(selfDotNsIdentifier("industrial.dot.li")).toBe("industrial.dot");
  });

  test("keeps a subname intact", () => {
    expect(selfDotNsIdentifier("app.industrial.dev-dot.li")).toBe("app.industrial.dot");
  });

  test("passes through a bare .dot host", () => {
    expect(selfDotNsIdentifier("industrial.dot")).toBe("industrial.dot");
  });

  test("normalises case and a trailing root dot", () => {
    expect(selfDotNsIdentifier("Industrial.Dev-Dot.li.")).toBe("industrial.dot");
  });

  // Null means "not served under a DotNS name", which is a fallback signal for
  // the caller, not a failure - `next dev` serves the same bundle on localhost.
  test("returns null off a DotNS name", () => {
    expect(selfDotNsIdentifier("localhost")).toBeNull();
    expect(selfDotNsIdentifier("192.168.1.42")).toBeNull();
    expect(selfDotNsIdentifier("")).toBeNull();
  });

  test("returns null when the gateway carries no label", () => {
    expect(selfDotNsIdentifier(".dev-dot.li")).toBeNull();
  });
});
