import {
	evaluatePerformance,
	type PerformanceRequest,
	type PerformancePosition,
} from "../src/index.js";
export const points = (values: readonly [string, number][]) =>
	values.map(([date, value]) => ({ date, value }));
export const position = (
	overrides: Partial<PerformancePosition> = {},
): PerformancePosition => ({
	id: "fund",
	label: "Synthetic fund",
	quoteCurrency: "EUR",
	currentQuantity: 100,
	anchorDate: "2026-01-01",
	priceSource: "Synthetic test fixture",
	annualExpenseRatio: 0.01,
	prices: points([
		["2026-01-01", 100],
		["2026-01-03", 100],
		["2026-01-05", 110],
	]),
	...overrides,
});
export const request = (
	overrides: Partial<PerformanceRequest> = {},
): PerformanceRequest => ({
	reportingCurrency: "EUR",
	asOfDate: "2026-01-05",
	ledgerComplete: true,
	snapshots: points([
		["2026-01-01", 10_000],
		["2026-01-03", 10_000],
		["2026-01-05", 11_000],
	]),
	positions: [position()],
	effects: [
		{
			id: "initial",
			holdingId: "fund",
			date: "2026-01-01",
			type: "buy",
			quantity: 100,
		},
	],
	cashFlows: [],
	recordedCosts: [],
	...overrides,
});
export function calculation(input: PerformanceRequest) {
	const result = evaluatePerformance(input);
	if (!result.calculation)
		throw new Error(`Unexpected refusal: ${result.reasonCodes}`);
	return result.calculation;
}
