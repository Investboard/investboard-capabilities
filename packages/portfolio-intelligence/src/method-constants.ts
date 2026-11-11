/** Every fixed threshold of the method, read from the modules that apply it. */
import { COVERAGE_REFUSE_FLOOR } from "./internal/concentration/leg-a.js";
import { NEUTRAL_CAP_PCT } from "./internal/concentration/measure.js";
import { BAND_BOUNDARIES } from "./internal/correlation/statistics.js";
import {
	COVERED_VALUE_FLOOR,
	ELIGIBLE_SHARE,
	FX_MAX_AGE_DAYS,
	GROUP_THRESHOLD,
	MIN_HOLDINGS,
	NEAR_DUPLICATE,
	WINDOW_WEEKS,
	WORST_WEEKS,
} from "./internal/correlation/types.js";
import {
	GATE_MIN_EQUITY_WEIGHT,
	GATE_NAMED_RATIO_FLOOR,
} from "./internal/coverage/classification-gate.js";
import { FULL_DISSOLUTION_THRESHOLD } from "./internal/xray/dissolve.js";
import {
	MAX_SHARED_HOLDINGS,
	OVERLAP_NOISE_FLOOR,
} from "./internal/xray/overlap.js";
import { TOP_N } from "./internal/xray/top-ten.js";

export const METHOD_CONSTANTS = Object.freeze({
	fundFullyCovered: FULL_DISSOLUTION_THRESHOLD,
	overlapFloor: OVERLAP_NOISE_FLOOR,
	overlapSharedListed: MAX_SHARED_HOLDINGS,
	topPositions: TOP_N,
	concentrationCoverageFloor: COVERAGE_REFUSE_FLOOR,
	concentrationMeasuredIssuer: NEUTRAL_CAP_PCT / 100,
	classificationMinEquity: GATE_MIN_EQUITY_WEIGHT,
	classificationNamedFloor: GATE_NAMED_RATIO_FLOOR,
	correlationWeeks1y: WINDOW_WEEKS["1y"],
	correlationWeeks3y: WINDOW_WEEKS["3y"],
	correlationWeeks5y: WINDOW_WEEKS["5y"],
	correlationWeeks10y: WINDOW_WEEKS["10y"],
	correlationEligibleShare: ELIGIBLE_SHARE,
	correlationCoveredValueFloor: COVERED_VALUE_FLOOR,
	correlationMinHoldings: MIN_HOLDINGS,
	correlationNearDuplicate: NEAR_DUPLICATE,
	correlationGroupThreshold: GROUP_THRESHOLD,
	correlationFxMaxAgeDays: FX_MAX_AGE_DAYS,
	correlationWorstWeeks: WORST_WEEKS,
	bandIndependentFrom: BAND_BOUNDARIES[0],
	bandPartialFrom: BAND_BOUNDARIES[1],
	bandCloseFrom: BAND_BOUNDARIES[2],
});
