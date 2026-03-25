"use strict";
var bops = require('bops');
var test = require('tape');
var msgpack = require('./msgpack');
var util = require('util');

// undefined is deliberately excluded from the round-trip list because it now
// encodes as nil (0xc0) and decodes back as null — it is not round-trippable.
// Dedicated tests below verify the encoding and decoding behaviour explicitly.
var tests = [
  true, false, null,
  0, 1, -1, 2, -2, 4, -4, 6, -6,
  0x10, -0x10, 0x20, -0x20, 0x40, -0x40,
  0x80, -0x80, 0x100, -0x100, 0x200, -0x100,
  0x1000, -0x1000, 0x10000, -0x10000,
  0x20000, -0x20000, 0x40000,-0x40000,
  10, 100, 1000, 10000, 100000, 1000000,
  -10, -100, -1000, -10000, -100000, -1000000,
  'hello', 'world', bops.from("Hello"), bops.from("World"),
  [1,2,3], [], {name: "Tim", age: 29}, {},
  {a: 1, b: 2, c: [1, 2, 3]}
];

test('codec works as expected', function(assert) {

  tests.forEach(function (input) {
    var packed = msgpack.encode(input);
    console.log(packed);
    var output = msgpack.decode(packed);
    if (bops.is(input)) {
      assert.true(bops.is(output));
      for (var i = 0, l = input.length; i < l; i++) {
        assert.equal(input[i], output[i]);
      }
      assert.equal(input.length, output.length);
    }
    else {
      assert.deepEqual(input, output);
    }
  });

  assert.end();

});

function Foo () {
  this.instance = true
}

Foo.prototype.blah = 324

Foo.prototype.doThing = function () {}

function jsonableFunction () {
  console.log("can be json'ed")
}

jsonableFunction.toJSON = function () { return this.toString() }

var jsonLikes = [
  {fun: function () {}, string: 'hello'},
  {toJSON: function () {
    return {object: true}
  }},
  new Date(0),
  /regexp/,
  new Foo(),
  {fun: jsonableFunction},
  jsonableFunction,
]

test('treats functions same as json', function (assert) {
  jsonLikes.forEach(function (input) {
    assert.deepEqual(
      msgpack.decode(msgpack.encode(input)),
      JSON.parse(JSON.stringify(input)),
      util.inspect(input)
    )
  })
  assert.end()
})

test('returns undefined for a function', function (assert) {
  function noop () {}
  assert.equal(msgpack.encode(noop), JSON.stringify(noop))
  assert.end()
})

test('sparse flag discards undefined values in objects; keeps them in arrays', function (assert) {
  const input = [undefined, {a: 'b', 'c': undefined}, undefined];
  const output = msgpack.decode(msgpack.encode(input, true));
  // Array elements encode as nil (0xc0) and decode as null — undefined is
  // not representable in standard msgpack, so null is the closest equivalent.
  assert.equal(output[0], null);
  assert.equal(output.length, 3);
  assert.deepEqual(output[1], {a: 'b'});
  assert.end()
})

test('Can encode large floats', function (assert) {
  const input = 1.7e+308
  const output = msgpack.decode(msgpack.encode(input, true));
  assert.equal(input, output);
  assert.end()
})

// --- undefined encoding tests ---
//
// undefined is now encoded as standard msgpack nil (0xc0) instead of the
// legacy fixext 1 (0xd4 0x00 0x00). This ensures interoperability with
// non-JS msgpack decoders (Go, Python, Ruby, etc.) that reject unknown
// extension types.

test('undefined encodes as nil (0xc0), not fixext 1', function (assert) {
  var encoded = msgpack.encode(undefined);
  // nil is a single byte: 0xc0
  assert.equal(encoded.length, 1, 'nil encoding is 1 byte');
  assert.equal(encoded[0], 0xc0, 'byte is 0xc0 (nil)');
  assert.end()
})

test('undefined decodes as null (same as JSON.stringify/parse)', function (assert) {
  var encoded = msgpack.encode(undefined);
  var decoded = msgpack.decode(encoded);
  assert.equal(decoded, null, 'undefined round-trips as null');
  assert.end()
})

test('undefined values in objects encode as nil, not fixext 1', function (assert) {
  var input = { a: 1, b: undefined, c: 'hello' };
  var encoded = msgpack.encode(input);
  // Verify no fixext 1 bytes (0xd4) appear in the output
  for (var i = 0; i < encoded.length; i++) {
    assert.notEqual(encoded[i], 0xd4, 'no fixext 1 byte at offset ' + i);
  }
  var decoded = msgpack.decode(encoded);
  assert.equal(decoded.a, 1);
  assert.equal(decoded.b, null, 'undefined map value decodes as null');
  assert.equal(decoded.c, 'hello');
  assert.end()
})

test('legacy fixext 1 encoding (0xd4 0x00 0x00) still decodes as undefined', function (assert) {
  // Simulate data written by a previous version of this library where
  // undefined was encoded as fixext 1 (type=0, value=0)
  var legacyBuffer = bops.from([0xd4, 0x00, 0x00]);
  var decoded = msgpack.decode(legacyBuffer);
  assert.equal(decoded, undefined, 'legacy fixext 1 still decodes as undefined');
  assert.end()
})

test('nested objects with undefined values are interoperable', function (assert) {
  // This is the exact pattern that caused failures with Go's msgpack decoder:
  // a nested object with undefined values in a PUT request body
  var input = {
    message: {
      text: 'updated message',
      metadata: undefined,
      headers: undefined
    }
  };
  var encoded = msgpack.encode(input);
  // Verify no fixext 1 bytes appear anywhere in the output
  for (var i = 0; i < encoded.length; i++) {
    assert.notEqual(encoded[i], 0xd4, 'no fixext 1 byte at offset ' + i);
  }
  var decoded = msgpack.decode(encoded);
  assert.equal(decoded.message.text, 'updated message');
  assert.equal(decoded.message.metadata, null, 'nested undefined decodes as null');
  assert.equal(decoded.message.headers, null, 'nested undefined decodes as null');
  assert.end()
})
