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

"use strict";

import {assert, debug, asImmutableObject} from './fp.js';
import * as calc from './calc.js';
import * as rat from './rat.js';
import * as fp from './fp.js';


/*** Unit Test Framework *****************************************************/


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
	throw new Error(`Assertion failed: \n${repr_a}\n!==\n${repr_b}`);
    }
}

// Assert if invoking `callback` does not throw the given exception.
function assertThrows(callback, except) {
    assert((typeof callback) === "function");
    try {
	callback();
	throw new Exception(`Expected exception: ${except}`);
    } catch (e) {
	// UserError can be compared for direct equality, since
	// they are globals.
	if (e instanceof calc.UserError && e !== except) {
	    throw new Error(`Assertion failed: ${e} !== ${except}`);
	} else {
            if (e instanceof Error && except instanceof Function) {
                if (!(e instanceof except)) {
                    throw new Error(`Assertion failed: ${e} !== ${except}`);
                }
            }  else {
	        // use stringify for comparison, since they are probably
	        // strings.
	        assertEq(e, except);
            }
	}
    }
}

// Create class-like objects from accumulator and calculator modules.
//
// Since these are immutable, we only need one single, global
// instance. There is no setup or tear-down.
const accumulator = asImmutableObject(calc.accumulator);
const calculator = asImmutableObject(calc.calculator);


/*** Test cases ****************************************************************/


test("test the test framework", () => {
    assertThrows(() => foo, ReferenceError);
});


/* Iterators chaining ********************************************************/

test("test iterator chaining", () => {
    assertEq(
        [1, 2, 3]
            .values()
            .filter(x => !!(x & 1))
            .map(x => x * 2)
            .reduce((x, y) => x + y),
        8
    );

    assertEq(
        new Set([1, 2, 2, 3, 3])
            .filter(x => !!(x & 1))
            .map(x => x * 2)
            .reduce((x, y) => x + y),
        8
    );

    assertEq(
        new Map([["foo", 1], ["bar", 2], ["baz", 3]])
            .map(([k, v]) => v)
            .filter(x => !!(x & 1))
            .map(v => 2 * v)
            .reduce((x, y) => x + y),
        8
    );

    // assertThrows(
    //     () => [].values().reduce((x, y) => x + y),
    //     TypeError
    // );
});


/* Accumulator ***************************************************************/


test("accumulator.is_empty()", () => {
    assert(accumulator.isEmpty());
    assert(accumulator.digit(4).digit(5).clear().isEmpty());
    assert(accumulator.digit(4).decimal().digit(5).clear().isEmpty());
    assert(accumulator.letter('a').letter('b').clear().isEmpty());
});

test("accumulator is initialized empty", () => {
    assertEq(accumulator, {type: "empty"});
    assertThrows(() => accumulator.value(), calc.empty_accum);
});

test("accumulator handles digits", () => {
    assertEq(
	accumulator.digit(4),
	{type: "dec", val: 4}
    );

    assertEq(
	accumulator.digit(4).decimal().digit(5),
	{type: "float", val: {integer: 4, frac: 5}}
    );
});

test("accumulator rejects letters when in digit mode", () => {
    assertThrows(
	() => accumulator.digit(4).letter('a'),
	calc.not_a_digit
    );

    assertThrows(
	() => accumulator.digit(4).decimal().letter('a'),
	calc.not_a_digit
    );
});

test("accumulator accepts letters when empty", () => {
    assertEq(
	accumulator.letter('a'),
	{type: "var", val: 'a'}
    );

    assertEq(
	accumulator.letter('a').digit('0'),
	{type: "var", val: "a0"}
    );

    assertThrows(
	() => accumulator.letter('a').decimal(),
	calc.not_a_letter
    );
});

test("accumulator can display values", () => {
    assertEq(
	accumulator.display(),
	""
    );

    assertEq(
	accumulator.lift({type: "dec", val: 4}).display(),
	"4"
    );

    assertEq(
	accumulator.lift({type: "float", val: {integer: 4, frac: 123}}).display(),
	"4.123"
    );

    assertEq(
	accumulator.lift({type: "var", val: "abc"}).display(),
	"abc"
    );
});

test("accumulator can produce values", () => {
    assertThrows(() => accumulator.value(), calc.empty_accum);

    assertEq(
	accumulator.lift({type: "dec", val: 4}).value(),
	4
    );

    assertEq(
	accumulator.lift({type: "float", val: {integer: 4, frac: 123}}).value(),
	4.123
    );

    assertEq(
	accumulator.lift({type: "var", val: "abc"}).value(),
	"abc"
    );
});

test("accumulator handles denom token correctly", () => {
    assertThrows(() => accumulator.denom(), calc.incomplete_frac);

    assertThrows(() => accumulator.digit(3).num(3).value(), calc.incomplete_frac);

    assertThrows(
	() => accumulator.digit(4).denom().decimal(),
	calc.decimal_in_frac
    );

    assertThrows(
	() => accumulator.digit(4).denom().digit(5).decimal(),
	calc.decimal_in_frac,
    );

    assertThrows(
	() => accumulator.digit(4).decimal().denom(),
	calc.frac_in_float
    );

    assertThrows(
	() => accumulator.letter('x').denom(),
	calc.not_a_letter
    );

    assertThrows(
	() => accumulator.digit(3).denom().denom(),
	calc.extra_denom
    );

    assertThrows(
	() => accumulator.digit(3).denom().digit(4).denom(),
	calc.extra_denom
    );
});

test("accumulator handles num token correctly", () => {
    assertEq(
	accumulator.num(),
	{type: "num", val: {integer: 0, num: 0}}
    );

    assertThrows(
	() => accumulator.digit(4).num().decimal(),
	calc.decimal_in_frac,
    );

    assertThrows(
	() => accumulator.digit(4).num().digit(5).decimal(),
	calc.decimal_in_frac,
    );

    assertThrows(
	() => accumulator.digit(4).decimal().num(),
	calc.frac_in_float
    );

    assertThrows(
	() => accumulator.letter('x').num(),
	calc.not_a_letter
    );

    assertThrows(
	() => accumulator.digit(3).num().num(),
	calc.extra_num
    );

    assertThrows(
	() => accumulator.digit(3).denom().num(),
	calc.extra_num
    );
});

test("accumulator can produce fractions", () => {
    assertEq(
	accumulator.digit(3).denom().digit(4).value(),
	{num: 3, denom: 4}
    );

    assertEq(
	accumulator.digit(3).digit(4).denom().digit(5).digit(6).value(),
	{num: 34, denom: 56}
    );

    assertEq(
	accumulator.digit(5).num().digit(3).denom().digit(4).value(),
	rat.fromProper({integer: 5, num: 3, denom: 4})
    );

    assertEq(
	accumulator.digit(5).digit(4)
	    .denom()
	    .digit(1).digit(2).digit(7)
	    .value(),
	{num: 54, denom: 127}
    );
});


/* Caluclator ****************************************************************/


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

test("calculator can swap values at stack positions", () => {
    assertEq(
	calculator
	    .digit(4)
	    .enter()
	    .digit(5)
	    .exch(1, 0),
	{
	    ops:calc.builtins,
	    stack: [5, 4],
	    tape: [4, 5, "exch(1, 0)"],
	    defs: calc.constants,
	    accum: accumulator,
	    showing: "basic"
	}
    );

    assertThrows(
	() => calculator.exch(1, 0),
        calc.overflow
    );

    assertEq(
	calculator
	    .digit(4)
	    .enter()
	    .digit(5)
	    .enter()
	    .exch(-1, -2)
	    .operator("sub"),
	{
	    ops: calc.builtins,
	    stack: [1],
	    tape: [4, 5, "exch(1, 0)", "sub"],
	    defs: calc.constants,
	    accum: accumulator,
	    showing: "basic"
	}
    );
});


/* Floating point manipulation ***********************************************/


test("floating point composition", () => {
    assertEq(rat.ldexp({exponent:  2, mantissa: 1}),  4);
    assertEq(rat.ldexp({exponent: -3, mantissa: 1}), 0.125);
});

test("floating point decomposition", () => {
    assertEq(rat.frexp(4),     {exponent: 2,  mantissa: 1});
    assertEq(rat.frexp(0.125), {exponent: -3, mantissa: 1});
    assertEq(rat.frexp(125),   {exponent: 0,  mantissa: 125});
});

test("floating composition and decomposition are consistent", () => {
    assertEq(rat.ldexp(rat.frexp(4)),         4);
    assertEq(rat.ldexp(rat.frexp(0.125)), 0.125);
    assertEq(rat.ldexp(rat.frexp(125)),     125);
    assertEq(
	rat.frexp(rat.ldexp({exponent: 2,  mantissa: 1})),
	{exponent: 2, mantissa: 1}
    );
});


/* GCD ***********************************************************************/


test("euclid's algorithm for gcd", () => {
    assertEq(rat.gcd(1, 1),  1);
    assertEq(rat.gcd(2, 1),  1);
    assertEq(rat.gcd(4, 8),  4);
    assertEq(rat.gcd(45, 15), 15);
    assertEq(rat.gcd(66, 77), 11);
});


/* Fractions *****************************************************************/


test("we can simplify fractions", () => {
    assertEq(
	rat.simplify({num: 4, denom: 12}),
	{num: 1, denom: 3}
    );
});

test("we can convert between improper and proper fractions", () => {
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

    // XXX: these tests below don't pass without the approx.
    //
    // I suspect this is because frexp needs to consider the guard and
    // rounding bits. Long story short, if you call rat.fromFloat() on
    // a value like 12.7, your exponent ends up being 2 ** 48, and the
    // numerator ends up being a huge integer. Somehow the JS console
    // correctly displays 12.7 or 0.1, which confuses the issue
    // considerably.
    //
    // The above isn'twrong, but this suggests that rat needs to use
    // BigInt so that the numerator and denominator will not overflow
    // the 53-bits of integer precision during multiplication or
    // division. I just don't have time to do it now.

    assertEq(
	rat.approx(rat.fromFloat(12.7), 10),
	{num: 127, denom: 10}
    );

    assertEq(
	rat.approx(rat.fromFloat(25.4), 10),
	{num: 127, denom: 5}
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

    assertEq(
	rat.simplify(rat.div({num: 127, denom: 10}, {num: 254, denom: 10})),
	{num: 1, denom: 2}
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

    assertEq(
	rat.approx(rat.fromFloat(12.7), 10),
	{num: 127, denom: 10}
    );

    assertEq(
	rat.approx(rat.fromFloat(25.4), 10),
	{num: 127, denom: 5}
    );
});


/* Expose Modules for interactive debugging ******************************/


window.rat = rat;
window.accumulator = accumulator;
window.calc = calc;
window.fp = fp;
