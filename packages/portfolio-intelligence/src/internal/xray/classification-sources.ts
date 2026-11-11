/** Which source (constituent, fund breakdown, direct) classified each part of a bucket. */
import type { BucketContributor } from "./buckets.js";
export interface ClassificationSource {
	id: string;
	label: string;
	isin: string | null;
}
export interface ClassificationContribution {
	key: string;
	source: ClassificationSource;
	value: number;
}
export function classificationSources(
	rows: readonly ClassificationContribution[],
	totalValue: number,
): Map<
	string,
	{
		contributors: BucketContributor[];
		contributorsTail: {
			count: number;
			weight: number;
		} | null;
	}
> {
	const buckets = new Map<string, Map<string, BucketContributor>>();
	if (!(totalValue > 0)) return new Map();
	for (const { key, source, value } of rows) {
		if (!(value > 0) || !Number.isFinite(value)) continue;
		const bucket = buckets.get(key) ?? new Map<string, BucketContributor>();
		const previous = bucket.get(source.id);
		bucket.set(source.id, {
			...source,
			weight: (previous?.weight ?? 0) + value / totalValue,
		});
		buckets.set(key, bucket);
	}
	return new Map(
		[...buckets].map(([key, sources]) => {
			const labels = new Map<string, number>();
			for (const row of sources.values()) {
				const label = row.label.trim().toLowerCase();
				labels.set(label, (labels.get(label) ?? 0) + 1);
			}
			const sorted = [...sources.values()]
				.map((row) => ({
					...row,
					label:
						(labels.get(row.label.trim().toLowerCase()) ?? 0) > 1
							? `${row.label} · ${row.isin ?? row.id.replace(/^(isin|ticker):/, "")}`
							: row.label,
				}))
				.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
			const tail = sorted.slice(5);
			return [
				key,
				{
					contributors: sorted.slice(0, 5),
					contributorsTail: tail.length
						? {
								count: tail.length,
								weight: tail.reduce((sum, row) => sum + row.weight, 0),
							}
						: null,
				},
			] as const;
		}),
	);
}
