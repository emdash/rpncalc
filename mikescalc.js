"use strict";


// Experimental functional approach to writing this.


/*** Functional helpers ************************************************/


// Helper for debugging in expressions.
function debug(expr, ...other) {
    console.log("debug", expr, ...other);
    return expr;
}


// Simple assert is used for testing in a couple places.
function assert(cond) {
    if (!cond) {
	throw "Assertion failed";
    }
}


// Call `f()` and return its result, or `err` if `f()` throws.
function trap(f, err) {
    try {
	return f();
    } catch (e) {
	console.log(e);
	return err;
    }
}


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


// Dynamic dispatch for javascript
const mux = (map) => (key, ...args) => map[key](...args);


// helpers for composing functions on composed states
const hoist_method = (slot) => (method) => (state, ...args) => ({
    ...state,
    [slot]: method(state[slot], ...args)
});
const hoist_property = (slot) => (prop) => (state, ...args) => prop(state[slot], ...args);
const hoist_methods  = (slot, module) => objmap(hoist_method(slot), module.methods);
const hoist_props    = (slot, module) => objmap(hoist_property(slot), module.properties);


// Undoable monad transformer
function undoable({init, methods, properties}) {
    function update(method) {
	return (state, ...args) => ({
	    inner: method(state.inner, ...args),
	    history: [...state.history, state.inner],
	    undone: []
	});
    }

    function get(prop) {
	return (state, ...args) => prop(state.inner, ...args);
    }

    function undo(state) {
	if (state.history.length > 0) {
	    let last = state.history.length - 1;
	    let inner = state.history[last];
	    let history = state.history.slice(0, last);
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
	    let undone = state.undone.slice(0, last);
	    return {inner, history, undone};
	} else {
	    throw "Nothing to redo!";
	}
    }
    
    return {
	init: {inner: init, history: [], undone: []},
	methods: {...objmap(update, methods), undo, redo},
	properties: objmap(get, properties)
    };
}


// Mutable monad consumer
function mutable({init, methods, properties}, update) {
    let state = init;
    const method   = (m) => (...args) => {state = m(state, ...args); update(state);};
    const property = (p) => (...args) => p(state, ...args);

    return {...objmap(method, methods), ...objmap(property, properties)};
}


// rendering helpers *****************************************************/


// generic element constructor
function el(name, attrs, ...children) {
    const ret = document.createElement(name);
    for (let key in attrs) {
	ret.setAttribute(key, attrs[key]);
    }
    for (let child of children) {
	if (typeof child === "string") {
	    ret.appendChild(document.createTextNode(child));
	} else {
	    ret.appendChild(child);
	}
    }
    return ret;
}


// standard elements
const div    = (attrs, ...children) => el("div",    attrs, ...children);
const span   = (attrs, ...children) => el("span",   attrs, ...children);
const h1     = (...children)        => el("h1",     {},    ...children);
const button = (attrs, ...children) => el("button", attrs, ...children);


// abstract behaviors


// Render a set of items with one selected.
//
// Items must be a record of {key, label, action}.
//
// The return value is an array of items. The key named by `selected`
// will be rendered with the `selected="true"` attribute.
function radio_group(selected, ...items) {
    const radio_button = ({key, label, action}) => {
	const attrs = (key === selected) ? {selected: "true"} : {};
	const ret = button(attrs, label);
	ret.addEventListener("click", action);
	return ret;
    };

    return items.map(radio_button);
};


/* Calculator business logic **********************************************/


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
    
    return {
	init: empty,
	methods: {clear, digit, decimal, letter},
	properties: {value, isEmpty}
    };
})();


// Calculator as a whole
const calculator = (function () {
    // This function has survived several refactorings
    //
    // It returns a function from stack -> stack
    function builtin(arity, func) {
	return (stack) => {
	    // the index on the stack where the operands begin
	    if (stack.length >= arity) {
		const pivot = stack.length - arity;
		const args = stack.slice(pivot);
		const residual = stack.slice(0, pivot);

		// one result per function assumed.
		residual.push(func(args));

		console.log(pivot, args, residual);
		
		return residual;
	    } else {
		throw "stack underflow";
	    }
	}
    }

    // This table of builtins has survived several refactorings.
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

    const init = {
	ops: builtins,
	stack: [],
	tape: [],
	defs: {},
	accum: accumulator.init,
	showing: "desktop"
    };

    // transfer accumulator to stack
    function enter(state) {
	if (!accumulator.properties.isEmpty(state.accum)) {
	    const value = accumulator.properties.value(state.accum);
	    const accum = accumulator.methods.clear(state.accum);
	    const numeric = (typeof(value) === "string") && state.defs[value]
		? calc.defs[value]
		: value;
	    const stack = [...state.stack, numeric];
	    const tape = [...state.tape, value];
	    return {...state, stack, tape, accum};
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

    //
    function show(state, showing) {
	return {...state, showing};
    }
    
    // Accessors
    const accum = (state) => accumulator.properties.value(state.accum);

    return undoable({
	init,
	properties: {top, accum},
	methods: {
	    reset,
	    enter,
	    store,
	    operator,
	    show,
	    ...hoist_methods('accum', accumulator)
	}
    });
})();


// Top level calculator object
//
// Arguments are the dom elements to update in `render()`.
function app(element) {
    // Renders a labeled container
    const container = (id, name, ...content) => div({id}, h1(name), ...content);
    // Helper generating radio items.
    const radio_item = (name) => ({
	key: name,
	label: name,
	action: () => state.show(name)
    });

    const list = (attrs, items) => el(
	"ul",
	attrs,
	...items.map((item) => el("li", {}, item.toString()))
    );

    // Append child elements to `element`.
    const append = (...items) => element.appendChild(...items);
    
    // Render the new state into `element`
    //
    // `full_state` is provided by `mutable`, and represents the inner
    // state object, while `state` is the wrapper object returned by
    // `mutable`.
    function render(full_state) {
	const calc = full_state.inner;
	const showing = calc.showing;

	// Clear the display, we're re-rendering everything.
	element.innerHTML = "";

	// Update this attribute, as some CSS rules depend on it.
	element.setAttribute("showing", showing);

	// Render the "tool strip"
	append(
	    div(
		{id: "tools"},
		...radio_group(
		    showing,
		    radio_item("desktop"),
		    radio_item("10-key"),
		    radio_item("eng"),
		    radio_item("trig"),
		    radio_item("vars"),
		    radio_item("functions")
		),
		button({}, "+")
	    ),
	);

	// Render the stack
	append(container(
	    "stack-container",
	    "Stack",
	    list({id: "stack"}, calc.stack)
	));

	// Some components are hidden to make room for an onscreen keypad
	if (calc.showing === "desktop") {
	    const vars = Object.getOwnPropertyNames(calc.defs).map(
		item => `${item}: ${calc.defs[item]}`
	    );

	    const tape = calc.tape.map((val) => val.toString());

	    // Render the variable window
	    append(container(
		"vars-container",
		"Vars",
		list({id: "vars"}, vars)
	    ));

	    // Render the current program tape
	    append(container(
		"tape-container",
		"Tape",
		list({id: "tape"}, tape)
	    ));
	} else {
	    const keypad = mux({
		"desktop":   () => "",
		"10-key":    () => "10-key",
		"eng":       () => "eng",
		"trig":      () => "trig",
		"vars":      () => "vars",
		"functions": () => "functions"
	    });

	    // Render the keypad
	    append(
		div({id: "keypad-container"}, keypad(showing))
	    );
	}

	// Render the accumulator
	append(container(
	    "accum-container", "Accum",
	    span({id: "accum"}, trap(() => state.accum().toString(), "")),
	    span({id: "cursor"}, "_")
	));
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
    const state = mutable(calculator, render);
    const key = (x, y, label, action) => ({x, y, label, action});
    const layout = {
	rows: 4,
	cols: 4,
	keys: [
	    key(0, 0, "7",     () => state.digit(7)),
	    key(0, 1, "8",     () => state.digit(8)),
	    key(0, 2, "9",     () => state.digit(9)),

	    key(1, 0, "4",     () => state.digit(4)),
	    key(1, 1, "5",     () => state.digit(5)),
	    key(1, 2, "6",     () => state.digit(6)),

	    key(2, 0, "1",     () => state.digit(1)),
	    key(2, 1, "2",     () => state.digit(2)),
	    key(2, 2, "3",     () => state.digit(3)),

	    key(3, 0, "0",     () => state.digit(0)),
	    key(3, 1, ".",     () => state.decimal()),
	    key(3, 2, "enter", () => state.enter()),

	    key(0, 3, "+",     () => state.operator('+')),
	    key(1, 3, "-",     () => state.operator('-')),
	    key(2, 3, "*",     () => state.operator('*')),
	    key(3, 3, "/",     () => state.operator('/'))
	]
    };

    state.reset();
	
    // This has survived several refactorings.
    // This keymap is hard-coded for now. Eventually we will make it
    // user-modifiable.
    function keymap(event) {
	switch(event.key) {
	case '0': return state.digit(0);
	case '1': return state.digit(1);
	case '2': return state.digit(2);
	case '3': return state.digit(3);
	case '4': return state.digit(4);
	case '5': return state.digit(5);
	case '6': return state.digit(6);
	case '7': return state.digit(7);
	case '8': return state.digit(8);
	case '9': return state.digit(9);
	case '.': return state.decimal();
	case 'x': return state.letter('x');
	case 'y': return state.letter('y');
	case '+': return state.operator('+');
	case '-': return state.operator('-');
	case '*': return state.operator('*');
	case '/': return state.operator('/');
	case 'l': return state.operator('log');
	case '^': return state.operator('pow');
	case 's': return state.operator('sin');
	case 'c': return state.operator('cos');
	case 'r': return state.operator('sqrt');
	case '=': return state.store();
	case 'Enter':     return state.enter();
	case 'Backspace': return state.undo();
	case 'Tab':       return state.redo();
	case 'Delete':    return state.clear();
	default:
	    console.log('unknown key', event.key);
	};
    }

    function keydown (event) {
	console.log(event);
	event.preventDefault();
	keymap(event);
    };

    return {...state, keydown};
}

// Create a calculator component using the following dom elements
const calc = app(document.getElementById("state"));

// Hook up keyboard handlers through the keymap.
window.addEventListener('keydown', calc.keydown);
