export const MAX_SUPPORTED_WEALTH = 1_000_000_000;
export const toCents = (amount: number): number => Math.round(amount * 100);
export const cents = (amount: number): number => toCents(amount) / 100;
