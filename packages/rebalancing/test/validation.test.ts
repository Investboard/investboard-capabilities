import { describe, expect, it } from "vitest";
import {
	replayRebalanceComparison,
	RebalanceInputError,
} from "../src/index.js";
import {
	compareRebalance,
	projectContributions,
	MAX_SUPPORTED_WEALTH,
	type RebalanceRequest,
	policy,
	request,
	salesRequest,
} from "./fixtures.js";

describe("public JSON and monetary boundary", () => {
	it.each([
		[
			"negative cash",
			(r: RebalanceRequest) => {
				r.contribution = -1;
			},
		],
		[
			"non-cent cash",
			(r: RebalanceRequest) => {
				r.contribution = 10.005;
			},
		],
		[
			"non-finite cash",
			(r: RebalanceRequest) => {
				r.contribution = Infinity;
			},
		],
		[
			"oversized partial cash",
			(r: RebalanceRequest) => {
				r.cashLimit = r.contribution + 1;
			},
		],
		[
			"duplicate holding",
			(r: RebalanceRequest) => {
				r.holdings.push({ ...r.holdings[0]! });
			},
		],
		[
			"duplicate account",
			(r: RebalanceRequest) => {
				r.accounts!.push({ ...r.accounts![0]! });
			},
		],
		[
			"bad policy sum",
			(r: RebalanceRequest) => {
				r.policy.equities!.target = 0.55;
			},
		],
		[
			"target outside corridor",
			(r: RebalanceRequest) => {
				r.policy.equities!.max = 0.5;
			},
		],
		[
			"zero increment",
			(r: RebalanceRequest) => {
				r.accounts![0]!.increment = 0;
			},
		],
		[
			"missing required holding class",
			(r: RebalanceRequest) => {
				delete (r.holdings[0] as Partial<RebalanceRequest["holdings"][number]>)
					.assetClass;
			},
		],
		[
			"negative minimum",
			(r: RebalanceRequest) => {
				r.minTradeSize = -1;
			},
		],
		[
			"fractional trade cap",
			(r: RebalanceRequest) => {
				r.maxTrades = 0.5;
			},
		],
	])("rejects %s", (_label, mutate) => {
		const input = request();
		mutate(input);
		expect(() => compareRebalance(input)).toThrow(RebalanceInputError);
	});
	it("keeps a legitimate large cent value precise and refuses excess wealth", () => {
		const input = request();
		input.contribution = 0;
		input.cashLimit = 0;
		input.holdings = [{ ...input.holdings[0]!, value: 999999999.98 }];
		expect(compareRebalance(input).valueBefore).toBe(999999999.98);
		input.contribution = 0.03;
		expect(() => compareRebalance(input)).toThrow("configured wealth");
	});
	it.each([
		"field",
		"undefined",
		"date",
		"symbol",
		"cycle",
		"sparse",
		"getter",
	])("rejects lossy %s snapshot data", (fault) => {
		const input = request();
		if (fault === "field")
			Object.assign(input, { providerToken: "synthetic-unexpected-field" });
		if (fault === "undefined") input.priority = undefined;
		if (fault === "date") Object.assign(input, { observed: new Date() });
		if (fault === "symbol")
			Object.assign(input, { [Symbol("unsupported")]: 1 });
		if (fault === "cycle") Object.assign(input, { cycle: input });
		if (fault === "sparse") delete input.holdings[0];
		if (fault === "getter")
			Object.defineProperty(input, "contribution", {
				enumerable: true,
				get() {
					throw new Error("Getter should never execute");
				},
			});
		expect(() => compareRebalance(input)).toThrow(RebalanceInputError);
	});
	it("rejects unsupported replay methodology and extra snapshot metadata", () => {
		const saved = compareRebalance(request()).snapshot;
		expect(() =>
			replayRebalanceComparison({
				...saved,
				methodologyVersion: "future",
			} as unknown as typeof saved),
		).toThrow("Unsupported snapshot");
		expect(() =>
			replayRebalanceComparison(Object.assign(saved, { secret: "synthetic" })),
		).toThrow("unsupported field");
	});
	it.each([
		"oversell",
		"duplicate sale",
		"wrong purchase depot",
		"unknown holding",
		"missing tax provenance",
		"cash purchase",
	])("refuses %s", (fault) => {
		const input = salesRequest();
		if (fault === "oversell") input.salePlan!.sales[0]!.amount = 201;
		if (fault === "duplicate sale")
			input.salePlan!.sales.push({ ...input.salePlan!.sales[0]! });
		if (fault === "wrong purchase depot")
			input.salePlan!.purchases[0]!.depotId = "B";
		if (fault === "unknown holding")
			input.salePlan!.sales[0]!.holdingId = "missing";
		if (fault === "missing tax provenance")
			input.salePlan!.sales[0]!.tax!.source = "";
		if (fault === "cash purchase") {
			input.salePlan!.purchases[0]!.holdingId = null;
			input.salePlan!.purchases[0]!.assetClass = "cash";
		}
		expect(() => compareRebalance(input)).toThrow(RebalanceInputError);
	});
	it("requires every projection assumption, including retained cash", () => {
		const input = {
			positions: [],
			policy,
			monthlyContribution: 100,
			months: 1,
			annualReturns: { equities: 0, bonds: 0 },
		};
		expect(() => projectContributions(input)).toThrow(
			"Annual return assumption required for cash",
		);
	});
	it("rejects projection overflow instead of returning infinite or imprecise wealth", () => {
		expect(() =>
			projectContributions({
				positions: [{ assetClass: "equities", value: MAX_SUPPORTED_WEALTH }],
				policy,
				monthlyContribution: 0,
				months: 12,
				annualReturns: { equities: 1, bonds: 0, cash: 0 },
			}),
		).toThrow("Projected wealth exceeds");
	});
});
