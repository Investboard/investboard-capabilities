import { describe, expect, it } from "vitest";
import {
	allocateContribution,
	compareRebalance,
	projectContributions,
	replayRebalanceComparison,
	RebalanceInputError,
	MAX_SAFE_MINOR_UNITS,
	type RebalanceRequest,
	type RebalancingConfiguration,
	type FeeSchedule,
} from "../src/index.js";

// Synthetic host policy, deliberately unlike Investboard's app defaults.
function config(decimalPlaces = 3): RebalancingConfiguration {
	return {
		money: {
			decimalPlaces,
			maximumAmount: Math.min(
				10_000_000_000,
				1_000_000_000_000 / 10 ** decimalPlaces,
			),
		},
		limits: {
			holdings: 500,
			assetClasses: 256,
			accounts: 256,
			orders: 256,
			projectionMonths: 720,
			scenarios: 256,
			jsonNodes: 100_000,
			jsonDepth: 32,
			collectionEntries: 5_000,
			textLength: 512,
		},
		cashAssetClass: "liquid",
	};
}
const policy = { stocks: { min: 0, target: 1, max: 1 } };
function request(decimalPlaces = 3): RebalanceRequest {
	return {
		configuration: config(decimalPlaces),
		baseCurrency: "KWD",
		holdings: [
			{
				holdingId: "stock",
				depotId: "D",
				assetClass: "stocks",
				value: 10,
				currency: "KWD",
			},
		],
		policy,
		fundingDepotId: "D",
		accounts: [
			{
				depotId: "D",
				feePerTrade: 0,
				minimum: 0,
				maximum: 0,
				increment: 10 ** -decimalPlaces,
			},
		],
		scenarios: [
			{ kind: "my monthly addition", mode: "contribution", externalCash: 1 },
		],
	};
}
function planRequest(): RebalanceRequest {
	const r = request();
	r.scenarios = [
		{
			kind: "combined",
			mode: "plan",
			externalCash: 2,
			plan: {
				sales: [
					{
						holdingId: "stock",
						amount: 1,
						tax: { amount: 0, source: "external" },
					},
				],
				purchases: [
					{ holdingId: "stock", depotId: "D", assetClass: "stocks", amount: 1 },
				],
			},
		},
	];
	return r;
}
function first(r: RebalanceRequest) {
	return compareRebalance(r).alternatives[0]!;
}

describe("caller-owned configuration", () => {
	it.each([
		["JPY", 0, 3],
		["KWD", 3, 0.003],
		["BTC", 8, 0.00000003],
	] as const)("conserves minor units for %s", (currency, digits, contribution) => {
		const r = request(digits);
		r.baseCurrency = currency;
		r.holdings[0]!.currency = currency;
		r.holdings[0]!.value = 0;
		r.policy = Object.fromEntries(
			["a", "b", "c"].map((k) => [k, { min: 0, target: 1 / 3, max: 1 }]),
		);
		r.scenarios = [
			{ kind: "custom", mode: "contribution", externalCash: contribution },
		];
		const result = first(r);
		expect(result.feasibility).toBe("feasible");
		expect(result.invested).toBe(contribution);
		expect(result.cashRetained).toBe(0);
		const scale = 10 ** digits;
		expect(
			result.purchases.reduce((s, p) => s + Math.round(p.amount * scale), 0),
		).toBe(Math.round(contribution * scale));
		expect(
			replayRebalanceComparison(
				JSON.parse(JSON.stringify(compareRebalance(r).snapshot)),
			),
		).toEqual(compareRebalance(r));
	});
	it("honors an optional currency allow-list and still refuses mixed-currency sums", () => {
		const r = request();
		expect(first(r).feasibility).toBe("feasible");
		r.configuration.allowedCurrencies = ["JPY"];
		expect(() => compareRebalance(r)).toThrow("currency policy");
		delete r.configuration.allowedCurrencies;
		r.holdings[0]!.currency = "GBP";
		const result = compareRebalance(r);
		expect(result.valueBefore).toBeNull();
		expect(result.alternatives[0]!.reasonCodes).toContain("currency_mismatch");
	});
	it("uses the configured cash class for reserves and projections", () => {
		const cfg = config();
		const result = allocateContribution({
			configuration: cfg,
			positions: [{ assetClass: "liquid", value: 0.009 }],
			policy,
			contribution: 0.01,
			cashFloor: 0.01,
		});
		expect(result.allocations[0]!.amount).toBe(0.009);
		expect(result.retainedCash).toBe(0.001);
		const projected = projectContributions({
			configuration: cfg,
			positions: [],
			policy,
			monthlyContribution: 0.001,
			months: 2,
			cashFloor: 1,
			annualReturns: { stocks: 0, liquid: 0 },
		});
		expect(projected.methodologyVersion).toBe("contribution-projection-v2");
		expect(projected.timeline[1]!.positions).toEqual([
			{ assetClass: "liquid", value: 0.002 },
		]);
	});
	it("accepts larger holding, class, account and order capacities when the caller raises them", () => {
		const r = request();
		r.holdings = Array.from({ length: 250 }, (_, i) => ({
			...r.holdings[0]!,
			holdingId: "h" + i,
			depotId: "d" + i,
			assetClass: "c" + i,
			value: 0,
		}));
		r.policy = Object.fromEntries(
			r.holdings.map((h) => [
				h.assetClass,
				{ min: 0, target: 1 / 250, max: 1 },
			]),
		);
		r.accounts = r.holdings.map((h) => ({
			depotId: h.depotId,
			feePerTrade: 0,
			minimum: 0,
			maximum: 0,
			increment: 0.001,
		}));
		r.transfersConfirmed = true;
		r.scenarios = [{ kind: "large", mode: "contribution", externalCash: 250 }];
		const result = first(r);
		expect(result.feasibility).toBe("feasible");
		expect(result.purchases).toHaveLength(250);
		expect(result.invested).toBe(250);
		r.configuration.limits.holdings = 200;
		expect(() => first(r)).toThrow("configured capacity");
		r.configuration.limits.holdings = 500;
		r.configuration.limits.assetClasses = 32;
		expect(() => first(r)).toThrow("class capacity");
		r.configuration.limits.assetClasses = 256;
		r.configuration.limits.accounts = 100;
		expect(() => first(r)).toThrow("Accounts exceed");
		r.configuration.limits.accounts = 256;
		r.configuration.limits.orders = 100;
		expect(first(r).purchases).toHaveLength(100);
	});
	it("supports caller horizons over 600 months and return ranges beyond former bounds", () => {
		const input = {
			configuration: config(),
			positions: [],
			policy,
			monthlyContribution: 0,
			months: 601,
			annualReturns: { stocks: 11, liquid: 0 },
		};
		expect(projectContributions(input).timeline).toHaveLength(601);
		input.configuration.annualReturnRange = { minimum: -0.5, maximum: 2 };
		expect(() => projectContributions(input)).toThrow("configured range");
		delete input.configuration.annualReturnRange;
		input.configuration.limits.projectionMonths = 600;
		expect(() => projectContributions(input)).toThrow("configured horizon");
	});
	it("supports wealth above the former product limit and rejects unsafe representation", () => {
		const r = request(2);
		r.holdings[0]!.value = 2_000_000_000.01;
		expect(compareRebalance(r).valueBefore).toBe(2_000_000_000.01);
		r.configuration.money.maximumAmount = Number.MAX_SAFE_INTEGER;
		expect(() => first(r)).toThrow("exact minor-unit precision");
		r.configuration.money.maximumAmount = MAX_SAFE_MINOR_UNITS / 100;
		r.holdings[0]!.value = 0;
		r.scenarios = [
			{
				kind: "large",
				mode: "contribution",
				externalCash: 5_000_000_000_000.01,
			},
		];
		r.policy = Object.fromEntries(
			Array.from({ length: 101 }, (_, i) => [
				"c" + i,
				{ min: 0, target: 1 / 101, max: 1 },
			]),
		);
		const result = first(r);
		expect(result.invested).toBe(5_000_000_000_000.01);
		expect(result.cashRetained).toBe(0);
	});
	it("uses caller JSON and text resource budgets", () => {
		const r = request();
		r.scenarios = Array.from({ length: 2100 }, (_, i) => ({
			kind: "k" + i,
			mode: "keep",
		}));
		r.configuration.limits.scenarios = 2200;
		expect(compareRebalance(r).alternatives).toHaveLength(2100);
		r.configuration.limits.collectionEntries = 2000;
		expect(() => first(r)).toThrow("arrays exceed");
		r.configuration.limits.collectionEntries = 5000;
		r.configuration.limits.jsonNodes = 1000;
		expect(() => first(r)).toThrow("data size");
		r.configuration.limits.jsonNodes = 100_000;
		r.scenarios = [{ kind: "x".repeat(129), mode: "keep" }];
		expect(first(r).kind).toHaveLength(129);
		r.configuration.limits.textLength = 128;
		expect(() => first(r)).toThrow("text limit");
	});
	it("requires configuration and refuses accessors without executing them", () => {
		const r = request();
		delete (r as Partial<RebalanceRequest>).configuration;
		expect(() => first(r)).toThrow(RebalanceInputError);
		const other = request();
		Object.defineProperty(other.configuration.money, "decimalPlaces", {
			enumerable: true,
			get() {
				throw new Error("must not execute");
			},
		});
		expect(() => first(other)).toThrow(RebalanceInputError);
	});
	it("keeps configurations isolated and snapshots defensively copied", () => {
		const a = request(3),
			b = request(0);
		a.scenarios = [{ kind: "a", mode: "contribution", externalCash: 0.001 }];
		const saved = compareRebalance(a);
		expect(first(b).invested).toBe(1);
		expect(compareRebalance(a)).toEqual(saved);
		a.configuration.cashAssetClass = "changed";
		expect(saved.snapshot.request.configuration.cashAssetClass).toBe("liquid");
		expect(replayRebalanceComparison(saved.snapshot)).toEqual(saved);
	});
});

describe("caller-selected comparison workflow", () => {
	it("generates only requested IDs and allows plans combining sales with external cash", () => {
		const r = planRequest();
		expect(compareRebalance(r).alternatives.map((a) => a.kind)).toEqual([
			"combined",
		]);
		expect(first(r).cashRetained).toBe(2);
		r.scenarios.push(
			{ kind: "baseline", mode: "keep" },
			{
				kind: "no proposal",
				mode: "unavailable",
				reasonCodes: ["host_approval_pending"],
			},
		);
		expect(compareRebalance(r).alternatives).toHaveLength(3);
		r.priority = "minimize_sales";
		expect(compareRebalance(r).alternatives.map((a) => a.kind)).toEqual([
			"baseline",
			"combined",
			"no proposal",
		]);
	});
	it("supports purchase-only explicit plans and scenario-specific funding depots", () => {
		const r = planRequest();
		const s = r.scenarios[0]!;
		if (s.mode !== "plan") throw Error();
		s.plan.sales = [];
		s.fundingDepotId = "other";
		expect(first(r).cashRetained).toBe(1);
		expect(first(r).reasonCodes).toContain("funding_transfer_required");
		expect(
			first(r).funding.find((f) => f.depotId === "other")!.externalCash,
		).toBe(2);
	});
	it.each([
		"rebalance-comparison-v1",
		"rebalance-comparison-v2",
	])("refuses %s replay", (version) => {
		const saved = compareRebalance(request()).snapshot;
		expect(() =>
			replayRebalanceComparison({
				...saved,
				methodologyVersion: version,
			} as typeof saved),
		).toThrow("Unsupported snapshot methodology");
	});
});

describe("serializable fee policies", () => {
	const schedule = (rounding: FeeSchedule["rounding"]): FeeSchedule => ({
		fixed: 0.001,
		rate: 0.0015,
		rounding,
	});
	it.each([
		["up", 0.003],
		["nearest", 0.003],
		["down", 0.002],
	] as const)("rounds fractional fees %s in configured minor units", (rounding, expected) => {
		const r = planRequest();
		r.accounts![0]!.fees = {
			buy: schedule(rounding),
			sell: { fixed: 0.005, rate: 0, rounding },
		};
		delete r.accounts![0]!.feePerTrade;
		expect(first(r).feeCost).toBe(Number((expected + 0.005).toFixed(3)));
		expect(first(r).feasibility).toBe("feasible");
	});
	it("applies minimum and maximum fee caps before summing individual orders", () => {
		const r = planRequest();
		r.accounts![0]!.fees = {
			buy: { fixed: 0, rate: 0.000001, minimum: 0.01, rounding: "down" },
			sell: { fixed: 0.1, rate: 0.1, maximum: 0.02, rounding: "up" },
		};
		delete r.accounts![0]!.feePerTrade;
		expect(first(r).feeCost).toBe(0.03);
	});
	it("reserves scheduled fees only for selected contributions", () => {
		const r = request();
		r.accounts![0]!.fees = {
			buy: { fixed: 0.01, rate: 0.01, rounding: "up" },
			sell: null,
		};
		delete r.accounts![0]!.feePerTrade;
		const result = first(r);
		expect(result.feasibility).toBe("feasible");
		expect(result.invested).toBe(0.98);
		expect(result.feeCost).toBe(0.02);
		expect(result.cashRetained).toBe(0);
	});
	it("uses exact per-order overrides for external fee models, including unknowns", () => {
		const r = planRequest();
		const s = r.scenarios[0]!;
		if (s.mode !== "plan") throw Error();
		s.plan.sales[0]!.fee = 0.123;
		s.plan.purchases[0]!.fee = 0.456;
		expect(first(r).feeCost).toBe(0.579);
		expect(first(r).sales[0]!.fee).toBe(0.123);
		s.plan.purchases[0]!.fee = null;
		expect(first(r).feeCost).toBeNull();
		expect(first(r).feasibility).toBe("conditional");
		s.externalCash = 0;
		s.plan.sales[0]!.fee = 0.001;
		expect(first(r).reasonCodes).toContain("insufficient_funding");
		expect(first(r).feasibility).toBe("unavailable");
	});
	it("keeps buy and sell uncertainty separate", () => {
		const r = planRequest();
		r.accounts![0]!.fees = {
			buy: { fixed: 0.001, rate: 0, rounding: "up" },
			sell: null,
		};
		delete r.accounts![0]!.feePerTrade;
		expect(first(r).feeCost).toBeNull();
		expect(first(r).reasonCodes).toContain("fees_unknown");
		const s = r.scenarios[0]!;
		if (s.mode !== "plan") throw Error();
		s.externalCash = 0;
		expect(first(r).reasonCodes).toContain("insufficient_funding");
	});
	it("rejects conflicting or invalid schedules", () => {
		const r = request();
		r.accounts![0]!.fees = { buy: schedule("up"), sell: null };
		expect(() => first(r)).toThrow("exactly one");
		delete r.accounts![0]!.feePerTrade;
		r.accounts![0]!.fees!.buy!.rate = -1;
		expect(() => first(r)).toThrow("nonnegative fraction");
		r.accounts![0]!.fees!.buy!.rate = 0;
		r.accounts![0]!.fees!.buy!.minimum = 0.02;
		r.accounts![0]!.fees!.buy!.maximum = 0.01;
		expect(() => first(r)).toThrow("admit their minimum");
	});
});
