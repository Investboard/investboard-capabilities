// Copyright 2026 Investboard GmbH. SPDX-License-Identifier: Apache-2.0
import { assertNever } from "../assert.js";
import type { Snapshot } from "./types.js";
export { assertNever };
export type OpeningBoundaryKind =
	| "first-date"
	| "boundary-snapshot"
	| "boundary-folded-carry"
	| "non-boundary-carry";
export type TerminalBoundaryKind =
	| "terminal-flow-stripped"
	| "mid-boundary-snapshot-stripped"
	| "mid-boundary-prev-snapshot"
	| "mid-boundary-no-snapshot-carry"
	| "non-boundary-carry";
export interface OpeningBoundaryContext {
	firstDate: string;
	boundaryDatesSet: ReadonlySet<string>;
	snapshotMap: ReadonlyMap<string, number>;
}
export interface TerminalBoundaryContext {
	lastDate: string;
	boundaryDatesSet: ReadonlySet<string>;
	snapshotMap: ReadonlyMap<string, number>;
	sorted: Snapshot[];
}
export function classifyOpeningBoundary(
	interval: {
		from: string;
		to: string;
	},
	ctx: OpeningBoundaryContext,
): OpeningBoundaryKind {
	if (interval.from === ctx.firstDate) {
		return "first-date";
	}
	if (ctx.boundaryDatesSet.has(interval.from)) {
		return ctx.snapshotMap.has(interval.from)
			? "boundary-snapshot"
			: "boundary-folded-carry";
	}
	return "non-boundary-carry";
}
export function classifyTerminalBoundary(
	interval: {
		from: string;
		to: string;
	},
	ctx: TerminalBoundaryContext,
): TerminalBoundaryKind {
	if (
		interval.to === ctx.lastDate &&
		ctx.boundaryDatesSet.has(interval.to) &&
		ctx.snapshotMap.has(interval.to)
	) {
		return "terminal-flow-stripped";
	}
	if (ctx.boundaryDatesSet.has(interval.to)) {
		if (ctx.snapshotMap.has(interval.to)) {
			return "mid-boundary-snapshot-stripped";
		}
		return getLatestSnapshotBefore(ctx.sorted, interval.to) !== null
			? "mid-boundary-prev-snapshot"
			: "mid-boundary-no-snapshot-carry";
	}
	return "non-boundary-carry";
}
export function getLatestSnapshotBefore(
	sorted: Snapshot[],
	date: string,
): Snapshot | null {
	let best: Snapshot | null = null;
	for (const s of sorted) {
		if (s.date < date) {
			best = s;
		} else {
			break;
		}
	}
	return best;
}
