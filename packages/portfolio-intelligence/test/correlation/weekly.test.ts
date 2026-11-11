import { describe, expect, it } from "vitest";
import {
	anchorFriday,
	toBaseDaily,
	weeklyCloses,
	weeklyReturns,
} from "../../src/internal/correlation/weekly.js";
describe("anchorFriday", () => {
	it("uses yesterday on a Saturday", () => {
		expect(anchorFriday("2026-09-26")).toBe("2026-09-25");
	});
	it("uses the previous Friday on a Friday, whose closes are not final yet", () => {
		expect(anchorFriday("2026-09-25")).toBe("2026-09-18");
	});
	it("uses the last Friday on any other day", () => {
		expect(anchorFriday("2026-09-28")).toBe("2026-09-25");
		expect(anchorFriday("2026-10-01")).toBe("2026-09-25");
	});
});
describe("weeklyCloses", () => {
	it("takes the last close of each Friday-ending week and leaves an empty week empty", () => {
		const daily = [
			{ date: "2026-09-01", value: 100 },
			{ date: "2026-09-03", value: 101 },
			{ date: "2026-09-08", value: 99 },
			{ date: "2026-09-11", value: 102 },
			{ date: "2026-09-22", value: 104 },
			{ date: "2026-09-26", value: 999 },
		];
		expect(weeklyCloses(daily, "2026-09-25", 3)).toEqual([101, 102, null, 104]);
	});
});
describe("weeklyReturns", () => {
	it("needs both closes; a missing week empties its return and the next", () => {
		const r = weeklyReturns([101, 102, null, 104]);
		expect(r).toHaveLength(3);
		expect(r[0]!).toBeCloseTo(0.00990099, 8);
		expect(r[1]).toBeNull();
		expect(r[2]).toBeNull();
	});
});
describe("toBaseDaily", () => {
	it("drops a close whose rate is more than four days old instead of carrying it", () => {
		const converted = toBaseDaily(
			[
				{ date: "2026-07-06", value: 100 },
				{ date: "2026-07-10", value: 100 },
				{ date: "2026-07-13", value: 100 },
				{ date: "2026-08-25", value: 100 },
			],
			[
				{ date: "2026-07-06", value: 0.9 },
				{ date: "2026-07-07", value: 0.91 },
				{ date: "2026-08-25", value: 0.86 },
			],
		);
		expect(converted).toEqual([
			{ date: "2026-07-06", value: 90 },
			{ date: "2026-07-10", value: 91 },
			{ date: "2026-08-25", value: 86 },
		]);
	});
});
