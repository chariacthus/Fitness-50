import { describe, expect, it } from "vitest";
import { firstParam, nextFromParams, safeNext, withNext } from "@/lib/auth-flow/safe-next";

describe("safeNext", () => {
  it("accepts same-site relative paths", () => {
    expect(safeNext("/hjem", "/x")).toBe("/hjem");
    expect(safeNext("/beskeder/123", "/x")).toBe("/beskeder/123");
    expect(safeNext("/bliv-medlem?krav=medlemskab", "/x")).toBe("/bliv-medlem?krav=medlemskab");
    expect(safeNext("/opslag#kommentar", "/x")).toBe("/opslag#kommentar");
    expect(safeNext("/", "/x")).toBe("/");
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safeNext("//evil.dk", "/hjem")).toBe("/hjem");
    expect(safeNext("//evil.dk/hjem", "/hjem")).toBe("/hjem");
    expect(safeNext("/\\evil.dk", "/hjem")).toBe("/hjem");
    expect(safeNext("/foo\\bar", "/hjem")).toBe("/hjem");
  });

  it("rejects absolute URLs and other schemes", () => {
    expect(safeNext("https://evil.dk", "/hjem")).toBe("/hjem");
    expect(safeNext("http://localhost:3000/hjem", "/hjem")).toBe("/hjem");
    expect(safeNext("javascript:alert(1)", "/hjem")).toBe("/hjem");
    expect(safeNext("data:text/html,hi", "/hjem")).toBe("/hjem");
  });

  it("rejects paths that are not rooted", () => {
    expect(safeNext("hjem", "/hjem")).toBe("/hjem");
    expect(safeNext("./hjem", "/hjem")).toBe("/hjem");
    expect(safeNext("", "/hjem")).toBe("/hjem");
    expect(safeNext(" /hjem", "/hjem")).toBe("/hjem");
  });

  it("rejects whitespace and control characters browsers would strip", () => {
    expect(safeNext("/\t/evil.dk", "/hjem")).toBe("/hjem");
    expect(safeNext("/\n/evil.dk", "/hjem")).toBe("/hjem");
    expect(safeNext("/\r/evil.dk", "/hjem")).toBe("/hjem");
    expect(safeNext("/ /evil.dk", "/hjem")).toBe("/hjem");
    expect(safeNext("/hjem\u0000", "/hjem")).toBe("/hjem");
  });

  it("rejects non-strings and overly long values", () => {
    expect(safeNext(undefined, "/hjem")).toBe("/hjem");
    expect(safeNext(null, "/hjem")).toBe("/hjem");
    expect(safeNext(42, "/hjem")).toBe("/hjem");
    expect(safeNext(["/beskeder"], "/hjem")).toBe("/hjem");
    expect(safeNext(`/${"a".repeat(600)}`, "/hjem")).toBe("/hjem");
  });

  it("keeps encoded characters as a harmless path", () => {
    expect(safeNext("/%2F%2Fevil.dk", "/hjem")).toBe("/%2F%2Fevil.dk");
  });

  it("returns the given fallback (also an empty one)", () => {
    expect(safeNext("//evil.dk", "")).toBe("");
    expect(safeNext("//evil.dk", "/bliv-medlem")).toBe("/bliv-medlem");
  });
});

describe("search param helpers", () => {
  it("firstParam takes the first of repeated params", () => {
    expect(firstParam(["/a", "/b"])).toBe("/a");
    expect(firstParam("/a")).toBe("/a");
    expect(firstParam(undefined)).toBeUndefined();
  });

  it("nextFromParams validates and defaults to an empty string", () => {
    expect(nextFromParams("/hjem")).toBe("/hjem");
    expect(nextFromParams(["//evil.dk", "/hjem"])).toBe("");
    expect(nextFromParams(undefined)).toBe("");
  });

  it("withNext only adds ?next when present", () => {
    expect(withNext("/log-ind", "")).toBe("/log-ind");
    expect(withNext("/log-ind", "/beskeder/1?x=2")).toBe("/log-ind?next=%2Fbeskeder%2F1%3Fx%3D2");
  });
});
