import type { CrisisDefinition } from "./scenarios/crisis-definitions.js";

/** Scenario currency moves are quoted against EUR; a cross rate divides the two gross factors. */
export function scenarioFxRatio(
	crisis: Pick<CrisisDefinition, "currencyShocks">,
	currency: string,
	base: string,
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

/**
 * A scenario reports in the euro or in a currency it carries a move against
 * the euro for; any other base has no cross rate and is never read at 1.0.
 */
export function scenarioCarriesBase(
	crisis: Pick<CrisisDefinition, "currencyShocks">,
	base: string,
): boolean {
	return scenarioFxRatio(crisis, "EUR", base) !== null;
}

export const MAX_STRESS_WEALTH = 1_000_000_000;

/** The bound in a reporting currency’s own units. It guards digits of
 * precision, not wealth: a yen is worth about a hundredth of the other
 * reporting currencies’ units, so yen wealth is bounded at 100 billion
 * (1e13 cents, still exact as an integer). */
export function maxStressWealth(base: string): number {
	return base === "JPY" ? MAX_STRESS_WEALTH * 100 : MAX_STRESS_WEALTH;
}

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
