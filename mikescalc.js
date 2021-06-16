"use strict";


function builtin(arity, func) {
    return function (stack) {
	// the index on the stack where the operands begin
	const pivot = stack.length - arity;
	const args = stack.slice(pivot);
	const residual = stack.slice(0, pivot);

	// one result per function assumed.
	residual.push(func(args));

	console.log(pivot, args, residual);
	
	return residual;
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


// A calculator is a monad over its state.
function calculator(ops, tape, stack, accum) {    
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
    
    /* 
     * Each of the following is defined in monadic style.
     */

    // Clear the accumulator.
    const clear = update('clear', (state) => ({
	ops: state.ops,
	stack: state.stack,
	tape: state.tape || [],
	accum: null,
    }));

    // Reset the entire calculator
    const reset = update('reset', (state) => initial);

    // Transfer digit to accumulator.
    const digit = (d) => update(`digit: ${d}`, (state) => ({
	ops: state.ops,
	stack: state.stack,
	tape: state.tape,
	// just insert digit if accum is null.
	accum: state.accum === null ? d : state.accum * 10 + d,
    }));

    // Push accumulator to stack
    const enter = update('enter', (state) => (state.accum !== null ? {
	ops: state.ops,
	stack: [...state.stack, state.accum],
	tape: [...state.tape, state.accum],
	accum: null
    } : state));

    // Apply operation to current stack.
    function operator(name) {
	return update(function (state) {
	    return {
		ops: state.ops,
		stack: state.ops[name](state.stack),
		tape: tape,
		accum: null
	    };
	});
    }

    // Transfer non-empty accum, then update with operator.
    function operation(name) {
	return function() { 
	    enter();
	    operator(name)();
	};
    };
    
    return {
	undo,
	redo,
	render,
	clear,
	digit,
	enter,
	operation,
    };
}


const calc = calculator(
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
