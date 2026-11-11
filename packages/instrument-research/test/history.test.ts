import { describe, expect, it } from "vitest";
import {
	evaluateInstrumentResearch,
	ResearchInputError,
} from "../src/index.js";
import { daily, research, source } from "./fixtures.js";

describe("source-aware instrument history", () => {
	it("accepts a caller's GBP listing and CHF reporting quotes with explicit multiplication", () => {
		const input = research();
		input.reportingCurrency = "CHF";
		input.history!.points = daily(undefined, undefined, () => 100);
		input.history!.fx = {
			baseCurrency: "GBP",
			quoteCurrency: "CHF",
			source: source("fx"),
			points: daily(undefined, undefined, (i) => 1 + i / 366),
		};
		const output = evaluateInstrumentResearch(input);
		expect(output.history.metrics?.cumulativeReturn).toBeCloseTo(1, 12);
		expect(output.history.metrics?.quality.availability).toBe("available");
		expect(output.snapshot.request.listing.currency).toBe("GBP");
	});
	it("calculates only the selected calendar window and sorts unordered observations", () => {
		const input = research();
		input.from = "2024-03-01";
		input.to = "2024-03-31";
		input.history!.points.reverse();
		const m = evaluateInstrumentResearch(input).history.metrics!;
		expect(m.actualFrom).toBe("2024-03-01");
		expect(m.actualTo).toBe("2024-03-31");
		expect(m.observations).toBe(31);
		expect(m.cumulativeReturn).toBeCloseTo(109 / 106 - 1, 12);
		expect(m.cagr).toBeNull();
	});
	it("preserves an explicit price-only basis without inventing distributions", () => {
		const input = research();
		input.history!.basis = "price";
		const output = evaluateInstrumentResearch(input);
		expect(output.history.metrics?.basis).toBe("price");
		expect(output.history.reasons).toContain(
			"price_return_excludes_distributions",
		);
	});
	it.each([
		"pre_inception",
		"interior_gap",
		"stale_endpoint",
		"sparse",
	])("withholds full-period metrics for %s history", (mode) => {
		const input = research();
		input.investment = { lumpSum: 100, monthlyContribution: 10 };
		if (mode === "pre_inception")
			input.history!.points = input.history!.points.slice(60);
		if (mode === "interior_gap") input.history!.points.splice(100, 30);
		if (mode === "stale_endpoint")
			input.history!.points = input.history!.points.slice(0, -30);
		if (mode === "sparse")
			input.history!.points = [
				input.history!.points[0]!,
				input.history!.points.at(-1)!,
			];
		const output = evaluateInstrumentResearch(input);
		expect(output.history.metrics?.cumulativeReturn).toBeNull();
		expect(output.history.metrics?.quality.availability).toBe("partial");
		expect(output.history.investment).toBeNull();
		expect(output.history.reasons).toContain(
			"investment_withheld_for_history_coverage",
		);
	});
	it("never uses a future FX quote or carries a rate beyond seven days", () => {
		const input = research();
		input.reportingCurrency = "CHF";
		input.history!.fx = {
			baseCurrency: "GBP",
			quoteCurrency: "CHF",
			source: source("fx"),
			points: [{ date: "2024-02-01", value: 2 }],
		};
		const output = evaluateInstrumentResearch(input);
		expect(output.history.metrics?.observations).toBe(8);
		expect(output.history.metrics?.actualFrom).toBe("2024-02-01");
		expect(output.history.metrics?.cumulativeReturn).toBeNull();
		expect(output.history.reasons).toContain("dated_fx_observations_missing");
	});
	it("keeps missing FX and missing history explicit", () => {
		const input = research();
		input.reportingCurrency = "CHF";
		expect(evaluateInstrumentResearch(input).history.reasons).toContain(
			"direct_fx_history_missing",
		);
		input.history = null;
		expect(evaluateInstrumentResearch(input).history.reasons).toEqual([
			"no_history",
		]);
	});
	it("measures a drawdown episode and its recovery, with no phantom episode on a rising series", () => {
		const input = research();
		input.history!.points = daily(undefined, undefined, (i) =>
			i < 50 ? 100 : i < 100 ? 120 : i < 200 ? 60 : 120,
		);
		const m = evaluateInstrumentResearch(input).history.metrics!;
		expect(m.maxDrawdown).toBe(-0.5);
		expect(m.peakDate).toBe(input.history!.points[50]!.date);
		expect(m.troughDate).toBe(input.history!.points[100]!.date);
		expect(m.recoveryDate).toBe(input.history!.points[200]!.date);
		const rising = evaluateInstrumentResearch(research()).history.metrics!;
		expect(rising.maxDrawdown).toBe(0);
		expect(rising.peakDate).toBeNull();
		expect(rising.recoveryDate).toBeNull();
	});
	it("withholds volatility for a valid two-observation window instead of failing", () => {
		const input = research();
		input.from = "2024-01-01";
		input.to = "2024-01-02";
		input.history!.points = daily(input.from, input.to, (i) => 100 + i);
		const m = evaluateInstrumentResearch(input).history.metrics!;
		expect(m.quality.availability).toBe("available");
		expect(m.observations).toBe(2);
		expect(m.cumulativeReturn).toBeCloseTo(0.01, 12);
		expect(m.maxDrawdown).toBe(0);
		expect(m.annualizedVolatility).toBeNull();
	});
	it("refuses duplicate or nonpositive prices rather than repairing source history", () => {
		const input = research();
		input.history!.points.push({ ...input.history!.points[0]! });
		expect(() => evaluateInstrumentResearch(input)).toThrow(ResearchInputError);
		input.history!.points.pop();
		input.history!.points[0]!.value = 0;
		expect(() => evaluateInstrumentResearch(input)).toThrow(ResearchInputError);
	});
});

describe("historical contribution illustration", () => {
	it("clamps monthly anniversaries at month end, starts month zero and preserves the cash ledger", () => {
		const input = research();
		input.from = "2024-01-31";
		input.to = "2024-05-31";
		input.history!.points = daily(input.from, input.to, () => 100);
		input.investment = { lumpSum: 1000, monthlyContribution: 100 };
		const result = evaluateInstrumentResearch(input).history.investment!;
		expect(result.contributions.map((c) => c.date)).toEqual([
			"2024-01-31",
			"2024-01-31",
			"2024-02-29",
			"2024-03-31",
			"2024-04-30",
			"2024-05-31",
		]);
		expect(result.totalContributed).toBe(1500);
		expect(result.endingValue).toBe(1500);
		expect(result.contributionReturn).toBe(0);
		expect(result.annualizedMoneyWeightedReturn).toBeNull();
		expect(result.moneyWeightedReason).toBe("less_than_one_year");
	});
	it("solves a one-year doubling without false convergence at an upper clamp", () => {
		const input = research();
		input.from = "2023-01-01";
		input.to = "2024-01-01";
		input.history!.points = daily(
			input.from,
			input.to,
			(i) => 100 * (1 + i / 365),
		);
		input.investment = { lumpSum: 1000, monthlyContribution: 0 };
		const result = evaluateInstrumentResearch(input).history.investment!;
		expect(result.endingValue).toBe(2000);
		expect(result.annualizedMoneyWeightedReturn).toBeCloseTo(1, 8);
		input.history!.points = daily(
			input.from,
			input.to,
			(i) => 100 * (1 + (i / 365) * 20),
		);
		const high = evaluateInstrumentResearch(input).history.investment!;
		expect(high.annualizedMoneyWeightedReturn).toBeNull();
		expect(high.moneyWeightedReason).toBe(
			"money_weighted_rate_outside_supported_bracket",
		);
	});
	it("recovers the annual rate from a daily growth curve with dated recurring purchases", () => {
		const input = research();
		input.from = "2023-01-31";
		input.to = "2024-01-31";
		input.history!.points = daily(
			input.from,
			input.to,
			(i) => 100 * 1.1 ** (i / 365),
		);
		input.investment = { lumpSum: 700, monthlyContribution: 123.456 };
		const result = evaluateInstrumentResearch(input).history.investment!;
		expect(result.annualizedMoneyWeightedReturn).toBeCloseTo(0.1, 8);
		expect(result.totalContributed).toBeCloseTo(700 + 13 * 123.456, 8);
	});
	it("stops the monthly schedule at the final supported calendar year", () => {
		const input = research();
		input.from = "9999-12-01";
		input.to = "9999-12-31";
		input.asOf = "9999-12-31T23:59:59Z";
		input.history!.source.observedAt = input.asOf;
		input.history!.points = daily(input.from, input.to, () => 100);
		input.investment = { lumpSum: 1000, monthlyContribution: 100 };
		expect(
			evaluateInstrumentResearch(input).history.investment?.totalContributed,
		).toBe(1100);
	});
	it("keeps zero contributions explicit and guards overflowing illustrations", () => {
		const input = research();
		input.investment = { lumpSum: 0, monthlyContribution: 0 };
		const zero = evaluateInstrumentResearch(input).history.investment;
		expect(zero).toMatchObject({
			totalContributed: 0,
			endingValue: 0,
			contributionReturn: null,
			annualizedMoneyWeightedReturn: null,
			moneyWeightedReason: "no_contributions",
		});
		input.investment = { lumpSum: 1e12, monthlyContribution: 0 };
		expect(() => evaluateInstrumentResearch(input)).toThrow("amount bound");
	});
});
