/** Reading the holdings currency and hedge of a fund from its name. */
const WRAPPER = /\b(?:UCITS\s+)?ET[FCN]\b/gi;
const SHARE_CLASS_TAIL =
	/\s+\(?(?:USD|EUR|GBP|JPY|CHF)\)?\s*(?:\(\s*(?:acc|dist|inc)[a-z]*\.?\s*\)|(?:acc|dist|inc)[a-z]*\.?)\s*$/i;
const CURRENCY_TOKENS: readonly (readonly [string, RegExp])[] = [
	["USD", /\$|\bUSD\b|\bUS\s+Dollars?\b/i],
	["EUR", /€|\bEUR\b|\bEuro\b/i],
	["GBP", /£|\bGBP\b|\bSterling\b|\bGilts?\b/i],
	["JPY", /¥|\bJPY\b|\bYen\b/i],
	["CHF", /\bCHF\b|\bSwiss\s+Francs?\b/i],
];
function beforeShareClass(name: string): string {
	let cut = name.length;
	for (const match of name.matchAll(WRAPPER)) cut = match.index;
	const named = name.slice(0, cut);
	return cut < name.length ? named : named.replace(SHARE_CLASS_TAIL, "");
}
export function holdingsCurrencyOfFundName(
	name: string | null | undefined,
): string | null {
	if (!name) return null;
	const named = beforeShareClass(name);
	const found = CURRENCY_TOKENS.filter(([, token]) => token.test(named));
	return found.length === 1 ? (found[0]?.[0] ?? null) : null;
}
