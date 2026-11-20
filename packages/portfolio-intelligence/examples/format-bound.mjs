/** Display at most five significant digits while preserving the direction of a bound. */
export function formatBound({ value, bound }) {
	const roundingMode =
		bound === "lower" ? "floor" : bound === "upper" ? "ceil" : "halfExpand";
	return new Intl.NumberFormat("en", {
		maximumSignificantDigits: 5,
		roundingMode,
		useGrouping: false,
	}).format(value);
}
