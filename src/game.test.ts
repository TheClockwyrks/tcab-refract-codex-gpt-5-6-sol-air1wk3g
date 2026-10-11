import { describe, expect, it } from "vitest";
import type { InitApi } from "@clockwyrks/simple-2d";
import { game, type RefractDebugApi, type RefractState } from "./game";

function init(): [RefractState, RefractDebugApi] {
  const api = {
    input: { register() {}, layout: () => null },
    audio: { define() {}, load: async () => {} },
    assets: {},
    diagnostics: { register() {} },
    events: {},
    viewport: () => ({}),
  } as unknown as InitApi<RefractState>;
  return game.initialize(api) as [RefractState, RefractDebugApi];
}
describe("Refract core", () => {
  it("starts and resets", () => {
    const [s, d] = init();
    expect(d.snapshot(s)).toMatchObject({
      version: 2,
      screen: "title",
      unlockedCount: 1,
      solved: false,
    });
    expect(d.reset({ ...s, simTime: 9 }).simTime).toBe(0);
  });
  it("draws a solved beam", () => {
    const [s, d] = init();
    let n = d.loadBoard(s, ["TtT"]);
    n = d.pointerDown(n, 544, 392);
    n = d.pointerMove(n, 640, 392);
    n = d.pointerMove(n, 736, 392);
    expect(d.snapshot(n)).toMatchObject({ solved: true, screen: "solved" });
  });
  it("rejects invalid notation", () => {
    const [s, d] = init();
    expect(() => d.loadBoard(s, ["TX"])).toThrow(/notation/);
  });
});
