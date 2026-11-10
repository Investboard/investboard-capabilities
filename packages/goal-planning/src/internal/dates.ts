/** Original observation-day anniversary, clamped independently to month end. */
export function savingsDate(day: string, months: number): string {
	const date = new Date(`${day}T00:00:00Z`);
	const last = new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0),
	);
	last.setUTCDate(Math.min(date.getUTCDate(), last.getUTCDate()));
	return last.toISOString().slice(0, 10);
}

/** Called only after date/range validation. No partial-month contributions. */
export function fullMonths(day: string, deadline: string): number {
	let months = 0;
	while (months < 600 && savingsDate(day, months + 1) <= deadline) months++;
	return months;
}
