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

"use strict";

import {debug} from './fp.js';


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


// namespaced version of above
export const ns = (namespace) => (name, attrs, ...children) => {
    const ret = document.createElementNS(namespace, name);

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


// MathML helpers
export const mathml = ns("http://www.w3.org/1998/Math/MathML");

export const math  = (...c) => mathml("math",  {}, ...c);
export const mfrac = (...c) => mathml("mfrac", {}, ...c);
export const mrow  = (...c) => mathml("mrow",  {}, ...c);
export const mi    = (...c) => mathml("mi",    {}, ...c);
export const mo    = (...c) => mathml("mo",    {}, ...c);
export const mn    = (...c) => mathml("mn",    {}, ...c);

function mitem(...items) {
    function mapitem (item) {
	switch (typeof(item)) {
	case "number": return mn(item.toString());
	case "string": return mi(item);
	}
	return item;
    }
    
    if (items.length === 1) {
	return mapitem(items[0]);
    } else {
	return mrow(...items.map(mapitem));
    }
}

export const fraction = (num, denom) => mfrac(mitem(num), mitem(denom));

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


// Monkey patch HTMLElement to add a fluent API
//
// - event handlers
// - style tweaks.
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
