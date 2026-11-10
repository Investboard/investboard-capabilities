export const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
export function isIsinShape(value: string): boolean {
	return ISIN_PATTERN.test(value);
}
