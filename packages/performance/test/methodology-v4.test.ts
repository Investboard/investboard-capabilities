import { describe, expect, it } from "vitest";
import {
	evaluatePerformance,
	METHODOLOGY_VERSION,
	PerformanceInputError,
	replayPerformance,
	type PerformanceEffect,
	type PerformanceRequest,
	type PerformanceResult,
	type PerformanceSnapshot,
	type RecordedCost,
} from "../src/index.js";
import { allocateTransferRounding } from "../src/internal/transfer-rounding.js";
import { calculation, points, request } from "./public-fixtures.js";
import savedV3 from "./methodology-v3-replays.json" with { type: "json" };

const fee = (overrides: Partial<RecordedCost> = {}): RecordedCost => ({
	date: "2026-01-03",
	holdingId: null,
	fees: 10,
	taxes: 0,
	standalone: true,
	...overrides,
});

/** A book with no positions, valued once at each end of the window. */
const twoValuations = (
	from: string,
	to: string,
	opening: number,
	closing: number,
	recordedCosts: RecordedCost[] = [],
): PerformanceRequest =>
	request({
		asOfDate: to,
		snapshots: points([
			[from, opening],
			[to, closing],
		]),
		positions: [],
		effects: [],
		recordedCosts,
	});

function transfers(
	amounts: readonly number[],
	opening: number,
	closing: number,
): PerformanceRequest {
	return {
		reportingCurrency: "EUR",
		asOfDate: "2026-01-05",
		ledgerComplete: true,
		snapshots: points([
			["2026-01-01", opening],
			["2026-01-03", closing],
			["2026-01-05", closing],
		]),
		positions: amounts.map((amount, index) => ({
			id: `position-${index}`,
			label: "Synthetic precise transfer",
			quoteCurrency: "EUR",
			currentQuantity: amount > 0 ? 1 : 0,
			anchorDate: "2026-01-01",
			priceSource: "Synthetic unadjusted prices",
			annualExpenseRatio: 0,
			prices: ["2026-01-01", "2026-01-03", "2026-01-05"].map((date) => ({
				date,
				value: Math.abs(amount),
			})),
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

describe("a fee booked on its own", () => {
	it("is money paid in that buys nothing: the return falls by it and the explanation reconciles", () => {
		const without = calculation(request());
		const result = evaluatePerformance(request({ recordedCosts: [fee()] }));
		const c = result.calculation!;
		expect(result.status).toBe("available");
		expect(result.reasonCodes).toEqual([]);
		// 10 paid on 2026-01-03 against 10,000: 0.999 x 1.1 - 1.
		expect(without.timeWeightedReturn.twr).toBeCloseTo(0.1, 12);
		expect(c.timeWeightedReturn.twr).toBeCloseTo(0.0989, 12);
		expect(c.wealthBridge).toMatchObject({
			securityFunding: 10,
			netExternalFlows: 10,
			investmentResult: 990,
			localPrice: 1000,
			recordedFees: 10,
			residual: 0,
			reconciliationGap: 0,
		});
		expect(c.attribution.recordedCostContribution).toBeCloseTo(-0.0011, 12);
		expect(c.attribution.recordedCostContributionPp).toBeCloseTo(-0.11, 10);
		expect(c.attribution.holdings[0]?.contribution).toBeCloseTo(0.1, 12);
		expect(Math.abs(c.attribution.residualContribution)).toBeLessThan(1e-12);
		expect(c.coverage.fraction).toBe(1);
		expect(
			replayPerformance(JSON.parse(JSON.stringify(result.snapshot))),
		).toEqual(result);
	});

	it("lowers the period it falls in when it is booked between valuations", () => {
		const c = calculation(
			request({ recordedCosts: [fee({ date: "2026-01-02" })] }),
		);
		// The next period opens with 10,000 + 10 and closes at 11,000.
		expect(c.timeWeightedReturn.twr).toBeCloseTo(990 / 10_010, 12);
		expect(c.attribution.recordedCostContribution).toBeCloseTo(
			-10 / 10_010,
			12,
		);
		expect(Math.abs(c.attribution.residualContribution)).toBeLessThan(1e-12);
		expect(c.wealthBridge.residual).toBe(0);
	});

	it("lowers the money-weighted return", () => {
		const without = calculation(
			twoValuations("2025-01-01", "2026-01-01", 1_000, 1_000),
		);
		const c = calculation(
			twoValuations("2025-01-01", "2026-01-01", 1_000, 1_000, [
				fee({ date: "2025-07-02" }),
			]),
		);
		expect(without.moneyWeightedReturn.mwr).toBeCloseTo(0, 8);
		expect(c.moneyWeightedReturn.mwr).toBeLessThan(-0.009);
		expect(c.moneyWeightedReturn.mwr).toBeGreaterThan(-0.011);
		expect(c.timeWeightedReturn.twr).toBeCloseTo(-10 / 1_010, 12);
	});

	it("keeps a fee inside a trade unchanged, whether flagged false or omitted", () => {
		const { standalone: _flag, ...inside } = fee({ holdingId: "fund" });
		const omitted = evaluatePerformance(request({ recordedCosts: [inside] }));
		const flagged = evaluatePerformance(
			request({ recordedCosts: [{ ...inside, standalone: false }] }),
		);
		expect(flagged.calculation).toEqual(omitted.calculation);
		expect(omitted.calculation?.timeWeightedReturn.twr).toBeCloseTo(0.1, 12);
		expect(omitted.calculation?.wealthBridge.residual).toBe(10);
		expect(omitted.calculation?.attribution).not.toHaveProperty(
			"recordedCostContribution",
		);
	});

	it("falls before the measured window when booked on the opening date", () => {
		const c = calculation(
			request({ recordedCosts: [fee({ date: "2026-01-01" })] }),
		);
		expect(c.timeWeightedReturn.twr).toBeCloseTo(0.1, 12);
		expect(c.wealthBridge.recordedFees).toBe(0);
		expect(c.attribution.recordedCostContribution).toBe(0);
	});

	it("follows the holding it names into a selected basket", () => {
		const whole = calculation(
			request({ recordedCosts: [fee({ holdingId: "fund" })] }),
		);
		const scoped = calculation(
			request({
				recordedCosts: [fee({ holdingId: "fund" })],
				scopeHoldingIds: ["fund"],
			}),
		);
		expect(scoped.timeWeightedReturn.twr).toBeCloseTo(
			whole.timeWeightedReturn.twr,
			12,
		);
		expect(scoped.attribution.recordedCostContribution).toBeCloseTo(
			-0.0011,
			12,
		);
		expect(
			evaluatePerformance(
				request({ recordedCosts: [fee()], scopeHoldingIds: ["fund"] }),
			).reasonCodes,
		).toEqual(["scope_history_missing"]);
	});

	it("rejects a standalone marker that is not a boolean", () => {
		expect(() =>
			evaluatePerformance(
				request({
					recordedCosts: [{ ...fee(), standalone: "yes" as never }],
				}),
			),
		).toThrow(PerformanceInputError);
	});
});

describe("one annualization threshold for both returns", () => {
	it("annualizes both returns over a window of exactly 365 days", () => {
		const c = calculation(
			twoValuations("2025-01-01", "2026-01-01", 1_000, 1_100),
		);
		expect(c.timeWeightedReturn.annualizedTwr).toBeCloseTo(
			1.1 ** (365.25 / 365) - 1,
			12,
		);
		expect(c.moneyWeightedReturn.isAnnualized).toBe(true);
		expect(c.moneyWeightedReturn.mwr).toBeCloseTo(0.1, 6);
	});

	it("annualizes neither return over 364 days", () => {
		const c = calculation(
			twoValuations("2025-01-02", "2026-01-01", 1_000, 1_100),
		);
		expect(c.timeWeightedReturn.annualizedTwr).toBeNull();
		expect(c.moneyWeightedReturn).toMatchObject({
			mwr: null,
			isAnnualized: false,
		});
	});
});

describe("half-cent transfer netting", () => {
	it("allocates +100.005 and -99 as 1.01 of net funding", () => {
		expect(allocateTransferRounding([100.005, -99])).toEqual([100.01, -99]);
		expect(allocateTransferRounding([-99, 100.005])).toEqual([-99, 100.01]);
	});

	it.each([
		[[100.005, -99]],
		[[-99, 100.005]],
	])("funds 1.01 without a false one-cent gain: %j", (amounts) => {
		const input = transfers(amounts, 99, 100.01);
		for (const result of [
			evaluatePerformance(input),
			evaluatePerformance({
				...input,
				scopeHoldingIds: input.positions.map((p) => p.id),
			}),
		]) {
			// The holding's own half-cent value (100.005 against a 100.01 NAV)
			// stays book rounding in the attribution residual, as documented.
			expect(result.calculation?.wealthBridge.securityFunding).toBeCloseTo(
				1.01,
				12,
			);
			expect(result.calculation?.wealthBridge.investmentResult).toBeCloseTo(
				0,
				12,
			);
			expect(result.calculation?.wealthBridge.reconciliationGap).toBe(0);
			expect(result.calculation?.timeWeightedReturn.twr).toBe(0);
			expect(
				result.calculation?.transfers.map((t) => t.value).sort((a, b) => a - b),
			).toEqual([99, 100.01]);
		}
	});
});

describe("saved actual-position-performance-v3 snapshots", () => {
	const saved = savedV3 as unknown as Record<string, PerformanceResult>;

	it("pins new evaluations to v4", () => {
		expect(METHODOLOGY_VERSION).toBe("actual-position-performance-v4");
		expect(evaluatePerformance(request()).snapshot.methodologyVersion).toBe(
			METHODOLOGY_VERSION,
		);
	});

	it.each(
		Object.keys(saved),
	)("replays %s to the result it was saved with", (name) => {
		const original = saved[name]!;
		expect(original.snapshot.methodologyVersion).toBe(
			"actual-position-performance-v3",
		);
		expect(replayPerformance(structuredClone(original.snapshot))).toEqual(
			original,
		);
	});

	it("applies the v4 rules when the saved inputs are evaluated again", () => {
		const window = evaluatePerformance(
			saved.window_of_365_days!.snapshot.request,
		);
		expect(window.calculation?.timeWeightedReturn.annualizedTwr).not.toBeNull();
		const net = evaluatePerformance(
			saved.half_cent_transfer_net!.snapshot.request,
		);
		expect(net.calculation?.wealthBridge.securityFunding).toBeCloseTo(1.01, 12);
	});

	it("refuses a v3 snapshot that declares a standalone fee", () => {
		const snapshot = structuredClone(
			saved.plain_book!.snapshot,
		) as PerformanceSnapshot;
		Object.assign(snapshot.request, { recordedCosts: [fee()] });
		expect(() => replayPerformance(snapshot)).toThrow(PerformanceInputError);
	});
});
