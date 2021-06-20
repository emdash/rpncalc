"use strict";


// Experimental functional approach to writing this.
//
// Everything is a monad. If I was new to functional programming, i
// would have no idea what is going on in this file.


// Simple assert is used for testing in a couple places.
function assert(cond) {
    if (!cond) {
	throw "Assertion failed";
    }
}


// This function has survied several refactorings
function builtin(arity, func) {
    return (stack) => {
	// the index on the stack where the operands begin
	if (stack.lenth >= arity) {
	    const pivot = stack.length - arity;
	    const args = stack.slice(pivot);
	    const residual = stack.slice(0, pivot);

	    // one result per function assumed.
	    residual.push(func(args));

	    console.log(pivot, args, residual);
	    
	    return residual;
	} else {
	    return "stack underflow";
	}
    }
}


// This table of builtins has surivived several refactorings as well.
const builtins = {
    "+":    builtin(2, (args) => args[0] + args[1]),
    "-":    builtin(2, (args) => args[0] - args[1]),
    "*":    builtin(2, (args) => args[0] * args[1]),
    "/":    builtin(2, (args) => args[0] / args[1]),
    "log":  builtin(2, (args) => Math.log(args[0], args[1])),
    "pow":  builtin(2, (args) => Math.pow(args[0], args[1])),
    "sin":  builtin(1, (args) => Math.sin(args[0])),
    "cos":  builtin(1, (args) => Math.cos(args[0])),
    "sqrt": builtin(1, (args) => Math.sqrt(args[0]))
};


// Return a new object, applying func to every value in obj.
function objmap(func, obj) {
    const ret = {};
    let key;

    for (key in obj) {
	if (obj.hasOwnProperty(key)) {
	    ret[key] = func(obj[key]);
	}
    }

    return ret;
}


// Given a description of a monad, return an object that behaves like
// a monad.
//
// Return an opaque object containing corresponding mutators and setters.
function monad(spec) {
    spec.methods = spec.methods || {};
    spec.properties = spec.properties || {};
    const {priv, methods, properties} = spec;

    function update(method) {
	return (...args) => monad({priv: method(priv, ...args), methods, properties});
    }

    function get(prop) {
	return (...args) => prop(priv, ...args);
    }

    return {
	...objmap(update, methods),
	...objmap(get, properties)
    };
}


// A monad representing the calculator's input accumulator.
//
// It is mostly just a wrapper around the usual methods for parsing
// base 10 values, but there are some wrinkles since it is modal.
//
// The accumulator starts out empty.
// If the first character is a digit, accumulator is in decimal mode.
// If the first character is a decimal, accumulator is in float mode.
// If the first character is a letter, accumulator is in word mode.
//
// Subsequent chars are then accepted or rejected based on the mode,
// until it is cleared, via clear().
const accumulator = (function () {
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
	case "word":  return {type: "word",  value: state.value + d.toString()};
    }; }

    // Handle the decimal point.
    function decimal(state) { switch (state.type) {
	case "empty": return {type: "float", dec: 0, frac: 0};
	case "dec":   return {type: "float", dec: state.dec, frac: 0};
	case "float": return state;
	case "word":  throw "Illegal: decimal point in word."
    }; }

    // Handle an incomming letter.
    function letter(state, l) { switch (state.type) {
	case "empty": return {type: "word", value: l};
	case "dec":   throw "Illegal: letter in numeral."
	case "float": throw "Illegal: letter in numeral."
	case "word":  return {type: "word", value: state + l};
    }; }

    // Return the current value of the accumulator.
    function value(state, defs) { switch (state.type) {
	case "empty": throw "Empty Accumulator";
	case "dec":   return state.dec;
	case "float": return parseFloat(`${state.dec}.${state.frac}`);
	case "word":  return state.value;
    }; }

    function isEmpty(state) {
	return state.type === "empty";
    }
    
    return monad({
	priv: empty,
	methods: {clear, digit, decimal, letter},
	properties: {value, isEmpty}
    });
})();


const calculator = (function () {
    const init = {
	ops: builtins,
	stack: [],
	tape: [],
	defs: {},
	accum: accumulator
    };

    // transfer accumulator to stack
    function enter(state) {
	if (!state.accum.isEmpty()) {
	    let accum = state.accum.clear();
	    let value = state.accum.value();
	    let numeric = (typeof(value) === "string")
		? state.defs[value]
		: value;
	    let stack = [...state.stack, numeric];
	    let tape = [...state.tape, value];
	    return {...state, stack, accum, tape};
	} else {
	    return state;
	}
    }

    // apply operator to stack
    function operator(state, operator) {
	// Ensure accumulator contents are transfered to stack.
	let auto_enter = enter(state);

	assert(auto_enter.accum.isEmpty());
	assert(operator in auto_enter.ops);

	let stack = auto_enter.ops[operator](auto_enter.stack);
	let tape = [...auto_enter.tape, operator];
	return {...auto_enter, stack, tape};
    }

    // Reset the calculator to initial conditions.
    function reset(state) {
	return init;
    }

    // Return the top value of the stack, if present.
    function top(state) {
	console.log(state);
	const stack = state.stack;
	const length = stack.length;

	if (length > 0) {
	    return stack[length - 1];
	} else {
	    throw "Stack Underflow";
	}
    }

    // Return the current set of definitions.
    function defs(state) { return state.defs };
    function stack(state) { return state.stack };

    // Re-expose the key behavior from accumulator
    const digit   = (state, d) => ({...state, accum: state.accum.digit(d)});
    const decimal = (state)    => ({...state, accum: state.accum.decimal()});
    const letter  = (state, l) => ({...state, accum: state.accum.letter(l)});
    const accum   = (state)    => state.accum.value();

    return monad({
	priv: init,
	properties: {top, stack, defs, tape, accum},
	methods: {reset, enter, digit, decimal, letter, operator},
    });
})();


// This is the punchline here:
//
// Hooking this back to the dom is one function:
function renderOnUpdate(m, render) {
    let state = m;

    const update = (method) => (...args) => {
	state = method(state);
	render(state);
    };

    const get = (property) => (...args) => property(state);

    render(state);

    return {...objmap(update, m.methods), ...objmap(get, m.properties)};
}


// This is also the punchline:
//
// We can wrap *any* monad in functions like "undoable", it's just a
// monad transform.
function undoable(inner) {
    function update(method) {
	return (state, ...args) => ({
	    inner: method(state.inner, ...args),
	    history: [...state.history, state.inner],
	    undone: []
	});
    }

    
    function get(method) {
	return 
    }

    function undo(state) {
	if (state.history.length > 0) {
	    let last = state.history.length - 1;
	    let inner = state.history[last];
	    let history = state.history.slice(last);
	    let undone = [...state.undone, state.inner];
	    return {inner, history, undone};
	} else {
	    throw "Nothing to undo!";
	}
    }

    function redo(state) {
	if (state.undone.length > 0) {
	    let last = state.undone.length - 1;
	    let inner = state.undone[last];
	    let history = [...state.history, state.inner];
	    let undone = sate.undone.slice(last);
	    return {inner, history, undone};
	} else {
	    throw "Nothing to redo!";
	}
    }
    
    return monad(
	{inner, history: [], undone: []},
	{undo, redo,
	 ...objmap(update, inner.methods),
	 ...objmap(get, inner.properties)
	}
    );
}


// Top level calculator object
//
// Arguments are the dom elements to update in `render()`.
function app(ops, tape, stack, accum) {
    // Helper method for rendering an item.
    function item(item) {	
	const ret = document.createElement("div");
	ret.appendChild(document.createTextNode(item.toString()));
	return ret;
    }

    // Helper method to render a key-value pair.
    function pair(name, value) {
	const ret = document.createElement("div");
	ret.appendChild(item(name));
	ret.appendChild(item(value));
	return ret;
    }

    // Render the new state to the dom.
    function render(state) {
	console.log("render", state);
	const calc = state;
	const accum = calc.accum();
	const stack = calc.stack();
	const tape = calc.tape();

	console.debug("render", calc) /* accum, stack, tape);  */

	tape.innerHTML = "";
	stack.innerHTML = "";
	accum.innerHTML = (function () { switch(accum.type) {
	    case "empty": return "";
	    case "int":   return accum.value;
	    case "float": return `${accum['int']}.${accum.frac}`;
	    case "word":  return accum.value;
	}; })();

	for (let val of stack) {
	    stack.append(item(val));
	}

	for (let token of tape) {
	    tape.append(item(token));
	}
    }

    // This is where we introduce mutable state.
    //
    // See the documentation for monad, but basically we first wrap
    // the `calculator()` type with the `undoable()` mixin. Then we
    // pass that off to `monad()` as the initial state. We pass `render()`
    // As the output function of the monad.
    //
    // Then we call mapobj on the resulting monad to generate the mutation
    // functions.
    //
    // I.e. here is where we transform the pure calculator state
    // object into a stateful object.
    //
    // The monad generates the methods for us using the 
    let state = renderOnUpdate(undoable(calculator), render);


    // This has survived several refactorings.
    // This keymap is hard-coded for now. Eventually we will make it
    // user-modifiable.
    function keymap(calc, event) {
	switch(event.key) {
	case '0': return calc.digit(0);
	case '1': return calc.digit(1);
	case '2': return calc.digit(2);
	case '3': return calc.digit(3);
	case '4': return calc.digit(4);
	case '5': return calc.digit(5);
	case '6': return calc.digit(6);
	case '7': return calc.digit(7);
	case '8': return calc.digit(8);
	case '9': return calc.digit(9);
	case '.': return calc.decimal();
	case '+': return calc.operation('+');
	case '-': return calc.operation('-');
	case '*': return calc.operation('*');
	case '/': return calc.operation('/');
	case 'l': return calc.operation('log');
	case '^': return calc.operation('pow');
	case 's': return calc.operation('sin');
	case 'c': return calc.operation('cos');
	case 'r': return calc.operation('sqrt');
	case 'Enter':     return calc.enter;
	case 'Backspace': return calc.undo;
	case 'Tab':       return calc.redo;
	case 'Delete':    return calc.clear;
	default:
	    console.log('unknown key', event.key);
	};
    }

    function keydown (event) {
	console.log(event);
	event.preventDefault();
	keymap(state, event);
    };

    return {...calc, keydown};
}

// Create a calculator component using the following dom elements
const calc = app(
    document.getElementById("ops"),
    document.getElementById("tape"),
    document.getElementById("stack"),
    document.getElementById("accum")
);

// Hook up keyboard handlers through the keymap.
window.addEventListener('keydown', calc.keydown);
