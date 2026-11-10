// Synthetic regression fixtures. Copyright 2026 Investboard GmbH. Apache-2.0
import { describe, expect, it } from "vitest";
import { calculateXirr } from "../src/internal/performance/xirr.js";
import { DIVIDEND_FLAT_1Y, DIVIDEND_SHORT, SHORT_HISTORY } from "./fixtures.js";
describe("calculateXirr", () => {
	it("Test 1: simple investment -- 10% annualized return", () => {
		const cashFlows = [
			{ date: "2024-01-01", amount: 1000, type: "buy" as const },
		];
		const result = calculateXirr(cashFlows, 1100, "2025-01-01");
		expect(result.mwr).not.toBeNull();
		expect(result.mwr!).toBeCloseTo(0.1, 2);
		expect(result.isAnnualized).toBe(true);
		expect(result.mwrError).toBeNull();
		expect(result.rawPeriodReturn).toBeUndefined();
	});
	it("Test 2: multiple cash flows -- XIRR converges to NPV-zeroing rate", () => {
		const cashFlows = [
			{ date: "2024-01-01", amount: 1000, type: "buy" as const },
			{ date: "2024-06-28", amount: 500, type: "buy" as const },
		];
		const result = calculateXirr(cashFlows, 1800, "2025-01-01");
		expect(result.mwr).not.toBeNull();
		expect(result.mwr!).toBeGreaterThan(0);
		expect(result.isAnnualized).toBe(true);
		expect(result.mwrError).toBeNull();
		expect(result.iterations).toBeGreaterThan(0);
		const r = result.mwr!;
		const npv =
			-1000 / (1 + r) ** 0 +
			-500 / (1 + r) ** (179 / 365) +
			1800 / (1 + r) ** (366 / 365);
		expect(Math.abs(npv)).toBeLessThan(0.01);
	});
	it("Test 3: < 1 year history -- MWR is not annualized (null), no raw period return", () => {
		const { cashFlows, snapshots } = SHORT_HISTORY;
		const lastSnapshot = snapshots[snapshots.length - 1]!;
		const result = calculateXirr(
			cashFlows,
			lastSnapshot.value,
			lastSnapshot.date,
		);
		expect(result.mwr).toBeNull();
		expect(result.rawPeriodReturn).toBeUndefined();
		expect(result.isAnnualized).toBe(false);
		expect(result.mwrError).toBeNull();
	});
	it("Test 4: convergence failure -- pathological cash flows", () => {
		const cashFlows = [
			{ date: "2024-01-01", amount: 1000, type: "sell" as const },
			{ date: "2024-02-01", amount: 5000, type: "buy" as const },
			{ date: "2024-03-01", amount: 8000, type: "sell" as const },
			{ date: "2024-04-01", amount: 12000, type: "buy" as const },
			{ date: "2024-05-01", amount: 15000, type: "sell" as const },
			{ date: "2024-06-01", amount: 20000, type: "buy" as const },
		];
		const result = calculateXirr(cashFlows, 1, "2025-01-01");
		if (result.mwr === null) {
			expect(result.mwrError).toBe("no_convergence");
		} else {
			expect(result.mwr).toBeGreaterThanOrEqual(-0.999);
			expect(result.mwr).toBeLessThanOrEqual(10.0);
		}
	});
	it("Test 5: insufficient data -- no cash flows", () => {
		const result = calculateXirr([], 1000, "2025-01-01");
		expect(result.mwr).toBeNull();
		expect(result.rawPeriodReturn).toBeUndefined();
		expect(result.mwrError).toBe("insufficient_data");
		expect(result.iterations).toBe(0);
		expect(result.isAnnualized).toBe(false);
	});
	it("Test 6: too short -- single day of history", () => {
		const cashFlows = [
			{ date: "2025-01-01", amount: 1000, type: "buy" as const },
		];
		const result = calculateXirr(cashFlows, 1000, "2025-01-01");
		expect(result.mwr).toBeNull();
		expect(result.rawPeriodReturn).toBeUndefined();
		expect(result.mwrError).toBe("too_short");
		expect(result.iterations).toBe(0);
		expect(result.isAnnualized).toBe(false);
	});
	it("Test 7: negative return -- portfolio drops 20%", () => {
		const cashFlows = [
			{ date: "2024-01-01", amount: 1000, type: "buy" as const },
		];
		const result = calculateXirr(cashFlows, 800, "2025-01-01");
		expect(result.mwr).not.toBeNull();
		expect(result.mwr!).toBeCloseTo(-0.2, 2);
		expect(result.isAnnualized).toBe(true);
		expect(result.mwrError).toBeNull();
	});
	it("Test 8: auto terminal value -- terminal cash flow auto-appended", () => {
		const cashFlows = [
			{ date: "2024-01-01", amount: 1000, type: "buy" as const },
			{ date: "2024-07-01", amount: 200, type: "sell" as const },
		];
		const result = calculateXirr(cashFlows, 900, "2025-01-01");
		expect(result.mwr).not.toBeNull();
		expect(result.isAnnualized).toBe(true);
		expect(result.mwrError).toBeNull();
		expect(result.mwr!).toBeCloseTo(0.1, 1);
	});
	it("Test 9: rate clamping -- extreme values kept within bounds", () => {
		const cashFlows = [
			{ date: "2024-01-01", amount: 10000, type: "buy" as const },
		];
		const result = calculateXirr(cashFlows, 1, "2025-01-01");
		if (result.mwr !== null) {
			expect(result.mwr).toBeGreaterThanOrEqual(-0.999);
			expect(result.mwr).toBeLessThanOrEqual(10.0);
		} else {
			expect(result.mwrError).toBe("no_convergence");
		}
	});
	it("Test 10: precision -- result matches to within 0.001", () => {
		const cashFlows = [
			{ date: "2025-01-01", amount: 5000, type: "buy" as const },
		];
		const result = calculateXirr(cashFlows, 5500, "2026-01-01");
		expect(result.mwr).not.toBeNull();
		expect(result.mwr!).toBeCloseTo(0.1, 3);
	});
	it("PERF-04: < 1y round-trip yields a null MWR and no raw period return", () => {
		const cashFlows = [
			{ date: "2025-01-01", amount: 1000, type: "buy" as const },
			{ date: "2025-02-01", amount: 1000, type: "sell" as const },
			{ date: "2025-03-01", amount: 1000, type: "buy" as const },
		];
		const result = calculateXirr(cashFlows, 1050, "2025-06-01");
		expect(result.isAnnualized).toBe(false);
		expect(result.mwr).toBeNull();
		expect(result.rawPeriodReturn).toBeUndefined();
	});
});
describe("MATH-13 — no false convergence at the clamp bounds", () => {
	it("reports no_convergence when the true IRR exceeds the +1000% bound (NPV ≠ 0)", () => {
		const result = calculateXirr(
			[{ date: "2020-01-01", type: "buy", amount: 100 }],
			1000000,
			"2021-01-01",
		);
		expect(result.mwr).toBeNull();
		expect(result.mwrError).toBe("no_convergence");
	});
});
describe("PERF-2 — valuationDate consistency (terminal flow + day-count)", () => {
	it("annualizes exactly at a 365-day valuation horizon (boundary uses valuationDate)", () => {
		const result = calculateXirr(
			[{ date: "2025-01-01", amount: 1000, type: "buy" as const }],
			1100,
			"2026-01-01",
		);
		expect(result.isAnnualized).toBe(true);
		expect(result.mwr!).toBeCloseTo(0.1, 3);
	});
	it("a one-day valuationDate shift moves the annualized rate (proves the skew is real)", () => {
		const flows = [{ date: "2025-01-01", amount: 1000, type: "buy" as const }];
		const atSnapshot = calculateXirr(flows, 1100, "2026-01-01");
		const atToday = calculateXirr(flows, 1100, "2026-01-02");
		expect(atSnapshot.mwr).not.toBeNull();
		expect(atToday.mwr).not.toBeNull();
		expect(atToday.mwr!).toBeLessThan(atSnapshot.mwr!);
		expect(atSnapshot.mwr! - atToday.mwr!).toBeGreaterThan(0);
	});
});
describe("calculateXirr — dividend-inclusive (DIV2)", () => {
	it("does not annualize a < 1y dividend history (MWR null, no raw return)", () => {
		const result = calculateXirr(DIVIDEND_SHORT.cashFlows, 100, "2025-04-01");
		expect(result.mwr).toBeNull();
		expect(result.rawPeriodReturn).toBeUndefined();
		expect(result.isAnnualized).toBe(false);
	});
	it("lifts the annualized MWR above the dividend-removed baseline (> 1y)", () => {
		const withDiv = calculateXirr(
			DIVIDEND_FLAT_1Y.cashFlows,
			100,
			"2025-02-01",
		);
		const noDiv = calculateXirr(
			DIVIDEND_FLAT_1Y.cashFlowsNoDividend,
			100,
			"2025-02-01",
		);
		expect(withDiv.mwr).not.toBeNull();
		expect(noDiv.mwr).not.toBeNull();
		expect(withDiv.mwr!).toBeGreaterThan(noDiv.mwr!);
		expect(withDiv.mwr!).toBeGreaterThan(0);
	});
});
