import type {
	HistoricalWindow,
	HoldingImpact,
	StressRequest,
} from "./types.js";
import { applyReturnToValue } from "./internal/scenario-fx.js";
import { validDate } from "./validation.js";

const day = 86_400_000;

/** Admit matching instrument history only within the documented price and FX date windows. */
export function withHistory(
	request: StressRequest,
	impacts: HoldingImpact[],
	reasons: Set<string>,
): HoldingImpact[] {
	return impacts.map((impact, index) => {
		const holding = request.holdings[index];
		if (!holding?.isin) return impact;
		const matches = (request.histories ?? []).filter(
			(h) =>
				h.ticker === holding.ticker &&
				h.isin === holding.isin &&
				h.currency === holding.currency,
		);
		if (!matches.length) return impact;
		if (matches.length !== 1) {
			reasons.add("history_ambiguous");
			return impact;
		}
		const history = matches[0];
		if (!history || !validHistory(history, request)) {
			reasons.add("history_rejected");
			return impact;
		}
		let fxRatio = 1;
		if (history.currency !== request.baseCurrency) {
			const fx = history.fx;
			if (
				!fx ||
				fx.baseCurrency !== request.baseCurrency ||
				!validFixing(fx.from, history.start.date) ||
				!validFixing(fx.to, history.end.date)
			) {
				reasons.add("historical_fx_unavailable");
				return impact;
			}
			fxRatio = fx.to.rate / fx.from.rate;
		}
		const shock = (history.end.value / history.start.value) * fxRatio - 1;
		if (!Number.isFinite(shock) || shock < -1) {
			reasons.add("history_rejected");
			return impact;
		}
		if (history.basis === "price")
			reasons.add("price_return_without_dividends");
		return {
			...impact,
			...applyReturnToValue(holding.currentValue, shock),
			shockApplied: Math.round(shock * 10000) / 10000,
			shockSource: "historical_price",
			currencyMethod: "direct_history",
			fxShockApplied:
				history.currency === request.baseCurrency ? 0 : fxRatio - 1,
			historicalBasis: history.basis,
			actualDateFrom: history.start.date,
			actualDateTo: history.end.date,
		};
	});
}

function validHistory(
	history: HistoricalWindow,
	request: StressRequest,
): boolean {
	return (
		typeof history.source === "string" &&
		Boolean(history.source.trim()) &&
		(history.basis === "price" || history.basis === "total") &&
		validDate(history.start?.date) &&
		validDate(history.end?.date) &&
		history.start.date < history.end.date &&
		Math.abs(
			Date.parse(history.start.date) - Date.parse(request.scenario.dateFrom),
		) <=
			5 * day &&
		Math.abs(
			Date.parse(history.end.date) - Date.parse(request.scenario.dateTo),
		) <=
			5 * day &&
		Number.isFinite(history.start.value) &&
		history.start.value > 0 &&
		Number.isFinite(history.end.value) &&
		history.end.value > 0
	);
}

function validFixing(
	fixing: { effectiveDate: string; rate: number },
	endpoint: string,
): boolean {
	if (
		!fixing ||
		!validDate(fixing.effectiveDate) ||
		!Number.isFinite(fixing.rate) ||
		fixing.rate <= 0
	)
		return false;
	const age = Date.parse(endpoint) - Date.parse(fixing.effectiveDate);
	return age >= 0 && age <= 7 * day;
}
