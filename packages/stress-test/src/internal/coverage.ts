import type { HoldingImpact } from "./result-types.js";
import { stressCurrencyExposure } from "./currency-exposure.js";
import { scenarioFxRatio } from "./scenario-fx.js";
import type { CrisisDefinition } from "./scenarios/crisis-definitions.js";
import {
	ASSET_CLASS_SHOCK_PROXY,
	assetClassShock,
} from "./shock-applicator.js";
import type { StressHoldingInput } from "./types.js";

type CoverageHolding = Pick<
	StressHoldingInput,
	| "assetClass"
	| "currency"
	| "economicCurrency"
	| "isin"
	| "instrumentType"
	| "priceSource"
>;
/** The scenario figures a coverage decision reads. */
type ScenarioFigures = Pick<
	CrisisDefinition,
	"assetClassShocks" | "currencyShocks"
>;
export type UnmodeledReason =
	| "asset_class_not_modeled"
	| "currency_not_modeled";

/** Why the scenario cannot model a holding without direct history, or null when it can. */
export function unmodeledReason(
	holding: CoverageHolding,
	crisis: ScenarioFigures,
	baseCurrency: string,
	standIns: ReadonlyMap<string, string> = ASSET_CLASS_SHOCK_PROXY,
): UnmodeledReason | null {
	if (assetClassShock(crisis, holding.assetClass, standIns) === undefined)
		return "asset_class_not_modeled";
	const exposure = stressCurrencyExposure(holding);
	return exposure &&
		scenarioFxRatio(crisis, exposure.currency, baseCurrency) === null
		? "currency_not_modeled"
		: null;
}
export function hasStressModelCoverage(
	holdings: readonly CoverageHolding[],
	crisis: ScenarioFigures,
	baseCurrency: string,
	standIns: ReadonlyMap<string, string> = ASSET_CLASS_SHOCK_PROXY,
): boolean {
	return (
		holdings.length > 0 &&
		holdings.every(
			(holding) =>
				unmodeledReason(holding, crisis, baseCurrency, standIns) === null,
		)
	);
}
/**
 * The impacts a scenario models (direct history or a scenario figure) and the
 * holdings it cannot, each with its reason. Null on an integrity failure (no
 * holdings, or a missing, duplicated, extra or non-finite impact), never a
 * left-out holding.
 */
export function partitionStressCoverage(
	holdings: readonly StressHoldingInput[],
	impacts: readonly HoldingImpact[],
	crisis: ScenarioFigures,
	baseCurrency: string,
	standIns: ReadonlyMap<string, string> = ASSET_CLASS_SHOCK_PROXY,
): {
	modeled: HoldingImpact[];
	leftOut: Array<{ holding: StressHoldingInput; reason: UnmodeledReason }>;
} | null {
	const byId = new Map(holdings.map((row) => [row.holdingId, row]));
	if (
		!holdings.length ||
		byId.size !== holdings.length ||
		impacts.length !== holdings.length
	)
		return null;
	const seen = new Set<string>();
	const modeled: HoldingImpact[] = [];
	const leftOut: Array<{
		holding: StressHoldingInput;
		reason: UnmodeledReason;
	}> = [];
	for (const impact of impacts) {
		const holding = byId.get(impact.holdingId);
		if (
			!holding ||
			seen.has(impact.holdingId) ||
			!Number.isFinite(impact.preStressValue) ||
			impact.preStressValue < 0 ||
			!Number.isFinite(impact.postStressValue)
		)
			return null;
		seen.add(impact.holdingId);
		const reason =
			impact.shockSource === "historical_price"
				? null
				: unmodeledReason(holding, crisis, baseCurrency, standIns);
		if (reason === null) modeled.push(impact);
		else leftOut.push({ holding, reason });
	}
	return { modeled, leftOut };
}
/** A missing, duplicated or unmodeled holding cannot silently become a zero shock. */
export function isStressScenarioCovered(
	holdings: readonly StressHoldingInput[],
	impacts: readonly HoldingImpact[],
	crisis: ScenarioFigures,
	baseCurrency: string,
	standIns: ReadonlyMap<string, string> = ASSET_CLASS_SHOCK_PROXY,
): boolean {
	const partition = partitionStressCoverage(
		holdings,
		impacts,
		crisis,
		baseCurrency,
		standIns,
	);
	return partition !== null && partition.leftOut.length === 0;
}
