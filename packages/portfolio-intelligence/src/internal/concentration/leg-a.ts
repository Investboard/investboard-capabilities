import { type EscalationBand, escalationTierFor } from "./escalation.js";
import { buildIssuerVector } from "./issuer-vector.js";
import type {
	ConcentrationPosition,
	ConcentrationRefusal,
	IssuerWeight,
	LegAResult,
} from "./types.js";
export const COVERAGE_REFUSE_FLOOR = 0.8;
export const APPROACHING_RATIO = 0.75;
const ISSUER_CAP_MULTIPLIERS = [128, 64, 32, 16, 8, 4, 2, 1.5, 1] as const;
const BOOK_HIGH_WATER = [0.9, 0.75, 0.5] as const;
const MULTIPLIER_TIER = {
	128: "over_128x",
	64: "over_64x",
	32: "over_32x",
	16: "over_16x",
	8: "over_8x",
	4: "over_4x",
	2: "over_2x",
	1.5: "over_1_5x",
	1: "over",
} as const satisfies Record<(typeof ISSUER_CAP_MULTIPLIERS)[number], string>;
const HIGH_WATER_TIER = {
	0.9: "book_90",
	0.75: "book_75",
	0.5: "book_50",
} as const satisfies Record<(typeof BOOK_HIGH_WATER)[number], string>;
export type IssuerCapTier =
	| "approaching"
	| (typeof MULTIPLIER_TIER)[keyof typeof MULTIPLIER_TIER]
	| (typeof HIGH_WATER_TIER)[keyof typeof HIGH_WATER_TIER];
function issuerCapLadder(capFraction: number): EscalationBand<IssuerCapTier>[] {
	const bands: EscalationBand<IssuerCapTier>[] = [
		...ISSUER_CAP_MULTIPLIERS.map((m) => ({
			tier: MULTIPLIER_TIER[m] as IssuerCapTier,
			floor: m * capFraction,
		})),
		...BOOK_HIGH_WATER.map((w) => ({
			tier: HIGH_WATER_TIER[w] as IssuerCapTier,
			floor: w,
		})),
	];
	return bands
		.filter((b) => b.floor >= capFraction)
		.sort((a, b) => b.floor - a.floor);
}
export function issuerCapTierFor(input: {
	weight: number;
	capFraction: number;
	breached: boolean;
}): IssuerCapTier {
	if (!input.breached) return "approaching";
	if (input.capFraction <= 0) return "over";
	return (
		escalationTierFor(input.weight, issuerCapLadder(input.capFraction)) ??
		"over"
	);
}
export function isApproachingCap(weight: number, capFraction: number): boolean {
	const basisPoints = (share: number) => Math.round(share * 10000);
	return basisPoints(weight) >= basisPoints(APPROACHING_RATIO * capFraction);
}
export function isBookSeenThrough(input: {
	issuers: readonly IssuerWeight[];
	coverage: number;
}): boolean {
	return input.issuers.length > 0 && input.coverage >= COVERAGE_REFUSE_FLOOR;
}
export interface CapVerdict {
	maxIssuer: IssuerWeight | null;
	breached: boolean;
	approaching: boolean;
	refusal: ConcentrationRefusal | null;
}
export function verdictAtCap(input: {
	maxIssuer: IssuerWeight;
	coverage: number;
	capFraction: number;
}): CapVerdict {
	const weight = input.maxIssuer.weight;
	const breached = weight > input.capFraction;
	if (!breached && input.coverage < COVERAGE_REFUSE_FLOOR) {
		return {
			maxIssuer: null,
			breached: false,
			approaching: false,
			refusal: "coverage_below_floor",
		};
	}
	return {
		maxIssuer: input.maxIssuer,
		breached,
		approaching: !breached && isApproachingCap(weight, input.capFraction),
		refusal: null,
	};
}
export function evaluateLegA(input: {
	positions: readonly ConcentrationPosition[];
	capPct: number;
	unlistedValueByClass?: Record<string, number>;
}): LegAResult {
	const capFraction = input.capPct / 100;
	const { issuers, attributed, unattributed, bookValue } = buildIssuerVector(
		input.positions,
		input.unlistedValueByClass,
	);
	const coverage = attributed;
	const hasEquityBook = attributed + unattributed > 0;
	const hhi = issuers.reduce((sum, i) => sum + i.weight * i.weight, 0);
	const effectiveN = hhi > 0 ? 1 / hhi : null;
	const maxIssuer = issuers[0];
	const verdict: CapVerdict =
		maxIssuer === undefined
			? {
					maxIssuer: null,
					breached: false,
					approaching: false,
					refusal: hasEquityBook ? "coverage_below_floor" : "empty_book",
				}
			: verdictAtCap({ maxIssuer, coverage, capFraction });
	return {
		issuers,
		capFraction,
		coverage,
		equityBookValue: bookValue,
		hhi,
		effectiveN,
		maxIssuer: verdict.maxIssuer,
		breached: verdict.breached,
		approaching: verdict.approaching,
		refusal: verdict.refusal,
	};
}
