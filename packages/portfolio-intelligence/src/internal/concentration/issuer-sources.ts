import { isEquityBookClass } from "./issuer-vector.js";
import type { ConcentrationPosition, IssuerWeight } from "./types.js";
export interface SourceValues {
	directValue?: number;
	viaFunds: readonly {
		etf: string;
		id?: string;
		name?: string;
		value?: number;
	}[];
}
export function attachIssuerSources(
	issuers: readonly IssuerWeight[],
	positions: readonly ConcentrationPosition[],
	provenance: readonly (SourceValues | undefined)[],
	bookValue: number,
): IssuerWeight[] {
	if (
		!(bookValue > 0) ||
		!provenance.some((row) => row?.directValue !== undefined)
	)
		return [...issuers];
	const fundNames = new Map<string, string>();
	const grouped = new Map<
		string,
		{
			direct: number;
			funds: Map<string, number>;
		}
	>();
	for (const [index, position] of positions.entries()) {
		if (
			position.isUnvalued ||
			position.isResidual ||
			position.issuerScopeUncertain ||
			!isEquityBookClass(position.assetClass)
		)
			continue;
		const source = provenance[index];
		if (!source || source.directValue === undefined) continue;
		const values = [
			source.directValue,
			...source.viaFunds.map((fund) => fund.value),
		];
		if (
			values.some(
				(value) => value === undefined || !Number.isFinite(value) || value < 0,
			)
		)
			continue;
		const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
		if (!(total > 0) || Math.abs(total - position.value) > 0.005001) continue;
		const scale = position.value / total / bookValue;
		const entry = grouped.get(position.issuerId) ?? {
			direct: 0,
			funds: new Map<string, number>(),
		};
		entry.direct += source.directValue * scale;
		for (const fund of source.viaFunds) {
			const fundId = fund.id ?? fund.etf;
			if (fund.name) fundNames.set(fundId, fund.name);
			if (fund.value !== undefined && fund.value > 0)
				entry.funds.set(
					fundId,
					(entry.funds.get(fundId) ?? 0) + fund.value * scale,
				);
		}
		grouped.set(position.issuerId, entry);
	}
	return issuers.map((issuer) => {
		const entry = grouped.get(issuer.issuerId);
		const clampWeight = (weight: number) =>
			Math.min(issuer.weight, Math.max(0, weight));
		const directWeight = clampWeight(entry?.direct ?? 0);
		const viaFunds = [...(entry?.funds ?? [])]
			.map(([name, weight]) => ({
				id: name,
				name: fundNames.get(name) ?? name,
				weight: clampWeight(weight),
			}))
			.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
		return {
			...issuer,
			sources: {
				directWeight,
				viaFunds,
				unassignedWeight: Math.max(
					0,
					issuer.weight -
						directWeight -
						viaFunds.reduce((sum, fund) => sum + fund.weight, 0),
				),
			},
		};
	});
}
