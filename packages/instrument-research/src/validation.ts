import type {
	Listing,
	PairRequest,
	ResearchRequest,
	Source,
	InstrumentHistory,
	Statement,
} from "./types.js";
import { LIMITS } from "./limits.js";
import {
	array,
	date,
	requireInput,
	requireJson,
	shape,
	text,
} from "./internal/input-guards.js";
export { ResearchInputError } from "./internal/input-guards.js";

export function listingKey(value: Listing): string {
	return JSON.stringify([
		value.symbol,
		value.isin,
		value.exchange,
		value.currency,
		value.kind,
	]);
}
function currency(value: unknown): asserts value is string {
	requireInput(
		typeof value === "string" && /^[A-Z]{3}$/.test(value),
		"Currencies must be explicit three-letter uppercase codes",
	);
}
function timestamp(value: unknown): asserts value is string {
	requireInput(
		typeof value === "string" &&
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value),
		"Timestamps must be UTC ISO dates with seconds and optional milliseconds",
	);
	date(value.slice(0, 10));
	requireInput(
		Number.isFinite(Date.parse(value)) &&
			new Date(value).toISOString().replace(".000Z", "Z") ===
				value.replace(".000Z", "Z"),
		"Timestamp is invalid",
	);
}
function listing(value: unknown): asserts value is Listing {
	shape(value, ["symbol", "isin", "exchange", "currency", "kind"], "Listing");
	text(value.symbol);
	text(value.exchange);
	requireInput(
		value.symbol === value.symbol.trim() &&
			value.exchange === value.exchange.trim(),
		"Listing identifiers cannot have surrounding whitespace",
	);
	requireInput(
		typeof value.isin === "string" &&
			/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value.isin),
		"A listing requires an explicit ISIN",
	);
	currency(value.currency);
	requireInput(
		value.kind === "stock" || value.kind === "fund",
		"Listing kind must be stock or fund",
	);
}
function source(value: unknown, asOf: string): asserts value is Source {
	shape(
		value,
		["id", "revision", "observedAt", "publishedAt", "url"],
		"Source",
	);
	text(value.id);
	text(value.revision);
	timestamp(value.observedAt);
	requireInput(
		Date.parse(value.observedAt) <= Date.parse(asOf),
		"Source was observed after the snapshot cutoff",
	);
	if (value.publishedAt !== null) {
		timestamp(value.publishedAt);
		requireInput(
			Date.parse(value.publishedAt) <= Date.parse(value.observedAt),
			"Source publication cannot follow its observation",
		);
	}
	if (value.url !== null) {
		requireInput(
			typeof value.url === "string" && value.url.length <= 2048,
			"Source URL must be text or null",
		);
		let valid = false;
		try {
			const url = new URL(value.url);
			valid =
				["https:", "http:"].includes(url.protocol) &&
				!url.username &&
				!url.password;
		} catch {}
		requireInput(
			valid,
			"Source URLs must be absolute HTTP(S) URLs without credentials",
		);
	}
}
function positive(value: unknown): asserts value is number {
	requireInput(
		typeof value === "number" &&
			Number.isFinite(value) &&
			value >= LIMITS.minimumPositiveValue &&
			value <= LIMITS.maximumPositiveValue,
		"History and FX values exceed the positive numeric bounds",
	);
}
function points(value: unknown, observedAt: string): void {
	array(value, LIMITS.pointsPerSeries);
	const dates = new Set<string>();
	for (const point of value) {
		shape(point, ["date", "value"], "Observation");
		date(point.date);
		positive(point.value);
		requireInput(
			point.date <= observedAt.slice(0, 10),
			"Observation date follows source observation",
		);
		requireInput(
			!dates.has(point.date),
			"History dates must be unique, including identical duplicates",
		);
		dates.add(point.date);
	}
}
function history(
	value: unknown,
	expected: Listing,
	reportingCurrency: string,
	asOf: string,
): asserts value is InstrumentHistory {
	shape(value, ["listing", "basis", "source", "points", "fx"], "History");
	listing(value.listing);
	requireInput(
		listingKey(value.listing) === listingKey(expected),
		"History belongs to a different exact listing",
	);
	requireInput(
		value.basis === "price" || value.basis === "distribution_adjusted",
		"History return basis must be explicit",
	);
	source(value.source, asOf);
	points(value.points, value.source.observedAt);
	if (value.fx !== null) {
		const fx = value.fx;
		shape(
			fx,
			["baseCurrency", "quoteCurrency", "source", "points"],
			"FX history",
		);
		currency(fx.baseCurrency);
		currency(fx.quoteCurrency);
		requireInput(
			expected.currency !== reportingCurrency &&
				fx.baseCurrency === expected.currency &&
				fx.quoteCurrency === reportingCurrency,
			"FX must directly quote reporting currency per listing-currency unit",
		);
		source(fx.source, asOf);
		points(fx.points, fx.source.observedAt);
	}
}
const valueKeys = {
	income: ["revenue", "netIncome", "operatingIncome", "dilutedEps"],
	balance: ["totalAssets", "totalDebt", "equity"],
	cash_flow: ["operatingCashFlow", "capitalExpenditure", "freeCashFlow"],
} as const;
function statement(
	value: unknown,
	expected: Listing,
	asOf: string,
): asserts value is Statement {
	shape(
		value,
		[
			"listing",
			"kind",
			"periodEnd",
			"fiscalYear",
			"period",
			"currency",
			"filingDate",
			"acceptedAt",
			"source",
			"values",
		],
		"Statement",
	);
	listing(value.listing);
	requireInput(
		listingKey(value.listing) === listingKey(expected),
		"Statement belongs to another listing",
	);
	requireInput(
		value.kind === "income" ||
			value.kind === "balance" ||
			value.kind === "cash_flow",
		"Statement kind is unsupported",
	);
	date(value.periodEnd);
	currency(value.currency);
	source(value.source, asOf);
	requireInput(
		typeof value.fiscalYear === "string" && /^\d{4}$/.test(value.fiscalYear),
		"Fiscal year must be explicit",
	);
	requireInput(
		["FY", "Q1", "Q2", "Q3", "Q4"].includes(String(value.period)),
		"Statement period must be explicit",
	);
	requireInput(
		value.periodEnd <= value.source.observedAt.slice(0, 10),
		"Statement period follows source observation",
	);
	if (value.filingDate !== null) {
		date(value.filingDate);
		requireInput(
			value.filingDate >= value.periodEnd &&
				value.filingDate <= value.source.observedAt.slice(0, 10),
			"Statement filing date is inconsistent",
		);
	}
	if (value.acceptedAt !== null) {
		timestamp(value.acceptedAt);
		requireInput(
			value.acceptedAt.slice(0, 10) >= value.periodEnd &&
				Date.parse(value.acceptedAt) <= Date.parse(value.source.observedAt),
			"Statement acceptance date is inconsistent",
		);
	}
	shape(value.values, valueKeys[value.kind], "Statement values");
	for (const amount of Object.values(value.values))
		requireInput(
			amount === null ||
				(typeof amount === "number" &&
					Number.isFinite(amount) &&
					Math.abs(amount) <= LIMITS.absoluteStatementValue),
			"Statement values must be finite signed amounts or null",
		);
}
function header(input: Record<string, unknown>) {
	timestamp(input.asOf);
	currency(input.reportingCurrency);
	requireInput(
		input.vintage === "retained" || input.vintage === "original_public",
		"Vintage must be explicit",
	);
}
export function validateResearch(
	input: unknown,
): asserts input is ResearchRequest {
	requireJson(input);
	shape(
		input,
		[
			"asOf",
			"from",
			"to",
			"vintage",
			"listing",
			"reportingCurrency",
			"history",
			"statements",
			"capitalizations",
			"investment",
		],
		"Research request",
	);
	header(input);
	timestamp(input.asOf);
	currency(input.reportingCurrency);
	listing(input.listing);
	date(input.from);
	date(input.to);
	requireInput(
		input.from < input.to &&
			input.to <= input.asOf.slice(0, 10) &&
			(Date.parse(input.to) - Date.parse(input.from)) / 864e5 <=
				365.25 * LIMITS.maxCalendarYears,
		"Research window must be ordered, at most 100 years, and no later than the cutoff",
	);
	if (input.history !== null)
		history(input.history, input.listing, input.reportingCurrency, input.asOf);
	array(input.statements, LIMITS.statements);
	const periods = new Set<string>();
	for (const row of input.statements) {
		statement(row, input.listing, input.asOf);
		const key = JSON.stringify([
			row.kind,
			row.periodEnd,
			row.fiscalYear,
			row.period,
			row.currency,
		]);
		requireInput(!periods.has(key), "Ambiguous duplicate statement period");
		periods.add(key);
	}
	array(input.capitalizations, LIMITS.capitalizations);
	const caps = new Set<string>();
	for (const row of input.capitalizations) {
		shape(
			row,
			["listing", "periodEnd", "fiscalYear", "currency", "value", "source"],
			"Period capitalization",
		);
		listing(row.listing);
		requireInput(
			listingKey(row.listing) === listingKey(input.listing),
			"Capitalization belongs to another listing",
		);
		date(row.periodEnd);
		currency(row.currency);
		source(row.source, input.asOf);
		requireInput(
			row.periodEnd <= row.source.observedAt.slice(0, 10),
			"Capitalization date follows observation",
		);
		requireInput(
			typeof row.fiscalYear === "string" && /^\d{4}$/.test(row.fiscalYear),
			"Capitalization fiscal year is required",
		);
		requireInput(
			row.value === null ||
				(typeof row.value === "number" &&
					row.value >= 0 &&
					row.value <= LIMITS.absoluteStatementValue),
			"Period capitalization must be a nonnegative amount or null",
		);
		const key = JSON.stringify([row.periodEnd, row.fiscalYear, row.currency]);
		requireInput(!caps.has(key), "Ambiguous duplicate capitalization");
		caps.add(key);
	}
	if (input.investment !== null) {
		shape(input.investment, ["lumpSum", "monthlyContribution"], "Investment");
		for (const key of ["lumpSum", "monthlyContribution"] as const)
			requireInput(
				typeof input.investment[key] === "number" &&
					(input.investment[key] === 0 ||
						input.investment[key] >= LIMITS.minimumPositiveValue) &&
					input.investment[key] <= LIMITS.amount,
				"Investment amounts must be nonnegative and within the supported bound",
			);
	}
}
export function validatePair(input: unknown): asserts input is PairRequest {
	requireJson(input);
	shape(
		input,
		["asOf", "vintage", "listings", "reportingCurrency", "series", "horizons"],
		"Pair request",
	);
	header(input);
	timestamp(input.asOf);
	currency(input.reportingCurrency);
	array(input.listings, 2);
	array(input.series, 2);
	requireInput(
		input.listings.length === 2 && input.series.length === 2,
		"A pair requires exactly two listings and histories",
	);
	listing(input.listings[0]);
	listing(input.listings[1]);
	requireInput(
		listingKey(input.listings[0]) !== listingKey(input.listings[1]),
		"Choose distinct exact listings",
	);
	history(
		input.series[0],
		input.listings[0],
		input.reportingCurrency,
		input.asOf,
	);
	history(
		input.series[1],
		input.listings[1],
		input.reportingCurrency,
		input.asOf,
	);
	array(input.horizons, 4);
	requireInput(
		input.horizons.length > 0 &&
			new Set(input.horizons).size === input.horizons.length &&
			input.horizons.every(
				(h) => [1, 3, 5, 10].includes(Number(h)) && typeof h === "number",
			),
		"Choose distinct 1, 3, 5 or 10-year horizons",
	);
}
