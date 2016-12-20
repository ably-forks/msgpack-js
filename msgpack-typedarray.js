"use strict";

var typedarray = require('./typedarray');
var utf8Decode = require('./utf8decode');

exports.encode = function (value, sparse) {
  var size = sizeof(value, sparse)
  if(size == 0)
    return undefined
  var buffer = new Uint8Array(size);
  encode(value, buffer, 0, sparse);
  return buffer;
};

exports.decode = decode;

// https://gist.github.com/frsyuki/5432559 - v5 spec
//
// I've used one extension point from `fixext 1` to store `undefined`. On the wire this
// should translate to exactly 0xd40000 
//
// +--------+--------+--------+
// |  0xd4  |  0x00  |  0x00  |
// +--------+--------+--------+
//    ^ fixext |        ^ value part unused (fixed to be 0)
//             ^ indicates undefined value
//

function Decoder(buffer, offset) {
  this.offset = offset || 0;
  this.buffer = buffer;
}
Decoder.prototype.map = function (length) {
  var value = {};
  for (var i = 0; i < length; i++) {
    var key = this.parse();
    value[key] = this.parse();
  }
  return value;
};
Decoder.prototype.bin = Decoder.prototype.buf = function (length) {
  var value = this.buffer.subarray(this.offset, this.offset + length);
  this.offset += length;
  return value;
};
Decoder.prototype.str = function (length) {
  var value = utf8Decode(this.buffer, this.offset, this.offset + length);
  this.offset += length;
  return value;
};
Decoder.prototype.array = function (length) {
  var value = new Array(length);
  for (var i = 0; i < length; i++) {
    value[i] = this.parse();
  }
  return value;
};
Decoder.prototype.parse = function () {
  var type = this.buffer[this.offset];
  var value, length, extType;
  // Positive FixInt
  if ((type & 0x80) === 0x00) {
    this.offset++;
    return type;
  }
  // FixMap
  if ((type & 0xf0) === 0x80) {
    length = type & 0x0f;
    this.offset++;
    return this.map(length);
  }
  // FixArray
  if ((type & 0xf0) === 0x90) {
    length = type & 0x0f;
    this.offset++;
    return this.array(length);
  }
  // FixStr
  if ((type & 0xe0) === 0xa0) {
    length = type & 0x1f;
    this.offset++;
    return this.str(length);
  }
  // Negative FixInt
  if ((type & 0xe0) === 0xe0) {
    value = typedarray.readInt8(this.buffer, this.offset);
    this.offset++;
    return value;
  }
  switch (type) {
  // nil
  case 0xc0:
    this.offset++;
    return null;
  // 0xc1: (never used)
  // false
  case 0xc2:
    this.offset++;
    return false;
  // true
  case 0xc3:
    this.offset++;
    return true;
  // bin 8
  case 0xc4:
    length = typedarray.readUInt8(this.buffer, this.offset + 1);
    this.offset += 2;
    return this.bin(length);
  // bin 16
  case 0xc5:
    length = typedarray.readUInt16BE(this.buffer, this.offset + 1);
    this.offset += 3;
    return this.bin(length);
  // bin 32
  case 0xc6:
    length = typedarray.readUInt32BE(this.buffer, this.offset + 1);
    this.offset += 5;
    return this.bin(length);
  // ext 8
  case 0xc7:
    length = typedarray.readUInt8(this.buffer, this.offset + 1);
    extType = typedarray.readUInt8(this.buffer, this.offset + 2);
    this.offset += 3;
    return [extType, this.bin(length)];
  // ext 16
  case 0xc8:
    length = typedarray.readUInt16BE(this.buffer, this.offset + 1);
    extType = typedarray.readUInt8(this.buffer, this.offset + 3);
    this.offset += 4;
    return [extType, this.bin(length)];
  // ext 32
  case 0xc9:
    length = typedarray.readUInt32BE(this.buffer, this.offset + 1);
    extType = typedarray.readUInt8(this.buffer, this.offset + 5);
    this.offset += 6;
    return [extType, this.bin(length)];
  // float 32
  case 0xca:
    value = typedarray.readFloatBE(this.buffer, this.offset + 1);
    this.offset += 5;
    return value;
  // float 64 / double
  case 0xcb:
    value = typedarray.readDoubleBE(this.buffer, this.offset + 1);
    this.offset += 9;
    return value;
  // uint8
  case 0xcc:
    value = this.buffer[this.offset + 1];
    this.offset += 2;
    return value;
  // uint 16
  case 0xcd:
    value = typedarray.readUInt16BE(this.buffer, this.offset + 1);
    this.offset += 3;
    return value;
  // uint 32
  case 0xce:
    value = typedarray.readUInt32BE(this.buffer, this.offset + 1);
    this.offset += 5;
    return value;
  // uint64
  case 0xcf:
    value = readUInt64BE(this.buffer, this.offset + 1);
    this.offset += 9;
    return value;
  // int 8
  case 0xd0:
    value = typedarray.readInt8(this.buffer, this.offset + 1);
    this.offset += 2;
    return value;
  // int 16
  case 0xd1:
    value = typedarray.readInt16BE(this.buffer, this.offset + 1);
    this.offset += 3;
    return value;
  // int 32
  case 0xd2:
    value = typedarray.readInt32BE(this.buffer, this.offset + 1);
    this.offset += 5;
    return value;
  // int 64
  case 0xd3:
    value = readInt64BE(this.buffer, this.offset + 1);
    this.offset += 9;
    return value;

  // fixext 1 / undefined
  case 0xd4:
    extType = typedarray.readUInt8(this.buffer, this.offset + 1);
    value = typedarray.readUInt8(this.buffer, this.offset + 2);
    this.offset += 3;
    return (extType === 0 && value === 0) ? undefined : [extType, value];
  // fixext 2
  case 0xd5:
    extType = typedarray.readUInt8(this.buffer, this.offset + 1);
    this.offset += 2;
    return [extType, this.bin(2)];
  // fixext 4
  case 0xd6:
    extType = typedarray.readUInt8(this.buffer, this.offset + 1);
    this.offset += 2;
    return [extType, this.bin(4)];
  // fixext 8
  case 0xd7:
    extType = typedarray.readUInt8(this.buffer, this.offset + 1);
    this.offset += 2;
    return [extType, this.bin(8)];
  // fixext 16
  case 0xd8:
    extType = typedarray.readUInt8(this.buffer, this.offset + 1);
    this.offset += 2;
    return [extType, this.bin(16)];
  // str 8
  case 0xd9:
    length = typedarray.readUInt8(this.buffer, this.offset + 1);
    this.offset += 2;
    return this.str(length);
  // str 16
  case 0xda:
    length = typedarray.readUInt16BE(this.buffer, this.offset + 1);
    this.offset += 3;
    return this.str(length);
  // str 32
  case 0xdb:
    length = typedarray.readUInt32BE(this.buffer, this.offset + 1);
    this.offset += 5;
    return this.str(length);
  // array 16
  case 0xdc:
    length = typedarray.readUInt16BE(this.buffer, this.offset + 1);
    this.offset += 3;
    return this.array(length);
  // array 32
  case 0xdd:
    length = typedarray.readUInt32BE(this.buffer, this.offset + 1);
    this.offset += 5;
    return this.array(length);
  // map 16:
  case 0xde:
    length = typedarray.readUInt16BE(this.buffer, this.offset + 1);
    this.offset += 3;
    return this.map(length);
  // map 32
  case 0xdf:
    length = typedarray.readUInt32BE(this.buffer, this.offset + 1);
    this.offset += 5;
    return this.map(length);
  }

  throw new Error("Unknown type 0x" + type.toString(16));
};
function decode(buffer) {
  var decoder = new Decoder(buffer);
  var value = decoder.parse();
  if (decoder.offset !== buffer.length) throw new Error((buffer.length - decoder.offset) + " trailing bytes");
  return value;
}

function encodeableKeys (value, sparse) {
  return Object.keys(value).filter(function (e) {
    var val = value[e], type = typeof(val);
    return (!sparse || (val !== undefined && val !== null)) && ('function' !== type || !!val.toJSON);
  })
}

function encode(value, buffer, offset, sparse) {
  var type = typeof value;
  var length, size;

  // Strings Bytes
  if (type === "string") {
    value = typedarray.utf8Encode(value);
    length = value.length;
    // fixstr
    if (length < 0x20) {
      buffer[offset] = length | 0xa0;
      typedarray.copy(value, buffer, offset + 1);
      return 1 + length;
    }
    // str 8
    if (length < 0x100) {
      buffer[offset] = 0xd9;
      typedarray.writeUInt8(buffer, length, offset + 1);
      typedarray.copy(value, buffer, offset + 2);
      return 2 + length;
    }
    // str 16
    if (length < 0x10000) {
      buffer[offset] = 0xda;
      typedarray.writeUInt16BE(buffer, length, offset + 1);
      typedarray.copy(value, buffer, offset + 3);
      return 3 + length;
    }
    // str 32
    if (length < 0x100000000) {
      buffer[offset] = 0xdb;
      typedarray.writeUInt32BE(buffer, length, offset + 1);
      typedarray.copy(value, buffer, offset + 5);
      return 5 + length;
    }
  }

  if (value instanceof Uint8Array) {
    length = value.length;
    // bin 8
    if (length < 0x100) {
      buffer[offset] = 0xc4;
      typedarray.writeUInt8(buffer, length, offset + 1);
      typedarray.copy(value, buffer, offset + 2);
      return 2 + length;
    }
    // bin 16
    if (length < 0x10000) {
      buffer[offset] = 0xc5;
      typedarray.writeUInt16BE(buffer, length, offset + 1);
      typedarray.copy(value, buffer, offset + 3);
      return 3 + length;
    }
    // bin 32
    if (length < 0x100000000) {
      buffer[offset] = 0xc6;
      typedarray.writeUInt32BE(buffer, length, offset + 1);
      typedarray.copy(value, buffer, offset + 5);
      return 5 + length;
    }
  }

  if (type === "number") {
    // Floating Point
    if (Math.floor(value) !== value) {
      buffer[offset] =  0xcb;
      typedarray.writeDoubleBE(buffer, value, offset + 1);
      return 9;
    }

    // Integers
    if (value >=0) {
      // positive fixnum
      if (value < 0x80) {
        buffer[offset] = value;
        return 1;
      }
      // uint 8
      if (value < 0x100) {
        buffer[offset] = 0xcc;
        buffer[offset + 1] = value;
        return 2;
      }
      // uint 16
      if (value < 0x10000) {
        buffer[offset] = 0xcd;
        typedarray.writeUInt16BE(buffer, value, offset + 1);
        return 3;
      }
      // uint 32
      if (value < 0x100000000) {
        buffer[offset] = 0xce;
        typedarray.writeUInt32BE(buffer, value, offset + 1);
        return 5;
      }
      // uint 64
      if (value < 0x10000000000000000) {
        buffer[offset] = 0xcf;
        writeUInt64BE(buffer, value, offset + 1);
        return 9;
      }
      throw new Error("Number too big 0x" + value.toString(16));
    }
    // negative fixnum
    if (value >= -0x20) {
      typedarray.writeInt8(buffer, value, offset);
      return 1;
    }
    // int 8
    if (value >= -0x80) {
      buffer[offset] = 0xd0;
      typedarray.writeInt8(buffer, value, offset + 1);
      return 2;
    }
    // int 16
    if (value >= -0x8000) {
      buffer[offset] = 0xd1;
      typedarray.writeInt16BE(buffer, value, offset + 1);
      return 3;
    }
    // int 32
    if (value >= -0x80000000) {
      buffer[offset] = 0xd2;
      typedarray.writeInt32BE(buffer, value, offset + 1);
      return 5;
    }
    // int 64
    if (value >= -0x8000000000000000) {
      buffer[offset] = 0xd3;
      writeInt64BE(buffer, value, offset + 1);
      return 9;
    }
    throw new Error("Number too small -0x" + value.toString(16).substr(1));
  }

  if (type === "undefined") {
    if(sparse) return 0;
    buffer[offset] = 0xd4;
    buffer[offset + 1] = 0x00; // fixext special type/value
    buffer[offset + 2] = 0x00;
    return 3;
  }

  // null
  if (value === null) {
    if(sparse) return 0;
    buffer[offset] = 0xc0;
    return 1;
  }

  // Boolean
  if (type === "boolean") {
    buffer[offset] = value ? 0xc3 : 0xc2;
    return 1;
  }

  if('function' === typeof value.toJSON)
    return encode(value.toJSON(), buffer, offset, sparse)

  // Container Types
  if (type === "object") {

    size = 0;
    var isArray = Array.isArray(value);

    if (isArray) {
      length = value.length;
    }
    else {
      var keys = encodeableKeys(value, sparse)
      length = keys.length;
    }

    // fixarray
    if (length < 0x10) {
      buffer[offset] = length | (isArray ? 0x90 : 0x80);
      size = 1;
    }
    // array 16 / map 16
    else if (length < 0x10000) {
      buffer[offset] = isArray ? 0xdc : 0xde;
      typedarray.writeUInt16BE(buffer, length, offset + 1);
      size = 3;
    }
    // array 32 / map 32
    else if (length < 0x100000000) {
      buffer[offset] = isArray ? 0xdd : 0xdf;
      typedarray.writeUInt32BE(buffer, length, offset + 1);
      size = 5;
    }

    if (isArray) {
      for (var i = 0; i < length; i++) {
        size += encode(value[i], buffer, offset + size, sparse);
      }
    }
    else {
      for (var i = 0; i < length; i++) {
        var key = keys[i];
        size += encode(key, buffer, offset + size);
        size += encode(value[key], buffer, offset + size, sparse);
      }
    }

    return size;
  }
  if(type === "function")
    return undefined
  throw new Error("Unknown type " + type);
}

function sizeof(value, sparse) {
  var type = typeof value;
  var length, size;

  // Raw Bytes
  if (type === "string") {
    // TODO: this creates a throw-away buffer which is probably expensive on browsers.
    length = typedarray.utf8Length(value);
    if (length < 0x20) {
      return 1 + length;
    }
    if (length < 0x100) {
      return 2 + length;
    }
    if (length < 0x10000) {
      return 3 + length;
    }
    if (length < 0x100000000) {
      return 5 + length;
    }
  }

  if (value instanceof Uint8Array) {
    length = value.length;
    if (length < 0x100) {
      return 2 + length;
    }
    if (length < 0x10000) {
      return 3 + length;
    }
    if (length < 0x100000000) {
      return 5 + length;
    }
  }

  if (type === "number") {
    // Floating Point
    // double
    if (Math.floor(value) !== value) return 9;

    // Integers
    if (value >=0) {
      // positive fixnum
      if (value < 0x80) return 1;
      // uint 8
      if (value < 0x100) return 2;
      // uint 16
      if (value < 0x10000) return 3;
      // uint 32
      if (value < 0x100000000) return 5;
      // uint 64
      if (value < 0x10000000000000000) return 9;
      throw new Error("Number too big 0x" + value.toString(16));
    }
    // negative fixnum
    if (value >= -0x20) return 1;
    // int 8
    if (value >= -0x80) return 2;
    // int 16
    if (value >= -0x8000) return 3;
    // int 32
    if (value >= -0x80000000) return 5;
    // int 64
    if (value >= -0x8000000000000000) return 9;
    throw new Error("Number too small -0x" + value.toString(16).substr(1));
  }

  // Boolean
  if (type === "boolean") return 1;

  // undefined, null
  if (value === null) return sparse ? 0 : 1;
  if (value === undefined) return sparse ? 0 : 3;

  if('function' === typeof value.toJSON)
    return sizeof(value.toJSON(), sparse)

  // Container Types
  if (type === "object") {

    size = 0;
    if (Array.isArray(value)) {
      length = value.length;
      for (var i = 0; i < length; i++) {
        size += sizeof(value[i], sparse);
      }
    }
    else {
      var keys = encodeableKeys(value, sparse)
      length = keys.length;
      for (var i = 0; i < length; i++) {
        var key = keys[i];
        size += sizeof(key) + sizeof(value[key], sparse);
      }
    }
    if (length < 0x10) {
      return 1 + size;
    }
    if (length < 0x10000) {
      return 3 + size;
    }
    if (length < 0x100000000) {
      return 5 + size;
    }
    throw new Error("Array or object too long 0x" + length.toString(16));
  }
  if(type === "function")
    return 0
  throw new Error("Unknown type " + type);
}


