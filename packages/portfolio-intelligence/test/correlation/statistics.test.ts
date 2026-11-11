import { describe, expect, it } from "vitest";
import {
	correlationBand,
	fisherInterval,
	intervalsDisjoint,
	pearson,
} from "../../src/internal/correlation/statistics.js";
describe("pearson", () => {
	const a = [0.01, -0.02, 0.03, 0.0, -0.01, 0.02];
	it("is 1 for a scaled copy and -1 for a mirror", () => {
		expect(
			pearson(
				a,
				a.map((v) => 2 * v + 0.001),
			).r!,
		).toBeCloseTo(1, 12);
		expect(
			pearson(
				a,
				a.map((v) => -v),
			).r!,
		).toBeCloseTo(-1, 12);
	});
	it("uses only weeks where both series have a return", () => {
		const c = pearson(a, [0.02, 0.01, -0.01, 0.03, null, -0.02]);
		expect(c.n).toBe(5);
		expect(c.r!).toBeCloseTo(-0.5891593474, 9);
	});
	it("has no value with fewer than three shared weeks or a flat series", () => {
		expect(pearson([0.01, 0.02], [0.03, 0.01]).r).toBeNull();
		expect(pearson([0.5, 0.5, 0.5], [0.25, 0.75, 0.5]).r).toBeNull();
	});
});
describe("fisherInterval", () => {
	it("matches the reference for one year of weekly returns", () => {
		const [lo, hi] = fisherInterval(0.5, 52)!;
		expect(lo).toBeCloseTo(0.262979, 6);
		expect(hi).toBeCloseTo(0.680103, 6);
	});
	it("narrows with five and ten years", () => {
		const five = fisherInterval(0.5, 260)!;
		expect(five[0]).toBeCloseTo(0.402849, 6);
		expect(five[1]).toBeCloseTo(0.58601, 6);
	});
});
describe("correlationBand", () => {
	it("names the band of the point value when the interval is narrow enough", () => {
		expect(correlationBand(0.5, 52)).toBe("partial");
		expect(correlationBand(0.2, 52)).toBe("independent");
		expect(correlationBand(0.72, 260)).toBe("close");
		expect(correlationBand(-0.45, 260)).toBe("opposite");
		expect(correlationBand(0.05, 260)).toBe("independent");
	});
	it("says too short when the interval spans two boundaries", () => {
		expect(correlationBand(0.5, 12)).toBe("undetermined");
		expect(correlationBand(0.9, 3)).toBe("undetermined");
		expect(correlationBand(null, 52)).toBe("undetermined");
	});
});
describe("intervalsDisjoint", () => {
	it("is true only when the two 95 % intervals do not overlap", () => {
		expect(intervalsDisjoint({ r: 0.9, n: 52 }, { r: -0.5, n: 260 })).toBe(
			true,
		);
		expect(intervalsDisjoint({ r: 0.5, n: 52 }, { r: 0.4, n: 260 })).toBe(
			false,
		);
	});
});
