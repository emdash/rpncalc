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


/*
 * A specialized graph implementation for our specific purposes.
 * 
 * JavasScript, for all its dynamism, doesn't make it easy to define a
 * generic graph data-structure.
 */



import {debug, asImmutableObject} from './fp.js';
import sets from './sets.js';

// XXX: move to fp.js
const id = x => x;

/**
 * A graph datastructure built on our set implementation.
 *
 * Because JavaScript lacks a universal interface for equality, we
 * allow the user to overload the comparison function on both vertices
 * and edges.
 *
 */
export default function (
    cmp_v=sets.defaultCmp,
    cmp_e=sets.defaultCmp
) {
    const eq_v = v1 => v2 => cmp_v(v1, v2) === 0;
    const eq_e = e1 => e1 => cmp_e(e1, e2) === 0;

    // specialize set type for vertices and edges.
    const vset = sets(cmp_v);
    const eset = sets(cmp_e);

    // graph constructors
    const empty = ()     => ({v: vset(), e: eset()});
    const cons  = (v, e) => ({v, e});
    const fromEdges = edges => ({
	v: vset.fromArray(edges.flatMap(([u, v, w]) => [u, v])),
	e: eset.fromArray(edges)
    });

    // flip all the edges in e, transforming the weight by f.
    const ereverse = (e, f=id) => ({
	v, e: e.map(([[u, v], w]) => [[v, u], f(w)])
    });

    // graph operations
    const reverse = ({v, e}) => ({v, e: ereverse(e)});
    const bidir = ({v, e}, f=id) => ({v, e: e.union(ereverse(e), f)});
    const merge = (a, b) => ({v: a.v.union(b.v), e: a.e.union(b.v)});
    const cut   = (a, b) => ({
	// remove vertices in b
	v: a.v.diff(b.v),
	// remove edges in b, as well as those referring to vertices in b.
	e: a.e.diff(b.v)
	    .diff(a.e.filter(([u, v, w]) => !(b.has(u) || b.has(v))))
    });

    // Get all the nodes connected to the given node
    const adjacent = ({e}, x) => e
	  .filter(([u, v, w]) => eq_v(u, x))
	  .map(([u, v, w]) => ({v, w}));

    // Get the weight for an edge
    const weight = ({v, e}, v1, v2) => e
	  .find(([u, v, w]) => eq_v(v1)(u) && eq_v(v)(v2))[2];

    const traverse = next => (g, start, init, visit) => {
	assert(v.has(start));

	const {v, e} = g;
	const items = [s];
	let visited = vset;
	let accum = init;
	while (items.length > 0) {
	    const {cur, w} = next(items);
	    accum = visit(cur, accum, w);
	    visited = visited.insert(cur);
	    cur.extend(adjacent(g, cur).filter(x => !visited.has(x)));
	}

	return accum;
    };

    const depthFirst   = traverse(x => x.pop);
    const breadthFirst = traverse(x => x.shift);

    return asImmutableObject({
	init:         {v: vset, e: eset},
	methods:      {reverse, bidir, merge, cut},
	properties:   {adjacent, weight, depthFirst, breadthFirst},
	constructors: {empty, cons, fromEdges}
    });
};
