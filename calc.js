
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

// I used the latest ES6 features to make this project a case-study in
// Functional Programming.
//
// This module defines ADTs for the calculator's state. The UX
// layer renders the resulting state.
//
// The idea is that a calculator is just a DFA you manually supply
// with tokens. I realized that, since we are operating at human input
// speed, we can be a little bit wasteful with the representation of
// the calculator's internal state, in exchange for some useful
// features like error tolerance and unlimited undo / redo.
//
// With every user action, the entire calculator state and UI is
// regenerated, rather than mutated in place. But this affords
// preserving any prior states in the undo stack, which means that the
// user need not fear a misplaced finger. The stack and history are
// visible, so that the input can be audited for error, and errors can
// be easily corrected.
//
// That all sounds like a lot, so to further distill it: the whole
// thing is a set of pure functions which operate on
// plain-old-javascript objects (POJOS), with the "heavy lifting"
// implemented in `fp.js`.
//
// Things I want to get to:
// - add tokens for the following stack ops:
//   - del
//   - ins
// - add token to clear variable binding
// - tape editor mode
//   - reorder / edit / insert new tokens
//     - history is re-calculated, including intermediate stack results
//   - extract selected tokens to function
//   - replace constant with variable
//     - binds first appearance of constant to a name, then
//     - replaces other uses with variable reference, as directed by user
//   - delete token
//   - insert token
//     - challenging because of keypads.
//     - could be implemented as a kind of implicit "tape cursor", so affecting next token.
//     - potentially confusing if the tape is not always visible, which is hard to fit on mobile
// - "function editor"
//  - looks just like tape editor, but
//    - only available when top of stack is a function value.
//    - plus the additional feature of "replace constant with function parameter".
//    - plus the additional "params" pane, which has to share real-estate with the "vars" pane.

import {
    debug,
    assert,
    assertInt,
    coallate,
    hoist_methods,
    hoist_props,
    parse,
    raise,
    stringify,
    undoable,
} from './fp.js';


import * as rat from './rat.js';


// This set of classes covers all errors caused by the user.
export class UserError    extends Error {};
export class IllegalToken extends UserError {};
export class ValueError   extends UserError {};

export const underflow       = new UserError("Stack Underflow");
export const overflow        = new UserError("Stack Overflow");
export const not_implemented = new UserError("Not implemented.");
export const incomplete_frac = new ValueError("Incomplete Fraction.");
export const empty_accum     = new ValueError("Accumulator is empty.");
export const extra_decimal   = new IllegalToken("Already have decimal.");
export const not_a_letter    = new IllegalToken("Not a letter.");
export const decimal_in_frac = new IllegalToken("decimal point in fraction");
export const frac_in_float   = new IllegalToken("fraction separator in float");
export const extra_num       = new IllegalToken("Already in numerator.");
export const extra_denom     = new IllegalToken("Already in denominator.");
export const not_a_digit     = new IllegalToken("Not a digit.");


/*** Polymorphic Dispatch *************************************************/

/* Stack Value Tagging *******************************************************/


// Stack values are a tagged union. Informally,
//
// type Value =
//    | {tag: "float", value:  Number}
//    | {tag: "rat",   value: rat.Rat};
//
// type Tag = "int" | "float" | "rat";
//
export const tag = (tag,  value)  => ({tag, value});
const gettag     = ({tag, value}) =>   tag;
const getval     = ({tag, value}) => value;


/* Polymorphic Dispatch Helpers **********************************************/


/**
 * XXX: I wrote all this code to handle dynamic dispatch on a
 * polymorphic stack. It was intended to lay the groudnwork for unit
 * calculations, but now that I wrote it, I am having some doubts.
 *
 * It works, it's very powerful and flexible. But it turned out that
 * adding an "int" type was a bit of a mistake.
 *
 * The real culprit was introducing an `int` type where before there
 * was really only `float` and `rat`. I'm just not sure it's right to
 * remove it.
 */


/**
 * This is a wrapper around map that internally converts keys to JSON
 * strings.
 *
 * The Map builtin is useless because it can't override
 * key equality.
 *
 * So, while a Map key can be any an object, you can't ever *fetch* an
 * object key, unless it is the exact same instance.
 */
function dispatchTable(items) {
    const data = new Map(items.map(([k, v]) => [stringify(k), v]));

    const has     = key    => data.has(stringify(key));
    const get     = key    => data.get(stringify(key));
    const entries = ()     => data.map(([k, v]) => [parse(k), v]);
    const map     = (f)    => entries().map(f);
    const filter  = (f)    => entries().filter(f);
    const reduce  = (f, i) => entries().reduce(f, i);

    return {entries, has, get, filter, map, reduce};
}


// Define `name` name over all supported types.
const poly_unop = (name, primF, ratF) => [
    [[name, ["float"]], ["float", primF]],
    [[name, ["rat"]],   [ "rat",   ratF]],
];


// Define `name` over the cross-product of all supported types.
//
// In general:
// - [float, float] -> float
// - [_,      rat] -> rat
// - [rat,      _] -> rat
const poly_binop = (name, primF, ratF) => [
    [[name, ["float", "float"]], ["float",           primF                                    ]],
    [[name, ["float",   "rat"]], ["rat",   (x, y) => ratF (rat.fromFloat(x),               y) ]],
    [[name, ["rat",   "float"]], ["rat",   (x, y) => ratF (              x , rat.fromFloat(y))]],
    [[name, ["rat",     "rat"]], ["rat",             ratF                                     ]],
];

// Define `f${denom}`, which divides its argument by denom, returning rat.
//
// In genaral: [_] -> rat
const divisor = d => {
    assertInt(d);

    const name = `f${d}`;
    const denom = rat.fromInt(d);

    return [
        [[name, ["float"]], ["rat", x => rat.div(rat.fromFloat(x), denom)]],
        [[name, ["rat"]],   ["rat",      rat.div]],
    ];
};

// Define `name` in terms of `f: float -> float`, preserving original type.
//
// In general:
// - int | rat -> rat,
// - float     -> float
const poly_math = (name, f) => [
    [[name, ["float"]], ["float",                    f]],
    [[name, ["rat"]],   ["rat",   x => rat.fromFloat(f(rat.toFloat(x)))]],
];

// Like above, but for binary operations.
//
// In general:
// - [float, float] -> float
// - [float,   rat] -> float
// - [rat,     rat] -> rat
const poly_binmath = (name, f) => {
    const tf = rat.toFloat;
    const ff = rat.fromFloat;
    return [
        [[name, ["float", "float"]], ["float", f                             ]],
        [[name, ["float",   "rat"]], ["float", (x, y) => f(x, tf(y))         ]],
        [[name, ["rat",   "float"]], ["rat",   (x, y) => ff(f(tf(x), y))     ]],
        [[name, ["rat",     "rat"]], ["rat",   (x, y) => ff(f(tf(x), tf(y))) ]],
    ];
};

// Define `name` in terms of `f` for the given type only.
const mono_binop = (name, tag, f) => [[name, [tag, tag]], [tag, f]];
const mono_unop  = (name, tag, f) => [[name, [tag]],      [tag, f]];

// Dispatch Table
//
// Function application indexes into this table. If lookup fails, then
// the function is undefined for the given types. If application
// succeeds, then the result is tagged using the return type tag.
//
// dispatch: Map<Signature, [Ret, Func]>, where
//   Signature: [Name, [Tag]],
//   Name:      String,                  // the function's user-visible identifier
//   Tag:       "float" | "rat",         // Type tag
//   Ret:       Tag                      // Return type tag
//   Func:      (...args: [Any]) => Any  // Function which implements the operation.
export const dispatch = window.dispatch = dispatchTable([
    // Universal Unary Functions
    ...poly_unop("abs",    Math.abs,              rat.abs),
    ...poly_unop("inv",    x => 1 / x,            rat.inv),
    ...poly_unop("neg",    x =>    -x,            rat.neg),
    ...poly_unop("square", x => x * x, x => rat.mul(x, x)),

    // Universal Binary Functions
    ...poly_binop("add", (x, y) => x + y, rat.add),
    ...poly_binop("sub", (x, y) => x - y, rat.sub),
    ...poly_binop("mul", (x, y) => x * y, rat.mul),
    ...poly_binop("div", (x, y) => x / y, rat.div),
    ...poly_binop("approx", rat.approx, rat.approx),

    // Scientific operations
    ...poly_math("acos",   Math.acos),
    ...poly_math("asin",   Math.asin),
    ...poly_math("atan",   Math.atan),
    ...poly_math("atan2",  Math.atan2),
    ...poly_math("ceil",   Math.ceil),
    ...poly_math("cos",    Math.cos),
    ...poly_math("exp",    Math.exp),
    ...poly_math("floor",  Math.floor),
    ...poly_math("fround", Math.fround),
    ...poly_math("ln",     Math.ln),
    ...poly_math("sin",    Math.sin),
    ...poly_math("sqrt",   Math.sqrt),
    ...poly_math("tan",    Math.tan),
    ...poly_math("log10",  Math.log10),
    ...poly_math("log2",   Math.log2),
    ...poly_math("log1p",  Math.log1p),
    ...poly_math("expm1",  Math.expm1),
    ...poly_math("cosh",   Math.cosh),
    ...poly_math("sinh",   Math.sinh),
    ...poly_math("tanh",   Math.tanh),
    ...poly_math("acosh",  Math.acosh),
    ...poly_math("asinh",  Math.asinh),
    ...poly_math("atanh",  Math.atanh),
    ...poly_math("cbrt",   Math.cbrt),
    ...poly_binmath("log", Math.log),
    ...poly_binmath("pow", Math.pow),

    // Divide by fixed integer constant
    ...divisor(2),
    ...divisor(4),
    ...divisor(8),
    ...divisor(16),

    // Type coercion functions
    mono_unop("float", "rat",   rat.toFloat),
    mono_unop("frac",  "float", rat.fromFloat),

    // Special cases.
    [["random", []],                 ["float", Math.random]],
    [["trunc",  ["float", "float"]], ["float",  Math.trunc]],
    [["sign",   ["float"]],          ["float",   Math.sign]],
]);


// index dispatch table by argument tuple
const by_args = coallate(
    dispatch
        .entries()
        .map(([[name, args], [ret, f]]) => [args, name])
);

// index dispatch table by function name
export const by_name = coallate(
    dispatch
        .entries()
        .map(([[name, args], [ret, f]]) => [name, [args, ret, f]])
);


// require that seq be empty, or all the same value.
// - if seq is empty, returns empty.
// - if seq is nonempty, and all elements are the same, returns this value.
// - if seq is nonempty, and all elements are not equal, throws.
const requireEqual = window.requireEqual = (seq, empty, err) =>
      (seq.length === 0)
      ? empty
      : (seq.length === 1)
      ? seq[0]
      : seq.reduce((p, n) => (p !== n) ? raise(err) : n);

// the arity of each function
const arities = (window.arities = coallate(
    dispatch
        .entries()
        .map(([[name, args], [ret, f]]) => [name, args.length])
)).map(
    a => requireEqual(a, 0, "inconsistent arity")
);

// split `arity` operands from stack, and return both pieces.
const split = (stack, arity) => {
    const pivot = stack.length - arity;
    const args  = stack.slice(pivot);
    const rest  = stack.slice(0, pivot);
    return {rest, args};
}

// true if stack configuration matches expected
const check = (args, expected) => (args.length !== expected.length)
      && (args
          .map(gettag)
          .zip(expected)
          .every(([got, expected]) => got === expected));

// return the set of valid operations for the given stack configuration
export const valid = stack => {
    const got = split(stack).args;
    return by_args
        .flatten()
        .filter(([expected,    _]) => check(got, expected))
        .map(   ([       _, name]) => name)
};

// apply a function to the given stack
export const apply = (stack, name) => {
    const arity        = arities[name];
    const {rest, args} = split(stack, arity);
    const tags         = args.map(gettag);
    const vals         = args.map(getval);

    if (dispatch.has([name, tags])) {
        const [ret, func] = dispatch.get([name, tags]);
        return [...rest, tag(ret, func(...vals))];
    }

    // tbd: more informative error message;
    throw not_implemented;
};

// Define default the table of constants.
export const constants = {
    "\u{1D486}": tag("float", Math.E),
    "\u{1D70B}": tag("float", Math.PI),
    LOG2E:       tag("float", Math.LOG2E),
    LOG10E:      tag("float", Math.LOG10E),
    LN2:         tag("float", Math.LN2),
    LN10:        tag("float", Math.LN10),
    SQRT2:       tag("float", Math.SQRT2),
    SQRT1_2:     tag("float", Math.SQRT1_2)
};


/* Calculator parts *******************************************************/


// A type representing the calculator's input accumulator.
//
// The job of the accumulator is to receive tokens, assembling them
// into values.
//
// It also represents the "modal" layer of user interaction, as token
// sequences are essentially a path through the state graph. What
// incomming tokens are valid at any given moment depends on what
// tokens have already been received, from the empty state.
//
// This is basically the FP equivalent of "grovelling through
// characters" sequentially. Modeling it this way lets me capture the
// state of the accumulator at any point, which means that undo/redo
// can operate at the token level.
//
// We can support all kinds of interesting ux behavior using this
// structure. Whereas stack operations are always orthogonal,
// accumulator tokens are modal and path-dependent.
export const accumulator = (function () {
    // The empty accumulator singleton.
    const empty = {type: "empty"};

    // Helper function to fold a single digit into a register
    const fold_digit = (reg, d) => reg * 10 + d;

    /* Input tokens */

    // Clear the accumulator state.
    function clear(state) { return empty; };

    // Handle an incoming digit
    function digit({type, val}, d) { switch (type) {
	case "empty": return {type: "dec",   val: d};
	case "dec":   return {type: "dec",   val: fold_digit(val, d)};
	case "float": return {type: "float", val: {...val, frac: fold_digit(val.frac, d)}};
	case "var":   return {type: "var",   val: val + d.toString()};
	case "num":   return {type: "num",   val: {...val, num: fold_digit(val.num, d)}};
	case "denom": return {type: "denom", val: {...val, denom: fold_digit(val.denom, d)}};
    }; }

    // Handle incomming decimal point.
    function decimal({type, val}) { switch (type) {
	case "empty": return {type: "float", val: {integer: 0, frac: 0}};
	case "dec":   return {type: "float", val: {integer: val, frac: 0}};
	case "float": throw  underflow;
	case "var":   throw  decimal_in_word;
	case "num":   throw  decimal_in_frac;
	case "denom": throw  decimal_in_frac;
    }; }

    // Convert decimal accumulator to fraction.
    //
    // Decimal contents preserved as whole-number value.
    //
    // Subsequent digits fold into numerator.
    function num({type, val}) { switch (type) {
	case "empty": return {type: "num", val: {integer: 0, num: 0}};
	case "dec":   return {type: "num", val: {integer: val, num: 0}};
	case "float": throw  frac_in_float;
	case "var":   throw  not_a_letter;
	case "num":   throw  extra_num;
	case "denom": throw  extra_num;
    }; }

    // Convert decimal accumulator to fraction.
    //
    // Decimal contents preserved as numerator.
    //
    // Subsequent digits fold into denominator.
    function denom({type, val}) { switch (type) {
	case "empty": throw  incomplete_frac;
	case "dec":   return {type: "denom", val: {integer: 0, num: val, denom: 0}};
	case "float": throw  frac_in_float;
	case "var":   throw  frac_in_letter;
	case "num":   return {type: "denom", val: {...val, denom: 0}};
	case "denom": throw  extra_denom;
    }; }

    // Handle an incomming letter.
    function letter({type, val}, l) { switch (type) {
	case "empty": return {type: "var", val: l};
	case "dec":   throw  not_a_digit;
	case "float": throw  not_a_digit;
	case "var":   return {type: "var", val: val + l};
	case "num":   throw  not_a_digit;
	case "denom": throw  not_a_digit;
    }; }

    /* Queries on Accumulator State */

    // Return the current value of the accumulator, if possible.
    //
    // This might throw, because the accumulator state might not
    // represent a meaningful value.
    function value({type, val}) { switch (type) {
	case "empty":  throw  empty_accum;
	case "dec":    return tag("float", val);
	case "float":  return tag("float", parseFloat(`${val.integer}.${val.frac}`));
	case "var":    return tag("word", val);
	case "num":    throw  incomplete_frac;
	case "denom":  return tag("rat", rat.fromProper(val));
    }; }

    // Return the current "display contents" of the accumulator.
    //
    // This should never throw.
    function display({type, val}, defs) { switch (type) {
	case "empty": return "";
	case "dec":   return val.toString();
	case "float": return `${val.integer}.${val.frac}`;
	case "var":   return val;
	case "num":   return `${val.integer} ${val.num} / `;
	case "denom": return `${val.integer} ${val.num} / ${val.denom}`;
    }; }

    // Return whether or not the accumulator is in the empty state.
    function isEmpty(state) {
	return state.type === "empty";
    }

    return {
	init:       empty,
	methods:    {clear, digit, decimal, num, denom, letter},
	properties: {value, display, isEmpty}
    };
})();


// Represents the entire calculator state, which is a stack machine.
//
// The calculator receives tokens, some of which are delegated to the
// accumulator, while others represent stack operations.
//
// The state consists of:
// - current set of valid stack functions, indexed by their symbolic name (ops)
// - current stack contents
// - history of input tokens (tape)
// - current bound variables (defs)
// - current accumulator state
// - current mode of operation ("showing")
//
// TBD: look into merging the keypad-layout here.
//
// It might make *more* sense if the calculator generates the abstract
// key layout and function mapping.
//
// TBD: should errors be stored here?
export const calculator = (function () {
    const init = {
	stack: [],
	tape: [],
	defs: constants,
	accum: accumulator.init,
	showing: "basic"
    };

    // push value onto stack, bypassing the accumulator.
    function push(state, value) {
	// if value is a string, and is defined...
	const numeric = value.tag === "word" && state.defs[value]
	// ...push the value after lookup...
	      ? state.defs[value]
	// ...otherwise push the value unmodified.
	      : value;
	// concatenate the new element onto the stack:
	const stack = [...state.stack, numeric];
	// concatenate the literal value onto the tape.
	const tape  = [...state.tape,  value];
	return {...state, stack, tape};
    }

    // Transfer valid accumulator to stack.
    //
    // this will clear the accumulator.
    function enter(state) {
	if (!accumulator.properties.isEmpty(state.accum)) {
	    const value = accumulator.properties.value(state.accum);
	    const accum = accumulator.methods.clear(state.accum);
            // XXX: hack to coerce all values to fractions in fraction
            // mode.  what I don't like is that it couples us to
            // "showing", (which should be renamed "mode", I guess).
            if (state.showing === "frac" && debug(value).tag === "float") {
	        return {...push(
                    state,
                    tag("rat", rat.fromFloat(value.value)),
                    accum
                )};
            } else {
                return {...push(state, value), accum};
            }
	} else {
	    return state;
	}
    }

    // Factor out auto-enter logic into this combinator.
    const auto_enter = (f) => (state, ...rest) => f(enter(state), ...rest);

    // Implement the family exchange (AKA swap) operations.
    //
    // Negative indices are used for indexing from the top of the
    // stack, positive indices are absolute from the bottom of the
    // stack.
    const exch = auto_enter((state, a, b) => {
	const A = (a < 0) ? state.stack.length + a : a;
	const B = (b < 0) ? state.stack.length + b : b;

	if (Math.max(A, B) > state.stack.length) throw overflow;
	if (Math.min(A, B) < 0)                  throw underflow;

	const val_a = state.stack[A],
	      val_b = state.stack[B];

	const tape = [...state.tape, `exch(${A}, ${B})`];

	let stack = [...state.stack];
	stack[A] = val_b;
	stack[B] = val_a;

	return {...state, stack, tape};
    });

    // apply operator to stack
    const operator = auto_enter((state, operator) => {
	assert(
	    accumulator.properties.isEmpty(state.accum),
	    "Accumulator must be empty."
	);

	const stack = apply(state.stack, operator);
	const tape = [...state.tape, operator];
	return {...state, stack, tape};
    });

    // Reset the calculator to initial conditions.
    function reset(state) {
	return init;
    }

    // Return the top value of the stack, if present.
    function top(state) {
	const stack = state.stack;
	const length = stack.length;

	if (length > 0) {
	    return stack[length - 1];
	} else {
	    throw underflow;
	}
    }

    // Store top of stack into slot
    const store = auto_enter((state) => {
	const length = state.stack.length;
	const pivot = length - 2;

	if (length >= 2) {
	    const [value, slot] = state.stack.slice(pivot);
	    const stack = state.stack.slice(0, pivot);
	    const defs = {...state.defs, [slot]: value};
	    const tape = [...state.tape, "="];
	    return {...state, stack, defs, tape};
	} else {
	    return state;
	}
    });

    // A bit of a wart: UI state is controlled here.
    function show(state, showing) {
	return {...state, showing};
    }

    // Accessors
    const accum = (state) => accumulator.properties.value(state.accum);
    const display = (state) => accumulator.properties.display(state.accum);

    return {
	init,
	properties: {top, accum, display},
	methods: {
	    reset,
	    push,
	    enter,
	    exch,
	    store,
	    operator,
	    show,
	    ...hoist_methods('accum', accumulator)
	}
    };
})();
