export const LIMITS = {
	amount: 1_000_000_000,
	months: 600,
	goals: 100,
	liquidityNeeds: 500,
	recurringPayments: 100,
} as const;

export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (amount: number): number => amount / 100;
