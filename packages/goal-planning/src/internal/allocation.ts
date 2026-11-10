interface CashRequest {
	goalId: string;
	amountCents: number;
}

/** Exact largest remainder; code-point identity breaks ties across runtimes. */
export function allocate(requests: readonly CashRequest[], available: number) {
	const total = requests.reduce((sum, row) => sum + BigInt(row.amountCents), 0n);
	const budget = BigInt(available) < total ? BigInt(available) : total;
	const shares = requests.map((row) => {
		const numerator = budget * BigInt(row.amountCents);
		return {
			...row,
			fundedCents: total > 0n ? Number(numerator / total) : 0,
			remainder: total > 0n ? numerator % total : 0n,
		};
	});
	let remainder = Number(budget) - shares.reduce((sum, row) => sum + row.fundedCents, 0);
	const ordered = [...shares].sort((a, b) => {
		if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
		return a.goalId < b.goalId ? -1 : a.goalId > b.goalId ? 1 : 0;
	});
	for (const row of ordered) {
		if (remainder === 0) break;
		if (row.fundedCents < row.amountCents) {
			row.fundedCents++;
			remainder--;
		}
	}
	return shares.map(({ goalId, amountCents, fundedCents }) => ({
		goalId,
		amountCents,
		fundedCents,
	}));
}
