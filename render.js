"use strict";


/*** rendering helpers *****************************************************/


// functional wrapper around DOM API.
//
// No virtual dom here, everything is direct.
export function el(name, attrs, ...children) {
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
export const div    = (a, ...c)  => el("div",    a, ...c);
export const span   = (a, ...c)  => el("span",   a, ...c);
export const h1     = (a, ...c)  => el("h1",     a, ...c);
export const button = (a, ...c)  => el("button", a, ...c);
export const li     = (a, ...c)  => el("li",     a, ...c);
export const ul     = (a, ...c)  => el("ul",     a, ...c);
export const tr     = (a, ...c)  => el("tr",     a, ...c);
export const td     = (a, ...c)  => el("td",     a, ...c);
export const table  = (a, ...c)  => el("table",  a, ...c);

// Renders a labeled container
export const container = (id, name, ...content) => div(
    {id, "class": "grid"}, h1({}, name), ...content
);


// Render a key / value pair to a string
export const pair = (key, value) => `${key}: ${value}`;


// A group of items representing a mutually-exclusive choice.
//
// Items must be a record of {key, label, action}.
//
// The item who's key matches `selected` will be rendered with the
// `selected: "true"` attribute.
export const radioGroup = (selected, ...items) => items.map(
    ({key, label, action}) => button(
	(key === selected) ? {selected: "true"} : {},
	label
    ).handle(
	'click',
	action
    )
);


// Monkey patch HTMLElement to add a fluent API for event handlers and
// style tweaks.
//
// XXX: this has an annoying side-effect that these methods appear as
// attributes in the HTML inspector, making an otherwise clean DOM
// tree look pretty cluttered and hard to read. At least in FireFox.
export function monkeyPatch() {
    HTMLElement.prototype.handle = function (event, handler) {
	this.addEventListener(event, handler);
	return this;
    };

    HTMLElement.prototype.setStyle = function (name, value) {
	this.style[name] = value;
	return this;
    }

};
