/** Average-linkage grouping of holdings that move together. */
import { GROUP_THRESHOLD } from "./types.js";
const EPS = 1e-12;
export function averageLinkage(
	corr: ReadonlyArray<ReadonlyArray<number>>,
	threshold: number = GROUP_THRESHOLD,
): number[][] {
	const clusters: number[][] = corr.map((_, i) => [i]);
	while (clusters.length > 1) {
		let best: [number, number] | null = null;
		let bestSim = Number.NEGATIVE_INFINITY;
		for (let a = 0; a < clusters.length; a++) {
			for (let b = a + 1; b < clusters.length; b++) {
				let sum = 0;
				let count = 0;
				for (const i of clusters[a]!) {
					for (const j of clusters[b]!) {
						sum += corr[i]![j]!;
						count++;
					}
				}
				const sim = sum / count;
				if (sim > bestSim + EPS) {
					bestSim = sim;
					best = [a, b];
				}
			}
		}
		if (best === null || bestSim < threshold - EPS) break;
		const [a, b] = best;
		clusters[a] = [...clusters[a]!, ...clusters[b]!].sort((x, y) => x - y);
		clusters.splice(b, 1);
	}
	return clusters;
}
