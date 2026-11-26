import { requireInput as require, validateJsonInput } from "./input-data.js";
import { LIMITS } from "./limits.js";
import type {
	ConstituentInput,
	CorrelationRequest,
	PortfolioRequest,
} from "./types.js";

export { PortfolioInputError } from "./input-data.js";

export const ASSET_CLASSES: ReadonlySet<string> = new Set([
	"equities",
	"bonds",
	"gold",
	"crypto",
	"cash",
	"alternatives",
	"real_estate",
	"commodities",
]);

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, what: string): asserts value is string {
	require(typeof value === "string" &&
		value.trim() !== "", `${what} must be a non-empty string`);
}

function optionalText(value: unknown, what: string): void {
	if (value === undefined || value === null) return;
	text(value, what);
}

export function isIsoDate(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
		return false;
	const time = Date.parse(`${value}T00:00:00Z`);
	return (
		Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
	);
}

function date(value: unknown, what: string): asserts value is string {
	require(isIsoDate(value), `${what} must be a valid YYYY-MM-DD date`);
}

function evidenceDate(value: unknown, asOf: string, label: string): void {
	date(value, label);
	require(value <= asOf, label + " cannot be dated after the analysis");
}

function marketValue(value: unknown, label: string): void {
	require(typeof value === "number" &&
		value >= LIMITS.minMarketValue &&
		value <= LIMITS.maxMarketValue, label +
		" must be in the supported market range of " +
		LIMITS.minMarketValue +
		" to " +
		LIMITS.maxMarketValue);
}

function currency(value: unknown, what: string): asserts value is string {
	require(typeof value === "string" &&
		/^[A-Z]{3}$/.test(
			value,
		), `${what} must be a three-letter upper-case currency code`);
}

function amount(value: unknown, what: string): void {
	require(typeof value === "number" &&
		Number.isFinite(value) &&
		value >= 0 &&
		value <=
			LIMITS.amount, `${what} value must be a finite number between 0 and ${LIMITS.amount}`);
}

function fraction(value: unknown): boolean {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		value >= 0 &&
		value <= 1
	);
}

function assetClass(value: unknown, what: string, allowUnknown: boolean): void {
	require(typeof value === "string" &&
		(ASSET_CLASSES.has(value) ||
			(allowUnknown &&
				value === "unknown")), `${what} has an unsupported asset class`);
}

function constituents(list: unknown, fundId: string): void {
	require(Array.isArray(list), `Fund ${fundId}: constituents must be an array`);
	require(list.length <=
		LIMITS.constituentsPerFund, `Fund ${fundId}: more constituents than the limit of ${LIMITS.constituentsPerFund}`);
	for (const entry of list as ConstituentInput[]) {
		require(isObject(
			entry,
		), `Fund ${fundId}: each constituent must be an object`);
		keys(entry, ["id", "isin", "name", "weight"], "Constituent");
		text(entry.id, `Fund ${fundId}: constituent id`);
		text(entry.name, `Fund ${fundId}: constituent name`);
		optionalText(entry.isin, `Fund ${fundId}: constituent isin`);
		require(fraction(
			entry.weight,
		), `Fund ${fundId}: constituent weights are fractions of 1 (got ${String(entry.weight)} for ${String(entry.id)})`);
	}
}

function breakdown(list: unknown, what: string): void {
	if (list === undefined || list === null) return;
	require(Array.isArray(list), `${what} must be an array`);
	for (const entry of list) {
		require(isObject(entry), `${what} entries must be objects`);
		keys(entry, ["key", "weight"], what);
		text(entry.key, `${what} key`);
		require(fraction(entry.weight), `${what} weights are fractions of 1`);
	}
}

function keys(
	value: Record<string, unknown>,
	allowed: readonly string[],
	what: string,
): void {
	for (const key of Object.keys(value))
		require(allowed.includes(key), `${what}: unsupported field ${key}`);
}
function currencySource(value: unknown, asOf: string, what: string): void {
	require(isObject(value), `${what} must carry source provenance`);
	keys(value, ["reference", "asOf"], what);
	text(value.reference, `${what} reference`);
	evidenceDate(value.asOf, asOf, what + " asOf");
}
function currencyEvidence(value: unknown, asOf: string, what: string): void {
	if (value === undefined) return;
	require(isObject(value), `${what} must be an object`);
	keys(value, ["exposure", "hedge"], what);
	require(value.exposure !== undefined ||
		value.hedge !== undefined, `${what} must name exposure or hedge evidence`);
	if (value.exposure !== undefined) {
		const exposure = value.exposure;
		require(isObject(exposure), `${what} exposure must be an object`);
		keys(exposure, ["basis", "source", "buckets"], `${what} exposure`);
		require(exposure.basis ===
			"reported_economic_exposure", `${what} exposure basis must be reported_economic_exposure`);
		currencySource(exposure.source, asOf, `${what} exposure source`);
		require(Array.isArray(exposure.buckets) &&
			exposure.buckets.length <=
				200, `${what} exposure requires at most 200 currency buckets`);
		const seen = new Set<string>();
		let sum = 0;
		for (const bucket of exposure.buckets) {
			require(isObject(bucket), `${what} currency bucket must be an object`);
			keys(bucket, ["key", "weight"], what);
			currency(bucket.key, `${what} currency bucket key`);
			require(!seen.has(
				bucket.key,
			), `${what} duplicate currency ${bucket.key}`);
			seen.add(bucket.key);
			require(fraction(
				bucket.weight,
			), `${what} currency weights must be fractions of 1`);
			sum += bucket.weight as number;
		}
		require(sum <=
			1, `${what} exposure weights exceed 1; unknown mass is never normalized away`);
	}
	if (value.hedge !== undefined) {
		const hedge = value.hedge;
		require(isObject(hedge), `${what} hedge must be an object`);
		keys(
			hedge,
			["basis", "status", "targetCurrency", "source"],
			`${what} hedge`,
		);
		require(typeof hedge.status === "string" &&
			["unhedged", "full", "partial", "unknown"].includes(
				hedge.status,
			), `${what} unsupported hedge status`);
		require(hedge.basis ===
			"reported_hedge_policy", `${what} hedge basis must be reported_hedge_policy`);
		currencySource(hedge.source, asOf, `${what} hedge source`);
		if (hedge.status === "full" || hedge.targetCurrency !== undefined)
			currency(hedge.targetCurrency, `${what} hedge targetCurrency`);
		require(hedge.targetCurrency === undefined ||
			hedge.status === "full" ||
			hedge.status ===
				"partial", `${what} hedge target is only supported for full or partial policies`);
	}
}

export function validatePortfolioRequest(request: PortfolioRequest): void {
	validateJsonInput(request);
	require(isObject(request), "The request must be an object");
	keys(
		request,
		[
			"asOf",
			"baseCurrency",
			"holdings",
			"funds",
			"securities",
			"fundOverrides",
		],
		"Portfolio request",
	);
	date(request.asOf, "asOf");
	currency(request.baseCurrency, "baseCurrency");
	require(Array.isArray(request.holdings), "holdings must be an array");
	require(request.holdings.length <=
		LIMITS.holdings, `More holdings than the limit of ${LIMITS.holdings}`);
	const kinds = new Map<string, string>();
	for (const holding of request.holdings) {
		require(isObject(holding), "Each holding must be an object");
		keys(
			holding,
			[
				"id",
				"kind",
				"name",
				"isin",
				"ticker",
				"value",
				"listingCurrency",
				"listingCurrencySource",
				"currencyEvidence",
				"assetClass",
			],
			"Portfolio holding",
		);
		text(holding.id, "Holding id");
		require(!kinds.has(holding.id), `Duplicate holding id ${holding.id}`);
		require(holding.kind === "security" ||
			holding.kind === "fund" ||
			holding.kind ===
				"cash", `Holding ${holding.id}: kind must be security, fund or cash`);
		kinds.set(holding.id, holding.kind);
		text(holding.name, `Holding ${holding.id}: name`);
		optionalText(holding.isin, `Holding ${holding.id}: isin`);
		optionalText(holding.ticker, `Holding ${holding.id}: ticker`);
		if (holding.value !== null) amount(holding.value, `Holding ${holding.id}:`);
		currency(holding.listingCurrency, `Holding ${holding.id}: listingCurrency`);
		assetClass(holding.assetClass, `Holding ${holding.id}`, true);
		if (holding.listingCurrencySource !== undefined)
			currencySource(
				holding.listingCurrencySource,
				request.asOf,
				`Holding ${holding.id}: listing source`,
			);
		currencyEvidence(
			holding.currencyEvidence,
			request.asOf,
			`Holding ${holding.id}: currencyEvidence`,
		);
	}

	const funds = request.funds ?? [];
	require(Array.isArray(funds), "funds must be an array");
	require(funds.length <=
		LIMITS.funds, `More funds than the limit of ${LIMITS.funds}`);
	const seenFunds = new Set<string>();
	for (const fund of funds) {
		require(isObject(fund), "Each fund input must be an object");
		keys(
			fund,
			[
				"holdingId",
				"reportedClass",
				"holdings",
				"sectorBreakdown",
				"countryBreakdown",
				"readThrough",
			],
			"Fund",
		);
		text(fund.holdingId, "Fund holdingId");
		const kind = kinds.get(fund.holdingId);
		require(kind !==
			undefined, `Fund input ${fund.holdingId} names no holding`);
		require(kind ===
			"fund", `Fund input ${fund.holdingId} names a holding that is not a fund`);
		require(!seenFunds.has(
			fund.holdingId,
		), `Duplicate fund input for ${fund.holdingId}`);
		seenFunds.add(fund.holdingId);
		if (fund.reportedClass !== undefined && fund.reportedClass !== null)
			assetClass(
				fund.reportedClass,
				`Fund ${fund.holdingId}: reportedClass`,
				false,
			);
		require(isObject(
			fund.holdings,
		), `Fund ${fund.holdingId}: holdings must be an object`);
		const status = fund.holdings.status;
		require(status === "listed" ||
			status === "none_reported" ||
			status ===
				"missing", `Fund ${fund.holdingId}: holdings status must be listed, none_reported or missing`);
		keys(
			fund.holdings,
			status === "listed" ? ["status", "asOf", "constituents"] : ["status"],
			"Fund holdings",
		);
		if (fund.holdings.status === "listed") {
			evidenceDate(
				fund.holdings.asOf,
				request.asOf,
				`Fund ${fund.holdingId}: holdings asOf`,
			);
			constituents(fund.holdings.constituents, fund.holdingId);
		}
		breakdown(fund.sectorBreakdown, `Fund ${fund.holdingId}: sectorBreakdown`);
		breakdown(
			fund.countryBreakdown,
			`Fund ${fund.holdingId}: countryBreakdown`,
		);
		if (fund.readThrough !== undefined && fund.readThrough !== null) {
			const read = fund.readThrough;
			require(isObject(
				read,
			), `Fund ${fund.holdingId}: readThrough must be an object`);
			text(read.index, `Fund ${fund.holdingId}: readThrough index`);
			text(read.fundName, `Fund ${fund.holdingId}: readThrough fundName`);
			keys(
				read,
				["index", "fundName", "asOf", "constituents"],
				"Fund readThrough",
			);
			evidenceDate(
				read.asOf,
				request.asOf,
				`Fund ${fund.holdingId}: readThrough asOf`,
			);
			constituents(read.constituents, fund.holdingId);
		}
	}

	const securities = request.securities ?? [];
	require(Array.isArray(securities), "securities must be an array");
	require(securities.length <=
		LIMITS.securities, `More securities than the limit of ${LIMITS.securities}`);
	for (const security of securities) {
		require(isObject(security), "Each security profile must be an object");
		keys(
			security,
			[
				"isin",
				"name",
				"sector",
				"industry",
				"country",
				"issuerName",
				"assetClass",
			],
			"Security profile",
		);
		text(security.isin, "Security isin");
		for (const field of [
			"name",
			"sector",
			"industry",
			"country",
			"issuerName",
			"assetClass",
		] as const)
			optionalText(security[field], `Security ${security.isin}: ${field}`);
	}

	const overrides = request.fundOverrides ?? [];
	require(Array.isArray(overrides) &&
		overrides.length <=
			LIMITS.funds, "fundOverrides must be an array within the fund limit");
	for (const override of overrides) {
		require(isObject(override), "Each fund override must be an object");
		keys(override, ["isin", "assetClass", "heldWhole"], "Fund override");
		text(override.isin, "Fund override isin");
		assetClass(override.assetClass, `Fund override ${override.isin}`, false);
		require(typeof override.heldWhole ===
			"boolean", `Fund override ${override.isin}: heldWhole must be a boolean`);
	}
}

export function validateCorrelationRequest(request: CorrelationRequest): void {
	validateJsonInput(request);
	require(isObject(request), "The request must be an object");
	keys(
		request,
		["asOf", "baseCurrency", "holdings", "closes", "fx"],
		"Correlation request",
	);
	date(request.asOf, "asOf");
	currency(request.baseCurrency, "baseCurrency");
	require(Array.isArray(request.holdings), "holdings must be an array");
	require(request.holdings.length <=
		LIMITS.correlationHoldings, `More holdings than the correlation limit of ${LIMITS.correlationHoldings}`);
	const ids = new Set<string>();
	for (const holding of request.holdings) {
		require(isObject(holding), "Each holding must be an object");
		keys(
			holding,
			["id", "name", "value", "priceCurrency", "closeBasis"],
			"Correlation holding",
		);
		if (holding.name !== undefined) text(holding.name, "Holding name");
		text(holding.id, "Holding id");
		require(!ids.has(holding.id), `Duplicate holding id ${holding.id}`);
		ids.add(holding.id);
		if (holding.value !== null) amount(holding.value, `Holding ${holding.id}:`);
		currency(holding.priceCurrency, `Holding ${holding.id}: priceCurrency`);
		require(holding.closeBasis === undefined ||
			holding.closeBasis === "price" ||
			holding.closeBasis ===
				"total_return", `Holding ${holding.id}: invalid closeBasis`);
	}
	require(Array.isArray(request.closes), "closes must be an array");
	const counts = new Map<string, number>();
	for (const close of request.closes) {
		require(isObject(close), "Each close must be an object");
		require(ids.has(close.id), `Close for unknown holding ${String(close.id)}`);
		keys(close, ["id", "date", "close"], "Close");
		date(close.date, `Close of ${close.id}: date`);
		marketValue(close.close, "Close of " + close.id + " on " + close.date);
		const count = (counts.get(close.id) ?? 0) + 1;
		require(count <=
			LIMITS.closesPerHolding, `Holding ${close.id}: more closes than the limit of ${LIMITS.closesPerHolding}`);
		counts.set(close.id, count);
	}
	const fx = request.fx ?? [];
	require(Array.isArray(fx), "fx must be an array");
	for (const rate of fx) {
		require(isObject(rate), "Each FX rate must be an object");
		keys(rate, ["currency", "date", "rateToBase"], "FX rate");
		currency(rate.currency, "FX currency");
		date(rate.date, "FX date");
		marketValue(
			rate.rateToBase,
			"FX rate for " + rate.currency + " on " + rate.date,
		);
	}
}
