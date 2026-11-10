import type { InstrumentHistory, Point } from "../types.js";
import { LIMITS } from "../limits.js";
import { dayNumber, orderedPoints } from "./series.js";

export function reportingHistory(
	history: InstrumentHistory,
	currency: string,
): { points: Point[]; reasons: string[] } {
	const prices = orderedPoints(history.points);
	if (history.listing.currency === currency)
		return { points: prices, reasons: [] };
	if (!history.fx)
		return { points: [], reasons: ["direct_fx_history_missing"] };
	const fx = orderedPoints(history.fx.points);
	let cursor = -1;
	let missing = 0;
	const points = prices.flatMap((p) => {
		while (fx[cursor + 1] && fx[cursor + 1]!.date <= p.date) cursor++;
		const rate = fx[cursor];
		if (
			!rate ||
			dayNumber(p.date) - dayNumber(rate.date) > LIMITS.fxCarryDays
		) {
			missing++;
			return [];
		}
		return [{ date: p.date, value: p.value * rate.value }];
	});
	return { points, reasons: missing ? ["dated_fx_observations_missing"] : [] };
}
