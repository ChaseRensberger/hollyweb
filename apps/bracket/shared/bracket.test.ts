import { describe, expect, test } from "bun:test";
import {
  bracketInput,
  chooseWinner,
  seedOrder,
  tournament,
  validPicks,
  type Entrant,
  type Picks,
} from "./bracket";

const entrants = (size: number): Entrant[] =>
  Array.from({ length: size }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Seed ${i + 1}`,
    image: null,
  }));

describe("single-elimination brackets", () => {
  for (let size = 8; size <= 64; size++) {
    test(`${size} entrants resolve with exactly ${size - 1} picks`, () => {
      const field = entrants(size);
      let picks: Picks = {};
      let state = tournament(field, picks);
      const byes = state.matches.filter((match) => match.status === "bye");
      expect(byes.length).toBe(2 ** Math.ceil(Math.log2(size)) - size);
      expect(new Set(seedOrder(2 ** Math.ceil(Math.log2(size)))).size).toBe(
        2 ** Math.ceil(Math.log2(size)),
      );
      expect(byes.every((match) => match.round === 0)).toBe(true);
      for (let count = 0; count < size - 1; count++) {
        expect(state.next).not.toBeNull();
        const match = state.next!;
        expect(match.a).not.toBeNull();
        expect(match.b).not.toBeNull();
        picks = chooseWinner(field, picks, match.id, count % 2 ? match.a!.id : match.b!.id);
        state = tournament(field, picks);
        expect(validPicks(field, picks)).toBe(true);
      }
      expect(state.next).toBeNull();
      expect(state.winner).not.toBeNull();
      expect(state.completed).toBe(size - 1);
      expect(Object.keys(picks)).toHaveLength(size - 1);
    });
  }
  test("byes go to the highest seeds", () => {
    const field = entrants(11);
    const byes = tournament(field).matches.filter((match) => match.status === "bye");
    expect(new Set(byes.map((match) => match.winner?.id))).toEqual(
      new Set(field.slice(0, 5).map((entry) => entry.id)),
    );
  });
  test("changing a pick clears only its downstream path", () => {
    const field = entrants(8);
    let picks: Picks = {};
    while (tournament(field, picks).next) {
      const match = tournament(field, picks).next!;
      picks = chooseWinner(field, picks, match.id, match.a!.id);
    }
    const first = tournament(field, picks).rounds[0]![0]!;
    const changed = chooseWinner(field, picks, first.id, first.b!.id);
    expect(changed.r1m0).toBeUndefined();
    expect(changed.r2m0).toBeUndefined();
    expect(changed.r1m1).toBe(picks.r1m1);
    expect(validPicks(field, changed)).toBe(true);
    expect(tournament(field, changed).winner).toBeNull();
  });
  test("rejects impossible, premature, unknown, and automatic-bye picks", () => {
    const field = entrants(9);
    expect(validPicks(field, { r5m99: field[0]!.id })).toBe(false);
    expect(validPicks(field, { r3m0: field[0]!.id })).toBe(false);
    const state = tournament(field);
    const bye = state.matches.find((match) => match.status === "bye")!;
    expect(() => chooseWinner(field, {}, bye.id, bye.winner!.id)).toThrow();
    expect(() => chooseWinner(field, {}, state.next!.id, crypto.randomUUID())).toThrow();
    expect(validPicks(field, { [bye.id]: bye.winner!.id })).toBe(false);
  });
  test("validates field size and duplicate IDs", () => {
    expect(bracketInput.safeParse({ title: "Test", entrants: entrants(7) }).success).toBe(false);
    expect(bracketInput.safeParse({ title: "Test", entrants: entrants(65) }).success).toBe(false);
    const field = entrants(8);
    field[1]!.id = field[0]!.id;
    expect(bracketInput.safeParse({ title: "Test", entrants: field }).success).toBe(false);
  });
});
