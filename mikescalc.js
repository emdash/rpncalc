"use strict";

import {debug, reactor, reversed, undoable} from './fp.js';
import {builtins, calculator} from './calc.js';


import {
    el,
    button,
    div,
    span,
    h1,
    li,
    ul,
    tr,
    td,
    table,
    container,
    pair,
    radioGroup,
    monkeyPatch,
    math,
    mathml,
    mi,
    mrow,
    mn,
    fraction,
} from './render.js';

import * as rat from './rat.js';


monkeyPatch();


// Table of unicode symbols for operators that have an obvious choice.
const symbols = {
    exch: "\u{2B0D}",
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

    frac: "fraction",
    fadd: "+",
    fsub: "-",
    fmul: "⨉",
    fdiv: "÷",
    f2:   math(fraction("x", "2")),
    f4:   math(fraction("x", "4")),
    f8:   math(fraction("x", "8")),
    f16:  math(fraction("x", "16")),
    finv: math(fraction("1", "x")),
};

function display(value) {
    if (symbols[value] !== undefined) {
	return symbols[value];
    } else if (typeof(value) === "number") {
	return div({}, value.toString());
    } else {
	const {integer, num, denom} = rat.toProper(value);
	if (denom !== 1 && num !== 0) {
	    if (integer === 0) {
		return div({}, math(fraction(num, denom)));
	    } else {
		return div({}, math(mrow(mn(integer.toString()), fraction(num, denom))));
	    }
	} else {
	    return div({}, integer.toString());
	}
    }
}

const hide_zero = number => (number === 0) ? "" : number.toString();

function render_accum({type, val}) {
    const carret = x => {
	const as_str = (x && x.toString()) || "";
	const length = as_str.length;
	const head = as_str.slice(0, length - 1);
	const tail = as_str.slice(length - 1, length);
	return mn(head, span({id: "carret"}, tail));
    };

    switch (type) {
    case "empty": return carret();
    case "dec":   return carret(val.toString());
    case "float": return span(
	{},
	val.integer.toString(), ".",
	carret(hide_zero(val.frac)));
    case "var":   return carret(val.toString());
    case "num":   return math(
	mn(hide_zero(val.integer)),
	fraction(carret(hide_zero(val.num)), mn("?")));
    case "denom": return math(
	mn(hide_zero(val.integer)),
	fraction(val.num.toString(), carret(hide_zero(val.denom))));
    };

    return `Error: Invalid State: ${type}`;
}

/*** Application entry point *************************************************/


// Browser / HTML-specific code to render the calculator state and
// respond to input.
export function app(element) {
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
	    ...radioGroup(
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
	    ...reversed(calc.stack).map(display)
	))

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
	    append(container(
		"tape-container",
		"Tape",
		...calc.tape.map(display)
	    ));
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
	append(div({id: "accum"}, render_accum(calc.accum)));
    }

    // This is where we transform the pure calculator type into a
    // stateful wrapper.
    const state = reactor(undoable(calculator), render);

    // Split a string on whitespace, dropping the empty strings.
    const split = (str) => str.split(' ').filter(x => !!x);

    /* Keypad layout *****************************************************/

    // Helper functions
    const digits   = new Set("0123456789");
    const digit    = (d) => ({name: `d${d}`, label: d, func: () => state.digit(parseInt(d))});
    const symbol   = (s) => ({name: s, label: s, func: () => state.letter(s)});
    const operator = (f) => ({name: f, label: symbols[f] || f, func: () => state.operator(f)});

    const fnum = math(mrow(mi("x"), fraction("n", "?")));
    const fdenom = math(fraction(mi("x"), "d"));

    // Table of functions which are special-case for one reason or
    // another.
    const specials = {
	swap:  {name: "swap",  label: symbols["exch"],  func: () => state.exch(-1, -2)},
	slash: {name: "slash", label: "/",     func: state.slash},
	clr:   {name: "clr",   label: "clr",   func: state.clear},
	rst:   {name: "rst",   label: "rst",   func: state.reset},
	dec:   {name: "dec",   label: ".",     func: state.decimal},
	undo:  {name: "undo",  label: "undo",  func: state.undo},
	redo:  {name: "redo",  label: "redo",  func: state.redo},
	fnum:  {name: "num",   label: fnum, func: state.num},
	fdenom: {name: "denom", label: fdenom, func: state.denom},
	"=":   {name: "store", label: "=",     func: state.store},
	"#":   {name: "enter", label: "enter", func: state.enter},
	"+":   operator("add"),
	"-":   operator("sub"),
	"*":   operator("mul"),
	"/":   operator("div"),
    };

    // Return the layout entry for a token in our layout dsl.
    function entry (token) {
	if (digits.has(token)) {
	    return digit(token);
	} else if (token in builtins) {
	    return operator(token);
	} else if (token in specials) {
	    return specials[token];
	} else if (token == ".") {
	    return {name: "."};
	} else {
	    return symbol(token);
	}
    };

    // Create the 2D key layout for the given layout spec.
    const layout = (...rows) => {
	// Convert the input text into a array of array of entry
	// records.
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
	"swap /   *    -",
	"7    8   9    +",
	"4    5   6    +",
	"1    2   3    #",
	"0    0   dec  #",
    );

    const scientific = layout(
	"sin  cos  tan     hypot",
	"log  ln   log10   log2",
	"pow  exp  square  sqrt",
	"swap /    *       -   ",
	"7    8    9       +   ",
	"7    8    9       +   ",
	"4    5    6       +   ",
	"4    5    6       +   ",
	"1    2    3       #   ",
	"1    2    3       #   ",
	"0    0    dec     #   ",
	"0    0    dec     #   ",
    );

    const frac = layout(
	"f2    f4   f8      f16",
 	"float finv approx  frac",
	"swap  fdiv fmul    fsub ",
	"7     8    9       fadd ",
	"7     8    9       fadd ",
	"4     5    6       fadd ",
	"4     5    6       fadd ",
	"1     2    3       #",
	"1     2    3       #",
	"0     0    fnum    #",
	"0     0    fdenom  #",
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
        "abs    acos   acosh approx asin  asinh",
	"atan   atan2  atanh cbrt   ceil  clz32",
	"cos    cosh   denom exp    expm1 floor",
	"frac   fround hypot imul   log   log10",
	"log2   log1p  max   min    num   pow",
	"random round  sin   sinh  square sqrt",
	"swap   tan   tanh   .     .      .",
    );

    // These are the standard layouts
    const layouts = {basic, scientific, frac, a, A, fn};

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
