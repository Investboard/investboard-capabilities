import { describe, expect, it } from "vitest";
import {
	evaluatePerformance,
	replayPerformance,
	type PerformanceEffect,
	type PerformanceRequest,
} from "../src/index.js";

function transfers(
	amounts: readonly number[],
	opening: number,
	closing: number,
	fxRate?: number,
): PerformanceRequest {
	return {
		reportingCurrency: "EUR",
		asOfDate: "2026-01-05",
		ledgerComplete: true,
		snapshots: [
			{ date: "2026-01-01", value: opening },
			{ date: "2026-01-03", value: closing },
			{ date: "2026-01-05", value: closing },
		],
		positions: amounts.map((amount, index) => ({
			id: `position-${index}`,
			label: "Synthetic precise transfer",
			quoteCurrency: fxRate === undefined ? "EUR" : "USD",
			currentQuantity: amount > 0 ? 1 : 0,
			anchorDate: "2026-01-01",
			priceSource: "Synthetic unadjusted prices",
			annualExpenseRatio: 0,
			prices: ["2026-01-01", "2026-01-03", "2026-01-05"].map((date) => ({
				date,
				value: Math.abs(amount) / (fxRate ?? 1),
			})),
			...(fxRate === undefined
				? {}
				: {
						fxSource: "Synthetic EUR per USD",
						fxRates: ["2026-01-01", "2026-01-03", "2026-01-05"].map((date) => ({
							date,
							value: fxRate,
						})),
					}),
		})),
		effects: amounts.flatMap((amount, index): PerformanceEffect[] => [
			...(amount < 0
				? [
						{
							id: `opening-${index}`,
							holdingId: `position-${index}`,
							date: "2026-01-01",
							type: "buy" as const,
							quantity: 1,
						},
					]
				: []),
			{
				id: `transfer-${index}`,
				holdingId: `position-${index}`,
				date: "2026-01-03",
				type: "transfer",
				quantity: Math.sign(amount),
			},
		]),
		cashFlows: [],
		recordedCosts: [],
	};
}

describe("aggregate rounding at public book boundaries", () => {
	it.each([
		{
			amounts: [100_000_000.0049996],
			opening: 0,
			closing: 100_000_000,
			funding: 100_000_000,
		},
		{ amounts: [1.0049996], opening: 0, closing: 1, funding: 1 },
		{ amounts: [-1.0049996], opening: 1, closing: 0, funding: -1 },
		{ amounts: [1.0024996, 1.0024996], opening: 0, closing: 2, funding: 2 },
		{ amounts: [-1.0024996, -1.0024996], opening: 2, closing: 0, funding: -2 },
		{
			amounts: [1.0012494, 1.0012494, 1.0012494, 1.0012524],
			opening: 0,
			closing: 4.01,
			funding: 4.01,
		},
		{
			amounts: [-1.0012494, -1.0012494, -1.0012494, -1.0012524],
			opening: 4.01,
			closing: 0,
			funding: -4.01,
		},
	])("rounds the original signed total once: $amounts", ({
		amounts,
		opening,
		closing,
		funding,
	}) => {
		const input = transfers(amounts, opening, closing);
		for (const result of [
			evaluatePerformance(input),
			evaluatePerformance({
				...input,
				scopeHoldingIds: input.positions.map((p) => p.id),
			}),
		]) {
			expect(result.calculation?.timeWeightedReturn.twr).toBe(0);
			expect(result.calculation?.wealthBridge.securityFunding).toBeCloseTo(
				funding,
				12,
			);
			expect(result.calculation?.wealthBridge.investmentResult).toBe(0);
			expect(result.calculation?.wealthBridge.reconciliationGap).toBe(0);
			expect(
				result.calculation?.transfers.reduce(
					(sum, transfer) =>
						sum +
						(amounts[Number(transfer.effectIds[0]!.split("-")[1])]! > 0
							? transfer.value
							: -transfer.value),
					0,
				),
			).toBeCloseTo(funding, 12);
			expect(
				replayPerformance(JSON.parse(JSON.stringify(result.snapshot))),
			).toEqual(result);
		}
	});
	it("keeps full precision after quote-FX conversion", () => {
		const input = transfers([1.0024996, 1.0024996], 0, 2, 0.8);
		const result = evaluatePerformance(input);
		expect(result.status).toBe("available");
		expect(result.calculation?.timeWeightedReturn.twr).toBe(0);
		expect(result.calculation?.wealthBridge.securityFunding).toBe(2);
		expect(result.calculation?.coverage.fraction).toBe(1);
		expect(result.calculation?.fundCostEstimate.coverageFraction).toBe(1);
	});
	it("preserves a small net transfer amid large offsetting amounts", () => {
		const input = transfers(
			[500_000_000, 1.0024996, -500_000_000, 1.0024996],
			500_000_000,
			500_000_002,
		);
		for (const result of [
			evaluatePerformance(input),
			evaluatePerformance({
				...input,
				scopeHoldingIds: input.positions.map((p) => p.id),
			}),
		]) {
			expect(result.calculation?.timeWeightedReturn.twr).toBe(0);
			expect(result.calculation?.wealthBridge.securityFunding).toBe(2);
		}
	});
	it("keeps the target and leg allocation stable under reordering", () => {
		const input = transfers([1.0024996, 1.0024996], 0, 2);
		const a = evaluatePerformance(input);
		const b = evaluatePerformance({
			...input,
			positions: [...input.positions].reverse(),
			effects: [...input.effects].reverse(),
		});
		const legs = (result: ReturnType<typeof evaluatePerformance>) =>
			result.calculation?.transfers
				.map((t) => ({ id: t.effectIds[0], value: t.value }))
				.sort((x, y) => x.id!.localeCompare(y.id!));
		expect(legs(a)).toBeDefined();
		expect(legs(b)).toEqual(legs(a));
		expect(b.calculation?.wealthBridge.securityFunding).toBe(2);
	});
	it("still withholds an actual unfunded cent rather than accepting it as rounding", () => {
		const result = evaluatePerformance(
			transfers([1.0024996, 1.0024996], 0, 2.01),
		);
		expect(result).toMatchObject({
			status: "unavailable",
			calculation: null,
			reasonCodes: ["undefined_subperiod"],
		});
	});
	it("matches an exact decimal funding oracle across 64 signed portfolios", () => {
		const money = (ticks: bigint) =>
			Number(
				(ticks < 0 ? -1n : 1n) *
					(((ticks < 0 ? -ticks : ticks) + 50_000n) / 100_000n),
			) / 100;
		let seed = 0x5eed;
		for (let sample = 0; sample < 64; sample++) {
			const ticks = Array.from({ length: 6 }, () => {
				seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
				return BigInt((seed % 30_000_000) + 1) * (seed & 0x80000000 ? -1n : 1n);
			});
			const outgoing = -ticks
				.filter((value) => value < 0n)
				.reduce((sum, value) => sum + value, 0n);
			const incoming = ticks
				.filter((value) => value > 0n)
				.reduce((sum, value) => sum + value, 0n);
			const expected = money(ticks.reduce((sum, value) => sum + value, 0n));
			const input = transfers(
				ticks.map((value) => Number(value) / 10_000_000),
				100 + money(outgoing),
				100 + money(incoming),
			);
			const withBaseline: PerformanceRequest = {
				...input,
				positions: [
					...input.positions,
					{
						...input.positions[0]!,
						id: "baseline",
						currentQuantity: 1,
						quoteCurrency: "EUR",
						prices: ["2026-01-01", "2026-01-03", "2026-01-05"].map((date) => ({
							date,
							value: 100,
						})),
					},
				],
				effects: [
					...input.effects,
					{
						id: "baseline-opening",
						holdingId: "baseline",
						date: "2026-01-01",
						type: "buy",
						quantity: 1,
					},
				],
			};
			const result = evaluatePerformance(withBaseline);
			expect(result.calculation?.wealthBridge.securityFunding).toBeCloseTo(
				expected,
				12,
			);
			expect(result.calculation?.wealthBridge.reconciliationGap).toBeCloseTo(
				0,
				12,
			);
		}
	});
});
