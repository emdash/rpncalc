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

import {debug, assertInt} from './fp.js';


/*** Helper functions ********************************************************/


// Convert x to raw bytes, using DataView.
//
// XXX: JS says byte ordering is platform-dependeing. So this will
// break on non-intel.
function float64ToBytesLE(x) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    // Force little-endian encoding on big-endian machines.
    view.setFloat64(0, x, true);
    return new Uint8Array(buffer);
}

// Convert raw bytes to a float, using DataView.
function bytesToFloat64LE(bytes) {
    const view = new DataView(bytes.buffer);
    return view.getFloat64(0, true);
}

// Handle a fractional mantissa.
function normalize(exponent, mantissa) {
    if (!Number.isInteger(mantissa)) {
	return normalize(exponent - 1, mantissa * 2);
    } else {
	return {exponent, mantissa};
    }
}

// return the exponent and mantissa of a Number.
//
// based on:
// https://stackoverflow.com/questions/9383593/extracting-the-exponent-and-mantissa-of-a-javascript-number
//
// XXX: use builtin alternatives if any are available.
export function frexp(x /*: Number */) /* : {exponent: int, mantissa: int} */ {
    const bytes = float64ToBytesLE(x);

    // Extract the 11-bit exponent from the most-significant bytes
    // as an integer value.
    const exp_high = bytes[7],
	  exp_low  = bytes[6],
	  // mask off sign bit, and don't forget to subtract bias from exponent.
	  exponent = (((exp_high & 0b01111111) << 4) | (exp_low >> 4)) - 0x3ff;

    // Extract sign from the most-significant bit of the exponent.
    const sign = (exp_high >> 7) ? -1 : 1;

    // Extract the mantissa.
    const mantissa = sign * bytesToFloat64LE(new Uint8Array([
	// preserve the original bits of the mantissa
	...bytes.slice(0, 6),
	// force the exponent to 1.0
	0xf0 | exp_low,
	0b00111111,
    ]));

    // The mantissa might still contain a fractional part, so may need
    // to adjust the final value.
    return normalize(exponent, mantissa);
}


// Convert exponent / mantissa back to a float.
export const ldexp = ({exponent, mantissa}) => mantissa * 2 ** exponent;

// Euclid's algorithm for finding greatest common divider.
export const gcd = (a, b) => (b === 0) ? Math.abs(a) : gcd(b, a % b);


/*** Rational API ************************************************************/


// Construct a rational from its parts.
export const cons = (num, denom) => ({num: assertInt(num), denom: assertInt(denom)});

// Construct a rational from an integer.
export const fromInt = num => ({num: assertInt(num), denom: 1});

// Express rational in lowest terms.
export function simplify({num, denom}) {
    const g = gcd(Math.abs(assertInt(num)), Math.abs(assertInt(denom)));
    return cons(num / g, denom / g);
}

// Convert a rational to a proper fraction for display.
export function toProper(value) {
    const simplified = simplify(value);
    return {
	integer: Math.floor(simplified.num / simplified.denom),
	num: simplified.num % simplified.denom,
	denom: simplified.denom
    };
}

// Convert a proper fraction to a rational.
export function fromProper({integer, num, denom}) {
    return cons(integer * denom + num, denom);
}

// Convert a rational to a string.
export function toString(value) {
    const {integer, num, denom} = (value.integer !== undefined)
          ? value
          : toProper(value);
    return (integer === 0) ? `${num}/${denom}` : `${integer}-${num}/${denom}`;
}

// Convert a rational to a float.
export function toFloat(value) {
    const {num, denom} = simplify(value);
    return num / denom;
}

// Convert a floating point value to a Rational.
//
// Ported from the cypthon implementation.
export function fromFloat(value) {
    if (typeof value !== "number") {
	throw new Error(`${toString(value)} is already a fraction`);
    }

    if (!isFinite(value) || isNaN(value)) {
	throw new Error(
	    `${JSON.stringify(value)} cannot be expressed as a ratio!`
	);
    }

    // Get the exponent and mantissa
    let {exponent, mantissa} = frexp(value);

    if (exponent >= 0) {
	return cons(mantissa * (1 << exponent), 1);
    } else {
	return simplify(cons(mantissa, 2 ** -exponent));
    }
}

// Arithmetic operations
export const add   = (a,           b) => cons(a.num * b.denom + b.num * a.denom, a.denom * b.denom);
export const sub   = (a,           b) => cons(a.num * b.denom - b.num * a.denom, a.denom * b.denom);
export const mul   = (a,           b) => cons(a.num * b.num, a.denom * b.denom);
export const div   = (a,           b) => mul(a, inv(b));
export const inv   = ({num,   denom}) => cons(denom, num);
export const floor = ({num,   denom}) => cons(Math.floor(num / denom), 1);
export const ceil  = ({value, denom}) => cons(Math.ceil(num / denom), 1);
export const neg   = ({num,   denom}) => cons(-num, denom);
export const abs   = ({num,   denom}) => cons(Math.abs(num), denom);

// Comparisons
export const lt  = (a, b) => a.num * b.denom <  b.num * a.denom;
export const lte = (a, b) => a.num * b.denom <= b.num * a.denom;
export const gt  = (a, b) => a.num * b.denom >  b.num * a.denom;
export const gte = (a, b) => a.num * b.denom >= b.num * a.denom;

// Return the nearest approximation of x with the given denominator.
export function approx(value, denom) {
    const limit = {num: 1, denom: denom};

    // Convert to proper fraction so that the num is always < denom.
    const proper = toProper(value);

    if ((typeof(denom) !== "number") || (denom !== Math.floor(denom))) {
	throw new Error(`${denom} is not an integer`);
    }

    // XXX: this is O(denom), we can surely do better
    let num = 0;
    for (let i = 0, bestErr = cons(1, 1); i <= denom; i++) {
	const error = abs(sub(proper, {num: i, denom}));
	if (lt(error, bestErr)) {
	    num = i;
	    bestErr = error;
	}
    }

    return simplify(cons(proper.integer * denom + num, denom));
}

