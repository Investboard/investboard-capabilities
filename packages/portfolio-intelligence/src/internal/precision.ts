/** Compensated addition keeps many small positive amounts in the total. */
export class AmountSum {
	private total = 0;
	private correction = 0;
	add(value: number): void {
		const adjusted = value - this.correction;
		const next = this.total + adjusted;
		this.correction = next - this.total - adjusted;
		this.total = next;
	}
	get value(): number {
		return this.total;
	}
}

/** Remove binary representation noise only when comparing a policy boundary. */
export const comparisonShare = (share: number): number =>
	Number(share.toPrecision(15));
