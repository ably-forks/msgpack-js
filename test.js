"use strict";
var test = require('tape');
var msgpackBuffer = require('./msgpack-buffer');
var msgpackTypedArray = require('./msgpack-typedarray');
var msgpackBops = require('./msgpack-bops');
var util = require('util');

function filledBuffer(length) {
  var buf = new Buffer(length);
  for(var i = 0; i < buf.length; i++) {
    buf[i] = i % 0x10;
  }
  return buf;
}

var tests = [
  true, false, null,
  0, 1, -1, 2, -2, 4, -4, 6, -6,
  0x10, -0x10, 0x20, -0x20, 0x40, -0x40,
  0x80, -0x80, 0x100, -0x100, 0x200, -0x100,
  0x1000, -0x1000, 0x10000, -0x10000,
  0x20000, -0x20000, 0x40000,-0x40000,
  10, 100, 1000, 10000, 100000, 1000000,
  -10, -100, -1000, -10000, -100000, -1000000,
  'hello', 'world', "søme string",
  Buffer.from('Hello'), Buffer.from('World'),
  filledBuffer(0xff), filledBuffer(0xffff), filledBuffer(0x10000),
  [1,2,3], [], {name: "Tim", age: 29}, {},
  {a: 1, b: 2, c: [1, 2, 3]}
];

test('encode to buffer works as expected', function(assert) {

  tests.forEach(function (input) {
    var packed = msgpackBuffer.encode(input);
    console.log(packed);
    var output = msgpackBops.decode(packed);
    if(Buffer.isBuffer(input)) {
      assert.true(Buffer.isBuffer(output));
      assert.true(input.compare(output) === 0);
    }
    else {
      assert.deepEqual(input, output);
    }
  });
  assert.end();
});

test('encode to typedarray works as expected', function(assert) {

  tests.forEach(function (input) {
    if(Buffer.isBuffer(input)) {
      var inputAsArrayBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.length);
      var packed = msgpackTypedArray.encode(inputAsArrayBuffer);
      console.log(packed);
      var output = msgpackBops.decode(Buffer.from(packed));
      assert.true(input.compare(output) === 0);
    } else {
      var packed = msgpackTypedArray.encode(input);
      console.log(packed);
      var output = msgpackBops.decode(Buffer.from(packed));
      assert.deepEqual(input, output);
    }
  });
  assert.end();
});

test('decode from buffer works as expected', function(assert) {

  tests.forEach(function (input) {
    var packed = msgpackBops.encode(input);
    console.log(packed);
    var output = msgpackBuffer.decode(packed);
    if (Buffer.isBuffer(input)) {
      assert.true(Buffer.isBuffer(output));
      assert.true(input.compare(output) === 0);
    }
    else {
      assert.deepEqual(input, output);
    }
  });
  assert.end();
});

test('decode from typedarray works as expected (to ArrayBuffers)', function(assert) {

  tests.forEach(function (input) {
    var packed = msgpackBops.encode(input);
    var packedAsArrayBuffer = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.length);
    var output = msgpackTypedArray.decode(packedAsArrayBuffer);
    if(Buffer.isBuffer(input)) {
      assert.true(input.compare(Buffer.from(output)) === 0);
    } else {
      assert.deepEqual(input, output);
    }
  });
  assert.end();
});

test('decode from typedarray works as expected (to node Buffers)', function(assert) {

  tests.forEach(function (input) {
    var packed = msgpackBops.encode(input);
    var packedAsArrayBuffer = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.length);
    var output = msgpackTypedArray.decode(packedAsArrayBuffer, 0, 0, true);
    if(Buffer.isBuffer(input)) {
      assert.true(input.compare(output) === 0);
    } else {
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
      msgpackBuffer.decode(msgpackBuffer.encode(input)),
      JSON.parse(JSON.stringify(input)),
      util.inspect(input)
    )
  })
  assert.end()
})

test('returns undefined for a function', function (assert) {
  function noop () {}
  assert.equal(msgpackBuffer.encode(noop), JSON.stringify(noop))
  assert.end()
})
