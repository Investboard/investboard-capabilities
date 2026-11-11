import { computePortfolioImpact } from "./internal/impact-calculator.js";
import {
	isStressScenarioCovered,
	partitionStressCoverage,
} from "./internal/coverage.js";
import { summarizeStressImpacts } from "./internal/attribution.js";
import { scenarioCarriesBase } from "./internal/scenario-fx.js";
import {
	ASSET_CLASS_SHOCK_PROXY,
	V5_ASSET_CLASS_SHOCK_PROXY,
} from "./internal/shock-applicator.js";
import { withHistory } from "./history.js";
import { maxSupportedWealth } from "./limits.js";
export { MAX_SUPPORTED_WEALTH, maxSupportedWealth } from "./limits.js";
import { StressInputError, validateRequest } from "./validation.js";
import type {
	HoldingImpact,
	StressExcludedHolding,
	StressMethodologyVersion,
	StressRequest,
	StressResult,
	StressSnapshot,
} from "./types.js";

export type * from "./types.js";
export { StressInputError } from "./validation.js";
import { BUILT_IN_SCENARIOS as scenarios } from "./internal/scenarios/crisis-definitions.js";

function freeze<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const child of Object.values(value)) freeze(child);
		Object.freeze(value);
	}
	return value;
}

/** Protect shared defaults; clone a scenario before editing custom assumptions. */
export const BUILT_IN_SCENARIOS = freeze(structuredClone(scenarios));
export const METHODOLOGY_VERSION = "whole-wealth-currency-replay-v6" as const;
const V5 = "whole-wealth-currency-replay-v5" as const;

/** All holding values are already in baseCurrency; capital is never converted twice. */
export function evaluateStressScenario(input: StressRequest): StressResult {
	return evaluate(input, METHODOLOGY_VERSION);
}

/**
 * v6 leaves a holding the scenario cannot model out of every figure and
 * reports the rest; v5 refuses the whole request. v5 also has no crypto
 * stand-in and reports in EUR or USD only.
 */
function evaluate(
	input: StressRequest,
	methodologyVersion: StressMethodologyVersion,
): StressResult {
	validateRequest(input, methodologyVersion);
	const v5 = methodologyVersion === V5;
	const standIns = v5 ? V5_ASSET_CLASS_SHOCK_PROXY : ASSET_CLASS_SHOCK_PROXY;
	const request = structuredClone(input);
	const snapshot: StressSnapshot = { methodologyVersion, request };
	const result = {
		interpretation: "hypothetical_replay" as const,
		baseCurrency: request.baseCurrency,
		snapshot,
	};
	const unavailable = (reason: string): StressResult => ({
		...result,
		status: "unavailable",
		reasonCodes: [reason],
		calculation: null,
	});
	// A base the scenario carries no move for has no cross rate.
	if (!v5 && !scenarioCarriesBase(request.scenario, request.baseCurrency))
		return unavailable("unsupported_base_currency");
	const reasons = new Set<string>();
	if (
		request.histories?.some(
			(history) =>
				!request.holdings.some(
					(holding) =>
						holding.isin === history.isin &&
						holding.ticker === history.ticker &&
						holding.currency === history.currency,
				),
		)
	)
		reasons.add("history_identity_unverified");
	const baseline = computePortfolioImpact(
		request.holdings,
		request.scenario,
		request.baseCurrency,
		standIns,
	);
	const allImpacts = withHistory(request, baseline.holdingImpacts, reasons);
	let impacts: HoldingImpact[] = allImpacts;
	let excluded: StressExcludedHolding[] = [];
	if (v5) {
		requireWealthLimit(allImpacts, request.baseCurrency);
		if (
			!isStressScenarioCovered(
				request.holdings,
				allImpacts,
				request.scenario,
				request.baseCurrency,
				standIns,
			)
		)
			return unavailable("unsupported_scenario_exposure");
	} else {
		const partition = partitionStressCoverage(
			request.holdings,
			allImpacts,
			request.scenario,
			request.baseCurrency,
			standIns,
		);
		if (!partition?.modeled.length)
			return unavailable("unsupported_scenario_exposure");
		impacts = partition.modeled;
		excluded = partition.leftOut.map(({ holding, reason }) => ({
			holdingId: holding.holdingId,
			ticker: holding.ticker,
			name: holding.name,
			value: holding.currentValue,
			reason,
		}));
		requireWealthLimit(impacts, request.baseCurrency);
		if (excluded.length) reasons.add("unmodeled_holdings_excluded");
	}
	const attribution = summarizeStressImpacts(impacts);
	if (!attribution) return unavailable("unsupported_scenario_exposure");
	for (const value of [
		attribution.preStressValueCents,
		attribution.postStressValueCents,
		attribution.netImpactCents,
	]) {
		if (!Number.isSafeInteger(value))
			throw new StressInputError(
				"Calculated result exceeds safe cent precision",
			);
	}
	const pre = attribution.preStressValueCents;
	const direct =
		(impacts.reduce(
			(sum, h) =>
				sum + (h.shockSource === "historical_price" ? h.preStressValue : 0),
			0,
		) *
			100) /
		pre;
	const currency =
		(impacts.reduce(
			(sum, h) => sum + (h.currencyMethod !== "unknown" ? h.preStressValue : 0),
			0,
		) *
			100) /
		pre;
	if (impacts.some((h) => h.currencyMethod === "unknown"))
		reasons.add("proxy_currency_decomposition_unavailable");
	return {
		...result,
		status: [...reasons].some(
			(reason) => reason !== "price_return_without_dividends",
		)
			? "partial"
			: "available",
		reasonCodes: [...reasons],
		calculation: {
			holdingImpacts: impacts,
			preStressTotal: pre / 100,
			postStressTotal: attribution.postStressValueCents / 100,
			absoluteLoss: attribution.netImpactCents / 100,
			percentageLoss:
				Math.round((attribution.netImpactCents / pre) * 10000) / 10000,
			attribution,
			coverage: {
				directValueFraction: Math.min(1, direct),
				proxyValueFraction: Math.max(0, 1 - direct),
				currencyDecompositionValueFraction: Math.min(1, currency),
			},
			...(excluded.length ? { excludedHoldings: excluded } : {}),
		},
	};
}

function requireWealthLimit(
	impacts: readonly HoldingImpact[],
	base: string,
): void {
	const postCents = impacts.reduce(
		(sum, holding) => sum + Math.round(holding.postStressValue * 100),
		0,
	);
	if (
		!Number.isSafeInteger(postCents) ||
		postCents > maxSupportedWealth(base) * 100
	)
		throw new StressInputError("Calculated wealth exceeds the supported limit");
}

/** Re-evaluates the original inputs only, without providers or current account state. */
export function replayStressScenario(snapshot: StressSnapshot): StressResult {
	const version = snapshot?.methodologyVersion;
	if (version !== METHODOLOGY_VERSION && version !== V5)
		throw new StressInputError("Unsupported snapshot methodology");
	return evaluate(snapshot.request, version);
}
