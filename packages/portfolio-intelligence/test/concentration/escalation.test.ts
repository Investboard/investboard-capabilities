import { describe, expect, it } from "vitest";
import {
	type EscalationBand,
	escalationTierFor,
} from "../../src/internal/concentration/escalation.js";
import { issuerCapTierFor } from "../../src/internal/concentration/leg-a.js";
const LADDER = [
	{ tier: "high", floor: 0.2 },
	{ tier: "mid", floor: 0.1 },
	{ tier: "low", floor: 0.05 },
] as const satisfies readonly EscalationBand<string>[];
describe("escalationTierFor", () => {
	it("returns the first band whose floor the weight clears", () => {
		expect(escalationTierFor(0.5, LADDER)).toBe("high");
		expect(escalationTierFor(0.15, LADDER)).toBe("mid");
		expect(escalationTierFor(0.06, LADDER)).toBe("low");
	});
	it("returns null below every floor", () => {
		expect(escalationTierFor(0.01, LADDER)).toBeNull();
	});
	it("uses a STRICT floor, matching the engine's breach convention", () => {
		expect(escalationTierFor(0.1, LADDER)).toBe("low");
		expect(escalationTierFor(0.05, LADDER)).toBeNull();
	});
	it("is total on a degenerate empty ladder", () => {
		expect(escalationTierFor(0.9, [])).toBeNull();
	});
});
describe("issuerCapTierFor", () => {
	const cap = 0.1;
	it("bands an un-breached verdict as approaching", () => {
		expect(
			issuerCapTierFor({ weight: 0.099, capFraction: cap, breached: false }),
		).toBe("approaching");
	});
	it("bands a breach by multiples of the user's own cap", () => {
		expect(
			issuerCapTierFor({ weight: 0.101, capFraction: cap, breached: true }),
		).toBe("over");
		expect(
			issuerCapTierFor({ weight: 0.151, capFraction: cap, breached: true }),
		).toBe("over_1_5x");
		expect(
			issuerCapTierFor({ weight: 0.201, capFraction: cap, breached: true }),
		).toBe("over_2x");
	});
	it("scales with the cap rather than with absolute percentages", () => {
		expect(
			issuerCapTierFor({ weight: 0.18, capFraction: 0.1, breached: true }),
		).toBe("over_1_5x");
		expect(
			issuerCapTierFor({ weight: 0.18, capFraction: 0.15, breached: true }),
		).toBe("over");
	});
	describe("no band may swallow the top of the book", () => {
		it("keeps escalating by doublings well past 2x the cap", () => {
			const bands = [0.21, 0.41, 0.81].map((weight) =>
				issuerCapTierFor({ weight, capFraction: 0.1, breached: true }),
			);
			expect(new Set(bands).size).toBe(3);
		});
		it("bounds the top band to the last ~10 points of the book, at EVERY IPS-valid cap", () => {
			const offenders: Array<{
				capPct: number;
				width: number;
			}> = [];
			for (let capPct = 1; capPct <= 100; capPct++) {
				const capFraction = capPct / 100;
				const at = (weight: number) =>
					issuerCapTierFor({ weight, capFraction, breached: true });
				const top = at(1);
				let w = 1;
				while (w > capFraction && at(w) === top) w -= 0.001;
				const width = 1 - w;
				if (width > 0.105) offenders.push({ capPct, width });
			}
			expect(offenders).toEqual([]);
		});
		it("treats half the book in one issuer as its own escalation, whatever the cap", () => {
			for (const capFraction of [0.05, 0.25, 0.4]) {
				const bands = [0.55, 0.8, 0.95].map((weight) =>
					issuerCapTierFor({ weight, capFraction, breached: true }),
				);
				expect(new Set(bands).size).toBe(3);
			}
		});
	});
	it("stays total on a degenerate cap", () => {
		expect(
			issuerCapTierFor({ weight: 0.4, capFraction: 0, breached: true }),
		).toBe("over");
		expect(
			issuerCapTierFor({ weight: 0.4, capFraction: -1, breached: true }),
		).toBe("over");
	});
});
