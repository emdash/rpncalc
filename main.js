"use strict";

import * as calc from './mikescalc.js';

// We need to do this for calculator to work correctly.
calc.monkeyPatch();

// Attach calculator to the dom element.
const c = calc.app(document.getElementById("state"));
