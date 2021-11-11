import {debug} from './fp.js';


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
    if (!isInt(mantissa)) {
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


export function ldexp({exponent, mantissa}) {
    return mantissa * 2 ** exponent;
}


const isInt = (value) => value === parseInt(value);

function assertInt(value) {
    if (!isInt(value)) {
	throw new Error(`${value} is not an integer!`);
    }
    return value;
}

// euclid's algorithm for finding greatest common divider.
export function gcd(a /*: int */, b /* :int */) /*: int */ {
    if (b === 0) {
	return Math.abs(a);
    } else {
	return gcd(b, a % b);
    }
}

// type Rat = {num: int, denom: int};
// type Proper = {int: int, num: num, denom: denom};

// The zero  value for fractions.
export const zero = {num: 0, denom: 1};

// The unit value for fractions.
export const one = {num: 1, denom: 1};

// Reduce r to lowest terms.
export function simplify(r /*: Rat*/) /* : Rat */ {
    assertInt(r.num);
    assertInt(r.denom);
    const g = gcd(Math.abs(r.num), Math.abs(r.denom));
    const num = r.num / g;
    const denom = r.denom / g;
    return {num, denom};
}

// Convert a rational to a proper fraction.
//
// Mainly used for display purposes.
export function toProper(value /*: Rat*/) /*: Proper */ {
    const simplified = simplify(value);
    return {
	integer: Math.floor(simplified.num / simplified.denom),
	num: simplified.num % simplified.denom,
	denom: simplified.denom
    };
}

// Convert a proper fraction to a rational.
export function fromProper(value /*: Proper */) /*: Rat */ {
    return {
	num: value.integer * value.denom + value.num,
	denom: value.denom
    };
}

// Convert a rational to a string.
//
// This will render a value as a proper fraction.
export function toString(value /*: Proper | Rat */) /* : string */ {
    const proper = (value.int !== undefined) ? value : toProper(value);
    if (proper.integer === 0) {
	return `${proper.num}/${proper.denom}`;
    } else {
	return `${proper.integer}-${proper.num}/${proper.denom}`;
    }
}

// Convert a rational to a floating point value.
//
// Just perform the division.
export function toFloat(value /*: Rat */) /*: Number */ {
    return value.num / value.denom;
}

// Convert a floating point value to a Rational.
//
// Ported from the cypthon implementation.
export function fromFloat(value /*: Number*/) /*: Rat */ {
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
	return {
	    num: assertInt(mantissa * (1 << exponent)),
	    denom: 1
	};
    } else {
	return simplify({
	    num: assertInt(mantissa),
	    denom: assertInt(2 ** -exponent)
	});
    }
}

// Promote the given value to a rational if it is a number.
export const promote = (x) => (typeof(x) === "number") ? fromFloat(x) : x;

// Automagically promote the arguments of `func`.
export const promoted = (func) => (...args) => func(...args.map(promote));

// Add two rational numbers.
export function add(a /*: Rat */, b /*: Rat */) /*: Rat */ {
    const num = a.num * b.denom + b.num * a.denom;
    const denom = a.denom * b.denom;
    return {num, denom};
}

// Subtract two rational numbers.
export function sub(a /*: Rat */, b /*: Rat */) /*: Rat */ {
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


