export interface Correlation {
	/** null when fewer than 3 shared observations or a series has no variance. */
	readonly r: number | null;
	/** Number of weeks where both series have a return. */
	readonly n: number;
}

const Z_95 = 1.96;

export function pearson(
	xs: readonly (number | null)[],
	ys: readonly (number | null)[],
): Correlation {
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
