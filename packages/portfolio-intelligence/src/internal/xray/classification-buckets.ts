/** Sector, country and region buckets from fund breakdowns and direct classifications, with explicit unknown mass. */
import type { BucketContributor } from "./buckets.js";
import {
	type ClassificationContribution,
	type ClassificationSource,
	classificationSources,
} from "./classification-sources.js";
import { countryToRegion } from "./region.js";
import type { ClassificationVectorEntry } from "./types.js";
export interface ClassificationEtfInput {
	value: number;
	source?: ClassificationSource;
	vector: ClassificationVectorEntry[] | null;
}
export interface ClassificationDirectInput {
	value: number;
	key: string | null;
	source?: ClassificationSource;
}
export interface ClassificationBucket {
	key: string;
	value: number;
	weight: number;
	contributors?: BucketContributor[];
	contributorsTail?: {
		count: number;
		weight: number;
	} | null;
}
export interface ClassificationResult {
	buckets: ClassificationBucket[];
	coverage: number;
}
const RESIDUAL_MIN_VALUE = 0.005;
function assembleBuckets(
	acc: Map<string, number>,
	totalValue: number,
): ClassificationResult {
	if (!(totalValue > 0)) return { buckets: [], coverage: 0 };
	const buckets = [...acc.entries()]
		.map(([key, value]) => ({ key, value, weight: value / totalValue }))
		.sort((a, b) =>
			a.key === "unknown" ? 1 : b.key === "unknown" ? -1 : b.weight - a.weight,
		);
	const classified = buckets.reduce(
		(s, b) => (b.key === "unknown" ? s : s + b.value),
		0,
	);
	return {
		buckets,
		coverage: Math.max(0, Math.min(1, classified / totalValue)),
	};
}
export function proRateVector(
	value: number,
	vector: ClassificationVectorEntry[] | null,
): {
	entries: Array<{
		key: string;
		value: number;
	}>;
	unknown: number;
} {
	const valid = (vector ?? []).filter(
		(v) => v.weight > 0 && Number.isFinite(v.weight),
	);
	const sum = valid.reduce((s, v) => s + v.weight, 0);
	if (valid.length === 0 || sum <= 0) return { entries: [], unknown: value };
	const scale = sum > 1 ? 1 / sum : 1;
	let covered = 0;
	const entries = valid.map((v) => {
		const share = value * v.weight * scale;
		covered += share;
		return { key: v.key, value: share };
	});
	const remainder = value - covered;
	return {
		entries,
		unknown: remainder > RESIDUAL_MIN_VALUE ? remainder : 0,
	};
}
export function classificationBuckets(input: {
	etfs: ClassificationEtfInput[];
	direct: ClassificationDirectInput[];
	totalValue: number;
}): ClassificationResult {
	const { etfs, direct, totalValue } = input;
	if (!(totalValue > 0)) return { buckets: [], coverage: 0 };
	const acc = new Map<string, number>();
	const sources: ClassificationContribution[] = [];
	const attributable = [...etfs, ...direct].every((row) => row.source);
	const add = (key: string, value: number) =>
		acc.set(key, (acc.get(key) ?? 0) + value);
	for (const e of etfs) {
		const { entries, unknown } = proRateVector(e.value, e.vector);
		for (const entry of entries) {
			add(entry.key, entry.value);
			if (e.source) sources.push({ ...entry, source: e.source });
		}
		if (entries.length === 0 || unknown > 0) {
			add("unknown", unknown);
			if (e.source)
				sources.push({ key: "unknown", value: unknown, source: e.source });
		}
	}
	for (const d of direct) {
		if (!Number.isFinite(d.value)) continue;
		add(d.key ?? "unknown", d.value);
		if (d.source)
			sources.push({
				key: d.key ?? "unknown",
				value: d.value,
				source: d.source,
			});
	}
	const result = assembleBuckets(acc, totalValue);
	if (!attributable) return result;
	const contributions = classificationSources(sources, totalValue);
	return {
		...result,
		buckets: result.buckets.map((row) => ({
			...row,
			...contributions.get(row.key),
		})),
	};
}
export function regionBucketsFromCountry(
	country: ClassificationResult,
	totalValue: number,
): ClassificationResult {
	const acc = new Map<string, number>();
	const sources: ClassificationContribution[] = [];
	for (const b of country.buckets) {
		const key = b.key === "unknown" ? "unknown" : countryToRegion(b.key);
		acc.set(key, (acc.get(key) ?? 0) + b.value);
		for (const row of b.contributors ?? [])
			sources.push({ key, source: row, value: row.weight * totalValue });
	}
	const result = assembleBuckets(acc, totalValue);
	if (country.buckets.some((row) => !row.contributors || row.contributorsTail))
		return result;
	const contributions = classificationSources(sources, totalValue);
	return {
		...result,
		buckets: result.buckets.map((row) => ({
			...row,
			...contributions.get(row.key),
		})),
	};
}
