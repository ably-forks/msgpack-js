"use strict";

exports.encodeToBuffer = require('./msgpack-buffer.js').encode;
exports.decodeFromBuffer = require('./msgpack-buffer.js').decode;

exports.encodeToArrayBufffer = require('./msgpack-typedarray.js').encode;
exports.decodeFromArrayBuffer = require('./msgpack-typedarray.js').decode;

if(typeof('Buffer') !== 'undefined') {
	exports.encode = exports.encodeToBuffer;
	exports.decode = exports.decodeFromBuffer;
} else {
	exports.encode = exports.encodeToArrayBufffer;
	exports.decode = exports.decodeFromArrayBuffer;
}
