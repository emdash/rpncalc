"use strict";


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


function undo() {
        // Define the default state:
    let initial = {
	ops: builtins,
	tape: [],
	stack: [],
	accum: null,
    };

    // Is there some way to factor this machinery out?
    // ... from here:
    let state = initial;
    let undo_stack = [];
    let redo_stack = [];
    
    // Private helper to aid with monadic style.
    //
    // Clear the redo stack, and push the current state to the undo
    // stack.
    function update(log, func) {
	return (...args) => {
	    console.log(log);
	    undo_stack.push(state);
	    redo_stack = [];
	    state = func(state, ...args);
	    render();
	};
    }

    // Undo last action
    //
    // Push the current state to the redo stack.
    // Pop the undo stack to the current state.
    function undo() {
	console.log('undo');
	if (undo_stack.length) {
	    redo_stack.push(state);
	    state = undo_stack.pop();
	}
	render();
    }

    // Redo last undo
    //
    // push the current state to the undo stack.
    // Pop the redo stack to the current state.
    function redo() {
	console.log('redo');
	if (redo_stack.length) {
	    undo_stack.push(state);
	    state = redo_stack.pop();
	}
	render();
    }
}



// Immutable accumulator state monad.
//
// Handles user input logic.
function accumulator(state) {
    const initial = {type: "empty"};

    state = state || initial;
    
    function digit(d) {
	switch (state.type) {
	case "empty": return accumulator({
	    type: "int",
	    value: d
	});
	case "integer": return accumulator({
	    type:  "int",
	    value: state.value * 10 + d,
	});
	case "float": return accumulator({
	    type: "float",
	    integer:  state.integer,
	    fraction: state.fraction * 10 + d
	});
	case "word": return accumulator({
	    type: "word",
	    value: state.value + d
	});
	}
    }

    function decimal() {
	switch (state.type) {
	case "empty":   return accumulator({
	    type: "float",
	    integer: 0,
	    fraction: 0
	});
	case "integer": return accumulator({
	    type: "float",
	    integer: state.value,
	    fraction: 0
	});
	case "float":   return state;
	case "word":    return state;
	}
    }

    function letter(l) {
	switch (state.type) {
	case "empty":   return accumulator({
	    type: "word",
	    value: l
	});
	case "integer": return state
	case "float":   return state
	case "word":    return accumulator({
	    type: "word",
	    value: state.value + l
	});
	}
    }
    
    return {...state, digit, decimal, letter};
}


// Immutable calculator state monad.
//
// The entire calculator state.
function calculator (state) {
    const initial = {
	ops: builtins,
	stack: [],
	accum: accumulator()
    };

    state = state || initial;

    // Clear the accumulator.
    const clear = () => calculator({
	...state,
	accum: {type: "empty"}
    });

    // Reset the entire calculator
    const reset = () => calculator(initial);

    // Transfer digit to accumulator.
    const digit = (d) => calculator({
	...state,
	accum: state.accum === null ? `${d}` : state.accum + `${d}`,
    });

    // Handle decimal point being pressed.
    const decimal = () => calculator({
	...state,
	accum: state.accum === null ? `0.` : state.accum + `.`,
    });

    // Push accumulator to stack
    const enter = () => (state.accum !== null) ? calculator({
	ops: state.ops,
	stack: [...state.stack, state.accum],
	tape: [...state.tape, state.accum],
	accum: init.accum
    }) : state;

    // Apply operation to current stack.
    const operator = (name) => calculator({
	...state.enter(),
	stack: state.ops[name](state.stack),
	tape: [...state.tape, name],
	accum: init.accum
    });
    
    return {
        ...state,
	clear,
	digit,
	decimal,
	enter,
	operator,
    };
}


// Top level calculator object
function app() {    
    // ... to here.

    function item(item) {	
	const ret = document.createElement("div");
	ret.appendChild(document.createTextNode(item.toString()));
	return ret;
    }

    function pair(name, value) {
	const ret = document.createElement("div");
	ret.appendChild(item(name));
	ret.appendChild(item(value));
	return ret;
    }

    // Render the new state to the dom.
    //
    // For now we just print state to the console.
    function render() {
	console.debug(state);

	tape.innerHTML = "";
	stack.innerHTML = "";
	accum.innerHTML = state.accum === null ? "" : state.accum;

	for (let val of state.stack) {
	    stack.append(item(val));
	}

	for (let token of state.tape) {
	    tape.append(item(token));
	}
    }
}


const calc = app(
    document.getElementById("ops"),
    document.getElementById("tape"),
    document.getElementById("stack"),
    document.getElementById("accum")
);


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
}

// Hook up keyboard handlers through the keymap.
window.addEventListener('keydown', function (event) {
    console.log(event);
    event.preventDefault();
    if (event.key in keymap) {
	keymap[event.key]();
    } else {
	console.log('unknown key', event.key);
    }
});
