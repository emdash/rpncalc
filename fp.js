// (c) 2021 Brandon Lewis
//
// This file is part of rpncalc.
//
// rpncalc is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// rpncalc is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with rpncalc.  If not, see <https://www.gnu.org/licenses/>.


/*** Functional Programming Helpers ************************************/


// Helper for debugging in expressions.
export function debug(expr, ...other) {
    console.trace("debug", expr, ...other);
    return expr;
}


// Simple assert is used for testing in a couple places.
export const assert = (cond, msg) => {
    if (!cond) {
	throw msg || "Assertion failed!";
    }
}


// Assert that the given number is an integer.
export function assertInt(value) {
    // XXX: force Number internally.
    //
    // TODO: the opposite, force BigInt internally.
    const val = (typeof value === "bigint")
          ? Number(value)
          : value;

    if (!Number.isInteger(val)) {
	throw new Error(`${value} is not an integer!`);
    }

    return val;
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


// throw `e` in an expression context.
export function raise(e) {
    throw e;
};


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


// Convert a list of key-value pairs to an object indexed by name.
//
// Informally, ([[k, v]]) -> {[k]: set<v>}.
export const coallate = seq => seq.reduce(
    (c, [k, v]) => ({...c, [k]: [...(c[k] || []), v]}),
    {}
);


// Flatten an object into a list of [name, value] pairs.
export const flatten = (obj) => Object
      .getOwnPropertyNames(obj)
      .map((name) => [name, obj[name]]);


// Monkey patch some useful methods into the standard library
// Legacy function syntax used for correct handling of `this`.
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


// Handle BigInt when deserializing from JSON
const reviver = (key, value) =>
      ((typeof value === "string") && /^\d+n$/.test(value))
      ? BigInt(value.slice(0, -1))
      : value;


// Handle BigInt when serializing to JSON.
const replacer = (key, value) =>
      (typeof value === "bigint")
      ? `${value.toString()}n`
      : value;

// enhanced version of stringify / parse which handle big-int.
export const stringify = (val, spc) => JSON.stringify(val, replacer, spc);
export const parse     = str        => JSON.parse(str, reviver)


/*** Iterator functions ******************************************************/

const reduce_empty_seq = new TypeError(
    "ireduce of empty sequence with no initial value"
);


// Iterator implementation of map
const imap = function* (f) {
    for (const value of this) {
        yield f(value, "imap");
    }
};

// Iterator implementation of filter
const ifilter = function* (f) {
    for (const value of this) {
        if (f(value)) {
            yield value;
        }
    }
};

// Iterator implementation of reduce
function ireduce(f, init) {
    const first = this.next();

    if (first.done) {
        if (init === undefined) {
            throw reduce_empty_seq;
        }
        return init;
    }

    let accum = (init === undefined)
          ? first.value
          : f(init, first.value);

    for (let next of this) {
        accum = f(accum, next);
    }

    return accum;
}

// Collect the iterator elements into an array.
function collect() { return [...this]; }

// Collect the iterator elements into an object.
function collectObj() { return Object.fromEntries(this.collect()); }


// Hack to monkey-patch builtin collection iterators with expected
// operations.
function monkeyPatchCollections() {
    // Hack to find the actual iterator prototype for the collection.
    const getIterProto = col => (new col)[Symbol.iterator]().__proto__;

    // Place useful iterator methods into the given iterator prototype.
    function patchIter(proto) {
        // patch in our methods
        proto.map = imap;
        proto.filter = ifilter;
        proto.reduce = ireduce;
        proto.collect = collect;
        proto.collectObj = collectObj;
    }

    patchIter(getIterProto(Array));
    patchIter(getIterProto(Map));
    patchIter(getIterProto(Set));
    // Generators need this special hack.
    const gen = (function* () { yield 1;})();
    patchIter(gen.__proto__.__proto__);

    // While we're at it, extend the Map and Set objects with some
    // useful methods.
    Map.prototype.map = function (...a) {
        return this.entries().map(...a);
    };

    Map.prototype.filter = function (...a) {
        return this.entries().filter(...a);
    };

    Map.prototype.reduce = function (...a) {
        return this.entries().reduce(...a);
    };

    Set.prototype.map = function (...a) {
        return this.values().map(...a);
    };

    Set.prototype.filter = function (...a) {
        return this.values().filter(...a);
    };

    Set.prototype.reduce = function (...a) {
        return this.values().reduce(...a);
    };

};


// array defines these, but Map / Set don't.
monkeyPatchCollections();



// Make the underlying type "undoable".
//
// Factor out history management from business logic.
//
// I've never had a calculator with an "undo" feature before.  I've
// implemented "undo/redo" before, in different ways. This
// implementation is by far the simplest, and most robust I've yet
// managed, though it works by keeping complete copies of previous
// states. Some sort of caching machinery would be involved if your
// state type is large.
//
// Essentially, an RPN calculator is such a trivial state machine
// compared to the resources of a modern smart phone, that we can
// afford to save preserve entire state history.
//
// This might prove problematic with persistent storage, and some care
// should be put in to the UX around saving / loading / expiring
// history. There's a convenience to having persistent history, but
// this has to be balanced against privacy and storage concerns.
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


// Make our functional-style code work like immutable.js objects.
//
// This makes writing unit tests / interactive debugging a lot more
// ergonomic, since we can just chain method / property calls.
export function asImmutableObject({init, methods, properties}) {
    // Lift a plain state value into an object instance.
    function lift(state) {
	state.__proto__ = vtable;
	return state;
    }

    // Convert transformer method `m` for use in the prototype vtable.
    //
    // `this` is treated as the state, and the result is itself lifted
    // to an instance.
    const method = (m) => function (...args) {
	return lift(m(this, ...args));
    };

    // Convert property `p` for use in the prototype vtable.
    //
    // `this` is treated as state. Result is returned unchanged.
    const property = (p) => function (...args) {
	return p(this, ...args);
    };

    // Construct the vtable by wrapping method and property functions
    // as described above.
    const vtable = {
	lift,
	...methods.map(method),
	...properties.map(property)
    };

    return lift(init);
}


// Transform our functional code into a stateful, reactive object.
//
// This is useful for hooking our functional code up to the DOM, and
// you can view this function as a bare-bones redux store.
//
// When a mutator is called, the internal state is updated, and
// `output` callback is invoked with the new state.
//
// If this process throws an excetion, `err` is called on the input
// state
export function reactor({init, methods, properties}, output, on_error) {
    let state;

    let saved = window.localStorage.getItem("default");

    if (saved !== null) {
        console.log("Loading saved history...");
        state = debug(JSON.parse(saved));
    } else {
        console.log("No history to load...");
        state = init;
    }

    function refresh() {
        output(state, actions);
    }

    const method = (m) => (...args) => {
	try {
	    state = m(state, ...args);
            window.localStorage.setItem("default", JSON.stringify(state));
	} catch (err) {
	    // defer to the error handler on failure.
	    state = on_error(state, err);
	}
	// notify the listener that the state has changed.
	refresh();
    };

    const property = (p) => (...args) => p(state, ...args);

    // Since this is the end of the chain, we can flatten these into
    // one namespace ... though in hindsight I wonder if this is
    // actually a good idea.
    const actions = {
        refresh,
	...methods.map(method),
	...properties.map(property)
    };

    return actions;
}
