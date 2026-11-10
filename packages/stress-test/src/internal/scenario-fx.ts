import type { CrisisDefinition } from "./scenarios/crisis-definitions.js";

export function scenarioFxRatio(
	crisis: CrisisDefinition,
	currency: string,
	base: "EUR" | "USD",
) {
	if (currency === base) return 1;
	const factor = (code: string) => {
		if (code === "EUR") return 1;
		const shock = Object.hasOwn(crisis.currencyShocks, code)
			? crisis.currencyShocks[code]
			: undefined;
		return shock !== undefined && Number.isFinite(shock) && shock > -1
			? 1 + shock
			: null;
	};
	const source = factor(currency),
		target = factor(base);
	return source !== null && target !== null ? source / target : null;
}

export const MAX_STRESS_WEALTH = 1_000_000_000;

function roundProductCents(value: number) {
	const scaled = value * 100;
	const midpoint = Math.floor(scaled) + 0.5;
	const tolerance = Math.min(
		0.0001,
		4 * Number.EPSILON * Math.max(1, Math.abs(scaled)),
	);
	return (
		Math.round(Math.abs(scaled - midpoint) <= tolerance ? midpoint : scaled) /
		100
	);
}

export function applyReturnToValue(value: number, returnFraction: number) {
	if (
		!Number.isFinite(value) ||
		value < 0 ||
		!Number.isFinite(returnFraction) ||
		returnFraction < -1
	)
		throw new Error("Invalid stress value or return");
	const postStressValue = roundProductCents(value * (1 + returnFraction));
	const absoluteLoss = Math.round((postStressValue - value) * 100) / 100;
	return {
		preStressValue: value,
		postStressValue,
		absoluteLoss,
		percentageLoss:
			value > 0 ? Math.round((absoluteLoss / value) * 10_000) / 10_000 : 0,
	};
}
