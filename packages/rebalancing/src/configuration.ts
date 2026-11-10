import type { RebalancingConfiguration } from "./types.js";
import {
	createMoney,
	MAX_SAFE_MINOR_UNITS,
	type Money,
} from "./internal/money.js";
import {
	requireInput,
	requireJson,
	requireShape,
	requireText,
} from "./internal/input-guards.js";

export interface CalculationContext {
	configuration: RebalancingConfiguration;
	money: Money;
}

/** No product preset: every capacity and monetary policy comes from the caller. */
export function calculationContext(value: unknown): CalculationContext {
	requireShape(
		value,
		[
			"money",
			"limits",
			"cashAssetClass",
			"allowedCurrencies",
			"annualReturnRange",
		],
		"Configuration",
	);
	requireShape(value.money, ["decimalPlaces", "maximumAmount"], "Money policy");
	const digits = value.money.decimalPlaces;
	requireInput(
		typeof digits === "number" &&
			Number.isInteger(digits) &&
			digits >= 0 &&
			digits <= 100,
		"Decimal places must fit the numeric representation (0–100)",
	);
	requireInput(
		typeof value.money.maximumAmount === "number" &&
			Number.isFinite(value.money.maximumAmount) &&
			value.money.maximumAmount >= 0 &&
			value.money.maximumAmount <= MAX_SAFE_MINOR_UNITS / 10 ** digits,
		"Configured maximum amount exceeds exact minor-unit precision",
	);
	const keys = [
		"holdings",
		"assetClasses",
		"accounts",
		"orders",
		"projectionMonths",
		"scenarios",
		"jsonNodes",
		"jsonDepth",
		"collectionEntries",
		"textLength",
	];
	requireShape(value.limits, keys, "Capacity limits");
	for (const key of keys) {
		const limit = value.limits[key];
		requireInput(
			typeof limit === "number" &&
				Number.isSafeInteger(limit) &&
				limit >= (["accounts", "orders"].includes(key) ? 0 : 1),
			`Configured ${key} must be a safe integer capacity`,
		);
	}
	const configuration = value as unknown as RebalancingConfiguration;
	requireJson(configuration, configuration.limits);
	requireText(
		configuration.cashAssetClass,
		"Cash class",
		configuration.limits.textLength,
	);
	if (configuration.allowedCurrencies !== undefined) {
		requireInput(
			Array.isArray(configuration.allowedCurrencies) &&
				configuration.allowedCurrencies.length > 0,
			"Allowed currencies must be a nonempty list",
		);
		for (const currency of configuration.allowedCurrencies)
			requireText(
				currency,
				"Currency identifier",
				configuration.limits.textLength,
			);
		requireInput(
			new Set(configuration.allowedCurrencies).size ===
				configuration.allowedCurrencies.length,
			"Allowed currencies must be unique",
		);
	}
	if (configuration.annualReturnRange !== undefined) {
		requireShape(
			configuration.annualReturnRange,
			["minimum", "maximum"],
			"Annual return range",
		);
		const { minimum, maximum } = configuration.annualReturnRange;
		requireInput(
			Number.isFinite(minimum) &&
				Number.isFinite(maximum) &&
				minimum >= -1 &&
				maximum >= minimum,
			"Annual return range must be finite, ordered and at least -1",
		);
	}
	const copy = structuredClone(configuration);
	return { configuration: copy, money: createMoney(copy.money) };
}
