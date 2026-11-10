import { describe, expect, it } from "vitest";
import {
	evaluatePerformance,
	replayPerformance,
	PerformanceInputError,
	type PerformanceRequest,
} from "../src/index.js";

function annualHistory(
	opening: number,
	closing: number,
	turnover = false,
): PerformanceRequest {
	const dates: string[] = [];
	for (
		let day = Date.parse("2025-01-01");
		day < Date.parse("2026-01-01");
		day += 7 * 86_400_000
	)
		dates.push(new Date(day).toISOString().slice(0, 10));
	dates.push("2026-01-01");
	const values = dates.map((date) => ({
		date,
		value: date === "2026-01-01" ? closing : opening,
	}));
	return {
		reportingCurrency: "EUR",
		asOfDate: "2026-01-01",
		ledgerComplete: true,
		snapshots: values,
		positions: [
			{
				id: "fund",
				label: "Synthetic annual history",
				quoteCurrency: "EUR",
				currentQuantity: 1,
				anchorDate: "2025-01-01",
				priceSource: "Synthetic weekly fixture",
				annualExpenseRatio: 0,
				prices: values,
			},
		],
		effects: [
			{
				id: "initial",
				holdingId: "fund",
				date: "2025-01-01",
				type: "buy",
				quantity: 1,
			},
			...(turnover
				? [
						{
							id: "rotation-buy",
							holdingId: "fund",
							date: "2025-01-08",
							type: "buy" as const,
							quantity: 100_000_000 / opening,
							order: 1,
						},
						{
							id: "rotation-sell",
							holdingId: "fund",
							date: "2025-01-08",
							type: "sell" as const,
							quantity: 100_000_000 / opening,
							order: 2,
						},
					]
				: []),
		],
		cashFlows: turnover
			? [
					{
						id: "rotation-buy",
						holdingId: "fund",
						date: "2025-01-08",
						type: "buy",
						amount: 100_000_000,
					},
					{
						id: "rotation-sell",
						holdingId: "fund",
						date: "2025-01-08",
						type: "sell",
						amount: 100_000_000,
					},
				]
			: [],
		recordedCosts: [],
	};
}

function incoming(
	price: number,
	nav: number,
	fxRate?: number,
): PerformanceRequest {
	return {
		reportingCurrency: "EUR",
		asOfDate: "2026-01-05",
		ledgerComplete: true,
		snapshots: [
			{ date: "2026-01-01", value: 0 },
			{ date: "2026-01-03", value: nav },
			{ date: "2026-01-05", value: nav },
		],
		positions: [
			{
				id: "incoming",
				label: "Synthetic incoming transfer",
				quoteCurrency: fxRate === undefined ? "EUR" : "USD",
				currentQuantity: 1,
				anchorDate: "2026-01-01",
				priceSource: "Synthetic unadjusted prices",
				annualExpenseRatio: 0.01,
				prices: [
					{ date: "2026-01-03", value: price },
					{ date: "2026-01-05", value: price },
				],
				...(fxRate === undefined
					? {}
					: {
							fxSource: "Synthetic EUR per USD",
							fxRates: [
								{ date: "2026-01-03", value: fxRate },
								{ date: "2026-01-05", value: fxRate },
							],
						}),
			},
		],
		effects: [
			{
				id: "transfer",
				holdingId: "incoming",
				date: "2026-01-03",
				type: "transfer",
				quantity: 1,
			},
		],
		cashFlows: [],
		recordedCosts: [],
	};
}

describe("public audit regressions", () => {
	it.each([
		[1, 12],
		[100, 0.01],
	])("keeps out-of-range XIRR unavailable after neutral turnover (%s → %s)", (opening, closing) => {
		const plain = evaluatePerformance(annualHistory(opening, closing));
		const churn = evaluatePerformance(annualHistory(opening, closing, true));
		expect(plain.calculation?.moneyWeightedReturn).toMatchObject({
			mwr: null,
			mwrError: "no_convergence",
		});
		expect(churn.calculation?.moneyWeightedReturn).toMatchObject({
			mwr: null,
			mwrError: "no_convergence",
		});
		expect(churn.calculation?.timeWeightedReturn.twr).toBe(
			plain.calculation?.timeWeightedReturn.twr,
		);
		expect(
			replayPerformance(JSON.parse(JSON.stringify(churn.snapshot))),
		).toEqual(churn);
	});
	it("preserves an ordinary annual XIRR after neutral turnover", () => {
		const plain = evaluatePerformance(annualHistory(100, 110));
		const churn = evaluatePerformance(annualHistory(100, 110, true));
		expect(churn.calculation?.moneyWeightedReturn.mwr).toBeCloseTo(0.1, 10);
		expect(churn.calculation?.moneyWeightedReturn).toEqual(
			plain.calculation?.moneyWeightedReturn,
		);
	});
	it.each([
		[1, 11, 10],
		[1000, 1, -0.999],
	])("still accepts a true root at a supported boundary (%s → %s)", (opening, closing, rate) => {
		const result = evaluatePerformance(annualHistory(opening, closing, true));
		expect(result.calculation?.moneyWeightedReturn.mwrError).toBeNull();
		expect(result.calculation?.moneyWeightedReturn.mwr).toBeCloseTo(rate, 8);
	});
	it.each([
		100.004, 99.996,
	])("preserves a flat transfer when selecting the full basket at price %s", (price) => {
		const input = incoming(price, 100);
		const whole = evaluatePerformance(input);
		const scoped = evaluatePerformance({
			...input,
			scopeHoldingIds: ["incoming"],
		});
		for (const result of [whole, scoped]) {
			expect(result.status).toBe("available");
			expect(result.calculation?.timeWeightedReturn.twr).toBe(0);
			expect(result.calculation?.coverage.fraction).toBe(1);
			expect(result.calculation?.fundCostEstimate.coverageFraction).toBe(1);
			expect(result.calculation?.wealthBridge.investmentResult).toBe(0);
			expect(result.calculation?.wealthBridge.reconciliationGap).toBe(0);
			expect(result.calculation?.fundCostEstimate.amount).toBeCloseTo(
				(price * 0.01 * 2) / 365,
				12,
			);
			expect(
				replayPerformance(JSON.parse(JSON.stringify(result.snapshot))),
			).toEqual(result);
		}
		expect(scoped.calculation?.scope.navBasis).toBe("reconstructed");
	});
	it.each([
		[1.005, 1.01],
		[2.675, 2.68],
	])("rounds an incoming transfer at half-cent ties (%s → %s)", (price, nav) => {
		const input = incoming(price, nav);
		for (const result of [
			evaluatePerformance(input),
			evaluatePerformance({ ...input, scopeHoldingIds: ["incoming"] }),
		]) {
			expect(result.status).toBe("available");
			expect(result.calculation?.transfers[0]?.value).toBe(nav);
			expect(result.calculation?.timeWeightedReturn.twr).toBe(0);
		}
	});
	it("applies the same transfer rounding after quote-FX conversion", () => {
		const result = evaluatePerformance(incoming(1.675, 1.01, 0.6));
		expect(result.status).toBe("available");
		expect(result.calculation?.transfers[0]).toMatchObject({
			value: 1.01,
			price: 1.675,
			fxRate: 0.6,
			quoteCurrency: "USD",
		});
		expect(result.calculation?.timeWeightedReturn.twr).toBe(0);
	});
	it("still refuses a real one-cent gain from zero capital without funding", () => {
		const result = evaluatePerformance({
			reportingCurrency: "EUR",
			asOfDate: "2026-01-05",
			ledgerComplete: true,
			snapshots: [
				{ date: "2026-01-01", value: 0 },
				{ date: "2026-01-05", value: 0.01 },
			],
			positions: [],
			effects: [],
			cashFlows: [],
		});
		expect(result).toMatchObject({
			status: "unavailable",
			reasonCodes: ["undefined_subperiod"],
		});
	});
	it.each([
		[100.004, 200.01],
		[99.996, 199.99],
	])("reconciles two same-day incoming transfers without a rounding gain (%s each)", (price, nav) => {
		const single = incoming(price, nav);
		const input: PerformanceRequest = {
			...single,
			positions: [
				single.positions[0]!,
				{ ...single.positions[0]!, id: "second" },
			],
			effects: [
				...single.effects,
				{
					id: "second-transfer",
					holdingId: "second",
					date: "2026-01-03",
					type: "transfer",
					quantity: 1,
				},
			],
		};
		for (const result of [
			evaluatePerformance(input),
			evaluatePerformance({
				...input,
				scopeHoldingIds: ["incoming", "second"],
			}),
		]) {
			expect(result.calculation?.timeWeightedReturn.twr).toBe(0);
			expect(result.calculation?.wealthBridge.securityFunding).toBe(nav);
			expect(
				result.calculation?.transfers.reduce((sum, t) => sum + t.value, 0),
			).toBeCloseTo(nav, 12);
			expect(
				result.calculation?.transfers.some((t) => t.roundingAdjustment !== 0),
			).toBe(true);
		}
	});
	it("versions corrected results and requires explicit recalculation of v1 inputs", () => {
		const result = evaluatePerformance(incoming(1.005, 1.01));
		expect(result.snapshot.methodologyVersion).toBe(
			"actual-position-performance-v2",
		);
		const legacy = {
			...result.snapshot,
			methodologyVersion: "actual-position-performance-v1",
		};
		expect(() => replayPerformance(legacy as never)).toThrow(
			PerformanceInputError,
		);
		expect(evaluatePerformance(legacy.request)).toEqual(result);
	});
	it.each([
		[1.005, 1.01],
		[2.675, 2.68],
	])("uses symmetric rounding for an outgoing transfer (%s → %s)", (price, nav) => {
		const single = incoming(price, nav);
		const input: PerformanceRequest = {
			...single,
			snapshots: [
				{ date: "2026-01-01", value: nav },
				{ date: "2026-01-03", value: 0 },
				{ date: "2026-01-05", value: 0 },
			],
			positions: [
				{
					...single.positions[0]!,
					currentQuantity: 0,
					prices: [
						{ date: "2026-01-01", value: price },
						...single.positions[0]!.prices,
					],
				},
			],
			effects: [
				{
					id: "initial",
					holdingId: "incoming",
					date: "2026-01-01",
					type: "buy",
					quantity: 1,
				},
				{
					id: "outgoing",
					holdingId: "incoming",
					date: "2026-01-03",
					type: "transfer",
					quantity: -1,
				},
			],
		};
		const result = evaluatePerformance(input);
		expect(result.calculation?.timeWeightedReturn.twr).toBe(0);
		expect(result.calculation?.wealthBridge.securityFunding).toBe(-nav);
		expect(result.calculation?.transfers[0]).toMatchObject({
			value: nav,
			roundingAdjustment: 0,
		});
	});
	it("keeps cent allocation stable under ledger reordering", () => {
		const single = incoming(100.004, 200.01);
		const input: PerformanceRequest = {
			...single,
			positions: [
				single.positions[0]!,
				{ ...single.positions[0]!, id: "second" },
			],
			effects: [
				...single.effects,
				{
					id: "second-transfer",
					holdingId: "second",
					date: "2026-01-03",
					type: "transfer",
					quantity: 1,
				},
			],
		};
		const original = evaluatePerformance(input);
		const reversed = evaluatePerformance({
			...input,
			effects: [...input.effects].reverse(),
		});
		const values = (result: ReturnType<typeof evaluatePerformance>) =>
			result.calculation?.transfers
				.map((transfer) => ({
					id: transfer.effectIds[0],
					value: transfer.value,
					adjustment: transfer.roundingAdjustment,
				}))
				.sort((a, b) => a.id!.localeCompare(b.id!));
		expect(values(reversed)).toEqual(values(original));
		expect(reversed.calculation?.timeWeightedReturn.twr).toBe(0);
	});
	it.each([
		[100.004, 200.01],
		[99.996, 199.99],
	])("reconciles two same-day outgoing transfers (%s each)", (price, nav) => {
		const single = incoming(price, nav);
		const positions = [
			single.positions[0]!,
			{ ...single.positions[0]!, id: "second" },
		].map((position) => ({
			...position,
			currentQuantity: 0,
			prices: [{ date: "2026-01-01", value: price }, ...position.prices],
		}));
		const input: PerformanceRequest = {
			...single,
			positions,
			snapshots: [
				{ date: "2026-01-01", value: nav },
				{ date: "2026-01-03", value: 0 },
				{ date: "2026-01-05", value: 0 },
			],
			effects: positions.flatMap((position) => [
				{
					id: `${position.id}-initial`,
					holdingId: position.id,
					date: "2026-01-01",
					type: "buy" as const,
					quantity: 1,
				},
				{
					id: `${position.id}-out`,
					holdingId: position.id,
					date: "2026-01-03",
					type: "transfer" as const,
					quantity: -1,
				},
			]),
		};
		const result = evaluatePerformance(input);
		expect(result.calculation?.timeWeightedReturn.twr).toBe(0);
		expect(result.calculation?.wealthBridge.securityFunding).toBe(-nav);
		expect(result.calculation?.wealthBridge.investmentResult).toBe(0);
		expect(
			result.calculation?.transfers.some(
				(transfer) => transfer.roundingAdjustment !== 0,
			),
		).toBe(true);
	});
	it("nets opposite external transfers before allocating half-cent grain", () => {
		const single = incoming(1.004, 1);
		const input: PerformanceRequest = {
			...single,
			snapshots: [
				{ date: "2026-01-01", value: 1.01 },
				{ date: "2026-01-03", value: 1 },
				{ date: "2026-01-05", value: 1 },
			],
			positions: [
				{
					...single.positions[0]!,
					id: "old",
					currentQuantity: 0,
					prices: [
						{ date: "2026-01-01", value: 1.005 },
						{ date: "2026-01-03", value: 1.005 },
					],
				},
				single.positions[0]!,
			],
			effects: [
				{
					id: "initial",
					holdingId: "old",
					date: "2026-01-01",
					type: "buy",
					quantity: 1,
				},
				{
					id: "out",
					holdingId: "old",
					date: "2026-01-03",
					type: "transfer",
					quantity: -1,
				},
				...single.effects,
			],
		};
		const result = evaluatePerformance(input);
		expect(result.calculation?.wealthBridge.securityFunding).toBe(0);
		expect(
			result.calculation?.transfers.every((transfer) => transfer.value === 1),
		).toBe(true);
		expect(
			result.calculation?.transfers.find(
				(transfer) => transfer.effectIds[0] === "out",
			)?.roundingAdjustment,
		).toBe(-0.01);
		expect(result.calculation?.wealthBridge.reconciliationGap).toBe(0);
	});
});
