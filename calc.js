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
//   - exch (should somehow support DnD)
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
		throw "stack underflow";
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
    throw new Error(`${name} is not yet implemented.`);
});


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
    f2:      builtin(0, () => ({num: 1, denom: 2})),
    f4:      builtin(0, () => ({num: 1, denom: 4})),
    f8:      builtin(0, () => ({num: 1, denom: 8})),
    f16:     builtin(0, () => ({num: 1, denom: 16})),
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
    function digit(state, d) { switch (state.type) {
	case "empty": return {type: "dec",   dec: d};
	case "dec":   return {type: "dec",   dec: fold_digit(state.dec, d)};
	case "float": return {type: "float", frac: fold_digit(state.frac, d), dec: state.dec};
	case "var":   return {type: "var",   id: state.id + d.toString()};
    }; }

    // Handle incomming decimal point.
    function decimal(state) { switch (state.type) {
	case "empty": return {type: "float", dec: 0, frac: 0};
	case "dec":   return {type: "float", dec: state.dec, frac: 0};
	case "float": return state;
	case "var":   throw "Illegal: decimal point in word."
    }; }

    // Handle an incomming letter.
    function letter(state, l) { switch (state.type) {
	case "empty": return {type: "var", id: l};
	case "dec":   throw "Illegal: letter in numeral."
	case "float": throw "Illegal: letter in numeral."
	case "var":   return {type: "var", id: state.id + l};
    }; }

    /* Queries on Accumulator State */

    // Return the current value of the accumulator, if possible.
    //
    // This might throw, because the accumulator state might not
    // represent a meaningful value.
    function value(state) { switch (state.type) {
	case "empty": throw "Empty Accumulator";
	case "dec":   return state.dec;
	case "float": return parseFloat(`${state.dec}.${state.frac}`);
	case "var":   return state.id;
    }; }

    // Return the current "display contents" of the accumulator.
    function display(state, defs) { switch (state.type) {
	case "empty": return "";
	case "dec":   return state.dec.toString();
	case "float": return `${state.dec}.${state.frac}`;
	case "var":   return state.id;
    }; }

    // Return whether or not the accumulator is in the empty state.
    function isEmpty(state) {
	return state.type === "empty";
    }

    return {
	init:       empty,
	methods:    {clear, digit, decimal, letter},
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

    // transfer accumulator to stack.
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

    // apply operator to stack
    function operator(state, operator) {
	// Ensure accumulator contents are transfered to stack.
	const auto_enter = enter(state);

	assert(
	    accumulator.properties.isEmpty(auto_enter.accum),
	    "Accumulator must be empty."
	);

	assert(
	    operator in auto_enter.ops,
	    "Illegal Operator: ${operator}."
	);

	const stack = auto_enter.ops[operator](auto_enter.stack);
	const tape = [...auto_enter.tape, operator];
	return {...auto_enter, stack, tape};
    }

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
	    throw "Stack Underflow";
	}
    }

    // Store top of stack into slot
    function store(state) {
	let auto_enter = enter(state);
	const length = auto_enter.stack.length;
	const pivot = length - 2;

	if (length >= 2) {
	    const [value, slot] = auto_enter.stack.slice(pivot);
	    const stack = auto_enter.stack.slice(0, pivot);
	    const defs = {...auto_enter.defs, [slot]: value};
	    const tape = [...auto_enter.tape, "="];
	    return {...auto_enter, stack, defs, tape};
	} else {
	    return state;
	}
    }

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
	    store,
	    operator,
	    show,
	    ...hoist_methods('accum', accumulator)
	}
    };
})();
