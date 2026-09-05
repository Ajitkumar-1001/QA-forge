import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();

vi.mock("node:dns/promises", () => ({
  default: { lookup: (...args: unknown[]) => lookupMock(...args) },
}));

const { isAddressAllowed, isUrlAllowed } = await import("@/mastra/tools/browser/navigate.tool");

beforeEach(() => {
  lookupMock.mockReset();
});

describe("isAddressAllowed", () => {
  it("allows a public unicast address", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(isAddressAllowed("example.com")).resolves.toBe(true);
  });

  it("denies a loopback address", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(isAddressAllowed("localhost")).resolves.toBe(false);
  });

  it("denies a private address", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(isAddressAllowed("internal.example")).resolves.toBe(false);
  });

  it("denies the cloud-metadata link-local address", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(isAddressAllowed("metadata.example")).resolves.toBe(false);
  });

  it("denies if any resolved address is disallowed (multi-A-record DNS-rebinding shape)", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(isAddressAllowed("mixed.example")).resolves.toBe(false);
  });

  it("fails closed on a DNS error", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(isAddressAllowed("nonexistent.invalid")).resolves.toBe(false);
  });
});

describe("isUrlAllowed — including the redirect-hop re-check", () => {
  it("allows a public https URL", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(isUrlAllowed("https://example.com/login")).resolves.toBe(true);
  });

  it("denies a redirect target that resolves to a private address (SEC-001: not only the initial URL)", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
    await expect(isUrlAllowed("https://example.com/redirect-target")).resolves.toBe(false);
  });

  it("denies a non-http(s) scheme without ever resolving DNS", async () => {
    await expect(isUrlAllowed("file:///etc/passwd")).resolves.toBe(false);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("denies a malformed URL", async () => {
    await expect(isUrlAllowed("not a url")).resolves.toBe(false);
  });
});
