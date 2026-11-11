import { describe, expect, it } from "vitest";
import {
	replayRebalanceComparison,
	type RebalanceSnapshot,
} from "../src/index.js";
import {
	compareRebalance,
	type RebalanceRequest,
	request,
	salesRequest,
} from "./fixtures.js";

function constrainedCash(): RebalanceRequest {
	const input = request();
	input.holdings[0]!.value = 60;
	input.holdings[1]!.value = 40;
	input.holdings[1]!.depotId = "B";
	input.contribution = 100;
	input.cashLimit = 0;
	input.fundingDepotId = "B";
	input.maxTrades = 1;
	input.accounts = [
		{ depotId: "A", feePerTrade: 0, minimum: 100, maximum: 0, increment: 0.01 },
		{ depotId: "B", feePerTrade: 0, minimum: 1, maximum: 0, increment: 0.01 },
	];
	return input;
}

function result(
	input: RebalanceRequest,
	kind: "fresh_cash" | "sales" = "fresh_cash",
) {
	const alternative = compareRebalance(input).alternatives.find(
		(a) => a.kind === kind,
	);
	if (!alternative) throw new Error("Missing alternative");
	return alternative;
}

/** The same request under the v4 rules, as a saved v4 snapshot replays it. */
function v4Result(
	input: RebalanceRequest,
	kind: "fresh_cash" | "sales" = "fresh_cash",
) {
	const comparison = replayRebalanceComparison({
		methodologyVersion: "rebalance-comparison-v4",
		request: compareRebalance(input).snapshot.request,
	});
	expect(comparison.methodologyVersion).toBe("rebalance-comparison-v4");
	const alternative = comparison.alternatives.find((a) => a.kind === kind);
	if (!alternative) throw new Error("Missing alternative");
	return alternative;
}

describe("broker admission before the order cap", () => {
	it.each([
		"minimum",
		"increment",
		"cap-below-minimum",
	])("refills the slot when %s rejects the larger proposal", (fault) => {
		const input = constrainedCash();
		if (fault === "increment") {
			input.accounts![0]!.minimum = 0;
			input.accounts![0]!.increment = 100;
		}
		if (fault === "cap-below-minimum") {
			input.accounts![0]!.minimum = 0;
			input.accounts![0]!.maximum = 20;
			input.minTradeSize = 25;
		}
		// v5 consolidates the share no order can take into the admitted order.
		expect(result(input)).toMatchObject({
			feasibility: "feasible",
			invested: 100,
			cashRetained: 0,
			feeCost: 0,
		});
		expect(result(input).purchases).toEqual([
			{
				holdingId: "synthetic-bond",
				depotId: "B",
				assetClass: "bonds",
				amount: 100,
			},
		]);
		const actual = v4Result(input);
		expect(actual).toMatchObject({
			feasibility: "feasible",
			invested: 40,
			cashRetained: 60,
			feeCost: 0,
		});
		expect(actual.purchases).toEqual([
			{
				holdingId: "synthetic-bond",
				depotId: "B",
				assetClass: "bonds",
				amount: 40,
			},
		]);
		expect(v4Result({ ...input, maxTrades: 2 }).purchases).toEqual(
			actual.purchases,
		);
	});
	it("ranks the admitted amounts after account caps and rounding", () => {
		const input = constrainedCash();
		input.accounts![0]!.minimum = 0;
		input.accounts![0]!.maximum = 10;
		expect(result(input).purchases).toEqual([
			{
				holdingId: "synthetic-bond",
				depotId: "B",
				assetClass: "bonds",
				amount: 40,
			},
		]);
	});
	it("reserves fees only for the admitted replacement and rechecks its budget", () => {
		const input = constrainedCash();
		input.accounts![0]!.feePerTrade = 1000;
		input.accounts![1]!.feePerTrade = 5;
		expect(result(input)).toMatchObject({
			feasibility: "feasible",
			invested: 95,
			cashRetained: 0,
			feeCost: 5,
			valueAfter: 195,
		});
		expect(v4Result(input)).toMatchObject({
			feasibility: "feasible",
			invested: 38,
			cashRetained: 57,
			feeCost: 5,
			valueAfter: 195,
		});
	});
});

describe("known funding bounds with incomplete costs", () => {
	it.each([
		{ amount: 200, expected: "conditional" },
		{ amount: 200.01, expected: "unavailable" },
	])("keeps wholly unknown costs null while checking the gross budget at $amount", ({
		amount,
		expected,
	}) => {
		const input = salesRequest();
		input.transfersConfirmed = true;
		for (const sale of input.salePlan!.sales) sale.tax = null;
		for (const account of input.accounts!) account.feePerTrade = null;
		input.salePlan!.purchases = [{ ...input.salePlan!.purchases[0]!, amount }];
		const actual = result(input, "sales");
		expect(actual).toMatchObject({
			feasibility: expected,
			feeCost: null,
			taxCost: null,
			cashRetained: null,
			valueAfter: null,
		});
		expect(actual.reasonCodes.includes("insufficient_funding")).toBe(
			expected === "unavailable",
		);
	});
	it.each([
		"fresh_cash",
		"sales",
	] as const)("rejects the guaranteed fee deficit in %s without inventing a complete fee", (kind) => {
		const input = constrainedCash();
		input.maxTrades = 100;
		input.fundingDepotId = "A";
		input.transfersConfirmed = true;
		input.accounts![0]!.minimum = 0;
		// Below each order it charges, so v5 still admits the order.
		input.accounts![0]!.feePerTrade = 50;
		input.accounts![1]!.minimum = 0;
		input.accounts![1]!.feePerTrade = null;
		if (kind === "sales") {
			input.holdings[0]!.value = 200;
			input.contribution = 0;
			input.salePlan = {
				sales: [
					{
						holdingId: "synthetic-equity",
						amount: 100,
						tax: { amount: 0, source: "Synthetic exact-sale estimate" },
					},
				],
				purchases: [
					{
						holdingId: "synthetic-bond",
						depotId: "B",
						assetClass: "bonds",
						amount: 100,
					},
				],
			};
		}
		const actual = result(input, kind);
		expect(actual).toMatchObject({
			feasibility: "unavailable",
			invested: 100,
			feeCost: null,
			valueAfter: null,
			cashRetained: null,
		});
		expect(actual.reasonCodes).toEqual(
			expect.arrayContaining(["fees_unknown", "insufficient_funding"]),
		);
		expect(actual.funding.find((f) => f.depotId === "A")?.fees).toBe(50);
		expect(actual.funding.find((f) => f.depotId === "B")?.fees).toBeNull();
	});
	it.each([
		false,
		true,
	])("preserves known tax when another sale is unknown (same depot: %s)", (sameDepot) => {
		const input = salesRequest();
		input.transfersConfirmed = true;
		if (sameDepot)
			input.holdings.find((h) => h.holdingId === "sale-B")!.depotId = "A";
		input.salePlan!.sales[1]!.tax = null;
		input.salePlan!.purchases = [
			{ ...input.salePlan!.purchases[0]!, amount: 180 },
		];
		const actual = result(input, "sales");
		expect(actual).toMatchObject({
			feasibility: "unavailable",
			taxCost: null,
			taxCoverage: "unknown",
			valueAfter: null,
		});
		expect(actual.reasonCodes).toEqual(
			expect.arrayContaining(["sale_tax_unknown", "insufficient_funding"]),
		);
		if (sameDepot)
			expect(actual.funding.find((f) => f.depotId === "A")?.taxCost).toBeNull();
	});
	it.each([
		{ amount: 173.62, expected: "conditional" },
		{ amount: 173.63, expected: "unavailable" },
	])("distinguishes an unknown completion from a one-cent deficit at $amount", ({
		amount,
		expected,
	}) => {
		const input = salesRequest();
		input.transfersConfirmed = true;
		input.salePlan!.sales[1]!.tax = null;
		input.salePlan!.purchases = [{ ...input.salePlan!.purchases[0]!, amount }];
		const actual = result(input, "sales");
		expect(actual.feasibility).toBe(expected);
		expect(actual.taxCost).toBeNull();
		expect(actual.reasonCodes.includes("insufficient_funding")).toBe(
			expected === "unavailable",
		);
	});
	it.each([
		{ floor: 73.62, expected: "conditional" },
		{ floor: 73.63, expected: "unavailable" },
	])("checks the maximum possible reserve without fabricating an actual reserve at $floor", ({
		floor,
		expected,
	}) => {
		const input = salesRequest();
		input.transfersConfirmed = true;
		input.cashFloor = floor;
		input.salePlan!.sales[1]!.tax = null;
		input.salePlan!.purchases = [
			{ ...input.salePlan!.purchases[0]!, amount: 100 },
		];
		const actual = v4Result(input, "sales");
		expect(actual.feasibility).toBe(expected);
		expect(actual.reserveAfter).toBeNull();
		expect(actual.reasonCodes.includes("reserve_shortfall")).toBe(
			expected === "unavailable",
		);
		expect(actual.reasonCodes).not.toContain("insufficient_funding");
		// v5: the plan raises the reserve from zero, so a floor it cannot reach
		// is stated, not refused; the unknown tax still withholds the amount.
		const current = result(input, "sales");
		expect(current.feasibility).toBe("conditional");
		expect(current.reserveAfter).toBeNull();
		expect(current.reserveShortfall).toBeUndefined();
		expect(current.reasonCodes.includes("reserve_floor_not_reached")).toBe(
			expected === "unavailable",
		);
		expect(current.reasonCodes).not.toContain("reserve_shortfall");
	});
});

describe("comparison methodology compatibility", () => {
	it("refuses v1 replay instead of silently changing an old comparison", () => {
		const snapshot = {
			methodologyVersion: "rebalance-comparison-v1",
			request: constrainedCash(),
		} as unknown as RebalanceSnapshot;
		expect(() => replayRebalanceComparison(snapshot)).toThrow(
			"Unsupported snapshot methodology",
		);
	});
	it("replays the corrected broker and incomplete-cost cases through JSON", () => {
		for (const input of [constrainedCash(), salesRequest()]) {
			const comparison = compareRebalance(input);
			expect(comparison.methodologyVersion).toBe("rebalance-comparison-v5");
			expect(
				replayRebalanceComparison(
					JSON.parse(JSON.stringify(comparison.snapshot)),
				),
			).toEqual(comparison);
		}
	});
});
