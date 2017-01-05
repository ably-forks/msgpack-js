"use strict";

if(typeof('Buffer') !== 'undefined') {
	exports.encode = require('./msgpack-buffer.js').encode;
	exports.decode = require('./msgpack-buffer.js').decode;
} else {
	exports.encode = require('./msgpack-typedarray.js').encode;
	exports.decode = require('./msgpack-typedarray.js').decode;
}
