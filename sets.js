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


import {debug, asImmutableObject} from './fp.js';


// Default comparison should work on strings and numbers.
function defaultCmp(a, b) {
    if (a < b) {
	return -1;
    } else if (a > b) {
	return 1;
    } else {
	return 0;
    }
}


/** 
 * An immutable set type which addresses the flaws of the builtin Set.
 *
 * In particular, the builtin Set doesn't provide:
 * - boolean operations
 * - equality between sets.
 *
 * This makes it fairly useless.
 * 
 * This type is parameterized on the comparison function, as required
 * by Array.sort.
 *
 * Internally, sets are represented as sorted arrays, which makes most
 * operations O(n * log(n)), which is unfortuante, but the best I can
 * with a reasonable amount of effort.
 */
export default function (cmp=defaultCmp) {
    // Convenient way to test for equality
    const equal = a => b => cmp(a, b) === 0;
    
    // This is the primary set constructor.
    const fromArray = arr => {
	// We use the Set builtin for deduplicating, and then sort the
	// resulting array before returning it as a new set.
	const s = [...new Set(arr)];
	s.sort(cmp);
	return {s};
    };

    // Construct a set from the keys or values of an object.
    const fromKeys   = obj => fromArray(Object.keys(obj));
    const fromValues = obj => fromArray(Object.values(obj));

    // Queries on sets
    const values   = ({s})    => s;
    const len      = ({s})    => s.length;
    const empty    = s        => len(s) === 0;
    const has      = ({s}, x) => s.find(equal(x)) !== undefined;
    const toString = s        => `{${values(s).join(', ')}}`;
    const eq       = (a, b)   => len(a) === len(b) && (
	// This only works because values are kept in sorted order.
	values(a).zip(values(b)).every(([a, b]) => equal(a)(b))
    );

    // Factor out what's common to boolean operations.
    const boolop = pred => (a, b) => {
	// Concatenate both sets
	let all = values(a).concat(values(b));
	
	// filter the result according to the predicate.
	return fromArray(all.filter(x => pred(has(a, x), has(b, x))));
    };

    // direct insertion
    const insert    = ({s}, ...els) => fromArray(s.concat(els));

    // The usual boolean operations
    const union     = boolop((a, b) => a ||  b);
    const intersect = boolop((a, b) => a &&  b);
    const diff      = boolop((a, b) => a && !b);
    const sdiff     = boolop((a, b) => a !=  b); // logical XOR.

    // For now we want to use sets as immutable objects.
    return asImmutableObject({
	init:         {s: []},
	methods:      {union, intersect, diff, sdiff, insert},
	properties:   {len, empty, has, values, eq, toString},
	constructors: {fromArray, fromKeys, fromValues}
    });
};
