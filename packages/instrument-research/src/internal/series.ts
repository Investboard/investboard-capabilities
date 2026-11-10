import type { Point as KnowledgePoint } from "../types.js";

export const DAY_MS = 86_400_000;
export const dayNumber = (date: string) => Date.parse(date) / DAY_MS;
export const dayString = (day: number) =>
	new Date(day * DAY_MS).toISOString().slice(0, 10);
export function yearsBefore(to: string, years: number) {
	const d = new Date(`${to}T00:00:00Z`);
	const month = d.getUTCMonth();
	d.setUTCFullYear(d.getUTCFullYear() - years);
	if (d.getUTCMonth() !== month) d.setUTCDate(0);
	return d.toISOString().slice(0, 10);
}

/** Never silently sort away conflicting duplicate dates or bridge corrupt prices. */
export function orderedPoints(
	input: readonly KnowledgePoint[],
	positive = true,
): KnowledgePoint[] {
	const seen = new Map<string, number>();
	for (const p of input) {
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(p.date) ||
			!Number.isFinite(dayNumber(p.date)) ||
			dayString(dayNumber(p.date)) !== p.date ||
			!Number.isFinite(p.value) ||
			(positive && p.value <= 0)
		)
			throw new Error("Invalid series observation");
		const old = seen.get(p.date);
		if (old !== undefined && old !== p.value)
			throw new Error("Conflicting date");
		seen.set(p.date, p.value);
	}
	return [...seen]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, value]) => ({ date, value }));
}

/** Completed Friday closes. At most three days carry within a week, and no
 * return across a missing week. Crypto weekends are sampled on the same grid.
 */
export function weeklyReturns(
	input: readonly KnowledgePoint[],
	from: string,
	to: string,
) {
	const points = orderedPoints(input);
	const result = new Map<string, number | null>();
	let cursor = -1;
	let prior: number | null = null;
	const start = dayNumber(from);
	const friday =
		start + ((5 - new Date(start * DAY_MS).getUTCDay() + 7) % 7) - 7;
	for (let day = friday; day <= dayNumber(to); day += 7) {
		while (
			points[cursor + 1] &&
			dayNumber(points[cursor + 1]?.date ?? "") <= day
		)
			cursor++;
		const p = points[cursor];
		const close = p && day - dayNumber(p.date) <= 3 ? p.value : null;
		if (day >= start)
			result.set(
				dayString(day),
				close !== null && prior !== null ? close / prior - 1 : null,
			);
		prior = close;
	}
	return result;
}
