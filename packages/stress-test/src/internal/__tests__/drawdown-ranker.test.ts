import type { HoldingImpact } from "../result-types.js";
import { describe, expect, it } from "vitest";
import { rankDrawdowns } from "../drawdown-ranker.js";
import type { StressTestSector } from "../scenarios/sector-enum.js";

function createImpact(
	id: string,
	absoluteLoss: number,
	overrides: Partial<HoldingImpact> = {},
): HoldingImpact {
	return {
		holdingId: id,
		ticker: `TICK-${id}`,
		name: `Holding ${id}`,
		sector: "Technology" as StressTestSector,
		assetClass: "equities",
		preStressValue: 10000,
		postStressValue: 10000 + absoluteLoss,
		absoluteLoss,
		percentageLoss: absoluteLoss / 10000,
		shockApplied: absoluteLoss / 10000,
		shockSource: "sector_proxy" as const,
		betaAdjusted: false,
		...overrides,
	};
}

describe("rankDrawdowns", () => {
	it("returns 5 worst and 3 best from 8 holdings", () => {
		const impacts: HoldingImpact[] = [
			createImpact("a", -8000), // worst
			createImpact("b", -6000),
			createImpact("c", -5000),
			createImpact("d", -4000),
			createImpact("e", -3000),
			createImpact("f", -2000),
			createImpact("g", -1000),
			createImpact("h", 500), // best (positive)
		];

		const result = rankDrawdowns(impacts);
		expect(result.worstPositions).toHaveLength(5);
		expect(result.worstPositions[0]!.holdingId).toBe("a"); // -8000
		expect(result.worstPositions[1]!.holdingId).toBe("b"); // -6000
		expect(result.worstPositions[2]!.holdingId).toBe("c"); // -5000
		expect(result.worstPositions[3]!.holdingId).toBe("d"); // -4000
		expect(result.worstPositions[4]!.holdingId).toBe("e"); // -3000
		expect(result.bestPositions).toHaveLength(3);
		expect(result.bestPositions[0]!.holdingId).toBe("h"); // +500
		expect(result.bestPositions[1]!.holdingId).toBe("g"); // -1000
		expect(result.bestPositions[2]!.holdingId).toBe("f"); // -2000
	});

	it("returns all items when fewer than 5 holdings for worst, all for best (3 holdings)", () => {
		const impacts: HoldingImpact[] = [
			createImpact("x", -5000),
			createImpact("y", -2000),
			createImpact("z", -1000),
		];

		const result = rankDrawdowns(impacts);
		expect(result.worstPositions).toHaveLength(3);
		expect(result.worstPositions[0]!.holdingId).toBe("x"); // -5000
		expect(result.worstPositions[1]!.holdingId).toBe("y"); // -2000
		expect(result.worstPositions[2]!.holdingId).toBe("z"); // -1000
		expect(result.bestPositions).toHaveLength(3);
		expect(result.bestPositions[0]!.holdingId).toBe("z"); // -1000
		expect(result.bestPositions[1]!.holdingId).toBe("y"); // -2000
		expect(result.bestPositions[2]!.holdingId).toBe("x"); // -5000
	});

	it("handles a single holding", () => {
		const impacts: HoldingImpact[] = [createImpact("solo", -3000)];

		const result = rankDrawdowns(impacts);

		expect(result.worstPositions).toHaveLength(1);
		expect(result.worstPositions[0]!.holdingId).toBe("solo");
		expect(result.bestPositions).toHaveLength(1);
		expect(result.bestPositions[0]!.holdingId).toBe("solo");
	});

	it("returns empty arrays for empty input", () => {
		const result = rankDrawdowns([]);

		expect(result.worstPositions).toEqual([]);
		expect(result.bestPositions).toEqual([]);
	});

	it("places gold with positive impact in bestPositions", () => {
		const impacts: HoldingImpact[] = [
			createImpact("eq1", -8000),
			createImpact("eq2", -5000),
			createImpact("eq3", -3000),
			createImpact("eq4", -2000),
			createImpact("gold", 1250, {
				sector: "Other" as StressTestSector,
				assetClass: "gold",
				shockSource: "asset_class_default",
			}),
		];

		const result = rankDrawdowns(impacts);
		expect(result.bestPositions[0]!.holdingId).toBe("gold");
		expect(result.bestPositions[0]!.absoluteLoss).toBe(1250);
		expect(result.worstPositions).toHaveLength(5);
		expect(result.worstPositions[4]!.holdingId).toBe("gold");
	});
});
