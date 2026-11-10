// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
import type { CashFlow, XirrResult } from "./types.js";
import { fromEuros, sumCents, toEuros, type Cents } from "../money/cents.js";
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-7;
const RATE_LOWER_BOUND = -0.999;
const RATE_UPPER_BOUND = 10.0;
const DAYS_PER_YEAR = 365;
const INITIAL_GUESSES = [0.1, 0.0, -0.5];
export function calculateXirr(
	cashFlows: CashFlow[],
	currentValue: number,
	valuationDate: string,
): XirrResult {
	if (cashFlows.length === 0) {
		return {
			mwr: null,
			mwrError: "insufficient_data",
			iterations: 0,
			isAnnualized: false,
		};
	}
	const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
	const firstDate = sorted[0]!.date;
	if (valuationDate === firstDate) {
		return {
			mwr: null,
			mwrError: "too_short",
			iterations: 0,
			isAnnualized: false,
		};
	}
	// Same-day turnover is economically neutral. Net in exact cents before it
	// can affect either the solver or the scale used to certify convergence.
	const netByDate = new Map<string, Cents>();
	for (const flow of sorted) {
		const amount =
			flow.type === "buy" ? -Math.abs(flow.amount) : Math.abs(flow.amount);
		netByDate.set(
			flow.date,
			sumCents([netByDate.get(flow.date) ?? fromEuros(0), fromEuros(amount)]),
		);
	}
	netByDate.set(
		valuationDate,
		sumCents([
			netByDate.get(valuationDate) ?? fromEuros(0),
			fromEuros(currentValue),
		]),
	);
	const dayFractions = [...netByDate]
		.filter(([, amount]) => amount !== 0)
		.map(([date, amount]) => ({
			amount: toEuros(amount),
			fraction: daysBetween(firstDate, date) / DAYS_PER_YEAR,
		}));
	const totalDays = daysBetween(firstDate, valuationDate);
	if (totalDays < DAYS_PER_YEAR) {
		const totalBuyAmount = sorted
			.filter((cf) => cf.type === "buy")
			.reduce((sum, cf) => sum + Math.abs(cf.amount), 0);
		if (totalBuyAmount === 0) {
			return {
				mwr: null,
				mwrError: "insufficient_data",
				iterations: 0,
				isAnnualized: false,
			};
		}
		return {
			mwr: null,
			mwrError: null,
			iterations: 0,
			isAnnualized: false,
		};
	}
	for (const initialGuess of INITIAL_GUESSES) {
		let rate = initialGuess;
		let converged = false;
		let iterations = 0;
		for (let i = 0; i < MAX_ITERATIONS; i++) {
			iterations = i + 1;
			const npvVal = npv(rate, dayFractions);
			const npvDeriv = npvDerivative(rate, dayFractions);
			if (
				!Number.isFinite(npvVal) ||
				!Number.isFinite(npvDeriv) ||
				Math.abs(npvDeriv) < 1e-12
			) {
				break;
			}
			const rateNext = rate - npvVal / npvDeriv;
			if (!Number.isFinite(rateNext)) break;
			const clampedRate = Math.max(
				RATE_LOWER_BOUND,
				Math.min(RATE_UPPER_BOUND, rateNext),
			);
			if (Math.abs(clampedRate - rate) < TOLERANCE) {
				// A blocked step at a bound is not a converged Newton step.
				converged = rateNext === clampedRate;
				rate = clampedRate;
				break;
			}
			rate = clampedRate;
		}
		if (converged) {
			const npvScale = dayFractions.reduce(
				(sum, f) => sum + Math.abs(f.amount),
				0,
			);
			const npvAtRate = Math.abs(npv(rate, dayFractions));
			if (npvAtRate <= Math.max(1e-6 * npvScale, 1e-8)) {
				return {
					mwr: rate,
					mwrError: null,
					iterations,
					isAnnualized: true,
				};
			}
		}
	}
	return {
		mwr: null,
		mwrError: "no_convergence",
		iterations: MAX_ITERATIONS,
		isAnnualized: false,
	};
}
function daysBetween(from: string, to: string): number {
	const a = new Date(from + "T00:00:00Z");
	const b = new Date(to + "T00:00:00Z");
	return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
function npv(
	rate: number,
	flows: Array<{
		amount: number;
		fraction: number;
	}>,
): number {
	let result = 0;
	for (const flow of flows) {
		result += flow.amount / (1 + rate) ** flow.fraction;
	}
	return result;
}
function npvDerivative(
	rate: number,
	flows: Array<{
		amount: number;
		fraction: number;
	}>,
): number {
	let result = 0;
	for (const flow of flows) {
		result +=
			(-flow.amount * flow.fraction) / (1 + rate) ** (flow.fraction + 1);
	}
	return result;
}
