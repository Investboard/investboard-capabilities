/** Friday-anchored weekly closes and returns, and conversion of daily closes to the base currency. */
import type { DatedValue, WeeklySeries } from "./types.js";
import { FX_MAX_AGE_DAYS } from "./types.js";
const MS_PER_DAY = 86400000;
const FRIDAY = 5;
export function dayNumber(iso: string): number {
	const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
	return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}
export function isoFromDayNumber(day: number): string {
	return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}
export function anchorFriday(localDate: string): string {
	const day = dayNumber(localDate);
	const dow = (day + 4) % 7;
	const back = (dow - FRIDAY + 7) % 7 || 7;
	return isoFromDayNumber(day - back);
}
export function weeklyCloses(
	daily: readonly DatedValue[],
	anchor: string,
	weeks: number,
): Array<number | null> {
	const a = dayNumber(anchor);
	const out: Array<number | null> = new Array(weeks + 1).fill(null);
	for (const point of daily) {
		const d = dayNumber(point.date);
		if (d > a) continue;
		const k = weeks - Math.floor((a - d) / 7);
		if (k < 0) continue;
		out[k] = point.value;
	}
	return out;
}
export function weeklyReturns(closes: WeeklySeries): Array<number | null> {
	const out: Array<number | null> = [];
	for (let k = 1; k < closes.length; k++) {
		const prev = closes[k - 1] ?? null;
		const cur = closes[k] ?? null;
		out.push(
			prev === null || cur === null || prev <= 0 ? null : cur / prev - 1,
		);
	}
	return out;
}
export function toBaseDaily(
	daily: readonly DatedValue[],
	fxToBase: readonly DatedValue[],
	maxAgeDays: number = FX_MAX_AGE_DAYS,
): DatedValue[] {
	const out: DatedValue[] = [];
	let j = -1;
	for (const point of daily) {
		const d = dayNumber(point.date);
		while (j + 1 < fxToBase.length && dayNumber(fxToBase[j + 1]!.date) <= d)
			j++;
		if (j < 0) continue;
		const rate = fxToBase[j]!;
		if (d - dayNumber(rate.date) > maxAgeDays) continue;
		out.push({ date: point.date, value: point.value * rate.value });
	}
	return out;
}
