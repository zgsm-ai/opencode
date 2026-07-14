import { describe, expect, test } from "bun:test";
import { decideSyncAction, pathToSplat, splatToPath } from "./sync-action";

describe("splatToPath / pathToSplat", () => {
  test("empty splat is home", () => {
    expect(splatToPath("")).toBe("/");
    expect(splatToPath("/")).toBe("/");
  });
  test("splat with segments becomes a leading-slash path", () => {
    expect(splatToPath("ipd-1/issues/abc")).toBe("/ipd-1/issues/abc");
  });
  test("path round-trips through splat", () => {
    expect(pathToSplat("/ipd-1/issues/abc")).toBe("ipd-1/issues/abc");
    expect(pathToSplat("/")).toBe("");
  });
});

describe("decideSyncAction — child location (child → parent)", () => {
  test("updates URL and records the child path", () => {
    const action = decideSyncAction(
      { currentSplat: "", lastChildPath: "/" },
      { kind: "childLocation", path: "/ipd-1/issues/abc" },
    );
    expect(action).toEqual({
      updateUrl: "/workflow/ipd-1/issues/abc",
      lastChildPath: "/ipd-1/issues/abc",
    });
  });

  test("home path maps to bare /workflow", () => {
    const action = decideSyncAction(
      { currentSplat: "ipd-1/issues/abc", lastChildPath: "/ipd-1/issues/abc" },
      { kind: "childLocation", path: "/" },
    );
    expect(action).toEqual({ updateUrl: "/workflow", lastChildPath: "/" });
  });
});

describe("decideSyncAction — splat change (parent → child)", () => {
  test("posts a route command when splat differs from child's location", () => {
    const action = decideSyncAction(
      { currentSplat: "", lastChildPath: "/" },
      { kind: "splatChange", splat: "ipd-1/issues/abc" },
    );
    expect(action).toEqual({
      postRoute: "/ipd-1/issues/abc",
      lastChildPath: "/ipd-1/issues/abc",
    });
  });

  test("no-op when splat matches where the child already is (breaks the loop)", () => {
    const action = decideSyncAction(
      { currentSplat: "ipd-1/issues/abc", lastChildPath: "/ipd-1/issues/abc" },
      { kind: "splatChange", splat: "ipd-1/issues/abc" },
    );
    expect(action).toEqual({});
  });

  test("empty splat posts home", () => {
    const action = decideSyncAction(
      { currentSplat: "ipd-1/issues/abc", lastChildPath: "/ipd-1/issues/abc" },
      { kind: "splatChange", splat: "" },
    );
    expect(action).toEqual({ postRoute: "/", lastChildPath: "/" });
  });
});
