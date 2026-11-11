/**
 * Historical correlations as Investboard's Diversification view measures them:
 * weekly returns in the base currency, one common sample of weeks for every
 * pair, Pearson coefficients with 95% intervals, over windows of 1, 3, 5 and
 * 10 years ending on the last Friday before the analysis date.
 */
import { freeze } from "./internal/freeze.js";
import { readDiversification } from "./internal/correlation/reading.js";
import type {
	DatedValue,
	DiversificationHolding,
} from "./internal/correlation/types.js";
import { anchorFriday, toBaseDaily } from "./internal/correlation/weekly.js";
import type { WindowReading } from "./internal/correlation/window.js";
import type { CorrelationRequest, CorrelationSnapshot } from "./types.js";
import {
	PortfolioInputError,
	validateCorrelationRequest,
} from "./validation.js";

export const CORRELATION_METHODOLOGY_VERSION =
	"weekly-common-sample-correlation-v1" as const;

export type CorrelationWindow = WindowReading;

export interface CorrelationResult {
	methodologyVersion: string;
	baseCurrency: string;
	anchor: string;
	/** 1y, 3y, 5y and 10y, in that order. */
	windows: CorrelationWindow[];
	snapshot: CorrelationSnapshot;
}

function seriesBy<T extends { date: string }>(
	rows: readonly T[],
	keyOf: (row: T) => string,
	what: string,
): Map<string, T[]> {
	const out = new Map<string, T[]>();
	for (const row of rows) {
		const key = keyOf(row);
		const list = out.get(key) ?? [];
		list.push(row);
		out.set(key, list);
	}
	for (const [key, list] of out) {
		list.sort((a, b) => a.date.localeCompare(b.date));
		for (let i = 1; i < list.length; i++)
			if (list[i]!.date === list[i - 1]!.date)
				throw new PortfolioInputError(
					`Duplicate ${what} for ${key} on ${list[i]!.date}`,
				);
	}
	return out;
}

export function measureCorrelations(
	input: CorrelationRequest,
): CorrelationResult {
	validateCorrelationRequest(input);
	const request = structuredClone(input);
	const closes = seriesBy(request.closes, (c) => c.id, "close");
	const rates = seriesBy(request.fx ?? [], (r) => r.currency, "FX rate");
	const anchor = anchorFriday(request.asOf);

	const holdings: DiversificationHolding[] = request.holdings.map((h) => {
		const value = h.value ?? 0;
		if (!(value > 0))
			return { id: h.id, valueBase: 0, dailyBase: null, exclusion: "no_value" };
		const daily: DatedValue[] = (closes.get(h.id) ?? []).map((c) => ({
			date: c.date,
			value: c.close,
		}));
		if (daily.length === 0)
			return {
				id: h.id,
				valueBase: value,
				dailyBase: null,
				exclusion: "no_market_series",
			};
		if (h.priceCurrency === request.baseCurrency)
			return { id: h.id, valueBase: value, dailyBase: daily, exclusion: null };
		const fx = (rates.get(h.priceCurrency) ?? []).map((r) => ({
			date: r.date,
			value: r.rateToBase,
		}));
		const converted = fx.length > 0 ? toBaseDaily(daily, fx) : [];
		return converted.length > 0
			? { id: h.id, valueBase: value, dailyBase: converted, exclusion: null }
			: { id: h.id, valueBase: value, dailyBase: null, exclusion: "no_fx" };
	});

	const reading = readDiversification(holdings, anchor);
	return freeze({
		methodologyVersion: CORRELATION_METHODOLOGY_VERSION,
		baseCurrency: request.baseCurrency,
		anchor,
		windows: [...reading.windows],
		snapshot: {
			methodologyVersion: CORRELATION_METHODOLOGY_VERSION,
			request: structuredClone(input),
		},
	});
}

export function replayCorrelations(
	snapshot: CorrelationSnapshot,
): CorrelationResult {
	if (
		typeof snapshot !== "object" ||
		snapshot === null ||
		snapshot.methodologyVersion !== CORRELATION_METHODOLOGY_VERSION
	)
		throw new PortfolioInputError(
			`This snapshot was saved with methodology ${String(snapshot?.methodologyVersion)}; this version replays ${CORRELATION_METHODOLOGY_VERSION}`,
		);
	return measureCorrelations(snapshot.request);
}
