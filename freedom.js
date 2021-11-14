/* Some might think it's silly to even implement this, but the truth
 * is I am needing this stuff on a daily basis, so here goes.
 *
 * Not aiming for perfection, just something that works well in the
 * woodshop, backyard, shop, job-site, and / or kitchen.
 *
 * So we're focused only on the legacy customary units that are
 * *commonly* used (no rods, chains, furlongs, or even stones (sorry
 * brits)). to wit:
 *
 * Length:
 * - inches (and fractions thereof), feet, yards, miles
 *
 * Area:
 * - inches^2, ft^2, mi^2, acres^
 *
 * Volume:
 * - cubic inches and derrived units
 *   - feet, yards
 *   - board feet
 *   - cords
 *   - acre-feet (and "inches of rain").
 * - gallons, and derrived units
 *   - tsp, tblsp (and silly fractions thereof)
 *   - cups (and silly fractions thereof)
 *   - quarts, pints
 *
 * Weight / Force (the customary system hopelessly conflates them):
 * - ounces, pounds, tons
 * - slugs (not supported, no one fucking uses these)
 * - kip -- maybe, if enough of my engineering peeps insist
 *
 * Torque:
 * - pound-feet, pound-inch, ounce-inch
 *
 * We're not doing rigorous dimensional analysis, but at least the
 * following should be supported.
 * - length x length -> area
 * - area x length -> volume
 * - length * weight -> torque [sic]
 * - area / length -> length
 * - torque / weight -> length
 * - torque / length -> weight
 * 
 * Other stuff is far less important, as for anything serious any sane
 * person would choose the SI system, and then convert back, rounding
 * off as appropriate.
 *
 * The goal here is is that basic calculations on round numbers should
 * produce clean, exact answers.
 *
 * When rounding is required, round to the nearest practical unit:
 *  - `4 gal 27 div` should round to the nearest 1/4tsp.
 *  - `1'2 3/4" 5/32" div` should round to the nearest 1/32".
 */


import {debug, change} from './fp.js';
import rat from './rat.js';

// Some facts that "everybody" knows.
const inches_per_foot = 12;
const inches_per_yard = 3 * inches_per_foot;
const inches_per_mile = 5280 * inches_per_foot;

// XXX: duplicate; where should this live?
const hide_zero = (x, f) => (x === 0) ? "" : f(x);

// Factor out arithmetic operations.
const dimension({tag, validate, to, from}) => impl_ops({
    tag,
    validate,
    to,
    from,
    toString
});

// If you squint, you can kinda see a DSL for units emerging.
//
// This could be a class, I suppose. If you like that sortof thing.
const length = dimension("inches", {
    validate: ({mi, yd, ft, inch}) => {
	rat.assertInt(mi);
	rat.assertInt(yd);
	rat.assertInt(ft);
	rat.assertRat(inch); },
    to: ({mi, yd, ft, inch}) => {
	const inches = toProper({inch});
	const feet: ((5280 * (mi || 0)) + 3 * (yd || 0));
	const whole_inches: 12 * feet + inches.integer;
	const num = whole_inches * inches.denom + inches.num;
	const denom = inches.denom;	
	return simplify({num, denom}); },
    from: (inches) => {
	const {integer, num, denom} = toProper({inches});
	const [mi, yd, ft, inch] = fp.change(integer, [
	    // These must appear in descending order
	    inches_per_mile,
	    inches_per_yard,
	    inches_per_foot
	]);
	return {
	    mi, yd, ft,
	    inch: rat.fromProper({integer: inch, num, denom})
	}; },
    toString: ({mi, yd, ft, inch}) => {
	return [
	    hide_zero(mi, x => `${x}mi`),
	    hide_zero(yd, x => `${x}yd`),
	    hide_zero(ft, x => `${x}'`),
	    `${rat.toString(rat.toProper(x))}"`
	].join(" "); }
});


function ops(dim) { return {
    add: (a, b) => {
	const num = a.num * b.denom + b.num * a.denom;
	const denom = a.denom * b.denom;
	return {num, denom};
    }

    // Subtract two rational numbers.
    sub: (a, b) => {
	const num = a.num * b.denom - b.num * a.denom;
	const denom = a.denom * b.denom;
	return {num, denom};
    }

    export function lt(a, b) {
	return a.num * b.denom < b.num * a.denom;
    }

    export function lte(a, b) {
	return a.num * b.denom <= b.num * a.denom;
    }

    export function gt(a, b) {
	return a.num * b.denom > b.num * a.denom;
    }

    export function gte(a, b) {
	return a.num * b.denom >= b.num * a.denom;
    }

    // Multiply two rational numbers
    export function mul(a /*: Rat */, b /*: Rat */) /*: Rat */ {
	const num = a.num * b.num;
	const denom = a.denom * b.denom;
	return {num, denom};
    }

    // Divide two rational numbers.
    export function div(a /*: Rat */, b /*: Rat */) /*: Rat */ {
	return mul(a, inv(b));
    }

    // Multiplicative inverse of the given rational.
    export function inv(value /*: Rat */) /*: Rat */ {
	return {num: value.denom, denom: value.num};
    }

    // Return the nearest whole number less than `value`.
    export function floor(value /*: Rat */) /*: Rat */ {
	return {num: Math.floor(value.num / value.denom) , denom: 1};
    }

    // Return the nearest whole number gerater than `value`.
    export function ceil(value /*: Rat */) /*: Rat */ {
	return {num: Math.ceil(value.num / denom), denom: 1};
    }

    // Return the additive inverse of value.
    export function neg(value /*: Rat */) /*: Rat */ {
	return {num: -value.num, denom: value.denom};
    }

    // Take the absolute value of the given rational.
    export function abs(value /*: Rat */) /*: Rat */ {
	return {num: Math.abs(value.num), denom: value.denom};
    }

}


// Return the nearest approximation of x with the given denominator.
//
// Currently this uses brute force, but I'm too tired to try anything
// else right now.
export function approx(value /*: Rat */, denom /*: Int */) {
    const limit = {num: 1, denom: denom};

    // Convert to proper fraction so that the num is always < denom.
    const proper = toProper(promote(value));

    if (typeof(denom) !== "number" || (denom !== Math.floor(denom))) {
	throw new Error(`${denom} is not an integer`);
    }

    // Find the best approximation.

    // XXX: this is O(denom), we can surely do better. OTOH, denom is
    // almost always going to be < value.denom, and most likely <
    // 64. So there's a limit to how bad this really is.
    //
    // But I have to believe there's a better method than brute force.
    let num = 0;
    for (let i = 0, bestErr = one; i <= denom; i++) {
	const error = abs(sub(proper, {num: i, denom}));
	if (lt(error, bestErr)) {
	    num = i;
	    bestErr = error;
	}
    }

    return simplify({num: proper.integer * denom + num, denom});
}


