export interface EscalationBand<TTier extends string> {
	readonly tier: TTier;
	readonly floor: number;
}
export function escalationTierFor<TTier extends string>(
	weight: number,
	ladder: readonly EscalationBand<TTier>[],
): TTier | null {
	for (const { tier, floor } of ladder) {
		if (weight > floor) return tier;
	}
	return null;
}
