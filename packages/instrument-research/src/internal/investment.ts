import type { Investment, InvestmentReading, Point } from "../types.js";
import { LIMITS } from "../limits.js";
import { requireInput } from "./input-guards.js";
import { dayNumber } from "./series.js";

function anniversary(start: string, months: number) {
	const [year, month, day] = start.split("-").map(Number);
	const lastDay = new Date(
		Date.UTC(year!, month! - 1 + months + 1, 0),
	).getUTCDate();
	return new Date(Date.UTC(year!, month! - 1 + months, Math.min(day!, lastDay)))
		.toISOString()
		.slice(0, 10);
}
/** Buy-only flows have one admissible root; a verified bracket avoids clamp convergence. */
function moneyWeighted(
	contributions: { date: string; amount: number }[],
	endingValue: number,
	to: string,
): { value: number | null; reason: string | null } {
	const first = contributions[0];
	if (!first) return { value: null, reason: "no_contributions" };
	if (dayNumber(to) - dayNumber(first.date) < 365)
		return { value: null, reason: "less_than_one_year" };
	const flows = contributions.map((c) => ({
		amount: -c.amount,
		years: (dayNumber(c.date) - dayNumber(first.date)) / 365,
	}));
	flows.push({
		amount: endingValue,
		years: (dayNumber(to) - dayNumber(first.date)) / 365,
	});
	const npv = (rate: number) =>
		flows.reduce((sum, f) => sum + f.amount / (1 + rate) ** f.years, 0);
	let lower = -0.999;
	let upper = 10;
	if (npv(lower) < 0 || npv(upper) > 0)
		return {
			value: null,
			reason: "money_weighted_rate_outside_supported_bracket",
		};
	const scale = flows.reduce((sum, f) => sum + Math.abs(f.amount), 0);
	for (let i = 0; i < 200; i++) {
		const rate = (lower + upper) / 2;
		const value = npv(rate);
		if (Number.isFinite(value) && Math.abs(value) <= scale * 1e-10)
			return { value: rate, reason: null };
		if (value > 0) lower = rate;
		else upper = rate;
	}
	return { value: null, reason: "money_weighted_rate_did_not_converge" };
}

/** Fractional units; no fees, taxes, spreads, rounding or unobserved executions. */
/** `zeroReturn` keeps version 1's 0 for a zero-contribution return. */
export function investmentReading(
	points: Point[],
	investment: Investment,
	zeroReturn: 0 | null = null,
): InvestmentReading {
	const first = points[0]!;
	const last = points.at(-1)!;
	const contributions: { date: string; amount: number }[] = [];
	let units = 0;
	let total = 0;
	function buy(point: Point, amount: number) {
		if (amount <= 0) return;
		units += amount / point.value;
		total += amount;
		contributions.push({ date: point.date, amount });
	}
	buy(first, investment.lumpSum);
	if (investment.monthlyContribution > 0) {
		let cursor = 0;
		const [firstYear, firstMonth] = first.date.split("-").map(Number);
		const [lastYear, lastMonth] = last.date.split("-").map(Number);
		const months = (lastYear! - firstYear!) * 12 + lastMonth! - firstMonth!;
		for (let month = 0; month <= months; month++) {
			const due = anniversary(first.date, month);
			if (due > last.date) break;
			while (cursor < points.length && points[cursor]!.date < due) cursor++;
			const point = points[cursor];
			if (!point) break;
			requireInput(
				dayNumber(point.date) - dayNumber(due) <= LIMITS.maxExecutionDelayDays,
				"A contribution has no sufficiently close observed execution date",
			);
			buy(point, investment.monthlyContribution);
		}
	}
	const endingValue = units * last.value;
	requireInput(
		Number.isFinite(endingValue) &&
			endingValue <= LIMITS.amount &&
			total <= LIMITS.amount,
		"Investment illustration exceeds the supported amount bound",
	);
	const mwr = moneyWeighted(contributions, endingValue, last.date);
	return {
		totalContributed: total,
		endingValue,
		contributionReturn: total > 0 ? endingValue / total - 1 : zeroReturn,
		annualizedMoneyWeightedReturn: mwr.value,
		moneyWeightedReason: mwr.reason,
		contributions,
	};
}
