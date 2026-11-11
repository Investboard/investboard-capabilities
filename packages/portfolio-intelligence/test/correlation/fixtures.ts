import type {
	DatedValue,
	DiversificationHolding,
} from "../../src/internal/correlation/types.js";
import {
	dayNumber,
	isoFromDayNumber,
} from "../../src/internal/correlation/weekly.js";
export const ANCHOR = "2026-09-25";
const base = (t: number) => 0.02 * Math.sin(0.7 * t) + 0.01 * Math.cos(1.3 * t);
type ReturnAt = (t: number) => number;
function closes(
	weeks: number,
	returnAt: ReturnAt,
	skip: (k: number) => boolean = () => false,
): DatedValue[] {
	const out: DatedValue[] = [];
	const anchor = dayNumber(ANCHOR);
	let close = 100;
	for (let k = 0; k <= weeks; k++) {
		if (k > 0) close *= 1 + returnAt(k);
		if (skip(k)) continue;
		out.push({
			date: isoFromDayNumber(anchor - 7 * (weeks - k)),
			value: close,
		});
	}
	return out;
}
function holding(
	id: string,
	valueBase: number,
	dailyBase: DatedValue[],
): DiversificationHolding {
	return { id, valueBase, dailyBase, exclusion: null };
}
export function oneYearBook(): DiversificationHolding[] {
	const w = 52;
	return [
		holding(
			"A",
			30000,
			closes(w, (t) => base(t)),
		),
		holding(
			"B",
			20000,
			closes(w, (t) => 1.1 * base(t) + 0.002 * Math.sin(3.1 * t)),
		),
		holding(
			"C",
			10000,
			closes(w, (t) => 0.9 * base(t) + 0.003 * Math.cos(2.3 * t)),
		),
		holding(
			"D",
			15000,
			closes(
				w,
				(t) => 0.015 * Math.sin(0.37 * t + 1),
				(k) => k === 10,
			),
		),
		holding(
			"E",
			20000,
			closes(w, (t) => -0.8 * base(t) + 0.004 * Math.sin(5.3 * t)),
		),
		holding(
			"F",
			5000,
			closes(
				w,
				(t) => base(t),
				(k) => k < 22,
			),
		),
		{
			id: "CASH",
			valueBase: 10000,
			dailyBase: null,
			exclusion: "no_market_series",
		},
	];
}
export function fiveYearBook(): DiversificationHolding[] {
	const w = 260;
	return [
		holding(
			"A",
			30000,
			closes(w, (t) => base(t)),
		),
		holding(
			"B",
			20000,
			closes(w, (t) => 1.1 * base(t) + 0.002 * Math.sin(3.1 * t)),
		),
		holding(
			"C",
			10000,
			closes(w, (t) => 0.9 * base(t) + 0.003 * Math.cos(2.3 * t)),
		),
		holding(
			"H",
			20000,
			closes(
				w,
				(t) =>
					(t <= w - 52 ? -0.8 * base(t) : 0.9 * base(t)) +
					0.004 * Math.sin(5.3 * t),
			),
		),
		holding(
			"D",
			15000,
			closes(w, (t) => 0.015 * Math.sin(0.37 * t + 1)),
		),
	];
}
export function copyOfB(): DatedValue[] {
	return closes(52, (t) => 1.1 * base(t) + 0.002 * Math.sin(3.1 * t));
}
export function lateStartBook(): DiversificationHolding[] {
	const w = 52;
	const late = (k: number) => k < 5;
	return [
		holding(
			"A",
			30000,
			closes(w, (t) => base(t), late),
		),
		holding(
			"B",
			20000,
			closes(w, (t) => 1.1 * base(t) + 0.002 * Math.sin(3.1 * t), late),
		),
		holding(
			"D",
			15000,
			closes(w, (t) => 0.015 * Math.sin(0.37 * t + 1), late),
		),
	];
}
export function apartBook(): DiversificationHolding[] {
	const w = 52;
	return [
		holding(
			"P",
			30000,
			closes(w, (t) => 0.015 * Math.sin(0.37 * t + 1)),
		),
		holding(
			"Q",
			20000,
			closes(w, (t) => 0.012 * Math.cos(0.91 * t)),
		),
		holding(
			"R",
			10000,
			closes(w, (t) => 0.018 * Math.sin(1.9 * t + 2)),
		),
	];
}
export function flatBook(): DiversificationHolding[] {
	const w = 52;
	return [
		holding(
			"A",
			30000,
			closes(w, (t) => base(t)),
		),
		holding(
			"B",
			20000,
			closes(w, (t) => 1.1 * base(t) + 0.002 * Math.sin(3.1 * t)),
		),
		holding(
			"FLAT",
			20000,
			closes(w, () => 0),
		),
		holding(
			"D",
			15000,
			closes(w, (t) => 0.015 * Math.sin(0.37 * t + 1)),
		),
	];
}
