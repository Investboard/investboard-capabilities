import { describe, expect, it } from "vitest";
import { compareRebalance, replayRebalanceComparison } from "../src/index.js";
import { request, salesRequest } from "./fixtures.js";
import type { AlternativeKind, RebalanceRequest } from "../src/index.js";

function alternative(
	input: RebalanceRequest,
	kind: AlternativeKind = "fresh_cash",
) {
	const result = compareRebalance(input).alternatives.find(
		(a) => a.kind === kind,
	);
	if (!result) throw new Error("Missing alternative");
	return result;
}

describe("public whole-book comparison", () => {
	it("reconciles varied fee, increment, reserve and order-cap scenarios in exact cents", () => {
		for (let i = 1; i <= 150; i++) {
			const input = request();
			input.contribution = (100000 + ((i * 7919) % 1000000)) / 100;
			input.cashLimit = 0;
			input.cashFloor = i;
			input.maxTrades = i % 3;
			input.accounts![0] = {
				depotId: "A",
				feePerTrade: i % 7,
				minimum: i % 30,
				maximum: 0,
				increment: [0.01, 1, 50][i % 3]!,
			};
			const result = alternative(input);
			expect(result.feasibility).toBe("feasible");
			expect(Math.round(result.valueAfter! * 100)).toBe(
				10000000 +
					Math.round(input.contribution * 100) -
					Math.round(result.feeCost! * 100),
			);
			expect(
				Math.round(result.cashRetained! * 100) +
					Math.round(result.invested * 100) +
					Math.round(result.feeCost! * 100),
			).toBe(Math.round(input.contribution * 100));
			expect(result.reserveAfter).toBeGreaterThanOrEqual(i);
		}
	});
	it("does not alias reason arrays between withheld alternatives", () => {
		const input = request();
		input.holdings[0]!.value = null;
		const result = compareRebalance(input);
		result.alternatives[0]!.reasonCodes.push("fees_unknown");
		expect(result.alternatives[1]!.reasonCodes).toEqual([
			"incomplete_valuation",
		]);
	});
	it("reaches 60/40 from 70/30 plus equal fresh capital without overshooting", () => {
		const input = request(),
			result = compareRebalance(input);
		expect(result.valueBefore).toBe(100000);
		expect(result.alternatives).toHaveLength(4);
		const fresh = alternative(input);
		expect(fresh).toMatchObject({
			feasibility: "feasible",
			externalCash: 100000,
			invested: 100000,
			valueAfter: 200000,
			feeCost: 0,
			taxCost: 0,
			cashRetained: 0,
			residualDrift: 0,
		});
		expect(fresh.purchases.map((p) => [p.assetClass, p.amount])).toEqual([
			["bonds", 50000],
			["equities", 50000],
		]);
		expect(
			fresh.rows
				?.filter((r) => r.assetClass !== "cash")
				.map((r) => [r.assetClass, r.current]),
		).toEqual([
			["bonds", 0.4],
			["equities", 0.6],
		]);
		expect(alternative(input, "keep").valueAfter).toBe(100000);
		expect(alternative(input, "sales")).toMatchObject({
			feasibility: "unavailable",
			reasonCodes: ["sale_plan_required"],
			valueAfter: null,
		});
	});
	it("shows partial progress and ranks by explicitly supplied priority", () => {
		const input = request();
		const partial = alternative(input, "partial_cash");
		expect(partial.invested).toBe(1000);
		expect(partial.residualDrift).toBeGreaterThan(0);
		expect(partial.residualDrift).toBeLessThan(
			alternative(input, "keep").residualDrift!,
		);
		input.priority = "target_alignment";
		expect(compareRebalance(input).alternatives[0]?.kind).toBe("fresh_cash");
	});
	it("keeps the full contribution, including the reserve, in wealth and replay", () => {
		const input = request();
		input.contribution = 10000;
		input.cashFloor = 5000;
		const fresh = alternative(input);
		expect(fresh).toMatchObject({
			invested: 5000,
			cashRetained: 5000,
			reserveAfter: 5000,
			valueAfter: 110000,
		});
		const original = compareRebalance(input);
		expect(
			replayRebalanceComparison(JSON.parse(JSON.stringify(original.snapshot))),
		).toEqual(original);
		input.holdings[0]!.value = 1;
		expect(original.snapshot.request.holdings[0]?.value).toBe(70000);
		original.alternatives[1]!.purchases[0]!.amount = 1;
		expect(
			replayRebalanceComparison(original.snapshot).alternatives[1]?.invested,
		).toBe(5000);
	});
	it("does not charge retained target cash as a trade or consume its order slot", () => {
		const input = request();
		input.holdings = [
			{
				holdingId: "equity",
				depotId: "A",
				assetClass: "equities",
				value: 100,
				currency: "EUR",
			},
		];
		input.policy = {
			cash: { min: 0.2, target: 0.2, max: 0.2 },
			equities: { min: 0.8, target: 0.8, max: 0.8 },
		};
		input.contribution = 100;
		input.cashLimit = 0;
		input.maxTrades = 1;
		const result = alternative(input);
		expect(result.purchases).toHaveLength(1);
		expect(result).toMatchObject({
			invested: 60,
			cashRetained: 40,
			valueAfter: 200,
			feeCost: 0,
		});
	});
	it("reserves selected-order fees and retains broker-rounding leftovers", () => {
		const input = request();
		input.contribution = 1000;
		input.cashLimit = 0;
		input.accounts![0] = {
			depotId: "A",
			feePerTrade: 5,
			minimum: 10,
			maximum: 0,
			increment: 50,
		};
		expect(alternative(input)).toMatchObject({
			invested: 950,
			feeCost: 5,
			cashRetained: 45,
			valueAfter: 100995,
		});
	});
	it("ignores an unused depot's fees", () => {
		const input = request();
		input.accounts!.push({
			...input.accounts![0]!,
			depotId: "unused",
			feePerTrade: 1000000,
		});
		expect(alternative(input)).toMatchObject({
			invested: 100000,
			feeCost: 0,
			residualDrift: 0,
		});
	});
	it.each([
		"minimum",
		"maxTrades",
		"fee",
	])("retains cash when %s prevents an order", (kind) => {
		const input = request();
		input.contribution = 100;
		input.cashLimit = 0;
		if (kind === "minimum") input.minTradeSize = 1000;
		if (kind === "maxTrades") input.maxTrades = 0;
		if (kind === "fee") input.accounts![0]!.feePerTrade = 1000;
		expect(alternative(input)).toMatchObject({
			purchases: [],
			invested: 0,
			cashRetained: 100,
			valueAfter: 100100,
			feeCost: 0,
		});
	});
	it("respects account caps without pretending a target has been reached", () => {
		const input = request();
		input.contribution = 1000;
		input.cashLimit = 0;
		input.accounts![0]!.maximum = 200;
		expect(alternative(input)).toMatchObject({
			invested: 200,
			cashRetained: 800,
			valueAfter: 101000,
		});
		expect(alternative(input).residualDrift).toBeGreaterThan(0);
	});
	it("keeps unsigned/unmodeled account costs unknown", () => {
		const input = request();
		delete input.accounts;
		expect(alternative(input)).toMatchObject({
			feasibility: "conditional",
			feeCost: null,
			valueAfter: null,
			cashRetained: null,
			rows: null,
		});
		expect(alternative(input).reasonCodes).toContain("account_rules_unknown");
		expect(alternative(input, "keep")).toMatchObject({
			feasibility: "feasible",
			feeCost: 0,
		});
	});
	it("distinguishes holding placement from funding at a second depot", () => {
		const input = request();
		input.holdings[1]!.depotId = "B";
		input.accounts!.push({ ...input.accounts![0]!, depotId: "B" });
		const fresh = alternative(input);
		expect(fresh.feasibility).toBe("conditional");
		expect(fresh.funding.find((f) => f.depotId === "B")?.transferRequired).toBe(
			50000,
		);
		input.transfersConfirmed = true;
		expect(alternative(input).feasibility).toBe("feasible");
	});
	it("withholds the entire denominator for missing values and mixed units", () => {
		for (const fault of ["unknown", "currency"]) {
			const input = request();
			if (fault === "unknown") input.holdings[0]!.value = null;
			else input.holdings[0]!.currency = "USD";
			const result = compareRebalance(input);
			expect(result.valueBefore).toBeNull();
			expect(
				result.alternatives.every(
					(a) =>
						a.feasibility === "unavailable" &&
						a.valueAfter === null &&
						a.rows === null,
				),
			).toBe(true);
		}
	});
	it("admits measured zero cash and a fully measured zero starting book", () => {
		const input = request();
		input.holdings = [
			{
				holdingId: "cash",
				depotId: "A",
				assetClass: "cash",
				value: 0,
				currency: "EUR",
			},
		];
		const result = compareRebalance(input);
		expect(result.valueBefore).toBe(0);
		expect(result.rowsBefore?.every((row) => row.current === null)).toBe(true);
		expect(alternative(input)).toMatchObject({
			valueAfter: 100000,
			feasibility: "feasible",
			residualDrift: 0,
		});
		expect(
			alternative(input).purchases.every((p) => p.holdingId === null),
		).toBe(true);
	});
	it("keeps all-class corridors visible and rejects an unfunded floor", () => {
		const input = request();
		input.cashFloor = 100000000;
		const result = alternative(input);
		expect(result).toMatchObject({
			feasibility: "unavailable",
			valueAfter: null,
		});
		expect(result.reasonCodes).toContain("reserve_shortfall");
		expect(
			alternative(request(), "keep").rows?.find(
				(r) => r.assetClass === "equities",
			)?.inRange,
		).toBe(false);
	});
	it("is independent of incidental holding and account order", () => {
		const input = request();
		input.holdings.push({ ...input.holdings[0]!, holdingId: "another-equity" });
		const expected = compareRebalance(input).alternatives;
		input.holdings.reverse();
		input.accounts!.reverse();
		expect(compareRebalance(input).alternatives).toEqual(expected);
	});
});

describe("explicit sale-plan accounting", () => {
	it("retains tax per holding and exposes the 13.19 depot deficit", () => {
		const input = salesRequest(),
			result = alternative(input, "sales");
		expect(result).toMatchObject({
			feasibility: "conditional",
			invested: 173.62,
			valueAfter: 393.62,
			taxCost: 26.38,
			taxCoverage: "supplied",
			cashRetained: 0,
		});
		expect(result.funding.find((f) => f.depotId === "A")).toMatchObject({
			netInflow: 73.62,
			taxCost: 26.38,
			transferRequired: 13.19,
		});
		expect(result.funding.find((f) => f.depotId === "B")).toMatchObject({
			netInflow: 100,
			taxCost: 0,
			transferRequired: 0,
		});
		input.transfersConfirmed = true;
		expect(alternative(input, "sales").feasibility).toBe("feasible");
	});
	it("withholds unknown tax and does not infer zero from another sale", () => {
		const input = salesRequest();
		input.salePlan!.sales[0]!.tax = null;
		const result = alternative(input, "sales");
		expect(result).toMatchObject({
			feasibility: "conditional",
			taxCost: null,
			valueAfter: null,
			rows: null,
			taxCoverage: "unknown",
		});
		expect(
			result.funding.find((f) => f.depotId === "A")?.transferRequired,
		).toBeNull();
		expect(result.funding.find((f) => f.depotId === "B")?.netInflow).toBe(100);
	});
	it("retains omitted purchases as cash instead of removing sale proceeds", () => {
		const input = salesRequest();
		input.salePlan!.purchases = [];
		input.transfersConfirmed = true;
		expect(alternative(input, "sales")).toMatchObject({
			invested: 0,
			cashRetained: 173.62,
			valueAfter: 393.62,
			reserveAfter: 173.62,
		});
	});
	it("refuses purchases above net proceeds and does not silently rescale a reviewed plan", () => {
		const input = salesRequest();
		input.salePlan!.purchases[0]!.amount = 100;
		expect(alternative(input, "sales")).toMatchObject({
			feasibility: "unavailable",
			valueAfter: null,
		});
		expect(alternative(input, "sales").reasonCodes).toContain(
			"insufficient_funding",
		);
	});
	it.each([
		"increment",
		"minimum",
		"trade-count",
	])("refuses a sale plan that violates %s without changing its tax basis", (fault) => {
		const input = salesRequest();
		if (fault === "increment") input.accounts![0]!.increment = 50;
		if (fault === "minimum") input.minTradeSize = 100;
		if (fault === "trade-count") input.maxTrades = 3;
		const result = alternative(input, "sales");
		expect(result.feasibility).toBe("unavailable");
		expect(result.rows).toBeNull();
		expect(result.sales).toEqual(input.salePlan!.sales);
	});
});
