#! /usr/bin/gjs
"use strict";

import {assert, debug, asImmutableObject} from './fp.js';
import * as calc from './calc.js';


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
