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
    undoable,
    hoist_methods,
    hoist_props,
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

/*** Calculator business logic ********************************************/


// This section represents the calculator itself, which is really a
// simple virtual machine.


// Implement a built-in calculator function or operator.
//
// Wraps `func()` such that it is called on a stack of arguments,
// using the specified number of elements.
//
// If the stack does not contain `arity` elements, then "stack
// underflow" is thrown.
function builtin(arity, func) {
    if (arity === null) {
	// Null arity indicates the function is variadic and consumes the
	// whole stack, so return a stack containing only the result.
	return (stack) => [func(...stack)];
    } else {
	// Otherwise we need to consume just the arguments we need.
	return (stack) => {
	    if (stack.length >= arity) {
		// the index on the stack where the operands begin.
		const pivot = stack.length - arity;
		const args = stack.slice(pivot);
		return [...stack.slice(0, pivot), func(...args)];
	    } else {
		throw underflow;
	    }
	};
    }
}


// Special case of above for constants.
const constant = (c) => builtin(0, () => c);


// Placeholder for unimplemented functions.
//
// Ideally, no usage of this ever gets committed, but it is useful
// when developing new features, so keep it here.
const unimplemented = (n, name) => builtin(0, () => {
    throw not_implemented;
});


const divisor = d => x => rat.mul(rat.promote(x), {num: 1, denom: d});


// Dispatch table for stack operations.
export const builtins = {
    add:     builtin(2, (x, y) => x + y),
    sub:     builtin(2, (x, y) => x - y),
    mul:     builtin(2, (x, y) => x * y),
    div:     builtin(2, (x, y) => x / y),
    square:  builtin(1, (x) => x * x),

    frac:    builtin(1, rat.fromFloat),
    float:   builtin(1, rat.toFloat),
    approx:  builtin(2, rat.approx),
    f2:      builtin(1, divisor(2)),
    f4:      builtin(1, divisor(4)),
    f8:      builtin(1, divisor(8)),
    f16:     builtin(1, divisor(16)),
    fadd:    builtin(2, rat.promoted(rat.add)),
    fsub:    builtin(2, rat.promoted(rat.sub)),
    fmul:    builtin(2, rat.promoted(rat.mul)),
    fdiv:    builtin(2, rat.promoted(rat.div)),
    finv:    builtin(1, rat.promoted(rat.inv)),


    abs:     builtin(1, Math.abs),
    acos:    builtin(1, Math.acos),
    asin:    builtin(1, Math.asin),
    atan:    builtin(1, Math.atan),
    atan2:   builtin(1, Math.atan2),
    ceil:    builtin(1, Math.ceil),
    clz32:   builtin(1, Math.clz32),
    cos:     builtin(1, Math.cos),
    exp:     builtin(1, Math.exp),
    floor:   builtin(1, Math.floor),
    imul:    builtin(2, Math.imul),
    fround:  builtin(1, Math.fround),
    ln:      builtin(1, Math.log),
    log:     builtin(2, (x, y) => Math.log(x) / Math.log(y)),
    max:     builtin(null, Math.max),
    min:     builtin(null, Math.min),
    pow:     builtin(2, Math.pow),
    random:  builtin(0, Math.random),
    round:   builtin(1, Math.round),
    sin:     builtin(1, Math.sin),
    sqrt:    builtin(1, Math.sqrt),
    tan:     builtin(1, Math.tan),
    log10:   builtin(1, Math.log10),
    log2:    builtin(1, Math.log2),
    log1p:   builtin(1, Math.log1p),
    expm1:   builtin(1, Math.expm1),
    cosh:    builtin(1, Math.cosh),
    sinh:    builtin(1, Math.sinh),
    tanh:    builtin(1, Math.tanh),
    acosh:   builtin(1, Math.acosh),
    asinh:   builtin(1, Math.asinh),
    atanh:   builtin(1, Math.atanh),
    hypot:   builtin(null, Math.hypot),
    trunc:   builtin(2, Math.trunc),
    sign:    builtin(2, Math.sign),
    cbrt:    builtin(2, Math.cbrt),
    LOG2E:   constant(Math.LOG2E),
    LOG10E:  constant(Math.LOG10E),
    LN2:     constant(Math.LN2),
    LN10:    constant(Math.LN10),
    SQRT2:   constant(Math.SQRT2),
    SQRT1_2: constant(Math.SQRT1_2)
}

// Define default the table of constants.
export const constants = {
    "\u{1D486}": Math.E,
    "\u{1D70B}": Math.PI,
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
	case "dec":    return val;
	case "float":  return parseFloat(`${val.integer}.${val.frac}`);
	case "var":    return val;
	case "num":    throw  incomplete_frac;
	case "denom":  return rat.fromProper(val);
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
// TBD: look into merging the keypad-layout with `ops` and `showing`
// stuff here. The original goal was for `ops` to be updated based on
// stack contents, such that the ux could suppress or"grey out"
// operations that are not present in `ops`.
//
// It might make *more* sense if the calculator generates the abstract
// key layout and function mapping. Different UI layers could use this
// as hints, and it would completely decouple the ux layer from
// calculator internals, since at that point it has everything it
// needs in the calculator's public state.
//
// TBD: should errors be stored here. I.e., if a stack operation
// results in an error being thrown, do we catch it and attach it to
// the current state, so that the ux can then render it? The problem
// here is that if `undoable` receives a value, then it will enter the
// history. So errors really need to be handled by `undoable`. But
// this then makes `undoable` a lot less general than one would wish.
//
// The behavior I would ideally want is that genuine user errors get a
// visual representation in the sucessor state, but do not enter the
// history. I.e."nothing happens, except that now there's a visible
// explanation for why nothing happened". This behavior could also be
// implemented in `reactor`. Internal errors should just present a
// clear stack trace on the console. There whole design is such that
// there is no harm in failing to catch these exceptions, and quite
// the opposite, I would prefer to see the stack trace.
export const calculator = (function () {
    const init = {
	ops: builtins,
	stack: [],
	tape: [],
	defs: constants,
	accum: accumulator.init,
	showing: "basic"
    };

    // push value onto stack, bypassing the accumulator.
    function push(state, value) {
	// if value is a string, and is defined...
	const numeric = (typeof(value) === "string") && state.defs[value]
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
	    return {...push(state, value), accum};
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

	assert(
	    operator in state.ops,
	    "Illegal Operator: ${operator}."
	);

	const stack = state.ops[operator](state.stack);
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
