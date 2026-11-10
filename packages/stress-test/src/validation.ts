import type { StressRequest } from "./types.js";
import { MAX_SUPPORTED_WEALTH } from "./limits.js";

export class StressInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StressInputError";
	}
}

function requireInput(condition: unknown, message: string): asserts condition {
	if (!condition) throw new StressInputError(message);
}

function requireShape(
	value: unknown,
	keys: readonly string[],
	label: string,
): void {
	requireInput(
		value && typeof value === "object" && !Array.isArray(value),
		`${label} must be an object`,
	);
	const prototype = Object.getPrototypeOf(value);
	requireInput(
		prototype === Object.prototype || prototype === null,
		`${label} must be plain data`,
	);
	requireInput(
		Reflect.ownKeys(value).every(
			(key) => typeof key === "string" && keys.includes(key),
		),
		`${label} contains an unsupported field`,
	);
}

/** Snapshots must survive JSON storage without losing or changing supplied evidence. */
function requireSerializable(
	value: unknown,
	ancestors = new Set<object>(),
): void {
	if (value == null || typeof value === "string" || typeof value === "boolean")
		return;
	if (typeof value === "number") {
		requireInput(Number.isFinite(value), "Snapshot numbers must be finite");
		return;
	}
	requireInput(typeof value === "object", "Snapshot values must be JSON data");
	const array = Array.isArray(value);
	const prototype = Object.getPrototypeOf(value);
	requireInput(
		array
			? prototype === Array.prototype
			: prototype === Object.prototype || prototype === null,
		"Snapshot values must be plain JSON data",
	);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(value)) {
		requireInput(typeof key === "string", "Snapshot keys must be strings");
		if (array && key === "length") continue;
		const descriptor = descriptors[key];
		requireInput(
			descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable,
			"Snapshot fields must be enumerable data properties",
		);
	}
	if (array)
		requireInput(
			Object.keys(value).length === value.length &&
				Array.from({ length: value.length }, (_, i) =>
					Object.hasOwn(value, i),
				).every(Boolean),
			"Snapshot arrays must be dense and contain only indexed values",
		);
	requireInput(
		!ancestors.has(value),
		"Snapshot inputs must not contain cycles",
	);
	ancestors.add(value);
	for (const child of Object.values(value))
		requireSerializable(child, ancestors);
	ancestors.delete(value);
}

export function validDate(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		Number.isFinite(Date.parse(value)) &&
		new Date(value).toISOString().slice(0, 10) === value
	);
}

export function validateRequest(input: StressRequest): void {
	requireShape(
		input,
		["holdings", "scenario", "baseCurrency", "histories"],
		"Request",
	);
	requireInput(
		input.baseCurrency === "EUR" || input.baseCurrency === "USD",
		"Reporting currency must be EUR or USD",
	);
	requireInput(
		Array.isArray(input.holdings) &&
			input.holdings.length > 0 &&
			input.holdings.length <= 200,
		"Provide between one and 200 holdings",
	);
	const ids = new Set<string>();
	let totalCents = 0;
	for (const holding of input.holdings) {
		requireShape(
			holding,
			[
				"holdingId",
				"isin",
				"ticker",
				"name",
				"sector",
				"assetClass",
				"instrumentType",
				"priceSource",
				"currentValue",
				"currency",
				"economicCurrency",
			],
			"Holding",
		);
		requireInput(
			typeof holding.holdingId === "string" &&
				holding.holdingId.trim() &&
				!ids.has(holding.holdingId),
			"Holding IDs must be nonempty and unique",
		);
		ids.add(holding.holdingId);
		requireInput(
			typeof holding.ticker === "string" &&
				typeof holding.name === "string" &&
				typeof holding.assetClass === "string",
			"Holding identity and class must be strings",
		);
		requireInput(
			holding.sector === null || typeof holding.sector === "string",
			"Sector must be a string or null",
		);
		if (holding.isin != null)
			requireInput(
				typeof holding.isin === "string" &&
					/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(holding.isin),
				"ISIN must have its canonical twelve-character shape",
			);
		if (holding.currency != null)
			requireInput(
				typeof holding.currency === "string" &&
					/^[A-Z]{3}$/.test(holding.currency),
				"Quote currency must be a three-letter code",
			);
		if (holding.instrumentType != null)
			requireInput(
				typeof holding.instrumentType === "string",
				"Instrument verdict must be a string",
			);
		if (holding.priceSource != null)
			requireInput(
				typeof holding.priceSource === "string",
				"Price provenance must be a string",
			);
		requireInput(
			Number.isFinite(holding.currentValue) && holding.currentValue >= 0,
			"Holding values must be finite and nonnegative in reporting currency",
		);
		requireInput(
			Math.abs(
				holding.currentValue * 100 - Math.round(holding.currentValue * 100),
			) < 1e-6,
			"Holding values must be rounded to reporting-currency cents",
		);
		totalCents += Math.round(holding.currentValue * 100);
		requireInput(
			Number.isSafeInteger(totalCents) &&
				totalCents <= MAX_SUPPORTED_WEALTH * 100,
			"Portfolio exceeds the supported wealth limit",
		);
		if (holding.economicCurrency != null) {
			const exposure = holding.economicCurrency;
			requireShape(
				exposure,
				["currency", "hedge", "source"],
				"Economic currency",
			);
			requireInput(
				typeof exposure.currency === "string" &&
					/^[A-Z]{3}$/.test(exposure.currency) &&
					typeof exposure.source === "string" &&
					exposure.source.trim(),
				"Economic currency requires a currency code and evidence source",
			);
			requireInput(
				exposure.hedge === "unhedged" || exposure.hedge === "hedged",
				"Unsupported hedge policy",
			);
		}
	}
	requireInput(totalCents > 0, "Portfolio must have positive valued exposure");
	const scenario = input.scenario;
	requireShape(
		scenario,
		[
			"key",
			"name",
			"description",
			"crisisType",
			"dateFrom",
			"dateTo",
			"peakToTroughPct",
			"recoveryMonths",
			"sectorShocks",
			"assetClassShocks",
			"currencyShocks",
			"provenance",
		],
		"Scenario",
	);
	for (const text of [scenario.name, scenario.description]) {
		requireShape(text, ["de", "en"], "Scenario text");
		requireInput(
			typeof text?.de === "string" && typeof text.en === "string",
			"Scenario text requires German and English strings",
		);
	}
	requireInput(
		typeof scenario.crisisType === "string" &&
			Number.isFinite(scenario.peakToTroughPct),
		"Scenario summary is required",
	);
	requireInput(
		scenario.recoveryMonths === null ||
			(Number.isSafeInteger(scenario.recoveryMonths) &&
				scenario.recoveryMonths >= 0),
		"Recovery months must be nonnegative or null",
	);
	requireInput(
		validDate(scenario.dateFrom) &&
			validDate(scenario.dateTo) &&
			scenario.dateFrom < scenario.dateTo,
		"Scenario requires an ordered calendar window",
	);
	requireInput(
		typeof scenario.key === "string" && scenario.key.trim(),
		"Scenario key is required",
	);
	for (const shocks of [
		scenario.sectorShocks,
		scenario.assetClassShocks,
		scenario.currencyShocks,
	]) {
		requireInput(
			shocks && typeof shocks === "object" && !Array.isArray(shocks),
			"Scenario shock maps are required",
		);
		requireShape(shocks, Object.keys(shocks), "Shock map");
		for (const shock of Object.values(shocks))
			requireInput(
				typeof shock === "number" && Number.isFinite(shock) && shock >= -1,
				"Scenario shocks must be finite and at least -100%",
			);
	}
	requireShape(
		scenario.provenance,
		["approximate", "methodology", "sources", "reviewedAt"],
		"Scenario provenance",
	);
	requireInput(
		scenario.provenance &&
			typeof scenario.provenance.approximate === "boolean" &&
			typeof scenario.provenance.methodology === "string" &&
			scenario.provenance.methodology.trim() &&
			Array.isArray(scenario.provenance.sources) &&
			scenario.provenance.sources.length > 0 &&
			scenario.provenance.sources.every(
				(s) => typeof s === "string" && s.trim(),
			) &&
			validDate(scenario.provenance.reviewedAt),
		"Scenario methodology, source provenance and review date are required",
	);
	requireInput(
		input.histories === undefined ||
			(Array.isArray(input.histories) && input.histories.length <= 200),
		"At most 200 history windows are supported",
	);
	for (const history of input.histories ?? []) {
		requireShape(
			history,
			["ticker", "isin", "currency", "basis", "start", "end", "source", "fx"],
			"History",
		);
		requireInput(
			typeof history.ticker === "string" &&
				typeof history.isin === "string" &&
				typeof history.currency === "string",
			"History identity must include ticker, ISIN and currency strings",
		);
		for (const endpoint of [history.start, history.end])
			if (endpoint != null)
				requireShape(endpoint, ["date", "value"], "Price endpoint");
		if (history.fx != null) {
			requireShape(history.fx, ["baseCurrency", "from", "to"], "Historical FX");
			for (const fixing of [history.fx.from, history.fx.to])
				if (fixing != null)
					requireShape(fixing, ["effectiveDate", "rate"], "FX fixing");
		}
	}
	requireSerializable(input);
}
