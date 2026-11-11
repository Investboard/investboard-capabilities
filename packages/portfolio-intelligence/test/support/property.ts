/** A small seeded generator for property tests, so runs are reproducible without a dependency. */
export interface Gen {
	double(min: number, max: number): number;
	int(min: number, max: number): number;
	pick<T>(values: readonly T[]): T;
	maybe<T>(make: () => T): T | null;
	array<T>(min: number, max: number, make: () => T): T[];
	string(min: number, max: number): string;
}

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function generator(seed: number): Gen {
	const next = mulberry32(seed);
	const gen: Gen = {
		double: (min, max) => min + next() * (max - min),
		int: (min, max) => min + Math.floor(next() * (max - min + 1)),
		pick: (values) =>
			values[gen.int(0, values.length - 1)] as (typeof values)[number],
		maybe: (make) => (next() < 0.5 ? null : make()),
		array: (min, max, make) => Array.from({ length: gen.int(min, max) }, make),
		string: (min, max) =>
			Array.from({ length: gen.int(min, max) }, () =>
				String.fromCharCode(gen.int(97, 122)),
			).join(""),
	};
	return gen;
}

/** Run `body` on `runs` independently seeded generators. */
export function forAll(
	runs: number,
	body: (gen: Gen) => void,
	seed = 20261111,
): void {
	for (let run = 0; run < runs; run++) body(generator(seed + run));
}
