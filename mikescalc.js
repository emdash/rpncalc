"use strict";

function assert(cond) {
    if (!cond) {
	throw "Assertion failed";
    }
}


// map a function over every slot in an object
function mapobj(func, obj) {
    const ret = {};
    let key;

    for (key in obj) {
	if (obj.hasOwnProperty(key)) {
	    ret[key] = func(obj[key]);
	}
    }

    return ret;
}

assert(
    JSON.stringify(mapobj(JSON.stringify, {foo: 1, bar: 2})) ===
	JSON.stringify({foo: "1", bar: "2"}));



// Creates immutable objects.
//
// Given a state value, which can be any data, and a dictionary of
// transformations on the state,
//
// Returns an object with derived mutation methods which can be used like an ADT.
function immutable(state, methods) {
    // Return function which will return the result of updating this object.
    function update(func) {
	return function (...args) {
	    return immutable(func(state, ...args), methods);
	}
    }

    const methods = mapobj(update, methods);

    // Return a method which updates some sub-field of the module.
    function wrap_method(wrapper) {
	return function (method) {
	    return wrapper(update(function (...args) {
		method(...args);
	    };
				 }

    return {
	state,
	...methods,
	wrap: (wrapper) => mapobj(wrap_method(wrapper), methods)
    };
}

let counter = immutable(0, {inc: (state) => state + 1});
let outer = counter.wrap((counter) => {state: counter});


// Abstract monad
function monad(state, output) {
    function update(func) {
	return function (...args) {
	    state = func(state, ...args);
	    output(state);
	}
    }

    // Force the initial state to the output.
    output(state);

    // Return an object which allows updating 
    return mapobj(update, state.methods);
}

let test = null;
let tm = monad(
    immutable(0, {inc: (state) => state + 1}),
    (m) => {test = m.state}
);
assert(test === 0);
tm.inc();
assert(test === 1);


// Immutable accumulator state monad.
//
// Handles user input logic.
function accumulator() {
    const initial = {type: "empty"};

    // Clear the accumulator state.
    function clear(state) { return initial; };

    // Handle an incoming digit
    function digit(state, d) { switch (state.type) {
	case "empty": return {type: "int", value: d};
	case "int":   return {type: "int", value: state.value * 10 + d};
	case "float": return {type: "float", "int":  state["int"], frac: state.frac * 10 + d};
	case "word":  return {type: "word", value: state.value + d};
    }; }

    // Handle the decimal point.
    function decimal(state) { switch (state.type) {
	case "empty": return {type: "float", "int": 0, frac: 0};
	case "int":   return {type: "float", "int": state.value, frac: 0};
	case "float": return state;
	case "word":  return state;
    }; }

    // Handle an incomming letter.
    function letter(state, l) { switch (state.type) {
	case "empty": return {type: "word", value: l};
	case "int":   return state
	case "float": return state
	case "word":  return {type: "word", value: state + l};
    }; }
    
    return immutable(initial, {clear, digit, decimal, letter});
}


// Immutable calculator state.
function calculator (state) {
    // Helper function for defining builtin operations on the stack.
    function builtin(arity, func) {
	return function (stack) {
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

    // table of builtin operations.
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

    const initial = {
	ops: builtins,
	stack: [],
	accum: accumulator()
    };

    state = state || initial;

    const reset = (state) => initial;
    const enter = (state) => (state.accum.type !== "empty") ? {
	stack: [...state.stack, state.accum],
	tape:  [...state.tape, state.accum],
	accum: accumulator()
    } : state;
    const operation = (state, op) => state.enter{
	accum: accumulator(),

    return immutable(
	state,
	{reset, enter}
    ).expose(
	(state)        => state.accum,
	(state, accum) => ({...state, accum})
    );
}



// Undo / redo mixin
function undoable(wrapped) {
    const state = {wrapped, history: [], undone: []};

    function update(state) {
	const history = [...state.history, state];
	const undone = [];
	return {state, history, undone}; 
    }

    function undo() {
	const last = state.history.length() - 1;
	if (length > 0) {
	    let history = state.history.slice(last);
	    let undone = [...state.undone, state]
	    let state = state.history[last];
	    return {state, history, undone};
	} else {
	    return state;
	    // XXX: or raise error.
	}
    }

    function redo() {
	const last = state.redo.length() - 1;
	if (length > 0) {
	    let history = [...state.history, state];
	    let undone = state.undone.slice(length);
	    let state = state.undone[last];
	} else {
	    return state;
	    // XXX: or raise error.
	}
    }

    // Return an immutable wrapper around the underlying state,
    // exposing any underlying methods.
    return immutable(state, {undo, redo}).expose(
	(state)          => state.wrapped,
	(state, wrapped) => ({...state, wrapped})
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
	const calc = state.wrapped;
	const accum = calc.state.accum;
	const stack = calc.state.stack;
	const tape = calc. state.tape;

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
    const calc = monad(undoable(calculator()), render);


    // This keymap is hard-coded for now. Eventually we will make it
    // user-modifiable.
    const keymap = {
	'0': calc.digit(0),
	'1': calc.digit(1),
	'2': calc.digit(2),
	'3': calc.digit(3),
	'4': calc.digit(4),
	'5': calc.digit(5),
	'6': calc.digit(6),
	'7': calc.digit(7),
	'8': calc.digit(8),
	'9': calc.digit(9),
	'.': calc.decimal(),
	'+': calc.operation('+'),
	'-': calc.operation('-'),
	'*': calc.operation('*'),
	'/': calc.operation('/'),
	'l': calc.operation('log'),
	'^': calc.operation('pow'),
	's': calc.operation('sin'),
	'c': calc.operation('cos'),
	'r': calc.operation('sqrt'),
	'Enter':     calc.enter,
	'Backspace': calc.undo,
	'Tab':     calc.redo,
	'Delete':    calc.clear,
    };

    function keydown (event) {
	console.log(event);
	event.preventDefault();
	if (event.key in keymap) {
	    keymap[event.key]();
	} else {
	    console.log('unknown key', event.key);
	}
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
