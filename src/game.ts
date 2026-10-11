import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  ACTIONS,
  BINDINGS,
  BOARD_CX,
  BOARD_CY,
  CELL_PITCH,
  CHANNELS,
  CUES,
  GRID_MAX_COLS,
  GRID_MAX_ROWS,
  MAX_TIER,
  NODE_HIT_R,
  REFRACT_DEBUG_VERSION,
  STAGE_H,
  STAGE_W,
  TIER_ADVANCE,
  TITLE_ITEMS,
  TITLE_TEXT,
  TAGLINE_TEXT,
} from "./constants";
import { CAMPAIGN_BOARDS, CASCADE_SEEDS } from "./boards";
export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";
export type Mode = "campaign" | "cascade";
export type Channel = "triangle" | "square" | "diamond";
export type NodeKind = "emitter" | "lens" | "crystal";
export interface Cell {
  readonly col: number;
  readonly row: number;
}
export interface NodeState extends Cell {
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}
export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}
export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}
export interface TraceState {
  readonly channel: Channel;
}
export type PointerDevice = "mouse" | "pen" | "touch";
export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}
export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;
  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;
  readonly solvedCount: number;
  readonly tier: number;
  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}
interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface RefractDebugApi {
  readonly version: number;
  reset(s: DeepReadonly<RefractState>): RefractState;
  snapshot(s: DeepReadonly<RefractState>): object;
  reconcile(s: DeepReadonly<RefractState>): RefractState;
  setMode(s: DeepReadonly<RefractState>, m: Mode): RefractState;
  setScreen(s: DeepReadonly<RefractState>, v: Screen): RefractState;
  setMenuIndex(s: DeepReadonly<RefractState>, v: number): RefractState;
  setSolvedCount(s: DeepReadonly<RefractState>, v: number): RefractState;
  setTier(s: DeepReadonly<RefractState>, v: number): RefractState;
  generateBoard(s: DeepReadonly<RefractState>, v: number): RefractState;
  loadBoard(s: DeepReadonly<RefractState>, v: readonly string[]): RefractState;
  pointerDown(
    s: DeepReadonly<RefractState>,
    x: number,
    y: number,
    d?: PointerDevice,
  ): RefractState;
  pointerMove(
    s: DeepReadonly<RefractState>,
    x: number,
    y: number,
    d?: PointerDevice,
  ): RefractState;
  pointerUp(s: DeepReadonly<RefractState>, d?: PointerDevice): RefractState;
  clear(s: DeepReadonly<RefractState>): RefractState;
}
export const BACKGROUND = "#071018";
const E: BoardState = { cols: 1, rows: 1, nodes: [] };
const hue: Record<Channel, string> = {
  triangle: "#ff5f8f",
  square: "#42d9ff",
  diamond: "#ffd45c",
};
const X = (c: number, n: number) =>
    BOARD_CX - ((n - 1) * CELL_PITCH) / 2 + c * CELL_PITCH,
  Y = (r: number, n: number) =>
    BOARD_CY - ((n - 1) * CELL_PITCH) / 2 + r * CELL_PITCH,
  eq = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;
function copy(s: DeepReadonly<RefractState>): RefractState {
  return {
    ...s,
    board: { ...s.board, nodes: s.board.nodes.map((n) => ({ ...n })) },
    beams: s.beams.map((b) => ({
      channel: b.channel,
      cells: b.cells.map((c) => ({ ...c })),
    })),
    solvedBoards: [...s.solvedBoards],
    pointer: { ...s.pointer },
  };
}
function start(m = false): RefractState {
  return {
    screen: "title",
    mode: "campaign",
    menuIndex: 0,
    board: E,
    beams: [],
    tracing: null,
    boardIndex: 0,
    solvedBoards: [],
    unlockedCount: 1,
    selectIndex: 0,
    solvedCount: 0,
    tier: 1,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    armedTarget: null,
    simTime: 0,
    muted: m,
  };
}
function parse(rows: readonly string[]): BoardState {
  if (!rows.length || rows.length > GRID_MAX_ROWS)
    throw Error("Invalid board height");
  const cols = rows[0]!.length;
  if (!cols || cols > GRID_MAX_COLS || rows.some((r) => r.length !== cols))
    throw Error("Invalid board width");
  const nodes: NodeState[] = [];
  const cs: Record<string, Channel> = {
    T: "triangle",
    t: "triangle",
    S: "square",
    s: "square",
    D: "diamond",
    d: "diamond",
  };
  rows.forEach((r, y) =>
    [...r].forEach((v, x) => {
      if (v === ".") return;
      if (cs[v])
        nodes.push({
          col: x,
          row: y,
          kind: v === v.toUpperCase() ? "emitter" : "lens",
          channel: cs[v]!,
          charges: null,
        });
      else if (/[1-3]/.test(v))
        nodes.push({
          col: x,
          row: y,
          kind: "crystal",
          channel: null,
          charges: +v,
        });
      else throw Error(`Invalid board notation: ${v}`);
    }),
  );
  return { cols, rows: rows.length, nodes };
}
const mkBeams = (b: BoardState) =>
  CHANNELS.filter((c) => b.nodes.some((n) => n.channel === c)).map(
    (channel) => ({ channel, cells: [] }),
  );
function pose(s: DeepReadonly<RefractState>, b: BoardState): RefractState {
  return {
    ...copy(s),
    screen: "playing",
    menuIndex: 0,
    board: b,
    beams: mkBeams(b),
    tracing: null,
    armedTarget: null,
  };
}
function gen(t: number) {
  const a = CASCADE_SEEDS[t];
  if (!a) throw Error("Invalid tier");
  return parse(a[Math.floor(Math.random() * a.length)]!);
}
const at = (s: DeepReadonly<RefractState>, c: Cell) =>
  s.board.nodes.find((n) => eq(n, c));
const spent = (s: DeepReadonly<RefractState>, n: Cell) =>
  s.beams.reduce((z, b) => z + b.cells.filter((c) => eq(c, n)).length, 0);
function deg(a: readonly DeepReadonly<Cell>[], c: Cell) {
  let z = 0;
  for (let i = 1; i < a.length; i++) if (eq(a[i - 1]!, c) || eq(a[i]!, c)) z++;
  return z;
}
function done(s: DeepReadonly<RefractState>, b: DeepReadonly<BeamState>) {
  if (b.cells.length < 2) return false;
  const a = at(s, b.cells[0]!),
    z = at(s, b.cells[b.cells.length - 1]!);
  return (
    !!a &&
    !!z &&
    a.kind === "emitter" &&
    z.kind === "emitter" &&
    a.channel === b.channel &&
    z.channel === b.channel &&
    !eq(a, z) &&
    s.board.nodes
      .filter((n) => n.kind === "lens" && n.channel === b.channel)
      .every((n) => deg(b.cells, n) === 2)
  );
}
function won(s: DeepReadonly<RefractState>) {
  return (
    s.beams.length > 0 &&
    s.beams.every((b) => done(s, b)) &&
    s.board.nodes
      .filter((n) => n.kind === "crystal")
      .every(
        (n) =>
          spent(s, n) === n.charges &&
          s.beams.every(
            (b) =>
              !b.cells.some((c) => eq(c, n)) ||
              (!eq(b.cells[0]!, n) && !eq(b.cells[b.cells.length - 1]!, n)),
          ),
      )
  );
}
const key = (a: Cell, b: Cell) =>
  [a, b]
    .sort((x, y) => x.row - y.row || x.col - y.col)
    .map((c) => `${c.col},${c.row}`)
    .join("/");
function legal(s: DeepReadonly<RefractState>, ch: Channel, a: Cell, z: Cell) {
  const n = at(s, z);
  if (
    !n ||
    Math.max(Math.abs(a.col - z.col), Math.abs(a.row - z.row)) !== 1 ||
    (n.channel && n.channel !== ch)
  )
    return false;
  for (const b of s.beams)
    for (let i = 1; i < b.cells.length; i++)
      if (key(a, z) === key(b.cells[i - 1]!, b.cells[i]!)) return false;
  if (Math.abs(a.col - z.col) + Math.abs(a.row - z.row) === 2) {
    const k = key({ col: a.col, row: z.row }, { col: z.col, row: a.row });
    for (const b of s.beams)
      for (let i = 1; i < b.cells.length; i++)
        if (k === key(b.cells[i - 1]!, b.cells[i]!)) return false;
  }
  if (n.kind === "crystal" && spent(s, n) >= n.charges!) return false;
  return (
    n.kind === "crystal" ||
    deg(s.beams.find((b) => b.channel === ch)!.cells, n) <
      (n.kind === "emitter" ? 1 : 2)
  );
}
function targets(s: DeepReadonly<RefractState>): Target[] {
  const menu = (n: number, y: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `menu-${i}`,
      x: 490,
      y: y + i * 82,
      w: 300,
      h: 72,
    }));
  if (s.screen === "title") return menu(3, 330);
  if (s.screen === "howto")
    return [{ id: "back", x: 80, y: 620, w: 120, h: 72 }];
  if (s.screen === "playing")
    return [
      { id: "clear", x: 1030, y: 560, w: 150, h: 72 },
      { id: "back", x: 100, y: 560, w: 150, h: 72 },
    ];
  if (s.screen === "select")
    return [
      ...Array.from({ length: 24 }, (_, i) => ({
        id: `board-${i + 1}`,
        x: 273 + (i % 6) * 126,
        y: 190 + Math.floor(i / 6) * 92,
        w: 108,
        h: 76,
      })),
      { id: "back", x: 80, y: 620, w: 120, h: 72 },
    ];
  return menu(
    s.screen === "complete" || s.mode === "cascade"
      ? 2
      : s.boardIndex < 23
        ? 3
        : 2,
    390,
  );
}
const inside = (t: Target, x: number, y: number) =>
  x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h;
const clear = (s: DeepReadonly<RefractState>): RefractState => ({
  ...copy(s),
  beams: s.beams.map((b) => ({ channel: b.channel, cells: [] })),
  tracing: null,
});
const campaign = (s: DeepReadonly<RefractState>, i: number) =>
  pose(
    { ...copy(s), boardIndex: i, selectIndex: i },
    parse(CAMPAIGN_BOARDS[i]!),
  );
function back(s: DeepReadonly<RefractState>): RefractState {
  if (s.screen === "title") return copy(s);
  if (s.screen === "howto")
    return { ...copy(s), screen: "title", menuIndex: 2 };
  if (s.screen === "playing")
    return {
      ...copy(s),
      screen: s.mode === "campaign" ? "select" : "title",
      menuIndex: s.mode === "campaign" ? 0 : 1,
      tracing: null,
    };
  return {
    ...copy(s),
    screen:
      s.screen === "select"
        ? "title"
        : s.mode === "campaign"
          ? "select"
          : "title",
    menuIndex: s.mode === "campaign" ? 0 : 1,
  };
}
function confirm(s: DeepReadonly<RefractState>): RefractState {
  if (s.screen === "title") {
    if (s.menuIndex === 0)
      return { ...copy(s), mode: "campaign", screen: "select" };
    if (s.menuIndex === 1)
      return pose(
        { ...copy(s), mode: "cascade", solvedCount: 0, tier: 1 },
        gen(1),
      );
    return { ...copy(s), screen: "howto", menuIndex: 0 };
  }
  if (s.screen === "select")
    return s.selectIndex < s.unlockedCount
      ? campaign(s, s.selectIndex)
      : copy(s);
  if (s.screen === "solved" && s.mode === "cascade")
    return s.menuIndex
      ? pose({ ...copy(s), solvedCount: 0, tier: 1 }, gen(1))
      : pose(s, gen(s.tier));
  if (s.screen === "solved") {
    const nx = s.boardIndex < 23;
    if (nx && !s.menuIndex) return campaign(s, s.boardIndex + 1);
    if (s.menuIndex === (nx ? 1 : 0)) return campaign(s, s.boardIndex);
    return { ...copy(s), screen: "select", menuIndex: 0 };
  }
  if (s.screen === "complete")
    return {
      ...copy(s),
      screen: s.menuIndex ? "title" : "select",
      menuIndex: 0,
    };
  return copy(s);
}
function finish(s: RefractState): RefractState {
  if (!won(s)) return s;
  if (s.mode === "cascade") {
    const c = s.solvedCount + 1;
    return {
      ...s,
      screen: "solved" as const,
      tracing: null,
      menuIndex: 0,
      solvedCount: c,
      tier: Math.min(Math.floor(c / TIER_ADVANCE) + 1, MAX_TIER),
    };
  }
  const a = [...new Set([...s.solvedBoards, s.boardIndex])].sort(
    (x, y) => x - y,
  );
  return {
    ...s,
    screen: a.length === 24 ? "complete" : "solved",
    tracing: null,
    menuIndex: 0,
    solvedBoards: a,
    unlockedCount: Math.min(24, Math.max(s.unlockedCount, s.boardIndex + 2)),
  };
}
function ptr(
  s: DeepReadonly<RefractState>,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  d: PointerDevice,
) {
  let q = { ...copy(s), pointer: { x, y, down: type !== "up", device: d } };
  const hit = targets(q).find((t) => inside(t, x, y));
  if (type === "down") {
    if (hit) {
      if (hit.id.startsWith("menu")) q = { ...q, menuIndex: +hit.id.slice(5) };
      if (hit.id.startsWith("board"))
        q = { ...q, selectIndex: +hit.id.slice(6) - 1 };
      return { ...q, armedTarget: hit.id };
    }
    if (q.screen !== "playing") return q;
    const n = q.board.nodes.find(
      (n) =>
        Math.hypot(X(n.col, q.board.cols) - x, Y(n.row, q.board.rows) - y) <=
        NODE_HIT_R,
    );
    if (!n) return q;
    for (const b of q.beams) {
      const matches = b.cells
        .map((c, i) => (eq(c, n) ? i : -1))
        .filter((i) => i >= 0);
      const i = matches[matches.length - 1];
      if (i !== undefined) {
        let cells = b.cells.slice(0, i + 1);
        if (i === 0 && b.cells.length > 1) cells = [...b.cells].reverse();
        return {
          ...q,
          beams: q.beams.map((v) =>
            v.channel === b.channel ? { channel: b.channel, cells } : v,
          ),
          tracing: { channel: b.channel },
        };
      }
    }
    if (n.kind === "emitter") {
      const b = q.beams.find((b) => b.channel === n.channel);
      if (b && !b.cells.length)
        return {
          ...q,
          beams: q.beams.map((v) =>
            v === b ? { channel: b.channel, cells: [n] } : v,
          ),
          tracing: { channel: n.channel! },
        };
    }
    return q;
  }
  if (type === "up") {
    if (q.armedTarget && hit?.id === q.armedTarget) {
      const id = hit.id;
      if (id === "back") q = back(q);
      else if (id === "clear") q = clear(q);
      else if (id.startsWith("board")) {
        const i = +id.slice(6) - 1;
        if (i < q.unlockedCount) q = campaign(q, i);
      } else q = confirm({ ...q, menuIndex: +id.slice(5) });
    }
    if (q.tracing)
      q = {
        ...q,
        beams: q.beams.map((b) =>
          b.channel === q.tracing!.channel && b.cells.length === 1
            ? { channel: b.channel, cells: [] }
            : b,
        ),
        tracing: null,
      };
    return { ...q, armedTarget: null };
  }
  if (!q.pointer.down && hit) {
    if (hit.id.startsWith("menu")) q = { ...q, menuIndex: +hit.id.slice(5) };
    if (hit.id.startsWith("board"))
      q = { ...q, selectIndex: +hit.id.slice(6) - 1 };
  }
  if (q.screen === "playing" && q.tracing) {
    const n = q.board.nodes.find(
        (n) =>
          Math.hypot(X(n.col, q.board.cols) - x, Y(n.row, q.board.rows) - y) <=
          NODE_HIT_R,
      ),
      b = q.beams.find((b) => b.channel === q.tracing!.channel)!;
    if (n && !eq(n, b.cells[b.cells.length - 1]!)) {
      let cells = b.cells;
      if (b.cells.length > 1 && eq(n, b.cells[b.cells.length - 2]!))
        cells = b.cells.slice(0, -1);
      else if (legal(q, b.channel, b.cells[b.cells.length - 1]!, n))
        cells = [...b.cells, n];
      q = {
        ...q,
        beams: q.beams.map((v) =>
          v === b ? { channel: b.channel, cells } : v,
        ),
      };
      q = finish(q);
    }
  }
  return q;
}
function snap(s: DeepReadonly<RefractState>) {
  const beams: Record<string, object> = {};
  s.beams.forEach(
    (b) =>
      (beams[b.channel] = {
        cells: b.cells.map((c) => ({ ...c })),
        complete: done(s, b),
      }),
  );
  const live = s.tracing
    ? (() => {
        const cells = s.beams.find(
          (b) => b.channel === s.tracing!.channel,
        )?.cells;
        return cells?.[cells.length - 1];
      })()
    : undefined;
  return {
    version: 2,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    boardIndex: s.boardIndex,
    solvedBoards: [...s.solvedBoards],
    unlockedCount: s.unlockedCount,
    selectIndex: s.selectIndex,
    solvedCount: s.solvedCount,
    tier: s.tier,
    board: {
      cols: s.board.cols,
      rows: s.board.rows,
      nodes: s.board.nodes.map((n) => ({
        ...n,
        x: X(n.col, s.board.cols),
        y: Y(n.row, s.board.rows),
        spent: n.kind === "crystal" ? spent(s, n) : null,
      })),
    },
    beams,
    solved: won(s),
    tracing: s.tracing && live ? { channel: s.tracing.channel, live } : null,
    pointer: { ...s.pointer },
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
const debug: RefractDebugApi = {
  version: REFRACT_DEBUG_VERSION,
  reset: (s) => start(s.muted),
  snapshot: snap,
  reconcile: copy,
  setMode: (s, mode) => ({ ...copy(s), mode }),
  setScreen: (s, screen) => ({ ...copy(s), screen, armedTarget: null }),
  setMenuIndex: (s, menuIndex) => ({ ...copy(s), menuIndex }),
  setSolvedCount: (s, solvedCount) => {
    if (!Number.isInteger(solvedCount) || solvedCount < 0)
      throw Error("Invalid solved count");
    return { ...copy(s), solvedCount };
  },
  setTier: (s, tier) => {
    if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER)
      throw Error("Invalid tier");
    return { ...copy(s), tier };
  },
  generateBoard: (s, t) => pose(s, gen(t)),
  loadBoard: (s, b) => pose(s, parse(b)),
  pointerDown: (s, x, y, d = "mouse") => ptr(s, "down", x, y, d),
  pointerMove: (s, x, y, d = "mouse") => ptr(s, "move", x, y, d),
  pointerUp: (s, d = "mouse") => ptr(s, "up", s.pointer.x, s.pointer.y, d),
  clear,
};
const txt = (
  c: CanvasRenderingContext2D,
  v: string,
  x: number,
  y: number,
  z = 24,
) => {
  c.font = `600 ${z}px system-ui`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(v, x, y);
};
function shape(
  c: CanvasRenderingContext2D,
  ch: Channel,
  x: number,
  y: number,
  r = 24,
) {
  c.beginPath();
  if (ch === "triangle") {
    c.moveTo(x, y - r);
    c.lineTo(x + r, y + r);
    c.lineTo(x - r, y + r);
    c.closePath();
  } else if (ch === "square") c.rect(x - r, y - r, r * 2, r * 2);
  else {
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
    c.closePath();
  }
}
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api: InitApi<RefractState>) {
    ACTIONS.forEach((a) => api.input.register(a, { keys: [...BINDINGS[a]] }));
    Object.values(CUES).forEach((v, i) =>
      api.audio.define(v, {
        freq: 250 + i * 130,
        freqTo: 350 + i * 150,
        durationMs: 100 + i * 30,
        gain: 0.12,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register("board", (s) => `${s.board.cols}x${s.board.rows}`);
    CHANNELS.forEach((channel) =>
      api.diagnostics.register(channel, (s) => {
        const b = s.beams.find((v) => v.channel === channel);
        return b ? `${b.cells.length} ${done(s, b) ? "done" : "open"}` : "-";
      }),
    );
    api.diagnostics.register(
      "crystals",
      (s) =>
        s.board.nodes
          .filter((n) => n.kind === "crystal")
          .map((n) => `${spent(s, n)}/${n.charges}`)
          .join(" ") || "-",
    );
    api.diagnostics.register("solved", won);
    api.diagnostics.register(
      "pointer",
      (s) => `${s.pointer.x | 0},${s.pointer.y | 0} ${s.pointer.device}`,
    );
    return [start(), debug];
  },
  update(s, api: UpdateApi, dt) {
    let q = copy(s);
    const oldSegments = s.beams.reduce(
      (n, b) => n + Math.max(0, b.cells.length - 1),
      0,
    );
    const oldComplete = new Set(
      s.beams.filter((b) => done(s, b)).map((b) => b.channel),
    );
    const wasSolved = won(s);
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    const samples = api.input.pointerSamples().filter((v) => v.primary);
    for (const v of samples) q = ptr(q, v.type, v.x, v.y, v.device);
    const p = api.input.pointer();
    if (!samples.length)
      q = { ...q, pointer: { x: p.x, y: p.y, down: p.down, device: p.device } };
    const n =
      q.screen === "title"
        ? 3
        : q.screen === "solved"
          ? q.mode === "cascade"
            ? 2
            : q.boardIndex < 23
              ? 3
              : 2
          : q.screen === "complete"
            ? 2
            : 0;
    if (n && (api.input.pressed("up") || api.input.pressed("down")))
      q = {
        ...q,
        menuIndex: (q.menuIndex + (api.input.pressed("down") ? 1 : n - 1)) % n,
      };
    if (q.screen === "select") {
      if (api.input.pressed("left"))
        q = {
          ...q,
          selectIndex:
            Math.floor(q.selectIndex / 6) * 6 + ((q.selectIndex + 5) % 6),
        };
      if (api.input.pressed("right"))
        q = {
          ...q,
          selectIndex:
            Math.floor(q.selectIndex / 6) * 6 + ((q.selectIndex + 1) % 6),
        };
      if (api.input.pressed("up"))
        q = { ...q, selectIndex: (q.selectIndex + 18) % 24 };
      if (api.input.pressed("down"))
        q = { ...q, selectIndex: (q.selectIndex + 6) % 24 };
    }
    if (api.input.pressed("confirm")) q = confirm(q);
    if (api.input.pressed("back")) q = back(q);
    if (api.input.pressed("clear") && q.screen === "playing") q = clear(q);
    const newSegments = q.beams.reduce(
      (n, b) => n + Math.max(0, b.cells.length - 1),
      0,
    );
    if (newSegments > oldSegments) api.audio.play(CUES.connect);
    if (newSegments < oldSegments)
      api.audio.play(api.input.pressed("clear") ? CUES.clear : CUES.retract);
    if (q.beams.some((b) => done(q, b) && !oldComplete.has(b.channel)))
      api.audio.play(CUES.channelComplete);
    if (won(q) && !wasSolved) api.audio.play(CUES.solved);
    return { ...q, simTime: q.simTime + dt, muted: api.audio.muted() };
  },
  render(s, api: RenderApi) {
    const c = api.ctx;
    c.fillStyle = BACKGROUND;
    c.fillRect(0, 0, STAGE_W, STAGE_H);
    c.fillStyle = "#eafffb";
    if (s.screen === "title") {
      txt(c, TITLE_TEXT, 640, 150, 76);
      c.fillStyle = "#63e9d5";
      txt(c, TAGLINE_TEXT, 640, 225, 20);
      TITLE_ITEMS.forEach((v, i) => {
        c.fillStyle = i === s.menuIndex ? "#63e9d5" : "#9bb5c3";
        txt(c, v, 640, 365 + i * 82, 25);
      });
      return;
    }
    if (s.screen === "howto") {
      txt(c, "HOW TO PLAY", 640, 70, 42);
      [
        "Draw between matching outlined emitters.",
        "Thread every filled lens of that shape.",
        "Move to any neighboring node, diagonals included.",
        "Spend every crystal charge. Beams cannot cross.",
        "Backtrack to retract • R clears • ESC goes back",
      ].forEach((v, i) => txt(c, v, 640, 190 + i * 65, 23));
      return;
    }
    if (s.screen === "select") {
      txt(c, "CAMPAIGN", 640, 70, 42);
      for (let i = 0; i < 24; i++) {
        const t = targets(s)[i]!;
        c.fillStyle =
          i === s.selectIndex
            ? "#63e9d5"
            : s.solvedBoards.includes(i)
              ? "#ffd45c"
              : i < s.unlockedCount
                ? "#9bb5c3"
                : "#3b5060";
        txt(
          c,
          s.solvedBoards.includes(i)
            ? `✓ ${i + 1}`
            : i < s.unlockedCount
              ? `${i + 1}`
              : "LOCK",
          t.x + t.w / 2,
          t.y + t.h / 2,
          18,
        );
      }
      return;
    }
    for (const b of s.beams) {
      c.strokeStyle = hue[b.channel];
      c.lineWidth = 10;
      c.lineCap = "round";
      c.beginPath();
      b.cells.forEach((v, i) =>
        i
          ? c.lineTo(X(v.col, s.board.cols), Y(v.row, s.board.rows))
          : c.moveTo(X(v.col, s.board.cols), Y(v.row, s.board.rows)),
      );
      c.stroke();
    }
    for (const n of s.board.nodes) {
      const x = X(n.col, s.board.cols),
        y = Y(n.row, s.board.rows);
      if (n.kind === "crystal") {
        c.fillStyle = "#b9f7ee";
        txt(c, `${spent(s, n)}/${n.charges}`, x, y, 18);
      } else {
        c.fillStyle = hue[n.channel!];
        c.strokeStyle = hue[n.channel!];
        c.lineWidth = 4;
        shape(c, n.channel!, x, y);
        if (n.kind === "lens") c.fill();
        else c.stroke();
      }
    }
    c.fillStyle = "#eafffb";
    txt(
      c,
      s.mode === "campaign"
        ? `BOARD ${s.boardIndex + 1} / 24`
        : `SOLVED ${s.solvedCount}   TIER ${s.tier}`,
      640,
      60,
      24,
    );
    if (s.screen !== "playing") {
      c.fillStyle = "rgba(7,16,24,.88)";
      c.fillRect(390, 270, 500, 390);
      c.fillStyle = "#eafffb";
      txt(
        c,
        s.screen === "complete" ? "CAMPAIGN COMPLETE" : "BOARD SOLVED",
        640,
        320,
        38,
      );
      const ls =
        s.mode === "cascade"
          ? ["NEXT BOARD", "RESTART"]
          : ["NEXT BOARD", "REPLAY", "BOARD SELECT"];
      targets(s).forEach((t, i) => {
        c.fillStyle = i === s.menuIndex ? "#63e9d5" : "#9bb5c3";
        txt(c, ls[i] ?? "TITLE", t.x + t.w / 2, t.y + t.h / 2, 21);
      });
    } else {
      for (const t of targets(s)) {
        c.fillStyle = "#102735";
        c.strokeStyle = "#315064";
        c.lineWidth = 2;
        c.beginPath();
        c.roundRect(t.x, t.y, t.w, t.h, 12);
        c.fill();
        c.stroke();
        c.fillStyle = "#b9cbd5";
        txt(
          c,
          t.id === "clear" ? "CLEAR  [R]" : "BACK",
          t.x + t.w / 2,
          t.y + t.h / 2,
          18,
        );
      }
    }
  },
};
