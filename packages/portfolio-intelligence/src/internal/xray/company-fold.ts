/** Folding the class parts of one company back into one row for company-level figures. */
import { companyIdOf } from "./identity.js";
interface FoldablePosition {
	id: string;
	name: string;
	value: number;
	weight: number;
	issuerScopeUncertain?: boolean;
	provenance: {
		direct: number;
		directValue?: number;
		viaFunds: ReadonlyArray<{
			weight: number;
		}>;
	};
}
function round2(v: number): number {
	return Math.round(v * 100) / 100;
}
function round4(v: number): number {
	return Number(v.toFixed(4));
}
export function foldCompanyParts<T extends FoldablePosition>(
	positions: readonly T[],
): T[] {
	const byCompany = new Map<string, T[]>();
	for (const p of positions) {
		const company = companyIdOf(p.id);
		const parts = byCompany.get(company);
		if (parts) parts.push(p);
		else byCompany.set(company, [p]);
	}
	const out: T[] = [];
	for (const [id, parts] of byCompany) {
		const [only] = parts;
		if (parts.length === 1 && only) out.push(only);
		else out.push(foldParts(id, parts));
	}
	return out.sort((a, b) => b.weight - a.weight);
}
function foldParts<T extends FoldablePosition>(id: string, parts: T[]): T {
	const base = parts.find((p) => p.id === id) ?? (parts[0] as T);
	const own = parts.find((p) => p.provenance.direct > 0);
	const sum = (pick: (p: T) => number) =>
		parts.reduce((s, p) => s + pick(p), 0);
	const uncertain = parts.some((p) => p.issuerScopeUncertain === true);
	return {
		...base,
		id,
		name: own?.name ?? base.name,
		value: round2(sum((p) => p.value)),
		weight: round4(sum((p) => p.weight)),
		...(uncertain ? { issuerScopeUncertain: true } : {}),
		provenance: {
			...base.provenance,
			direct: round4(sum((p) => p.provenance.direct)),
			directValue: sum((p) => p.provenance.directValue ?? 0),
			viaFunds: parts
				.flatMap((p) => [...p.provenance.viaFunds])
				.sort((x, y) => y.weight - x.weight),
		},
	} as T;
}
