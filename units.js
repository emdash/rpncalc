// (c) 2021 Brandon Lewis
//
// This file is part of rpncalc.
//
// rpncalc is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// rpncalc is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with rpncalc.  If not, see <https://www.gnu.org/licenses/>.

/* Dimensional Analysis for US Customary Units. 
 *
 * Some might think it's silly to even even try.
 *
 * Not aiming for perfection, just something that works well in the
 * woodshop, backyard, shop, job-site, and / or kitchen.  Focusing on
 * *commonly* used units (no rods, chains, furlongs).
 * 
 * The approach is to represent the physical quantities as a vector of
 * exponents, one for each base unit. This is great for the SI system,
 * which has coherent units. Customary units are more complicated.
 *
 * Consider the following:
 * - `5_1/2mi 3/4_mi +`     -> answer in miles
 * - `5_1/2mi 330yd +`      -> answer in miles + yards.
 * - `5_1/2mi 500ft +`      -> answer in miles + feet.
 * - `5_1/2mi 5ft 1_3/4 + +`-> answer in miles + feet + inches.
 * 
 * Also note, the *smallest* unit mentioned calculation is always the
 * limit of precision, and gets the fractional values of the displayed
 * result, with the larger units being rounded down to the nearest
 * whole number.
 *
 * Open question when multiplying / dividing across dimensions:
 * obviously we add up exponents for the dimensions, but how do we
 * compose the unit sets if each dimensino mentions multiple units?
 * Because really we have a new "dimension" with compound units. But
 * not every combination of units mentioned will make sense.
 *
 * `5 ft 1 lbf mul` -> `5lbf-ft`
 * `5 ft 1 in add 1lbf mul` -> `5lbf-ft 1lbf-in`
 * `5.1 ft 1lbf mul` -> `5.1lbf-ft`
 *
 * Length:
 * - inches (and fractions thereof), feet, yards, miles
 * - nautical units, since these are still used
 * - hands? (sure, why not?)
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
 * Mass / Force (the customary system hopelessly conflates them):
 * - grains, drachms, ounces, pounds, tons
 *
 * Torque:
 * - pound-feet, pound-inch, ounce-inch
 *
 * We're not doing rigorous dimensional analysis, but at least the
 * following should be supported.
 * - a      + b      -> units must match
 * - a      - b      -> units must match
 * - any    x scalar -> preserve unit
 * - any    / scalar -> preserve unit
 * - any    / any    -> scalar
 * - length x length -> area
 * - area   x length -> volume
 * - length x weight -> torque [sic]
 * - area   / length -> length
 * - torque / weight -> length
 * - torque / length -> weight
 */

import {debug, asImmutableObject} from './fp.js';
import sets from './sets.js';
import * as rat from './rat.js';
import {UserError} from './error.js';

const set = sets();
const incompat_units = new UserError("Incompatible units");


// Some textbook stuff for counting change.
export function count(amount, coin, coins) {
    if (rat.gte(amount, coin)) {
	return count(rat.sub(amount, coin), coin, coins + 1);
    } else {
	return {amount, coins};
    }
}


// Some textbook stuff for counting change.
export function change(amount, coins) {
    if (coins.length > 0) {
	const result = count(amount, coins[0], 0);
	return [result.coins, ...change(result.amount, coins.slice(1))];
    } else {
	if (amount.num !== 0) {
	    return [amount];
	} else {
	    return [];
	}
    }
}


// A dimension is a named tuple of exponents.
export const dimension = (init) => {
    const {length, mass, time} = init;

    // Dimensions are exponents: mul adds, div subtracts, inv negates.
    // We can always perform these operations.
    const mul = (a, b) => a.zip(b).map(([a, b]) => a + b);
    const div = (a, b) => a.zip(b).map(([a, b]) => a - b);
    const inv = ()     => self.map(x => -x);

    // Equality is element-wise.
    const eq  = (a, b) => (["length", "mass", "time"]).all(k => a[k] === b[k]);

    return asImmutableObject({
	init,
	methods:    {mul, div, inv},
	properties: {eq}
    });
};


// XXX: fundamental units form an interesting pattern.
//
// can this be factored out?
export const scalar       = dimension({length: 0, mass: 0, time: 0});
export const length       = dimension({length: 1, mass: 0, time: 0});
export const mass         = dimension({length: 0, mass: 1, time: 0});
export const time         = dimension({length: 0, mass: 0, time: 1});
export const area         = length.mul(length);
export const volume       = area.mul(length);
export const velocity     = length.div(time);
export const acceleration = velocity.div(time);
export const momentum     = velocity.mul(mass);
export const density      = mass.div(volume);


/**
 * A `system` is a chain of of units along one `dimension` (see above).
 *
 * This is a narrower definition than colloquial usage:
 *  - a system based on *one* dimension.
 *  - "in", "hd", "ft", "yd, "mi" embody one system of length units.
 *  - "fl.oz", "C", "t", "T" embody a separate system, because these
 *     are *volume* units with no direct relationship to the inch (in the
 *     US, a fl.oz is defined in terms of mL).
 * 
 * Conversion between quantities within a system reduces to
 * change-counting.
 * 
 * Addition and subtraction within the same system preserves units.
 *
 * Multiplication and division implies higher / lower dimensional
 * versions of said unit.
 * 
 * Conversion between systems TBD.
 */
function system(dim, base, ...factors) {
    // create a mapping from unit name -> base unit conversion.
    //
    // integer and float values are coerced to fractions internally.
    const conversions = Object.fromEntries(
	factors
	    .map(({name, factor}) => [name, rat.promote(factor)])
	    .concat([[base, rat.promote(1)]])
    );
    
    // define comparison function for units.
    //
    // this uses the conversions table to sort units in order of their
    // conversion factor.
    const cmp_unit = (a, b) => {
	if (!conversions[a]) throw incompat_units;
	if (!conversions[b]) throw incompat_units;

	if (rat.lt(conversions[a], conversions[b])) {
	    return -1;
	} else if (rat.gt(conversions[a], conversions[b])) {
	    return 1;
	}

	return 0;
    };

    const units = set.fromKeys(conversions);

    // XXX: this feels like it should be common among all systems.
    // it seems a little weird to have a different scalar in each system.
    // otoh, 
    const scalar = value => ({
	dim: scalar,
	value: rat.promote(value),
	units: set
    });

    const withDim = (value, unit) => ({
	dim,
	value: rat.mul(rat.promote(value), conversions[unit]),
	units: set.insert(unit)
    });

    const matches = (e1, e2) => e1.eq(e2) ? e1 : raise(incompat_units);

    const binop = (vf, dimf) => (q1, q2) => ({
	dim:   dimf(q1.dim,  q2.dim),
	value: vf(q1.value, q2.value),
	units: q1.units.union(q2.units)
    });

    const add = binop(rat.add, matches);
    const sub = binop(rat.sub, matches);
    const mul = binop(rat.mul, (x, y) => x.mul(y));
    const div = binop(rat.div, (x, y) => x.div(y));

    // express the given quantity using the given set of units.
    const using = (q, ...us) => {
	us.sort(cmp_unit);
	us.reverse();

	const counted = change(q.value, us.map(u => conversions[u]));

	// XXX: little bit hacky. make sure to include final fraction
	if (counted.length > us.length) {
	    const last_unit = us[us.length - 1];
	    us.push("frac");
	    const frac = counted[counted.length - 1];
	    const factor = conversions[last_unit];
	    counted[counted.length - 1] = rat.simplify(rat.div(frac, factor));
	}

	return Object.fromEntries(us.zip(counted));
    };

    // express the given quantity using the default units
    const valueOf  = x => using(x, ...x.units.values());
    const toString = x => `${valueOf(x)}`;

    return asImmutableObject({
	methods:      {add, sub, mul, div},
	properties:   {using, valueOf, toString},
	constructors: {withDim, scalar}
    });
}

// helper method to condense system definitions.
const unit = (name, factor) => ({name, factor}); 

// define the system of inch-derrived units
export const inches = system(
    length, "in",
    unit("hd",         4),
    unit("ft",        12),
    unit("yd",    3 * 12),
    unit("mi", 5280 * 12)
);

// define the system of units based on the fluid ounce
export const floz = system(
    volume, "fl.oz",
    unit("gal",                  128),
    unit("qt",                    32),
    unit("pt",                    16),
    unit("C",                      8),
    unit("T",     {num:1, denom:   2}),
    unit("t",     {num:1, denom:   6}),
    unit("fl.dr", {num:1, denom:   8}),
    unit("ds",    {num:1, denom:  64}),
    unit("pn",    {num:1, denom: 128}),
    unit("smi",   {num:1, denom: 256}),
    unit("dr",    {num:1, denom: 567})
);

// define the system of weights based on the ounce.
export const oz = system(
    mass, "oz",
    unit("lb",         16),
    unit("ton", 2000 * 16)
);

// define the usual time abbreviations.
export const s = system(
    time, "s",
    unit("m",           60),
    unit("h",      60 * 60),
    unit("d", 24 * 60 * 60)
);
