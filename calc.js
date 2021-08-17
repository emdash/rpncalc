"use strict";

// I used the latest ES6 features to write this in a "functional"
// style.
//
// You could think of this as an exploration of functional programming
// using javascript.

import {
    debug,
    assert,
    trap,
    reversed,
    objmap,
    flatten,
    undoable,
    hoist_methods,
    hoist_props,
    io
} from './fp.js';


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


// Define the builtin functions of the calculator.
//
// Match each function to a symbolic name.
//
// For now we just expose all the properties of the Math module, which
// means all operations are on 64-bit floats.
//
// The good news is that if we want to support exact decimal
// calculations, complex numbers, quaternions, vectors, or arbitrary
// precision, we just need to supply an alternative implementation for
// the functions in this table.
//
// TBD: Associate a unicode symbol or image for each function, which
// will be used as the button icon for onscreen use.
export const builtins = {
    add:     builtin(2, (x, y) => x + y),
    sub:     builtin(2, (x, y) => x - y),
    mul:     builtin(2, (x, y) => x * y),
    div:     builtin(2, (x, y) => x / y),
    square:  builtin(1, (x) => x * x),
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
// It is just the usual methods for parsing base 10 values, but
// expressed in a stateless fashion. Another way you can think of it
// is that this is really a simple "lexer" monad.
//
// The accumulator starts out empty.
// If the first character is a digit, accumulator is in decimal mode.
// If the first character is a decimal, accumulator is in float mode.
// If the first character is a letter, accumulator is in word mode.
//
// Subsequent chars are then accepted or rejected based on the mode,
// until it is cleared, via clear().
//
// TBD: function mode
export const accumulator = (function () {
    const empty = {type: "empty"};

    // Clear the accumulator state.
    function clear(state) { return empty; };

    // Fold a single digit into accumulator
    const fold_digit = (state, d) => state * 10 + d;

    // Handle an incoming digit
    function digit(state, d) { switch (state.type) {
	case "empty": return {type: "dec",   dec: d};
	case "dec":   return {type: "dec",   dec: fold_digit(state.dec, d)};
	case "float": return {type: "float", frac: fold_digit(state.frac, d), dec: state.dec};
	case "var":   return {type: "var",  value: state.value + d.toString()};
    }; }

    // Handle the decimal point.
    function decimal(state) { switch (state.type) {
	case "empty": return {type: "float", dec: 0, frac: 0};
	case "dec":   return {type: "float", dec: state.dec, frac: 0};
	case "float": return state;
	case "var":   throw "Illegal: decimal point in word."
    }; }

    // Handle an incomming letter.
    function letter(state, l) { switch (state.type) {
	case "empty": return {type: "var", value: l};
	case "dec":   throw "Illegal: letter in numeral."
	case "float": throw "Illegal: letter in numeral."
	case "var":   return {type: "var", value: state.value + l};
    }; }

    // Return the current value of the accumulator.
    function value(state) { switch (state.type) {
	case "empty": throw "Empty Accumulator";
	case "dec":   return state.dec;
	case "float": return parseFloat(`${state.dec}.${state.frac}`);
	case "var":   return state.value;
    }; }

    // Return the current display value. Similar to above, but
    // returned as a string.
    function display(state, defs) { switch (state.type) {
	case "empty": return "";
	case "dec":   return state.dec.toString();
	case "float": return `${state.dec}.${state.frac}`;
	case "var":   return state.value;
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


// Represents the entire calculator state, including:
// - stack
// - input stream
// - current definitions
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

	assert(accumulator.properties.isEmpty(auto_enter.accum));
	assert(operator in auto_enter.ops);

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

    return undoable({
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
    });
})();
