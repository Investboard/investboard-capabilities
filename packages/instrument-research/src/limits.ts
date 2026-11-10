/** Resource and numeric bounds; source availability is always caller-controlled. */
export const LIMITS = Object.freeze({
	pointsPerSeries: 50_000,
	statements: 300,
	capitalizations: 100,
	maxCalendarYears: 100,
	amount: 1e12,
	absoluteStatementValue: 1e15,
	minimumPositiveValue: 1e-9,
	maximumPositiveValue: 1e12,
	fxCarryDays: 7,
	maxExecutionDelayDays: 7,
});
