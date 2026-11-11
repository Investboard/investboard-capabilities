/** Pearson correlation, Fisher intervals and the word bands. */
import type { CorrelationBand, WeeklySeries } from "./types.js";
export interface Correlation {
	readonly r: number | null;
	readonly n: number;
}
const BAND_BOUNDARIES = [-0.3, 0.3, 0.7] as const;
const Z_95 = 1.96;
export function pearson(xs: WeeklySeries, ys: WeeklySeries): Correlation {
	const px: number[] = [];
	const py: number[] = [];
	const len = Math.min(xs.length, ys.length);
	for (let k = 0; k < len; k++) {
		const x = xs[k] ?? null;
		const y = ys[k] ?? null;
		if (x !== null && y !== null) {
			px.push(x);
			py.push(y);
		}
	}
	const n = px.length;
	if (n < 3) return { r: null, n };
	let mx = 0;
	let my = 0;
	for (let i = 0; i < n; i++) {
		mx += px[i]!;
		my += py[i]!;
	}
	mx /= n;
	my /= n;
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (let i = 0; i < n; i++) {
		const dx = px[i]! - mx;
		const dy = py[i]! - my;
		sxy += dx * dy;
		sxx += dx * dx;
		syy += dy * dy;
	}
	if (sxx <= 0 || syy <= 0) return { r: null, n };
	return { r: sxy / Math.sqrt(sxx * syy), n };
}
export function fisherInterval(
	r: number,
	n: number,
): readonly [number, number] | null {
	if (n <= 3) return null;
	const rc = Math.max(-0.999999, Math.min(0.999999, r));
	const z = Math.atanh(rc);
	const se = 1 / Math.sqrt(n - 3);
	return [Math.tanh(z - Z_95 * se), Math.tanh(z + Z_95 * se)];
}
export function correlationBand(r: number | null, n: number): CorrelationBand {
	if (r === null) return "undetermined";
	const ci = fisherInterval(r, n);
	if (ci === null) return "undetermined";
	const [lo, hi] = ci;
	const spanned = BAND_BOUNDARIES.filter((b) => lo < b && b < hi).length;
	if (spanned >= 2) return "undetermined";
	if (r >= 0.7) return "close";
	if (r >= 0.3) return "partial";
	if (r >= -0.3) return "independent";
	return "opposite";
}
export function intervalsDisjoint(a: Correlation, b: Correlation): boolean {
	if (a.r === null || b.r === null) return false;
	const ia = fisherInterval(a.r, a.n);
	const ib = fisherInterval(b.r, b.n);
	if (ia === null || ib === null) return false;
	return ia[1] < ib[0] || ib[1] < ia[0];
}
