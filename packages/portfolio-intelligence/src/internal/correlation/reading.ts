/** All four windows of a portfolio, with the 5-year versus 1-year changes. */
import { pairChanges } from "./changes.js";
import {
	DIVERSIFICATION_WINDOWS,
	type DiversificationHolding,
} from "./types.js";
import { computeWindow, type WindowReading } from "./window.js";
export interface DiversificationReading {
	readonly anchor: string;
	readonly windows: readonly WindowReading[];
}
export function readDiversification(
	holdings: readonly DiversificationHolding[],
	anchor: string,
): DiversificationReading {
	const states = new Map(
		DIVERSIFICATION_WINDOWS.map(
			(w) => [w, computeWindow(holdings, anchor, w)] as const,
		),
	);
	const five = states.get("5y")!;
	const one = states.get("1y")!;
	if (
		five.reading.status === "available" &&
		one.reading.status === "available"
	) {
		states.set("5y", {
			...five,
			reading: {
				...five.reading,
				changes: pairChanges(one.reading.pairs, five.reading.pairs),
			},
		});
	}
	return {
		anchor,
		windows: DIVERSIFICATION_WINDOWS.map((w) => states.get(w)!.reading),
	};
}
