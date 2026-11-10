import { computePortfolioImpact } from "./internal/impact-calculator.js";
import { isStressScenarioCovered } from "./internal/coverage.js";
import { summarizeStressImpacts } from "./internal/attribution.js";
import { withHistory } from "./history.js";
import { MAX_SUPPORTED_WEALTH } from "./limits.js";
export { MAX_SUPPORTED_WEALTH } from "./limits.js";
import { StressInputError, validateRequest } from "./validation.js";
import type { StressRequest, StressResult, StressSnapshot } from "./types.js";

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
export const METHODOLOGY_VERSION = "whole-wealth-currency-replay-v5" as const;

/** All holding values are already in baseCurrency; capital is never converted twice. */
export function evaluateStressScenario(input: StressRequest): StressResult {
	validateRequest(input);
	const request = structuredClone(input);
	const snapshot: StressSnapshot = {
		methodologyVersion: METHODOLOGY_VERSION,
		request,
	};
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
	);
	const impacts = withHistory(request, baseline.holdingImpacts, reasons);
	const postCents = impacts.reduce(
		(sum, holding) => sum + Math.round(holding.postStressValue * 100),
		0,
	);
	if (
		!Number.isSafeInteger(postCents) ||
		postCents > MAX_SUPPORTED_WEALTH * 100
	)
		throw new StressInputError("Calculated wealth exceeds the supported limit");
	const covered = isStressScenarioCovered(
		request.holdings,
		impacts,
		request.scenario,
		request.baseCurrency,
	);
	const attribution = summarizeStressImpacts(impacts);
	const result = {
		interpretation: "hypothetical_replay" as const,
		baseCurrency: request.baseCurrency,
		snapshot,
	};
	if (!covered || !attribution)
		return {
			...result,
			status: "unavailable",
			reasonCodes: ["unsupported_scenario_exposure"],
			calculation: null,
		};
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
		},
	};
}

/** Re-evaluates the original inputs only, without providers or current account state. */
export function replayStressScenario(snapshot: StressSnapshot): StressResult {
	if (snapshot?.methodologyVersion !== METHODOLOGY_VERSION)
		throw new StressInputError("Unsupported snapshot methodology");
	return evaluateStressScenario(snapshot.request);
}
