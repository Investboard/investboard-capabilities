import type {
	DrawdownPoint,
	DrawdownResult,
	Point as Snapshot,
} from "../types.js";

/**
 * Calculate max drawdown and drawdown time series from portfolio snapshots.
 *
 * For each point, tracks the running peak and computes drawdown as
 * (value - peak) / peak, always <= 0. Identifies the deepest drawdown,
 * its corresponding peak date, and the first recovery date (if any).
 *
 * @param snapshots - Array of date/value pairs (portfolio total value over time)
 * @returns DrawdownResult with max drawdown, dates, and full time series
 */
export function calculateDrawdown(snapshots: Snapshot[]): DrawdownResult {
	// ─── Empty input guard ──────────────────────────────────────────────────
	if (snapshots.length === 0) {
		return {
			maxDrawdown: 0,
			maxDrawdownDate: "",
			peakDate: "",
			recoveryDate: null,
			timeSeries: [],
		};
	}

	// ─── Single snapshot guard ──────────────────────────────────────────────
	if (snapshots.length === 1) {
		const snap = snapshots[0]!;
		return {
			maxDrawdown: 0,
			maxDrawdownDate: snap.date,
			peakDate: snap.date,
			recoveryDate: null,
			timeSeries: [
				{ date: snap.date, drawdown: 0, value: snap.value, peak: snap.value },
			],
		};
	}

	// ─── Sort snapshots by date ascending ───────────────────────────────────
	const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

	// ─── Build time series with running peak tracking ───────────────────────
	const timeSeries: DrawdownPoint[] = [];
	let peak = sorted[0]!.value;
	let peakDate = sorted[0]!.date;
	let maxDrawdown = 0;
	let maxDrawdownDate = sorted[0]!.date;
	let maxDrawdownPeakDate = sorted[0]!.date;
	let maxDrawdownPeakValue = sorted[0]!.value;

	for (const snap of sorted) {
		// Update running peak
		if (snap.value > peak) {
			peak = snap.value;
			peakDate = snap.date;
		}

		// Compute drawdown (avoid division by zero)
		let drawdown = 0;
		if (peak > 0 && snap.value < peak) {
			drawdown = (snap.value - peak) / peak;
		}

		// Track max drawdown
		if (drawdown < maxDrawdown) {
			maxDrawdown = drawdown;
			maxDrawdownDate = snap.date;
			maxDrawdownPeakDate = peakDate;
			maxDrawdownPeakValue = peak;
		}

		timeSeries.push({
			date: snap.date,
			drawdown,
			value: snap.value,
			peak,
		});
	}

	// ─── Find recovery date ─────────────────────────────────────────────────
	// Scan time series after maxDrawdownDate for first point where
	// value >= peak value at the time of max drawdown. Only meaningful when a
	// drawdown actually occurred: with maxDrawdown 0 the "trough" is the first
	// bar and the scan would return the second bar as a phantom recovery.
	let recoveryDate: string | null = null;
	let pastMaxDrawdown = false;

	if (maxDrawdown < 0) {
		for (const point of timeSeries) {
			if (point.date === maxDrawdownDate) {
				pastMaxDrawdown = true;
				continue;
			}
			if (pastMaxDrawdown && point.value >= maxDrawdownPeakValue) {
				recoveryDate = point.date;
				break;
			}
		}
	}

	return {
		maxDrawdown,
		maxDrawdownDate,
		peakDate: maxDrawdownPeakDate,
		recoveryDate,
		timeSeries,
	};
}
