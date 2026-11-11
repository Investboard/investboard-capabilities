import { describe, expect, it } from "vitest";
import {
	compareRebalance,
	RebalanceInputError,
	replayRebalanceComparison,
	type AccountRules,
	type Holding,
	type RebalanceAlternative,
	type RebalanceComparison,
	type RebalanceRequest,
	type RebalanceSnapshot,
} from "../src/index.js";
import { configuration } from "./fixtures.js";
import savedV4 from "./comparison-v4-replays.json" with { type: "json" };

const v4 = savedV4 as unknown as Record<string, RebalanceComparison>;
const holding = (
	holdingId: string,
	depotId: string,
	assetClass: string,
	value: number,
	extra: Partial<Holding> = {},
): Holding => ({
	holdingId,
	depotId,
	assetClass,
	value,
	currency: "EUR",
	...extra,
});
const account = (
	depotId: string,
	rules: Partial<{
		feePerTrade: number | null;
		minimum: number;
		maximum: number;
		increment: number;
	}> = {},
): AccountRules => ({
	depotId,
	feePerTrade: 0,
	minimum: 0,
	maximum: 0,
	increment: 0.01,
	...rules,
});
const sixtyForty = {
	equities: { min: 0.55, target: 0.6, max: 0.65 },
	bonds: { min: 0.35, target: 0.4, max: 0.45 },
};
function book(extra: Partial<RebalanceRequest>): RebalanceRequest {
	return {
		configuration,
		baseCurrency: "EUR",
		purchasePlacement: { mode: "largest_holding" },
		cashDeployment: { mode: "preserve" },
		fundingDepotId: "A",
		holdings: [],
		policy: sixtyForty,
		scenarios: [{ kind: "fresh_cash", mode: "contribution", externalCash: 0 }],
		...extra,
	};
}
const fresh = (input: RebalanceRequest, externalCash: number) =>
	compareRebalance({
		...input,
		scenarios: [{ kind: "fresh_cash", mode: "contribution", externalCash }],
	}).alternatives[0]!;
const orders = (alternative: RebalanceAlternative) =>
	alternative.purchases.map((p) => [p.holdingId, p.depotId, p.amount]);
const cents = (value: number) => Math.round(value * 100);
const v5 = (name: string) =>
	compareRebalance(structuredClone(v4[name]!.snapshot.request));

describe("the holding that receives a class purchase", () => {
	const shares = holding("share", "A", "equities", 90000);
	const fund = holding("fund", "A", "equities", 10000, { fund: true });
	const bonds = holding("bonds", "A", "bonds", 100000, { fund: true });
	const input = book({
		holdings: [shares, fund, bonds],
		accounts: [account("A")],
	});

	it("buys a declared fund before a larger single share, whatever the input order", () => {
		for (const holdings of [
			[shares, fund, bonds],
			[bonds, fund, shares],
		]) {
			const result = fresh({ ...input, holdings }, 100000);
			expect(
				result.purchases.find((p) => p.assetClass === "equities")?.holdingId,
			).toBe("fund");
		}
	});

	it("buys a holding with a usable price before an unpriced fund", () => {
		const result = fresh(
			{
				...input,
				holdings: [
					{ ...shares, priced: true },
					{ ...fund, priced: false },
					bonds,
				],
			},
			100000,
		);
		expect(
			result.purchases.find((p) => p.assetClass === "equities")?.holdingId,
		).toBe("share");
	});

	it("keeps largest value, then holding ID, when nothing is declared", () => {
		const twins = [
			holding("b-twin", "A", "equities", 50000),
			holding("a-twin", "A", "equities", 50000),
			holding("small", "A", "equities", 100),
			holding("bonds", "A", "bonds", 100000),
		];
		const result = fresh(
			{ ...input, holdings: twins, accounts: [account("A")] },
			100000,
		);
		expect(
			result.purchases.find((p) => p.assetClass === "equities")?.holdingId,
		).toBe("a-twin");
	});

	it.each([
		["fund", "yes"],
		["priced", 1],
	])("refuses a non-boolean %s declaration", (field, value) => {
		const bad = { ...shares, [field]: value } as unknown as Holding;
		expect(() => fresh({ ...input, holdings: [bad, bonds] }, 100)).toThrow(
			RebalanceInputError,
		);
	});
});

describe("a class amount the first account does not admit", () => {
	it("spills a capped amount to another account that holds the class", () => {
		const result = v5("capSpill").alternatives[0]!;
		// Admitted orders are listed largest first.
		expect(orders(result)).toEqual([
			["small", "B", 99],
			["large", "A", 1],
		]);
		expect(result).toMatchObject({
			feasibility: "feasible",
			invested: 100,
			cashRetained: 0,
		});
		expect(result.uninvestedCash).toBeUndefined();
	});

	it("routes an order the first account's fee would swallow to the account without that fee", () => {
		const result = v5("feeAboveOrder").alternatives[0]!;
		expect(orders(result)).toEqual([["bond-b", "B", 50]]);
		expect(result).toMatchObject({
			feasibility: "feasible",
			invested: 50,
			feeCost: 0,
			cashRetained: 0,
		});
	});

	it("tries the lowest declared fee first, then an account without declarations as the last resort", () => {
		const holdings = [
			holding("big", "A", "equities", 40000),
			holding("costly", "B", "equities", 1000),
			holding("cheap", "C", "equities", 1000),
			holding("undeclared", "D", "equities", 1000),
			holding("bonds", "A", "bonds", 40000),
		];
		const accounts = [
			account("A", { minimum: 1000 }),
			account("B", { feePerTrade: 5 }),
			account("C", { feePerTrade: 1 }),
		];
		const input = book({ holdings, accounts, transfersConfirmed: true });
		const routed = fresh(input, 600);
		expect(orders(routed)).toEqual([["cheap", "C", 599]]);
		expect(routed).toMatchObject({ feasibility: "feasible", feeCost: 1 });
		const lastResort = fresh(
			{
				...input,
				accounts: accounts.map((a) => ({ ...a, minimum: 1000 })),
			},
			600,
		);
		expect(orders(lastResort)).toEqual([["undeclared", "D", 600]]);
		expect(lastResort.feasibility).toBe("conditional");
		expect(lastResort.reasonCodes).toContain("account_rules_unknown");
		expect(lastResort.uninvestedCash).toBeUndefined();
	});
});

describe("amounts below an order minimum", () => {
	it("are consolidated into the fewest orders that move toward target", () => {
		const result = v5("minimumConsolidation").alternatives[0]!;
		expect(orders(result)).toEqual([["bond", "A", 600]]);
		expect(result).toMatchObject({
			feasibility: "feasible",
			reasonCodes: [],
			invested: 600,
			cashRetained: 0,
		});
	});

	it("join an order that already meets its minimum", () => {
		const result = v5("feeStranded").alternatives[0]!;
		expect(orders(result)).toEqual([["synthetic-bond", "B", 95]]);
		expect(result).toMatchObject({
			feasibility: "feasible",
			invested: 95,
			feeCost: 5,
			cashRetained: 0,
		});
	});

	it("are reported with a reason only when no order can take them, never as feasible", () => {
		const result = v5("minimumConsolidation").alternatives[1]!;
		expect(result).toMatchObject({
			feasibility: "conditional",
			reasonCodes: ["uninvested_below_order_minimum"],
			invested: 0,
			cashRetained: 400,
			uninvestedCash: 400,
		});
	});

	it("report an amount above every admitting account's maximum", () => {
		const result = fresh(
			book({
				holdings: [
					holding("equity", "A", "equities", 70000),
					holding("bond", "A", "bonds", 30000),
				],
				accounts: [account("A", { maximum: 200 })],
			}),
			1000,
		);
		expect(result).toMatchObject({
			feasibility: "conditional",
			reasonCodes: ["uninvested_above_order_maximum"],
			invested: 200,
			cashRetained: 800,
			uninvestedCash: 800,
		});
	});

	it("do not count increment rounding, the reserve or target cash as uninvested", () => {
		const input = book({
			holdings: [
				holding("equity", "A", "equities", 50000),
				holding("bond", "A", "bonds", 30000),
			],
			accounts: [account("A", { feePerTrade: 4.9, increment: 1 })],
		});
		const rounded = fresh(input, 1234.57);
		expect(rounded.uninvestedCash).toBeUndefined();
		expect(rounded.feasibility).toBe("feasible");
		const reserved = fresh(
			{
				...input,
				cashFloor: 5000,
				policy: {
					equities: { min: 0, target: 0.5, max: 1 },
					bonds: { min: 0, target: 0.3, max: 1 },
					cash: { min: 0, target: 0.2, max: 1 },
				},
			},
			3000,
		);
		expect(reserved.uninvestedCash).toBeUndefined();
	});

	it("conserves money and never leaves uninvested cash under a feasible label", () => {
		const holdings = [
			holding("big-fund", "A", "equities", 41234.56, { fund: true }),
			holding("small", "B", "equities", 777.77),
			holding("bond", "B", "bonds", 30000),
			holding("gold", "A", "gold", 900),
		];
		const policy = {
			equities: { min: 0.5, target: 0.55, max: 0.6 },
			bonds: { min: 0.3, target: 0.35, max: 0.4 },
			gold: { min: 0.05, target: 0.1, max: 0.15 },
		};
		const ruleSets: AccountRules[][] = [
			[
				account("A", { feePerTrade: 4.9, increment: 1 }),
				account("B", { feePerTrade: 1, increment: 1 }),
			],
			[
				account("A", { minimum: 500 }),
				account("B", { minimum: 250, maximum: 2000 }),
			],
			[
				account("A", { feePerTrade: 60 }),
				account("B", { feePerTrade: 0.5, minimum: 100 }),
			],
		];
		const bad: unknown[] = [];
		for (const cash of [0.01, 49.99, 99.99, 333.33, 1234.57, 9999.99, 54321.09])
			for (const accounts of ruleSets) {
				const r = fresh(
					book({ holdings, policy, accounts, transfersConfirmed: true }),
					cash,
				);
				if (
					cents(r.invested) + cents(r.cashRetained!) + cents(r.feeCost!) !==
					cents(cash)
				)
					bad.push(["not conserved", cash, r]);
				if (r.feasibility === "feasible" && r.uninvestedCash !== undefined)
					bad.push(["idle while feasible", cash, r.uninvestedCash]);
				if (
					r.uninvestedCash !== undefined &&
					cents(r.uninvestedCash) > cents(r.cashRetained!)
				)
					bad.push(["uninvested beyond retained", cash, r]);
			}
		expect(bad).toEqual([]);
	});
});

describe("a reserve below its floor", () => {
	it("keeps the current allocation available, with the shortfall stated", () => {
		const keep = v5("reserveBelowFloor").alternatives[0]!;
		expect(keep).toMatchObject({
			feasibility: "conditional",
			reasonCodes: ["reserve_floor_not_reached"],
			reserveAfter: 1000,
			reserveShortfall: 4000,
			valueAfter: 101000,
		});
	});

	it("shows fresh cash that raises the reserve without reaching it as conditional", () => {
		const result = v5("reserveBelowFloor").alternatives[1]!;
		expect(result).toMatchObject({
			feasibility: "conditional",
			reasonCodes: ["reserve_floor_not_reached"],
			invested: 0,
			reserveAfter: 4000,
			reserveShortfall: 1000,
		});
	});

	it("still refuses an alternative that lowers the reserve further", () => {
		const result = v5("reserveBelowFloor").alternatives[2]!;
		expect(result.feasibility).toBe("unavailable");
		expect(result.reasonCodes).toContain("reserve_shortfall");
		expect(result.reserveShortfall).toBeUndefined();
	});

	it("states no shortfall once the reserve is reached", () => {
		const result = fresh(v5("reserveBelowFloor").snapshot.request, 10000);
		expect(result.feasibility).toBe("feasible");
		expect(result.reserveShortfall).toBeUndefined();
	});
});

describe("comparison methodology v4 snapshots", () => {
	it.each(Object.keys(v4))("%s replays to its saved result", (name) => {
		const saved = v4[name]!;
		expect(saved.methodologyVersion).toBe("rebalance-comparison-v4");
		expect(
			replayRebalanceComparison(JSON.parse(JSON.stringify(saved.snapshot))),
		).toEqual(saved);
		expect(v5(name).methodologyVersion).toBe("rebalance-comparison-v5");
	});

	it("refuses fund and price declarations in a v4 snapshot", () => {
		const snapshot = structuredClone(v4.capSpill!.snapshot);
		snapshot.request.holdings[0]!.fund = true;
		expect(() => replayRebalanceComparison(snapshot)).toThrow(
			RebalanceInputError,
		);
	});

	it("replays a new comparison under v5", () => {
		const comparison = v5("reserveBelowFloor");
		const snapshot: RebalanceSnapshot = JSON.parse(
			JSON.stringify(comparison.snapshot),
		);
		expect(snapshot.methodologyVersion).toBe("rebalance-comparison-v5");
		expect(replayRebalanceComparison(snapshot)).toEqual(comparison);
	});
});
