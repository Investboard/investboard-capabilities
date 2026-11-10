import type {
	InstrumentHistory,
	Listing,
	PairRequest,
	Point,
	ResearchRequest,
	Source,
	Statement,
} from "../src/index.js";
export const listing: Listing = {
	symbol: "SYNTH.L",
	isin: "GB0000000001",
	exchange: "XLON",
	currency: "GBP",
	kind: "stock",
};
export const other: Listing = {
	...listing,
	symbol: "SYNTH.SW",
	exchange: "XSWX",
	currency: "CHF",
};
export function source(id = "synthetic"): Source {
	return {
		id,
		revision: "synthetic-v1",
		observedAt: "2026-01-02T12:00:00Z",
		publishedAt: null,
		url: null,
	};
}
export function daily(
	from = "2024-01-01",
	to = "2025-01-01",
	value: (i: number) => number = (i) => 100 + i / 10,
): Point[] {
	const result: Point[] = [];
	for (
		let day = Date.parse(from), i = 0;
		day <= Date.parse(to);
		day += 864e5, i++
	)
		result.push({
			date: new Date(day).toISOString().slice(0, 10),
			value: value(i),
		});
	return result;
}
export function history(
	identity = listing,
	points = daily(),
): InstrumentHistory {
	return {
		listing: { ...identity },
		basis: "distribution_adjusted",
		source: source(),
		points,
		fx: null,
	};
}
export function research(): ResearchRequest {
	return {
		asOf: "2026-01-03T00:00:00Z",
		from: "2024-01-01",
		to: "2025-01-01",
		vintage: "retained",
		listing: { ...listing },
		reportingCurrency: "GBP",
		history: history(),
		statements: [],
		capitalizations: [],
		investment: null,
	};
}
export function pair(): PairRequest {
	const left = history(
		listing,
		daily("2023-12-20", "2025-01-01", (i) => 100 * (1 + i / 10000) ** (i / 30)),
	);
	const right = history(
		other,
		left.points.map((p) => ({ ...p, value: p.value * 2 })),
	);
	return {
		asOf: "2025-01-02T00:00:00Z",
		vintage: "retained",
		listings: [{ ...listing }, { ...other }],
		reportingCurrency: "CHF",
		series: [
			{
				...left,
				source: { ...source(), observedAt: "2025-01-01T23:00:00Z" },
				fx: {
					baseCurrency: "GBP",
					quoteCurrency: "CHF",
					source: { ...source("fx"), observedAt: "2025-01-01T23:00:00Z" },
					points: daily("2023-12-20", "2025-01-01", () => 1),
				},
			},
			{ ...right, source: { ...source(), observedAt: "2025-01-01T23:00:00Z" } },
		],
		horizons: [1],
	};
}
export function statement(
	kind: Statement["kind"],
	values: Statement["values"],
): Statement {
	return {
		listing: { ...listing },
		kind,
		periodEnd: "2024-12-31",
		fiscalYear: "2024",
		period: "FY",
		currency: "USD",
		filingDate: "2025-02-01",
		acceptedAt: "2025-02-01T12:00:00Z",
		source: source(kind),
		values,
	};
}
