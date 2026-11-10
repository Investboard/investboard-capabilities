import { describe, expect, it } from "vitest";
import { evaluateInstrumentResearch } from "../src/index.js";
import { listing, research, source, statement } from "./fixtures.js";

function reports() {
	const input = research();
	input.history = null;
	input.statements = [
		statement("income", {
			revenue: 1000,
			netIncome: 100,
			operatingIncome: 140,
			dilutedEps: 2,
		}),
		statement("balance", { totalAssets: 1000, totalDebt: 200, equity: 400 }),
		statement("cash_flow", {
			operatingCashFlow: 150,
			capitalExpenditure: -50,
			freeCashFlow: 100,
		}),
	];
	input.capitalizations = [
		{
			listing: { ...listing },
			periodEnd: "2024-12-31",
			fiscalYear: "2024",
			currency: "USD",
			value: 2000,
			source: source("capitalization"),
		},
	];
	return input;
}
describe("reported statement evidence and ratios", () => {
	it("combines only period-matched evidence and retains reporting currency and signed source values", () => {
		const input = reports();
		input.reportingCurrency = "CHF";
		const result = evaluateInstrumentResearch(input).fundamentals.periods[0]!;
		expect(result.currency).toBe("USD");
		expect(result.values.capitalExpenditure).toBe(-50);
		expect(result.netMargin).toBe(0.1);
		expect(result.debtToEquity).toBe(0.5);
		expect(result.valuation).toEqual({
			marketCap: 2000,
			priceToEarnings: 20,
			priceToBook: 5,
			freeCashFlowYield: 0.05,
		});
		expect(result.statements[0]!.filingDate).toBe("2025-02-01");
		expect(result.statements[0]!.source.revision).toBe("synthetic-v1");
		expect(result.reasons).toContain("original_publication_vintage_unverified");
	});
	it.each([
		"currency",
		"fiscalYear",
		"period",
		"periodEnd",
	] as const)("does not join a balance sheet with different %s", (dimension) => {
		const input = reports();
		const balance = input.statements[1]!;
		if (dimension === "currency") balance.currency = "EUR";
		if (dimension === "fiscalYear") balance.fiscalYear = "2023";
		if (dimension === "period") balance.period = "Q4";
		if (dimension === "periodEnd") balance.periodEnd = "2024-12-30";
		const periods = evaluateInstrumentResearch(input).fundamentals.periods;
		const income = periods.find((p) =>
			p.statements.some((s) => s.kind === "income"),
		)!;
		expect(income.values.equity).toBeNull();
		expect(income.debtToEquity).toBeNull();
		expect(income.valuation.priceToBook).toBeNull();
		expect(periods).toHaveLength(2);
	});
	it("keeps negative earnings, capex and FCF signed, without positive-denominator ratios or invented FCF", () => {
		const input = reports();
		input.statements[0]!.values.netIncome = -100;
		input.statements[1]!.values.equity = -400;
		input.statements[2]!.values.freeCashFlow = -50;
		const result = evaluateInstrumentResearch(input).fundamentals.periods[0]!;
		expect(result.netMargin).toBe(-0.1);
		expect(result.debtToEquity).toBeNull();
		expect(result.valuation.priceToEarnings).toBeNull();
		expect(result.valuation.priceToBook).toBeNull();
		expect(result.valuation.freeCashFlowYield).toBe(-0.025);
		delete input.statements[2]!.values.freeCashFlow;
		expect(
			evaluateInstrumentResearch(input).fundamentals.periods[0]!.values
				.freeCashFlow,
		).toBeNull();
	});
	it("does not annualize quarterly flows or attach a differently dated/current capitalization", () => {
		const input = reports();
		for (const row of input.statements) row.period = "Q4";
		const result = evaluateInstrumentResearch(input).fundamentals.periods[0]!;
		expect(result.netMargin).toBe(0.1);
		expect(result.valuation.priceToEarnings).toBeNull();
		expect(result.valuation.freeCashFlowYield).toBeNull();
		expect(result.valuation.priceToBook).toBe(5);
		input.capitalizations[0]!.periodEnd = "2025-01-01";
		expect(
			evaluateInstrumentResearch(input).fundamentals.periods[0]!.valuation
				.marketCap,
		).toBeNull();
	});
	it("retains partial fragments, unknown source dates, and excludes periods after the requested end", () => {
		const input = reports();
		input.statements = [input.statements[1]!];
		input.statements[0]!.filingDate = null;
		input.statements[0]!.acceptedAt = null;
		const result = evaluateInstrumentResearch(input).fundamentals.periods[0]!;
		expect(result.values.equity).toBe(400);
		expect(result.values.netIncome).toBeNull();
		expect(result.reasons).toContain("filing_date_unknown");
		input.to = "2024-12-30";
		expect(evaluateInstrumentResearch(input).fundamentals.periods).toEqual([]);
	});
	it("refuses non-finite derived ratios even when the history fragment is absent", () => {
		const input = reports();
		input.statements[0]!.values.revenue = 1e-300;
		input.statements[0]!.values.netIncome = 1e15;
		expect(() => evaluateInstrumentResearch(input)).toThrow(
			"finite numeric precision",
		);
	});
});
