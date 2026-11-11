import { describe, expect, it } from "vitest";
import {
	allocateContribution,
	compareRebalance,
	projectContributions,
	replayRebalanceComparison,
	RebalanceInputError,
	type RebalanceRequest,
	type ProjectionRequest,
} from "../src/index.js";
import { configuration as historicalConfiguration } from "./fixtures.js";

const band = { min: 0, target: 1, max: 1 };
function request(): RebalanceRequest {
	return {
		configuration: {
			...structuredClone(historicalConfiguration),
			allowedCurrencies: ["GBP"],
		},
		baseCurrency: "GBP",
		cashDeployment: { mode: "preserve" },
		purchasePlacement: { mode: "largest_holding" },
		policy: { stocks: band },
		fundingDepotId: "B",
		transfersConfirmed: true,
		holdings: [
			{
				holdingId: "large",
				depotId: "A",
				assetClass: "stocks",
				value: 90,
				currency: "GBP",
			},
			{
				holdingId: "small",
				depotId: "B",
				assetClass: "stocks",
				value: 10,
				currency: "GBP",
			},
		],
		accounts: [
			{ depotId: "A", minimum: 0, maximum: 1, increment: 0.01, feePerTrade: 0 },
			{ depotId: "B", minimum: 0, maximum: 0, increment: 0.01, feePerTrade: 0 },
		],
		scenarios: [{ kind: "addition", mode: "contribution", externalCash: 100 }],
	};
}
function cashRequest(): RebalanceRequest {
	const r = request();
	r.holdings = [
		{
			holdingId: "wallet-a",
			depotId: "A",
			assetClass: "cash",
			value: 100,
			currency: "GBP",
		},
		{
			holdingId: "wallet-b",
			depotId: "B",
			assetClass: "cash",
			value: 200,
			currency: "GBP",
		},
	];
	r.accounts![0]!.maximum = 0;
	r.cashDeployment = {
		mode: "deploy_excess",
		holdingIds: ["wallet-a", "wallet-b"],
	};
	r.purchasePlacement = {
		mode: "ordered_routes",
		routes: [{ assetClass: "stocks", holdingId: null, depotId: "B" }],
	};
	r.scenarios = [{ kind: "cash", mode: "contribution", externalCash: 0 }];
	return r;
}
const first = (r: RebalanceRequest) => compareRebalance(r).alternatives[0]!;
function projection(): ProjectionRequest {
	return {
		configuration: structuredClone(historicalConfiguration),
		positions: [],
		policy: { stocks: band },
		cashSweep: "reinvest_excess",
		periods: 4,
		periodsPerYear: 12,
		contributions: 100,
		minTradeSize: 150,
		annualReturns: { stocks: 0, cash: 0 },
	};
}

describe("host-selected purchase placement", () => {
	it("preserves largest-holding placement only when explicitly requested", () => {
		const r = request();
		// v5 spills the capped amount to the other account holding the class.
		expect(first(r).invested).toBe(100);
		expect(first(r).cashRetained).toBe(0);
		expect(first(r).purchases.map((p) => [p.holdingId, p.amount])).toEqual([
			["small", 99],
			["large", 1],
		]);
		const v4 = replayRebalanceComparison({
			methodologyVersion: "rebalance-comparison-v4",
			request: compareRebalance(r).snapshot.request,
		}).alternatives[0]!;
		expect(v4.invested).toBe(1);
		expect(v4.cashRetained).toBe(99);
		expect(v4.purchases[0]!.holdingId).toBe("large");
		r.purchasePlacement = {
			mode: "ordered_routes",
			routes: [{ assetClass: "stocks", holdingId: "small", depotId: "B" }],
		};
		expect(first(r).invested).toBe(100);
		expect(first(r).purchases[0]!.holdingId).toBe("small");
	});
	it("spills capped and rounded amounts into subsequent routes for the same class", () => {
		const r = request();
		r.purchasePlacement = {
			mode: "ordered_routes",
			routes: [
				{ assetClass: "stocks", holdingId: "large", depotId: "A" },
				{ assetClass: "stocks", holdingId: "small", depotId: "B" },
			],
		};
		const result = first(r);
		expect(result.purchases.map((p) => [p.holdingId, p.amount])).toEqual([
			["large", 1],
			["small", 99],
		]);
		expect(result.cashRetained).toBe(0);
		r.accounts![0]!.maximum = 52;
		r.accounts![0]!.increment = 10;
		expect(first(r).purchases.map((p) => p.amount)).toEqual([50, 50]);
	});
	it("rejects broker amounts before counting order slots across routes", () => {
		const r = request();
		r.maxTrades = 1;
		r.accounts![0]!.minimum = 2;
		r.accounts![0]!.maximum = 2;
		r.accounts![0]!.increment = 10;
		r.purchasePlacement = {
			mode: "ordered_routes",
			routes: [
				{ assetClass: "stocks", holdingId: "large", depotId: "A" },
				{ assetClass: "stocks", holdingId: "small", depotId: "B" },
			],
		};
		expect(first(r).purchases).toEqual([
			{ assetClass: "stocks", holdingId: "small", depotId: "B", amount: 100 },
		]);
	});
	it("uses host route order when the host limits admitted orders", () => {
		const r = request();
		r.maxTrades = 1;
		r.purchasePlacement = {
			mode: "ordered_routes",
			routes: [
				{ assetClass: "stocks", holdingId: "large", depotId: "A" },
				{ assetClass: "stocks", holdingId: "small", depotId: "B" },
			],
		};
		expect(first(r).purchases[0]!.holdingId).toBe("large");
		expect(first(r).invested).toBe(1);
		r.purchasePlacement.routes.reverse();
		expect(first(r).purchases[0]!.holdingId).toBe("small");
		expect(first(r).invested).toBe(100);
	});
	it("reserves separate fees for each selected route and preserves exact wealth", () => {
		const r = request();
		r.accounts![0]!.feePerTrade = 0.25;
		r.accounts![1]!.feePerTrade = 0.5;
		r.purchasePlacement = {
			mode: "ordered_routes",
			routes: [
				{ assetClass: "stocks", holdingId: "large", depotId: "A" },
				{ assetClass: "stocks", holdingId: "small", depotId: "B" },
			],
		};
		const result = first(r);
		expect(result.feeCost).toBe(0.75);
		expect(result.invested).toBe(99.25);
		expect(result.cashRetained).toBe(0);
		expect(result.valueAfter).toBe(199.25);
	});
	it("retains allocations with no host route and never invents a destination", () => {
		const r = request();
		r.purchasePlacement = { mode: "ordered_routes", routes: [] };
		expect(first(r).invested).toBe(0);
		expect(first(r).cashRetained).toBe(100);
	});
	it.each([
		"wrong identity",
		"duplicate",
		"cash route",
		"unknown mode",
	])("refuses %s placement", (fault) => {
		const r = request();
		const route = { assetClass: "stocks", holdingId: "small", depotId: "B" };
		r.purchasePlacement = { mode: "ordered_routes", routes: [route] };
		if (fault === "wrong identity") route.depotId = "A";
		if (fault === "duplicate") r.purchasePlacement.routes.push({ ...route });
		if (fault === "cash route") route.assetClass = "cash";
		if (fault === "unknown mode")
			Object.assign(r.purchasePlacement, { mode: "surprise" });
		expect(() => first(r)).toThrow(RebalanceInputError);
	});
});

describe("explicit existing-cash funding policy", () => {
	it("releases selected cash without a taxable sale, new contribution or wealth inflation", () => {
		const r = cashRequest();
		r.cashFloor = 50;
		const result = first(r);
		expect(result.externalCash).toBe(0);
		expect(result.existingCashReleased).toBe(250);
		expect(result.invested).toBe(250);
		expect(result.reserveAfter).toBe(50);
		expect(result.valueAfter).toBe(300);
		expect(result.sales).toEqual([]);
		expect(result.taxCoverage).toBe("no_sales");
		expect(result.feeCost).toBe(0);
		expect(result.cashReleases).toEqual([
			{ holdingId: "wallet-a", amount: 100 },
			{ holdingId: "wallet-b", amount: 150 },
		]);
		expect(
			result.funding.map((f) => [
				f.depotId,
				f.existingCashReleased,
				f.transferRequired,
			]),
		).toEqual([
			["A", 100, 0],
			["B", 150, 100],
		]);
	});
	it("preserves held cash when the host selects preserve, including a keep scenario", () => {
		const r = cashRequest();
		r.cashDeployment = { mode: "preserve" };
		expect(first(r).invested).toBe(0);
		expect(first(r).reserveAfter).toBe(300);
		r.cashDeployment = {
			mode: "deploy_excess",
			holdingIds: ["wallet-a", "wallet-b"],
		};
		r.scenarios = [{ kind: "baseline", mode: "keep" }];
		expect(first(r).existingCashReleased).toBe(0);
		expect(first(r).reserveAfter).toBe(300);
	});
	it("obeys eligible source selection and source order", () => {
		const r = cashRequest();
		r.cashFloor = 50;
		r.cashDeployment = { mode: "deploy_excess", holdingIds: ["wallet-b"] };
		expect(first(r).existingCashReleased).toBe(200);
		expect(first(r).reserveAfter).toBe(100);
		r.cashDeployment = {
			mode: "deploy_excess",
			holdingIds: ["wallet-b", "wallet-a"],
		};
		expect(first(r).cashReleases).toEqual([
			{ holdingId: "wallet-b", amount: 200 },
			{ holdingId: "wallet-a", amount: 50 },
		]);
	});
	it("returns unspent released cash and protects target cash as well as the floor", () => {
		const r = cashRequest();
		r.policy = {
			stocks: { min: 0, target: 0.8, max: 1 },
			cash: { min: 0, target: 0.2, max: 1 },
		};
		expect(first(r).invested).toBe(240);
		expect(first(r).cashRetained).toBe(60);
		expect(first(r).reserveAfter).toBe(60);
		expect(first(r).valueAfter).toBe(300);
		r.accounts![1]!.maximum = 10;
		expect(first(r).reserveAfter).toBe(290);
		expect(first(r).cashRetained).toBe(290);
	});
	it("charges purchase fees once and confirms required cash transfers", () => {
		const r = cashRequest();
		r.accounts![1]!.feePerTrade = 1;
		r.transfersConfirmed = false;
		const result = first(r);
		expect(result.existingCashReleased).toBe(300);
		expect(result.invested).toBe(299);
		expect(result.feeCost).toBe(1);
		expect(result.valueAfter).toBe(299);
		expect(result.feasibility).toBe("conditional");
		expect(result.reasonCodes).toContain("funding_transfer_required");
	});
	it("funds explicit plans from cash while avoiding double use of explicitly sold cash", () => {
		const r = cashRequest();
		r.scenarios = [
			{
				kind: "explicit",
				mode: "plan",
				externalCash: 10,
				plan: {
					sales: [
						{
							holdingId: "wallet-a",
							amount: 100,
							tax: { amount: 0, source: "host-declared cash sale" },
						},
					],
					purchases: [
						{
							holdingId: null,
							depotId: "B",
							assetClass: "stocks",
							amount: 310,
						},
					],
				},
			},
		];
		expect(first(r).existingCashReleased).toBe(200);
		expect(first(r).invested).toBe(310);
		expect(first(r).valueAfter).toBe(310);
		expect(first(r).cashRetained).toBe(0);
	});
	it("preserves known-cost deficit evidence when other order costs are unknown", () => {
		const r = cashRequest();
		r.accounts![1]!.feePerTrade = null;
		r.scenarios = [
			{
				kind: "unfunded",
				mode: "plan",
				externalCash: 0,
				plan: {
					sales: [],
					purchases: [
						{
							holdingId: null,
							depotId: "B",
							assetClass: "stocks",
							amount: 300,
							fee: 0.01,
						},
						{
							holdingId: null,
							depotId: "B",
							assetClass: "stocks",
							amount: 0.01,
						},
					],
				},
			},
		];
		const result = first(r);
		expect(result.feeCost).toBeNull();
		expect(result.feasibility).toBe("unavailable");
		expect(result.reasonCodes).toContain("insufficient_funding");
		expect(result.rows).toBeNull();
	});
	it("withholds all cash-funded outcomes for incomplete valuation or mixed currencies", () => {
		const r = cashRequest();
		r.holdings[0]!.value = null;
		expect(first(r).cashReleases).toEqual([]);
		expect(first(r).reasonCodes).toContain("incomplete_valuation");
		r.holdings[0]!.value = 100;
		r.holdings[0]!.currency = "USD";
		expect(first(r).reasonCodes).toContain("currency_mismatch");
	});
	it.each([
		"duplicate source",
		"security source",
		"unknown source",
		"missing policy",
	])("refuses %s", (fault) => {
		const r = cashRequest();
		if (r.cashDeployment.mode !== "deploy_excess") throw Error();
		if (fault === "duplicate source")
			r.cashDeployment.holdingIds.push("wallet-a");
		if (fault === "security source") {
			r.holdings[0]!.assetClass = "stocks";
		}
		if (fault === "unknown source") r.cashDeployment.holdingIds.push("missing");
		if (fault === "missing policy")
			delete (r as Partial<RebalanceRequest>).cashDeployment;
		expect(() => first(r)).toThrow(RebalanceInputError);
	});
	it("replays the exact selected routes and cash policies after JSON storage", () => {
		const r = cashRequest();
		const result = compareRebalance(r);
		expect(
			replayRebalanceComparison(JSON.parse(JSON.stringify(result.snapshot))),
		).toEqual(result);
		if (r.cashDeployment.mode !== "deploy_excess") throw Error();
		r.cashDeployment.holdingIds.reverse();
		expect(result.snapshot.request.cashDeployment).toEqual({
			mode: "deploy_excess",
			holdingIds: ["wallet-a", "wallet-b"],
		});
	});
});

describe("pooled cash deployment and projection policies", () => {
	it("deploys existing pooled cash once without increasing reported wealth", () => {
		const result = allocateContribution({
			configuration: structuredClone(historicalConfiguration),
			positions: [{ assetClass: "cash", value: 1000 }],
			policy: { stocks: band },
			cashDeployment: "deploy_excess",
			cashFloor: 200,
			contribution: 100,
		});
		expect(result).toEqual({
			existingCashReleased: 800,
			allocations: [{ assetClass: "stocks", amount: 900, proportion: 1 }],
			retainedCash: 0,
			postContributionValue: 1100,
		});
	});
	it("sweeps retained cash once the trade minimum is reached", () => {
		const result = projectContributions(projection());
		expect(
			result.timeline.map((p) =>
				p.allocations.reduce((s, a) => s + a.amount, 0),
			),
		).toEqual([0, 200, 0, 200]);
		expect(result.timeline.map((p) => p.value)).toEqual([100, 200, 300, 400]);
		expect(
			result.timeline.map(
				(p) => p.positions.find((v) => v.assetClass === "cash")?.value,
			),
		).toEqual([100, 0, 100, 0]);
		expect(result.timeline[1]!.existingCashReleased).toBe(100);
	});
	it("retains skipped cash when explicitly requested and protects a cash floor during sweeping", () => {
		const r = projection();
		r.cashSweep = "retain";
		expect(projectContributions(r).timeline[3]!.positions).toEqual([
			{ assetClass: "cash", value: 400 },
		]);
		r.cashSweep = "reinvest_excess";
		r.cashFloor = 100;
		expect(
			projectContributions(r).timeline.map(
				(p) => p.positions.find((v) => v.assetClass === "cash")?.value,
			),
		).toEqual([100, 200, 100, 200]);
	});
	it("handles cash growth and non-monthly, time-varying return/contribution paths", () => {
		const r = projection();
		r.minTradeSize = 0;
		r.periods = 2;
		r.periodsPerYear = 1;
		r.positions = [
			{ assetClass: "stocks", value: 100 },
			{ assetClass: "cash", value: 100 },
		];
		r.contributions = [0, 50];
		r.annualReturns = [
			{ stocks: 0.1, cash: 0.2 },
			{ stocks: 0, cash: 0 },
		];
		const result = projectContributions(r);
		expect(result.timeline.map((p) => p.value)).toEqual([230, 280]);
		expect(result.timeline[0]!.existingCashReleased).toBe(120);
		expect(result.timeline[1]!.contribution).toBe(50);
		expect(
			result.timeline[1]!.positions.find((p) => p.assetClass === "stocks")!
				.value,
		).toBe(280);
		expect(
			projectContributions(JSON.parse(JSON.stringify(result.request))),
		).toEqual(result);
	});
	it("lets the host model quarterly instead of monthly returns", () => {
		const r = projection();
		r.periods = 4;
		r.periodsPerYear = 4;
		r.positions = [{ assetClass: "stocks", value: 100 }];
		r.contributions = 0;
		r.annualReturns = { stocks: 1.1 ** 4 - 1, cash: 0 };
		expect(projectContributions(r).timeline.map((p) => p.value)).toEqual([
			110, 121, 133.1, 146.41,
		]);
	});
	it.each([
		"cash policy",
		"cadence",
		"contribution length",
		"return length",
		"missing cash return",
		"negative contribution",
	])("refuses invalid %s", (fault) => {
		const r = projection();
		if (fault === "cash policy") Object.assign(r, { cashSweep: "guess" });
		if (fault === "cadence") r.periodsPerYear = 0;
		if (fault === "contribution length") r.contributions = [100];
		if (fault === "return length") r.annualReturns = [{ stocks: 0, cash: 0 }];
		if (fault === "missing cash return") r.annualReturns = { stocks: 0 };
		if (fault === "negative contribution")
			r.contributions = [100, 100, 100, -1];
		expect(() => projectContributions(r)).toThrow(RebalanceInputError);
	});
	it("conserves varied minor-unit budgets across sweeping, reserves and order caps", () => {
		for (let i = 1; i <= 150; i++) {
			const r = projection();
			r.periods = 6;
			r.contributions = Number((i * 0.07).toFixed(2));
			r.minTradeSize = i % 7;
			r.cashFloor = i % 11;
			r.maxTrades = i % 2;
			const result = projectContributions(r);
			for (const p of result.timeline) {
				expect(
					Math.round(p.positions.reduce((s, v) => s + v.value, 0) * 100),
				).toBe(Math.round(p.period * (r.contributions as number) * 100));
				expect(p.positions.every((v) => v.value >= 0)).toBe(true);
			}
		}
	});
});
