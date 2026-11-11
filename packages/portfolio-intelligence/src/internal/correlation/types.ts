/** Correlation types and the method's fixed constants (windows, eligibility, floors, bands). */
export type DiversificationWindow = "1y" | "3y" | "5y" | "10y";
export const WINDOW_WEEKS: Readonly<Record<DiversificationWindow, number>> = {
	"1y": 52,
	"3y": 156,
	"5y": 260,
	"10y": 520,
};
export const DIVERSIFICATION_WINDOWS: readonly DiversificationWindow[] = [
	"1y",
	"3y",
	"5y",
	"10y",
];
export const GROUP_THRESHOLD = 0.7;
export const ELIGIBLE_SHARE = 0.8;
export const COVERED_VALUE_FLOOR = 0.6;
export const MIN_HOLDINGS = 3;
export const WORST_WEEKS = 10;
export const FX_MAX_AGE_DAYS = 4;
export const NEAR_DUPLICATE = 0.95;
export type CorrelationBand =
	| "close"
	| "partial"
	| "independent"
	| "opposite"
	| "undetermined";
export type ExclusionReason =
	| "no_market_series"
	| "short_history"
	| "no_fx"
	| "flat_series"
	| "no_value";
export interface DatedValue {
	readonly date: string;
	readonly value: number;
}
export interface DiversificationHolding {
	readonly id: string;
	readonly valueBase: number;
	readonly dailyBase: readonly DatedValue[] | null;
	readonly exclusion: ExclusionReason | null;
}
export type WeeklySeries = ReadonlyArray<number | null>;
