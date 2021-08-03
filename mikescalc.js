"use strict";


// I used the latest ES6 features to write this in a "functional"
// style.
//
// You could think of this as an exploration of functional programming
// using javascript.
//
// The first part of this file builds up to a bare-bones
// single-page-app framework that resembles a minimalist React + Redux
// store.


/*** Functional Programming Helpers ************************************/


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


// Return a reversed copy of an array.
function reversed(array) {
    const ret = [...array];
    ret.reverse();
    return ret;
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


// Flatten an object into a list of [name, value] pairs.
const flatten = (obj) => Object
      .getOwnPropertyNames(obj)
      .map((name) => [name, obj[name]]);


// Monkey patch some useful methods into the standard library
// Old-style function syntax used for correct handling of `this`.
Object.prototype.map     = function (func) {return objmap(func, this);};
Object.prototype.flatten = function ()     {return flatten(this);};


// Hoist methods from `module` into `slot` in the outer object.
const hoist_methods  = (slot, module) => module.methods.map(
    (method) => (state, ...args) => ({
	...state,
	[slot]: method(state[slot], ...args)
    })
);


// Hoist properties from `module` into `slot`, a field in the outer object.
const hoist_props = (slot, module) => module.properties.map(
    (prop) => (state, ...args) => prop(state[slot], ...args)
);


// Undoable "mixin". Make the underlying type "undoable" by wrapping
// its state and methods.
function undoable({init, methods, properties}) {
    // Each method in `methods` will be wrapped with this function.
    //
    // This handles the argument wrangling, and will fold the previous
    // state into the history, and clear the redo stack.
    const update = (method) => (state, ...args) => ({
	inner: method(state.inner, ...args),
	history: [...state.history, state.inner],
	undone: []
    });

    // Each property in `property` will be wrapped with this function.
    //
    // It simply handles the argument wrangling.
    const get = (prop) => (state, ...args) => prop(state.inner, ...args);

    // Restore state to the top of the undo stack.
    //
    // Uses traditional function syntax since it throws.
    function undo(state) {
	if (state.history.length > 0) {
	    const last    = state.history.length - 1;
	    const inner   = state.history[last];
	    const history = state.history.slice(0, last);
	    const undone  = [...state.undone, state.inner];
	    return {inner, history, undone};
	} else {
	    throw "Nothing to undo!";
	}
    }

    // Restore state to top of the redo stack.
    //
    // Uses traditional function syntax since it throws.
    function redo(state) {
	if (state.undone.length > 0) {
	    const last    = state.undone.length - 1;
	    const inner   = state.undone[last];
	    const history = [...state.history, state.inner];
	    const undone  = state.undone.slice(0, last);
	    return {inner, history, undone};
	} else {
	    throw "Nothing to redo!";
	}
    }

    // We return a wrapper around the type's initial state, with blank
    // undo and redo stacks.
    //
    // We wrap each method in `update`, as described above, and inject
    // the `undo`, `redo` methods.
    //
    // We wrap each property in `get` as described above.
    return {
	init:       {inner: init, history: [], undone: []},
	methods:    {...methods.map(update), undo, redo},
	properties: properties.map(get)
    };
}


// The IO monad, for JS in the browser.
//
// This is some functional magic which helps adapt between input,
// output, and state transformer functions.
//
// Given a type description for an immutable type, returns a wrapper
// type which has a corresponding mutator for every method in the
// underlying type.
//
// When a mutator is called, the new state is passed to the `output`
// callback.
function io({init, methods, properties}, output) {
    let state = init;

    const method = (m) => (...args) => {
	state = m(state, ...args); output(state, actions);
    };

    const property = (p) => (...args) => p(state, ...args);

    // Since this is the end of the chain, we 
    const actions = {
	...methods.map(method),
	...properties.map(property)
    };

    return actions;
}


/*** rendering helpers *****************************************************/


// functional wrapper around DOM API.
//
// No virtual dom here, everything is direct.
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
const div    = (a, ...c)  => el("div",    a, ...c);
const span   = (a, ...c)  => el("span",   a, ...c);
const h1     = (a, ...c)  => el("h1",     a, ...c);
const button = (a, ...c)  => el("button", a, ...c);
const li     = (a, ...c)  => el("li",     a, ...c);
const ul     = (a, ...c)  => el("ul",     a, ...c);
const tr     = (a, ...c)  => el("tr",     a, ...c);
const td     = (a, ...c)  => el("td",     a, ...c);
const table  = (a, ...c)  => el("table",  a, ...c);

// Renders a labeled container
const container = (id, name, ...content) => div(
    {id, "class": "grid"}, h1({}, name), ...content
);


// Render a key / value pair to a string
const pair = (key, value) => `${key}: ${value}`;


/* abstract behaviors *******************************************************/


// Monkey patch Element so that a few useful things can be chained.
//
// XXX: this has an annoying side-effect that these methods appear as
// attributes in the HTML inspector, making an otherwise clean DOM
// tree look pretty cluttered and hard to read. At least in FireFox.
HTMLElement.prototype.handle = function (event, handler) {
    this.addEventListener(event, handler);
    return this;
};

HTMLElement.prototype.setStyle = function (name, value) {
    this.style[name] = value;
    return this;
}


// A group of items representing a mutually-exclusive choice.
//
// Items must be a record of {key, label, action}.
//
// The item who's key matches `selected` will be rendered with the
// `selected: "true"` attribute.
const radio_group = (selected, ...items) => items.map(
    ({key, label, action}) => button(
	(key === selected) ? {selected: "true"} : {},
	label
    ).handle(
	'click',
	action
    )
);


/*** Calculator business logic ********************************************/


// This section represents the calculator itself, which is really a
// simple virtual machine.


// Implement a built-in calculator function.
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
	return (...args) => [func(...args)];
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
const builtins = {
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

const constants = {
    "\u{1D486}": Math.E,
    "\u{1D70B}": Math.PI,
};

// Specify visual symbol for operators as appropriate.
const symbols = {
    add:  "+",
    sub:  "-",
    mul:  "⨉",
    div:  "÷",
    pow:  "x\u{207F}",
    exp:  "\u{1D486}\u{207F}",
    square: "x\u{00B2}",
    abs:  "|\u{1D499}|",
    sqrt: "\u{221A}",
    E:    "\u{1D486}",
    PI:   "\u{1D70B}",
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
const calculator = (function () {
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


/*** Application entry point *************************************************/


// Browser / HTML-specific code to render the calculator state and
// respond to input.
function app(element) {
    // Find the right style rule;
    let keyboard_style_rule = (function () {
	for (let rule of document.styleSheets[0].rules) {
	    if (rule.selectorText === "#content") {
		return rule;
	    }
	}
    })();

    // Append child elements to `element`.
    //
    // XXX: this is stateful and cheaty.
    const append = (...items) => element.appendChild(...items);

    // Render the calculator state as HTML
    function render(state, actions) {
	// Most of this code doesn't care about the undo /
	// redo stacks.
	const calc = state.inner;
	const showing = calc.showing;

	// Clear the display, we're re-rendering everything.
	element.innerHTML = "";

	// Update this attribute, as some CSS rules depend on it.
	element.setAttribute("showing", showing);

	// Render the button strip which controls which mode we are in.
	append(div(
	    {id: "mode"},

	    // Radio buttons for the current display mode.
	    ...radio_group(
		showing,

		// either we are using physical keyboard...
		{
		    key: "keyboard",
		    label: "Tape",
		    action: () => actions.show("keyboard")
		},

		// ...or one of the onscreen layouts.
		...layouts
		    .flatten()
		    .map(([key, _]) => ({
			key,
			label: key,
			action: () => actions.show(key)
		    }))
	    ),
	    button({}, "+").handle("click", () => {throw "Not Implemented";})
	));

	// Render the global actions of clear, reset, undo, redo
	append(
	    div(
		{id: "tools"},
		button({}, "Clear").handle("click", actions.clear),
		button({}, "Reset").handle("click", actions.reset),
		button({}, "Undo").handle("click", actions.undo),
		button({}, "Redo").handle("click", actions.redo),
	    )
	);

	// Render the stack.
	append(container(
	    "stack-container",
	    "Stack",
	    ...reversed(calc.stack).map((value) => div({}, value.toString()))
	));

	// Render the variables. Clicking a variable places it onto the stack.
	append(
	    container(
		"vars-container",
		"Vars",
		...calc
		    .defs
		    .flatten()
		    .map(
			([name, value]) => {
			    console.log(name, value);
			    return button({}, name).handle(
				"click", () => actions.push(name)
			    );
			}
		    )
	    )
	);

	if (calc.showing === "keyboard") {
	    // In keyboard mode, there is no onscreen keyboard.
	    //
	    // We use the space to show the tape.	
	    const tape = calc.tape.map((val) => div({}, val.toString()));
	    append(container("tape-container", "Tape", ...tape))
	} else {
	    // Otherwise, render the keypad appropriate for the mode
	    // we've entered.
	    const layout = layouts[showing];
	    append(
		div(
		    {id: "content"},
		    ...layout.keys.map(
			({name, label, func}) => button({id: name}, label)
			    .handle('click', func)
			    .setStyle('grid-area', name)
		    )
		).setStyle("grid-template-areas", layout.areas)
	    );
	}

	// Render the accumulator
	append(div(
	    {id: "accum"},
	    div({}, `${calc.accum.type}`),
	    div({}, "> " + actions.display()),
	));
    }

    // This is where we transform the pure calculator type into a
    // stateful wrapper.
    const state = io(calculator, render);

    // Split a string on whitespace, dropping the empty strings.
    const split = (str) => str.split(' ').filter(x => !!x);

    /* Keypad layout *****************************************************/

    // Helper functions
    const digits   = new Set("0123456789");
    const digit    = (d) => ({name: `d${d}`, label: d, func: () => state.digit(parseInt(d))});
    const symbol   = (s) => ({name: s, label: s, func: () => state.letter(s)});
    const operator = (f) => ({name: f, label: symbols[f] || f, func: () => state.operator(f)});

    debug(digits);

    // Short-cut characters for common symbols and other funtions.
    const specials = {
	clr:  {name: "clr",   label: "clr",   func: state.clear},
	rst:  {name: "rst",   label: "rst",   func: state.reset},
	dec:  {name: "dec",   label: ".",     func: state.decimal},
	undo: {name: "undo",  label: "undo",  func: state.undo},
	redo: {name: "redo",  label: "redo",  func: state.redo},
	"=":  {name: "store", label: "=",     func: state.store},
	"#":  {name: "enter", label: "enter", func: state.enter},
	"+":  operator("add"),
	"-":  operator("sub"),
	"*":  operator("mul"),
	"/":  operator("div"),
    };

    // Create the 2D key layout for the given layout spec.
    const layout = (...rows) => {
	// Create an entry for each symbol in the row.
	function entry (key) {
	    if (digits.has(key)) {
		return digit(key);
	    } else if (key in builtins) {
		return operator(key);
	    } else if (key in specials) {
		return specials[key];
	    } else if (key == ".") {
		return {name: "."};
	    } else {
		return symbol(key);
	    }
	};

	const entries = rows.map(split).map(row => row.map(entry));

	// Recombine the layout into a string compatible with CSS.
	//
	// We use the `grid-template-areas` property for formatting,
	// but the DSL makes use of funky characters which aren't
	// legal in the CSS to keep the layouts concise.
	//
	// So we need to replace the funky characters with their more
	// wordy equivalents.
	const areas = entries
	      .map(row => row.map(({name}) => name).join(" "))
	      .map(JSON.stringify)
	      .join(" ");

	// Return a flattened, deduplicated list of entries.
	const keys = [...new Set(entries.flat().filter(x => x.name !== "."))];

	return {keys, areas};
    };

    /* Standard Keypad layouts ***********************************************/

    const basic = layout(
	"=   /   *    -",
	"7   8   9    +",
	"4   5   6    +",
	"1   2   3    #",
	"0   0   dec  #",
    );

    const scientific = layout(
	"sin cos  tan     hypot",
	"log ln   log10   log2 ",
	"pow exp  square  sqrt ",
	"=   /    *       -    ",
	"7   8    9       +    ",
	"7   8    9       +    ",
	"4   5    6       +    ",
	"4   5    6       +    ",
	"1   2    3       #    ",
	"1   2    3       #    ",
	"0   0    dec     #    ",
	"0   0    dec     #    ",
    );

    const a = layout(
	"1 2 3 4 5 6 7 8 9 0",
	"q w e r t y u i o p",
	". a s d f g h j k l",
	". . z x c v b n m .",
	". . . = = # # # dec .",
    );

    const A = layout(
	"1 2 3 4 5 6 7 8 9 0",
	"Q W E R T Y U I O P",
	". A S D F G H J K L",
	". . Z X C V B N M .",
	". . . = = # # # dec .",
    );
    
    // Layout consisting of all available functions.
    const fn = layout(
        "abs   acos   asin  atan atan2",
        "ceil  clz32  cos   exp  floor",
        "imul  fround log   max  min  ",
	"pow   random round sin  square",
	"sqrt  tan    log10 log2 log1p",
	"expm1 cosh   sinh  tanh acosh",
	"asinh atanh  hypot sign cbrt"
    );

    // These are the standard layouts
    const layouts = {basic, scientific, a, A, fn};

    /* Keyboard input *******************************************************/

    // Standard keymap for keyboard operation.
    //
    // Maps the key directly as it appears in the `keydown` event.
    const keymap = {
	'0':         () => state.digit(0),
	'1':         () => state.digit(1),
	'2':         () => state.digit(2),
	'3':         () => state.digit(3),
	'4':         () => state.digit(4),
	'5':         () => state.digit(5),
	'6':         () => state.digit(6),
	'7':         () => state.digit(7),
	'8':         () => state.digit(8),
	'9':         () => state.digit(9),
	'.':         () => state.decimal(),
	'x':         () => state.letter('x'),
	'y':         () => state.letter('y'),
	'+':         () => state.operator('add'),
	'-':         () => state.operator('sub'),
	'*':         () => state.operator('mul'),
	'/':         () => state.operator('div'),
	'l':         () => state.operator('log'),
	'^':         () => state.operator('pow'),
	's':         () => state.operator('sin'),
	'c':         () => state.operator('cos'),
	'r':         () => state.operator('sqrt'),
	'=':         state.store,
	'Enter':     state.enter,
	'Backspace': state.undo,
	'Tab':       state.redo,
	'Delete':    state.clear,
    };

    // Hook up keyboard handlers through the keymap.
    window.addEventListener('keydown', function (event) {
	const key = event.key;
	console.log('keydown', event);
	event.preventDefault();
	if (key in keymap) {
	    keymap[key]();
	}
    });

    // Trigger the initial render.
    state.reset();

    // Return value is the debug interface.
    return {...state, layouts};
}

// Create a calculator component using the following dom elements
const calc = app(document.getElementById("state"));
