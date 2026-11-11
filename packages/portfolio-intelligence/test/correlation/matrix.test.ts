import { describe, expect, it } from "vitest";
import {
	displayOrder,
	meanWith,
	weightedMeanCorrelation,
} from "../../src/internal/correlation/matrix.js";
const corr = [
	[1, 0.9, 0.2, -0.4],
	[0.9, 1, 0.3, -0.5],
	[0.2, 0.3, 1, 0.1],
	[-0.4, -0.5, 0.1, 1],
];
describe("weightedMeanCorrelation", () => {
	it("weighs every pair by the product of its value shares", () => {
		const shares = [0.4, 0.3, 0.2, 0.1];
		const pairs: Array<[number, number]> = [
			[0, 1],
			[0, 2],
			[0, 3],
			[1, 2],
			[1, 3],
			[2, 3],
		];
		let num = 0;
		let den = 0;
		for (const [i, j] of pairs) {
			num += shares[i]! * shares[j]! * corr[i]![j]!;
			den += shares[i]! * shares[j]!;
		}
		expect(weightedMeanCorrelation(corr, shares)).toBeCloseTo(num / den, 12);
		expect(weightedMeanCorrelation(corr, [0.25, 0.25, 0.25, 0.25])).toBeCloseTo(
			(0.9 + 0.2 - 0.4 + 0.3 - 0.5 + 0.1) / 6,
			12,
		);
	});
});
describe("meanWith", () => {
	it("averages a row over the given columns, its own column left out", () => {
		expect(meanWith(corr, 2, [0, 1, 2])).toBeCloseTo(0.25, 12);
		expect(meanWith(corr, 0, [0])).toBeNull();
	});
});
describe("displayOrder", () => {
	const ids = ["A", "B", "C", "D"];
	it("puts the groups first and the rest by their mean to the block, highest first", () => {
		expect(displayOrder(ids, [{ id: "g", members: ["A", "B"] }], corr)).toEqual(
			["A", "B", "C", "D"],
		);
	});
	it("orders by the mean with everyone when there is no group", () => {
		expect(displayOrder(ids, [], corr)).toEqual(["A", "B", "C", "D"]);
	});
	it("keeps a group's own member order", () => {
		expect(displayOrder(ids, [{ id: "g", members: ["B", "A"] }], corr)).toEqual(
			["B", "A", "C", "D"],
		);
	});
});
