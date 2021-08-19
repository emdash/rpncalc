#! /usr/bin/gjs
"use strict";

import {assert, debug, asImmutableObject} from './fp.js';
import * as calc from './calc.js';
import * as rat from './rat.js';

// quick-and dirty helper to append an element to the document.
function append(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
}

// Bare-bones unit test framework.
function test(name, callback) {
    try {
	callback();
	const msg = `<tt>${name}<div style="float: right;">OK</div></tt>`;
	console.log(name, "ok");
	append(msg);
    } catch (e) {
	console.log(name, "Fail", e);
	append(`<tt>${name}<div style="float: right;">${e}</div></tt>`);
    }
}

// Deep-compare two values for equality, asserting if the values do
// not match.
function assertEq(a, b) {
    // XXX: need a less brittle way to achieve deep equality
    const repr_a = JSON.stringify(a),
	  repr_b = JSON.stringify(b);

    if (repr_a !== repr_b) {
	throw new Exception(`Assertion failed: \n${repr_a}\n!==\n${repr_b}`);
    }
}

// Assert if invoking `callback` does not throw the given exception.
function assertThrows(callback, except) {
    assert((typeof callback) === "function");
    try {
	callback();
	throw new Exception(`Expected exception: ${except}`);
    } catch (e) {
	assertEq(e, except);
    }
}

// Create class-like objects from accumulator and calculator modules.
//
// Since these are immutable, we only need one single, global
// instance. There is no setup or tear-down.
const accumulator = asImmutableObject(calc.accumulator);
const calculator = asImmutableObject(calc.calculator);


/* Test cases below **********************************************************/

test("test the test framework", () => {
    this_failure_is_expected;
});

test("accumulator.is_empty()", () => {
    assert(accumulator.isEmpty());
    assert(accumulator.digit(4).digit(5).clear().isEmpty());
    assert(accumulator.digit(4).decimal().digit(5).clear().isEmpty());
    assert(accumulator.letter('a').letter('b').clear().isEmpty());
});

test("accumulator is initialized empty", () => {
    assertEq(
	accumulator,
	{type: "empty"}
    );

    assertThrows(
	() => accumulator.value(),
	"Empty Accumulator"
    );
});

test("accumulator handles digits", () => {
    assertEq(
	accumulator.digit(4),
	{type: "dec", dec: 4}
    );

    assertEq(
	accumulator.digit(4).decimal().digit(5),
	{type: "float", frac: 5, dec: 4}
    );
});

test("accumulator rejects letters when in digit mode", () => {
    assertThrows(
	() => accumulator.digit(4).letter('a'),
	"Illegal: letter in numeral."
    );

    assertThrows(
	() => accumulator.digit(4).decimal().letter('a'),
	"Illegal: letter in numeral."
    );
});

test("accumulator accepts letters when empty", () => {
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
});

test("accumulator can display values", () => {
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
});

test("accumulator can produce values", () => {
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
});

test("calculator is initalized correctly", () => {
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
});

test("calculator accepts digits", () => {
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
});

test("calculator can perform operations", () => {
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
});

test("floating point composition", () => {
    assertEq(rat.ldexp({exponent:  2, mantissa: 1}),  4);
    assertEq(rat.ldexp({exponent: -3, mantissa: 1}), 0.125);
});

test("floating point decomposition", () => {
    assertEq(rat.frexp(4),     {exponent: 2,  mantissa: 1});
    assertEq(rat.frexp(0.125), {exponent: -3, mantissa: 1});
    assertEq(rat.frexp(125),   {exponent: 6,  mantissa: 1.953125});
});

test("floating composition and decomposition are consistent", () => {
    // Test equivalency of fp composition and decomposition.
    assertEq(rat.ldexp(rat.frexp(4)),         4);
    assertEq(rat.ldexp(rat.frexp(0.125)), 0.125);
    assertEq(rat.ldexp(rat.frexp(125)),     125);
    assertEq(
	rat.frexp(rat.ldexp({exponent: 2,  mantissa: 1})),
	{exponent: 2, mantissa: 1}
    );
});

test("euclid's algorithm for gcd", () => {
    // Test that euclid's algorithm works.
    assertEq(rat.gcd(1, 1),  1);
    assertEq(rat.gcd(2, 1),  1);
    assertEq(rat.gcd(4, 8),  4);
    assertEq(rat.gcd(45, 15), 15);
    assertEq(rat.gcd(66, 77), 11);
});

test("we can simplify fractions", () => {
    // Test that simplification works
    assertEq(
	rat.simplify({num: 4, denom: 12}),
	{num: 1, denom: 3}
    );
});

test("we can convert between improper and proper fractions", () => {
    // Test to / from proper fractions.
    assertEq(
	rat.toProper({num: 5, denom: 4}),
	{integer: 1, num: 1, denom: 4}
    );

    assertEq(
	rat.fromProper({integer:1, num: 1, denom: 4}),
	{num: 5, denom: 4}
    );
});

test("we can convert between fractions and strings", () => {
    // Test to / from strings
    assertEq(
	rat.toString({num: 1, denom: 4}),
	"1/4"
    );

    assertEq(
	rat.toString({num: 5, denom: 4}, true),
	"1-1/4"
    );
});

test("we can convert between rationals and floats", () => {

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
});

test("basic arithmetic operations on fractions", () => {
    // Test a bunch of boring arithmetic operators
    assertEq(
	rat.add(rat.zero, rat.one),
	{num: 1, denom: 1}
    );

    assertEq(
	rat.simplify(rat.add({num: 3, denom: 16}, {num: 3, denom: 4})),
	{num: 15, denom: 16}
    );

    assertEq(
	rat.simplify(rat.mul({num: 3, denom: 4}, {num: 100, denom: 1})),
	{num: 75, denom: 1}
    );

    assertEq(
	rat.div(rat.one, rat.fromFloat(4)),
	{num: 1, denom: 4}
    );

    assertEq(
	rat.simplify(rat.div({num: 5, denom: 16}, {num: 1, denom: 16})),
	{num: 5, denom: 1}
    );

    assertEq(
	rat.simplify(rat.div(rat.fromFloat(12.7), rat.fromFloat(25.4))),
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
});

test("we can find arbitrary fractional aproximations", () => {
    assertEq(
	rat.approx(rat.fromFloat(Math.PI), 64),
	{num: 201, denom: 64}
    );

    assertEq(
	rat.approx(rat.fromFloat(Math.PI), 32),
	{num: 101, denom: 32}
    );

    assertEq(
	rat.approx(rat.fromFloat(Math.PI), 7),
	{num: 22, denom: 7}
    );
});
