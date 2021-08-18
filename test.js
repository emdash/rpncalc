#! /usr/bin/gjs
"use strict";

import {assert, debug, asImmutableObject} from './fp.js';
import * as calc from './calc.js';
import * as rat from './rat.js';


function assertEq(a, b) {
    // XXX: need a less brittle way to achieve deep equality
    const repr_a = JSON.stringify(a),
	  repr_b = JSON.stringify(b);

    if (repr_a !== repr_b) {
	throw `Assertion failed: \n${repr_a}\n!==\n${repr_b}`
    }
}


function assertThrows(callback, except) {
    assert((typeof callback) === "function");
    try {
	callback();
	throw `Expected exception: ${except}`;
    } catch (e) {
	assertEq(e, except);
    }
}

const accumulator = asImmutableObject(calc.accumulator);
const calculator = asImmutableObject(calc.calculator);


// Test the basic accumulator functionality.

assert(accumulator.isEmpty());
assert(accumulator.digit(4).digit(5).clear().isEmpty());
assert(accumulator.digit(4).decimal().digit(5).clear().isEmpty());
assert(accumulator.letter('a').letter('b').clear().isEmpty());

assertEq(
    accumulator,
    {type: "empty"}
);

assertThrows(
    () => accumulator.value(),
    "Empty Accumulator"
);

assertEq(
    accumulator.digit(4),
    {type: "dec", dec: 4}
);

assertEq(
    accumulator.digit(4).decimal().digit(5),
    {type: "float", frac: 5, dec: 4}
);

assertThrows(
    () => accumulator.digit(4).letter('a'),
    "Illegal: letter in numeral."
);

assertThrows(
    () => accumulator.digit(4).decimal().letter('a'),
    "Illegal: letter in numeral."
);

assertEq(
    accumulator.letter('a'),
    {type: "var", id: 'a'}
);

assertEq(
    accumulator.letter('a').digit('0'),
    {type: "var", id: "a0"}
);

assertThrows(
    () => accumulator.letter('a').decimal(),
    "Illegal: decimal point in word."
);


// Test accumulator display.


assertEq(
    accumulator.display(),
    ""
);

assertEq(
    accumulator.lift({type: "dec", dec: 4}).display(),
    "4"
);

assertEq(
    accumulator.lift({type: "float", dec: 4, frac: 123}).display(),
    "4.123"
);

assertEq(
    accumulator.lift({type: "var", id: "abc"}).display(),
    "abc"
);


// Test accumulator value.


assertThrows(
    () => accumulator.value(),
    "Empty Accumulator"
);

assertEq(
    accumulator.lift({type: "dec", dec: 4}).value(),
    4
);

assertEq(
    accumulator.lift({type: "float", dec: 4, frac: 123}).value(),
    4.123
);

assertEq(
    accumulator.lift({type: "var", id: "abc"}).value(),
    "abc"
);


// Test basic calculator operation


assertEq(
    calculator,
    {
	ops: calc.builtins,
	stack: [],
	tape: [],
	defs: calc.constants,
	accum: accumulator,
	showing: "basic"
    }
);

assertEq(
    calculator.digit(4),
    {
	ops: calc.builtins,
	stack: [],
	tape: [],
	defs: calc.constants,
	accum: accumulator.digit(4),
	showing: "basic"
    }
);

assertEq(
    calculator.digit(4).enter(),
    {
	ops: calc.builtins,
	stack: [4],
	tape: [4],
	defs: calc.constants,
	accum: accumulator,
	showing: "basic"
    }
);

assertEq(
    calculator
	.digit(4)
	.enter()
	.digit(5)
	.operator("add"),
    {
	ops: calc.builtins,
	stack: [9],
	tape: [4, 5, "add"],
	defs: calc.constants,
	accum: accumulator,
	showing: "basic"
    }
);

assertEq(
    calculator
	.digit(1)
	.digit(0)
	.enter()
	.digit(5)
	.operator("add"),
    {
	ops: calc.builtins,
	stack: [15],
	tape: [10, 5, "add"],
	defs: calc.constants,
	accum: accumulator,
	showing: "basic"
    }
);


// Test basic floating point composition.
assertEq(rat.ldexp({exponent:  2, mantissa: 1}),  4);
assertEq(rat.ldexp({exponent: -3, mantissa: 1}), 0.125);

// Test floating point decomposition.
assertEq(rat.frexp(4),     {exponent: 2,  mantissa: 1});
assertEq(rat.frexp(0.125), {exponent: -3, mantissa: 1});
assertEq(rat.frexp(125),   {exponent: 6,  mantissa: 1.953125});

// Test equivalency of fp composition and decomposition.
assertEq(rat.ldexp(rat.frexp(4)),         4);
assertEq(rat.ldexp(rat.frexp(0.125)), 0.125);
assertEq(rat.ldexp(rat.frexp(125)),     125);
assertEq(
    rat.frexp(rat.ldexp({exponent: 2,  mantissa: 1})),
    {exponent: 2, mantissa: 1}
);

// Test that euclid's algorithm works.
assertEq(rat.gcd(1, 1),  1);
assertEq(rat.gcd(2, 1),  1);
assertEq(rat.gcd(4, 8),  4);
assertEq(rat.gcd(45, 15), 15);
assertEq(rat.gcd(66, 77), 11);

// Test that simplification works
assertEq(
    rat.simplify({num: 4, denom: 12}),
    {num: 1, denom: 3}
);

// Test to / from proper fractions.
assertEq(
    rat.toProper({num: 5, denom: 4}),
    {integer: 1, num: 1, denom: 4}
);

assertEq(
    rat.fromProper({integer:1, num: 1, denom: 4}),
    {num: 5, denom: 4}
);

// Test to / from strings
assertEq(
    rat.toString({num: 1, denom: 4}),
    "1/4"
);

assertEq(
    rat.toString({num: 5, denom: 4}, true),
    "1-1/4"
);

assertEq(
    rat.toFloat({num: 1, denom: 4}),
    0.25
);

assertEq(
    rat.fromFloat(0.25),
    {num: 1, denom: 4}
);

assertEq(
    rat.fromFloat(0.375),
    {num: 3, denom: 8}
);

assertEq(
    rat.add(rat.zero, rat.one),
    {num: 1, denom: 1}
);

assertEq(
    rat.add({num: 3, denom: 16}, {num: 3, denom: 4}),
    {num: 15, denom: 16}
);

assertEq(
    rat.mul({num: 3, denom: 4}, {num: 100, denom: 1}),
    {num: 75, denom: 1}
);

assertEq(
    rat.div(rat.one, rat.fromFloat(4)),
    {num: 1, denom: 4}
);

assertEq(
    rat.div({num: 5, denom: 16}, {num: 1, denom: 16}),
    {num: 5, denom: 1}
);

assertEq(
    rat.div(rat.fromFloat(12.7), rat.fromFloat(25.4)),
    {num: 1, denom: 2}
);

assertEq(
    rat.inv(rat.fromFloat(4)),
    {num: 1, denom: 4}
);

assertEq(
    rat.neg({num: 1, denom: 8}),
    {num: -1, denom: 8}
);

assertEq(
    rat.neg({num: -1, denom: 8}),
    {num: 1, denom: 8}
);

assertEq(
    rat.abs({num: 1, denom: 8}),
    {num: 1, denom: 8}
);

assertEq(
    rat.abs({num: -1, denom: 8}),
    {num: 1, denom: 8}
);
