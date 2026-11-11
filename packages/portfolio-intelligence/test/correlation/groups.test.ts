import { describe, expect, it } from "vitest";
import { averageLinkage } from "../../src/internal/correlation/groups.js";
describe("averageLinkage", () => {
	it("does not chain: A-B and B-C at 0.9 but A-C at 0.2 leaves C on its own", () => {
		const chain = [
			[1, 0.9, 0.2],
			[0.9, 1, 0.9],
			[0.2, 0.9, 1],
		];
		expect(averageLinkage(chain)).toEqual([[0, 1], [2]]);
	});
	it("merges while the mean over every cross pair is at least 0.7", () => {
		const four = [
			[1, 0.92, 0.85, 0.1],
			[0.92, 1, 0.8, 0.05],
			[0.85, 0.8, 1, 0.2],
			[0.1, 0.05, 0.2, 1],
		];
		expect(averageLinkage(four)).toEqual([[0, 1, 2], [3]]);
	});
	it("keeps everything apart below the threshold", () => {
		expect(
			averageLinkage([
				[1, 0.69],
				[0.69, 1],
			]),
		).toEqual([[0], [1]]);
	});
});
