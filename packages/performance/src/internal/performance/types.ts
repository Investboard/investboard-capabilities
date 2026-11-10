// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
export interface Snapshot {
	date: string;
	value: number;
}
export interface CashFlow {
	date: string;
	amount: number;
	type: "buy" | "sell" | "dividend";
}
export type DataQuality = "ok" | "stale_pricing_gaps" | "undefined_subperiod";
export type Confidence = "low" | "medium" | "high";
export interface TwrResult {
	twr: number;
	annualizedTwr: number | null;
	subPeriodReturns: Array<{
		from: string;
		to: string;
		return: number | null;
	}>;
	timeSeries: Array<{
		date: string;
		return: number;
	}>;
	snapshotCount: number;
	dateRange: {
		from: string;
		to: string;
	};
	effectiveStartDate: string;
	confidence: Confidence;
	dataQuality: DataQuality;
	maxCarryForwardDays: number;
	shallowHistoryWarning: boolean;
}
export interface XirrResult {
	mwr: number | null;
	rawPeriodReturn?: number | null;
	mwrError: "no_convergence" | "insufficient_data" | "too_short" | null;
	iterations: number;
	isAnnualized: boolean;
}
export interface DrawdownPoint {
	date: string;
	drawdown: number;
	value: number;
	peak: number;
}
export interface DrawdownResult {
	maxDrawdown: number;
	maxDrawdownDate: string;
	peakDate: string;
	recoveryDate: string | null;
	timeSeries: DrawdownPoint[];
}
export interface InvestedCapitalResult {
	current: number;
	timeSeries: Array<{
		date: string;
		capital: number;
	}>;
	totalBought: number;
	totalSold: number;
	transactionCount: number;
	wentNegative: boolean;
}
