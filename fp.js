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
export function assert(cond, msg) {
    if (!cond) {
	throw msg || "Assertion failed!";
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


// Allows us to throw from within an expression.
export function raise(err) {
    throw Err;
};


// Return a reversed copy of an array.
export function reversed(array) {
    const ret = [...array];
    ret.reverse();
    return ret;
}

// Monkey patch some useful methods into the standard library ****************/

// Old-style function syntax used for correct handling of `this`.
//
// XXX: this has obnoxious side-effect that these methods appear as
// attributes in the HTML inspector, making an otherwise clean DOM
// tree look pretty cluttered and hard to read. At least in FireFox.


// Map over the values of an object.
//
// The keys cannot be changed, though we could support this, it would
// make the common case more verbose.
Object.prototype.map = function (func) {
    return Object.fromEntries(Object.entries(this).map(
	([key, value]) => [key, func(value, key)]
    ));
}


// Convert object into an array of `[key, value]` pairs.
//
// This is just a wrapper around Object.entries.
//
// XXX: refactor: rename smth like "entries" or "items"?
Object.prototype.flatten = function () {
    return Object.entries(this);
};


// Zip the values of two objects with the same set of keys.
//
// We don't attempt to enforce that the two objects have the same
// keyset.
Object.prototype.zip = function (b) {
    const a = this;
    return Object.fromEntries(Object.keys(a).map(k => [k, [a[k], b[k]]]));
};


// Array-optimized version of zip
//
// Length will be the shorter of the two.
Array.prototype.zip = function (b) {
    const ret = [];
    const end = Math.min(this.length, b.length);
    for (let i = 0; i < end; i++) {
	ret.push([this[i], b[i]]);
    }
    return ret;
};


// Shorthand for map(f).reduce(r)
Array.prototype.mapreduce = function (f, r) { return this.map(f).reduce(r); };


// Like python's `all` builtin.
Array.prototype.all = function (func) {
    return this.mapreduce(func, (a, x) => a && x);
};


// Like python's `any` builtin.
Array.prototype.any = function (func) {
    return this.mapreduce(func, (a, x) => a || b);
}


// Embed one immutable object within another, under the named slot.
function embed(obj, slot) {
    const {
        init,
        methods,
        properties,
        constructors = {},
    } = obj.__spec;

    // These combinators lift the underlying method to our object type.
    // They differ just in how the arguments are treated.
    //
    // - a constructor takes no state parameter, returns state.
    // - a method takes a state parameter, returns state.
    // - a property takes a state parameter, returns plain value.
    const embed_cons   = c => (s, ...a) => ({...s, [slot]: c(...a)});
    const embed_method = m => (s, ...a) => ({...s, [slot]: m(s[slot], ...a)});
    const embed_prop   = p => (s, ...a) => p(s[slot], ...a);

    return asImmutableObject({
        methods: {
            init: init && state => ({...state, [slot]: init}),
            ...constructors.map(embed_cons),
            ...methods.map(embed_method)
        }, properties: properties.map(embed_prop),
    };
}


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
export function undoable(inner) {
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
    return embed(
        {inner, 
	init:    {inner: inner.init(), history: [], undone: []},
	methods: {undo, redo},
    };
}


// Convert our pure-functional API into an immutable object API.
//
// This makes testing and debugging a lot more ergonomic, since we can
// just chain method calls to sequence operations.
//
// It becomes hard to compose objects once this function has been
// applied. Consider it the last in a chain of combinators.
export function asImmutableObject(spec) {
    const spec = {
        init,
        methods,
        properties,
        constructors={},
        embedded={}
    };

    // Lift a plain state value into an object instance.
    function lift(state) {
	state.__proto__ = vtable;
	return state;
    }

    // `lift()` the return value of a constructor function.
    //
    // Like `method` below, but does not bind `this` to its argument.
    const cons = c => (...args) => lift(c(...args));

    // Convert mutator function `m` for use in the prototype vtable.
    //
    // `this` is treated as state, with result lifted to a new instance.
    //
    // Note: legacy function syntax is intential, in order to capture
    // `this` correctly.
    const method = (m) => function (...args) {
	return lift(m(this, ...args));
    };

    // Convert query function `p` for use in the prototype vtable.
    //
    // `this` is treated as state, result is returned unmodified.
    //
    // Note: legacy function syntax is intential, in order to capture
    // `this` correctly.
    const property = (p) => function (...args) {
	return p(this, ...args);
    };

    // Construct the vtable by wrapping pure functions with
    // appropriate combinators defined above.
    const vtable = {
        // include the original typespec
        __spec,
	lift,
	...constructors.map(cons),
	...methods.map(method),
	...properties.map(property)
    };

    if (!(init === undefined || init === null)) {
	return lift(init);
    } else if (constructors) {
	return constructors.map(cons);
    }

    throw "Neither `init` nor `constructors` given";
}


// Convert our pure-functional API into a stateful, reactive API.
//
// This bridges our functional code to the browser. You can think of
// this as a bare-bones redux store. Like `asImmutableObject` above,
// this is the last stop in a chain of combinators.
//
// When a mutator is called, the internal state is updated, and
// `output` callback is invoked with the new state.
//
// If this process throws an excetion, `err` is called on the input
// state
export function reactor({init, methods, properties}, output, on_error) {
    let state = init;

    const method = (m) => (...args) => {
	try {
	    state = m(state, ...args);
	} catch (err) {
	    // defer to the error handler on failure.
	    state = on_error(state, err);
	}
	// notify the listener that the state has changed.
	output(state, actions);
    };

    const property = (p) => (...args) => p(state, ...args);

    // Since this is the end of the chain, we can flatten these into
    // one namespace ... though in hindsight I wonder if this is
    // actually a good idea.
    const actions = {
	...methods.map(method),
	...properties.map(property)
    };

    return actions;
}


// A sum type that works with our conventions around immutability.
//
// Also provides some basic support for pattern matching.
export function sum_t(typespecs) {
    const variants = typespecs.map(asImmutableObject);
    const lift     = tag => value => ({tag, value});
    const wrap     = tag => f => (...args) => lift(tag)(f(...args));
    const relift   = ([tag, value]) => {
    });

    // Dispatch based on the typestate of ourselves.
    //
    // Matches can be a plain object or a Map instance. This will
    // throw if the matches isn't exhaustive.
    const match = ({tag, value}) => matches => {
        // XXX: handle wildcard patterns somehow?
        if (!variants.every(x => typeof matches[x] === "function")) {
            throw new Error("match is not exhaustive");
        }
        return matches[tag](variants[tag].lift(value));
    };

    // Dispatch over a pair of variant values.
    //
    // Matches must be a Map with an exhaustive set of [x, y]
    // patterns.
    //
    // Each match should return a [tag, value] tuple.
    const bimatch (a, b) => matches => {
        const at = a.tag,
              bt = b.tag,
              av = variants[tag].lift(a),
              bv = variants[tag].lift(b);

        // XXX: match should be exhaustive over cross-product of
        // (variants^2)
        //
        // Also counting wildcard patterns.
        return relift(matches[[at, bt]](av, bv));
    };

    return {
        methods: {match, bimatch, ...},
        constructors: {
            lift,
            ...Object.fromEntries(
                alternatives
                    .flatten()
                    .flatMap(([k, v]) => v.constructors.map(wrap(k)))
            )
        }
    };
}


