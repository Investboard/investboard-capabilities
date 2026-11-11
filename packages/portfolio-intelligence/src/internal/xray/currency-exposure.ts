/** Economic currency exposure: the currencies behind the holdings, net of hedging read from fund names. */
import {
	type BucketContributor,
	type DimensionBucket,
	finalizeDimensionBuckets,
} from "./buckets.js";
import { proRateVector } from "./classification-buckets.js";
import type { ClassificationVectorEntry } from "./types.js";
const EURO_COUNTRIES: ReadonlySet<string> = new Set([
	"AT",
	"BE",
	"BG",
	"CY",
	"DE",
	"EE",
	"ES",
	"FI",
	"FR",
	"GR",
	"HR",
	"IE",
	"IT",
	"LT",
	"LU",
	"LV",
	"MT",
	"NL",
	"PT",
	"SI",
	"SK",
	"AD",
	"MC",
	"ME",
	"SM",
	"VA",
	"XK",
]);
const OFFSHORE_REGISTRIES: ReadonlySet<string> = new Set([
	"AI",
	"BM",
	"BS",
	"CW",
	"GG",
	"GI",
	"IM",
	"JE",
	"KY",
	"LR",
	"MH",
	"TC",
	"VG",
]);
const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
	US: "USD",
	PR: "USD",
	GU: "USD",
	VI: "USD",
	EC: "USD",
	SV: "USD",
	PA: "USD",
	GB: "GBP",
	CH: "CHF",
	LI: "CHF",
	JP: "JPY",
	CA: "CAD",
	AU: "AUD",
	NZ: "NZD",
	SE: "SEK",
	DK: "DKK",
	FO: "DKK",
	GL: "DKK",
	NO: "NOK",
	IS: "ISK",
	PL: "PLN",
	CZ: "CZK",
	HU: "HUF",
	RO: "RON",
	RS: "RSD",
	TR: "TRY",
	RU: "RUB",
	UA: "UAH",
	GE: "GEL",
	IL: "ILS",
	SA: "SAR",
	AE: "AED",
	QA: "QAR",
	KW: "KWD",
	BH: "BHD",
	OM: "OMR",
	JO: "JOD",
	EG: "EGP",
	MA: "MAD",
	NG: "NGN",
	KE: "KES",
	ZA: "ZAR",
	CN: "CNY",
	HK: "HKD",
	MO: "MOP",
	TW: "TWD",
	KR: "KRW",
	IN: "INR",
	PK: "PKR",
	BD: "BDT",
	LK: "LKR",
	SG: "SGD",
	MY: "MYR",
	TH: "THB",
	ID: "IDR",
	PH: "PHP",
	VN: "VND",
	KZ: "KZT",
	MN: "MNT",
	BR: "BRL",
	MX: "MXN",
	AR: "ARS",
	CL: "CLP",
	CO: "COP",
	PE: "PEN",
	UY: "UYU",
	MU: "MUR",
};
export function countryToCurrency(
	country: string | null | undefined,
): string | null {
	if (!country) return null;
	const iso = country.trim().toUpperCase();
	if (OFFSHORE_REGISTRIES.has(iso)) return null;
	if (EURO_COUNTRIES.has(iso)) return "EUR";
	return Object.hasOwn(COUNTRY_CURRENCY, iso)
		? (COUNTRY_CURRENCY[iso] ?? null)
		: null;
}
export interface FundHedge {
	currency: string | null;
}
const HEDGE_CODES = [
	"EUR",
	"EO",
	...new Set(Object.values(COUNTRY_CURRENCY)),
].join("|");
const SHORT_H_CODES = "EUR|EO|USD|GBP|CHF";
const GERMAN_HEDGE = "w(?:\u00e4|ae|a)hrungs(?:ab)?gesichert";
const CODE_THEN_HEDGE = new RegExp(
	`\\b(${HEDGE_CODES})[\\s\\-]*(?:(?:currency|fx|ccy)[\\s\\-]*)?(?:hedged|hedge|hdg|hgd|${GERMAN_HEDGE})\\b`,
	"i",
);
const CODE_THEN_SHORT_H = new RegExp(
	`\\b(${SHORT_H_CODES})[\\s\\-]*hd?\\b`,
	"i",
);
const HEDGE_THEN_CODE = new RegExp(
	`(?:\\b(?:hedged|hedg|hdg)[\\s.\\-]*(?:to|into|in)?[\\s\\-]*\\(?|\\bh\\.)(${HEDGE_CODES})\\b`,
	"i",
);
const PAREN_CODE_THEN_HEDGE = new RegExp(
	`\\((${HEDGE_CODES})\\)[^()]*\\b(?:hedged|hdg)\\b(?![\\s\\-]+(?:equity|income|strategy))`,
	"i",
);
const GENERIC_CURRENCY_HEDGE = new RegExp(
	`\\b(?:currency|fx|ccy)[\\s\\-]*hedged\\b|${GERMAN_HEDGE}`,
	"i",
);
function hedgeCode(raw: string): string {
	const code = raw.toUpperCase();
	return code === "EO" ? "EUR" : code;
}
export function hedgeOfFundName(
	name: string | null | undefined,
): FundHedge | null {
	if (!name) return null;
	const before = CODE_THEN_HEDGE.exec(name) ?? CODE_THEN_SHORT_H.exec(name);
	if (before?.[1]) return { currency: hedgeCode(before[1]) };
	const after = HEDGE_THEN_CODE.exec(name);
	if (after?.[1]) return { currency: hedgeCode(after[1]) };
	const paren = PAREN_CODE_THEN_HEDGE.exec(name);
	if (paren?.[1]) return { currency: hedgeCode(paren[1]) };
	if (GENERIC_CURRENCY_HEDGE.test(name)) return { currency: null };
	return null;
}
export interface ForeignCurrencies {
	weight: number;
	top: {
		key: string;
		weight: number;
	} | null;
}
export function foreignCurrencies(
	buckets: ReadonlyArray<{
		key: string;
		weight: number;
	}>,
	baseCurrency: string,
): ForeignCurrencies {
	const base = baseCurrency.trim().toUpperCase();
	let weight = 0;
	let top: ForeignCurrencies["top"] = null;
	for (const b of buckets) {
		if (b.key === "unknown" || b.key.toUpperCase() === base) continue;
		weight += b.weight;
		if (!top || b.weight > top.weight) top = { key: b.key, weight: b.weight };
	}
	return { weight, top };
}
export interface CurrencyFundInput {
	id: string;
	label: string;
	isin: string | null;
	value: number;
	countryVector: ClassificationVectorEntry[] | null;
	hedge: FundHedge | null;
}
export interface CurrencyDirectInput {
	id: string;
	label: string;
	isin: string | null;
	value: number;
	country: string | null;
}
export interface HedgedFund {
	id: string;
	label: string;
	isin: string | null;
	currency: string | null;
	value: number;
	weight: number;
}
export interface CurrencyExposureResult {
	buckets: DimensionBucket[];
	coverage: number;
	hedged: HedgedFund[];
}
function round4(v: number): number {
	return Number(v.toFixed(4));
}
class HolderLedger {
	private readonly acc = new Map<string, Map<string, number>>();
	private readonly meta = new Map<
		string,
		{
			label: string;
			isin: string | null;
		}
	>();
	holder(id: string, label: string, isin: string | null): void {
		this.meta.set(id, { label, isin });
	}
	add(key: string, holder: string, value: number): void {
		if (!(value > 0)) return;
		const byHolder = this.acc.get(key) ?? new Map<string, number>();
		byHolder.set(holder, (byHolder.get(holder) ?? 0) + value);
		this.acc.set(key, byHolder);
	}
	groups(totalValue: number): Map<
		string,
		{
			value: number;
			contributors: BucketContributor[];
		}
	> {
		const out = new Map<
			string,
			{
				value: number;
				contributors: BucketContributor[];
			}
		>();
		for (const [key, byHolder] of this.acc) {
			let value = 0;
			const contributors: BucketContributor[] = [];
			for (const [id, v] of byHolder) {
				value += v;
				const m = this.meta.get(id);
				contributors.push({
					id,
					label: m?.label ?? id,
					isin: m?.isin ?? null,
					weight: round4(v / totalValue),
				});
			}
			out.set(key, { value, contributors });
		}
		return out;
	}
}
function foldFund(f: CurrencyFundInput, ledger: HolderLedger): void {
	const { entries, unknown } = proRateVector(f.value, f.countryVector);
	if (f.hedge && entries.length > 0) {
		ledger.add(f.hedge.currency ?? "unknown", f.id, f.value);
		return;
	}
	for (const e of entries) {
		ledger.add(countryToCurrency(e.key) ?? "unknown", f.id, e.value);
	}
	ledger.add("unknown", f.id, unknown);
}
const isPositive = (value: number): boolean =>
	Number.isFinite(value) && value > 0;
export function currencyExposure(input: {
	funds: readonly CurrencyFundInput[];
	direct: readonly CurrencyDirectInput[];
	totalValue: number;
}): CurrencyExposureResult {
	const { totalValue } = input;
	if (!(totalValue > 0)) return { buckets: [], coverage: 0, hedged: [] };
	const funds = input.funds.filter((f) => isPositive(f.value));
	const direct = input.direct.filter((d) => isPositive(d.value));
	const ledger = new HolderLedger();
	for (const f of funds) {
		ledger.holder(f.id, f.label, f.isin);
		foldFund(f, ledger);
	}
	for (const d of direct) {
		ledger.holder(d.id, d.label, d.isin);
		ledger.add(countryToCurrency(d.country) ?? "unknown", d.id, d.value);
	}
	const buckets = finalizeDimensionBuckets(
		ledger.groups(totalValue),
		totalValue,
	).sort((a, b) =>
		a.key === "unknown" ? 1 : b.key === "unknown" ? -1 : b.weight - a.weight,
	);
	const equityValue =
		funds.reduce((s, f) => s + f.value, 0) +
		direct.reduce((s, d) => s + d.value, 0);
	const assigned = buckets.reduce(
		(s, b) => (b.key === "unknown" ? s : s + b.value),
		0,
	);
	const hedged: HedgedFund[] = funds
		.filter(
			(f) =>
				f.hedge !== null &&
				proRateVector(f.value, f.countryVector).entries.length > 0,
		)
		.map((f) => ({
			id: f.id,
			label: f.label,
			isin: f.isin,
			currency: f.hedge?.currency ?? null,
			value: f.value,
			weight: round4(f.value / totalValue),
		}))
		.sort((a, b) => b.value - a.value);
	return {
		buckets,
		coverage:
			equityValue > 0 ? Math.max(0, Math.min(1, assigned / equityValue)) : 0,
		hedged,
	};
}
