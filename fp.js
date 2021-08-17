/*** Functional Programming Helpers ************************************/


// Helper for debugging in expressions.
export function debug(expr, ...other) {
    console.log("debug", expr, ...other);
    return expr;
}


// Simple assert is used for testing in a couple places.
export function assert(cond) {
    if (!cond) {
	throw "Assertion failed";
    }
}


// Call `f()` and return its result, or `err` if `f()` throws.
export function trap(f, err) {
    try {
	return f();
    } catch (e) {
	console.log(e);
	return err;
    }
}


// Return a reversed copy of an array.
export function reversed(array) {
    const ret = [...array];
    ret.reverse();
    return ret;
}


// Return a new object, applying func to every value in obj.
export function objmap(func, obj) {
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
export const flatten = (obj) => Object
      .getOwnPropertyNames(obj)
      .map((name) => [name, obj[name]]);


// Monkey patch some useful methods into the standard library
// Old-style function syntax used for correct handling of `this`.
Object.prototype.map     = function (func) {return objmap(func, this);};
Object.prototype.flatten = function ()     {return flatten(this);};


// Hoist methods from `module` into `slot` in the outer object.
export const hoist_methods  = (slot, module) => module.methods.map(
    (method) => (state, ...args) => ({
	...state,
	[slot]: method(state[slot], ...args)
    })
);


// Hoist properties from `module` into `slot`, a field in the outer object.
export const hoist_props = (slot, module) => module.properties.map(
    (prop) => (state, ...args) => prop(state[slot], ...args)
);


// Undoable "mixin". Make the underlying type "undoable" by wrapping
// its state and methods.
export function undoable({init, methods, properties}) {
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
export function io({init, methods, properties}, output) {
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
