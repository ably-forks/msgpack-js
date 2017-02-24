"use strict";

exports.encode = function (value) {
  var size = sizeof(value)
  if(size == 0)
    return undefined
  var buffer = new Buffer(size);
  encode(value, buffer, 0);
  return buffer;
};

exports.decode = decode;

var SH_L_32 = (1 << 16) * (1 << 16), SH_R_32 = 1 / SH_L_32;
function readInt64BE(buf, offset) {
	offset = offset || 0;
	return buf.readInt32BE(offset + 0) * SH_L_32 + buf.readUInt32BE(offset + 4);
}

function readUInt64BE(buf, offset) {
	offset = offset || 0;
	return buf.readUInt32BE(offset + 0) * SH_L_32 + buf.readUInt32BE(offset + 4);
}

function writeInt64BE(buf, val, offset) {
    if (val < 0x8000000000000000) {
        buf.writeInt32BE(Math.floor(val * SH_R_32), offset);
        buf.writeInt32BE(val & -1, offset + 4);
    } else {
        buf.writeUInt32BE(0x7fffffff, offset);
        buf.writeUInt32BE(0xffffffff, offset + 4);
    }
}

function writeUInt64BE(buf, val, offset) {
    if (val < 0x10000000000000000) {
        buf.writeUInt32BE(Math.floor(val * SH_R_32), offset);
        buf.writeInt32BE(val & -1, offset + 4);
    } else {
        buf.writeUInt32BE(0xffffffff, offset);
        buf.writeUInt32BE(0xffffffff, offset + 4);
    }
}

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
  var value = this.buffer.slice(this.offset, this.offset + length);
  this.offset += length;
  return value;
};
Decoder.prototype.str = function (length) {
  var value = this.buffer.slice(this.offset, this.offset + length).toString('utf-8');
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
    value = this.buffer.readInt8(this.offset);
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
    length = this.buffer.readUInt8(this.offset + 1);
    this.offset += 2;
    return this.bin(length);
  // bin 16
  case 0xc5:
    length = this.buffer.readUInt16BE(this.offset + 1);
    this.offset += 3;
    return this.bin(length);
  // bin 32
  case 0xc6:
    length = this.buffer.readUInt32BE(this.offset + 1);
    this.offset += 5;
    return this.bin(length);
  // ext 8
  case 0xc7:
    length = this.buffer.readUInt8(this.offset + 1);
    extType = this.buffer.readUInt8(this.offset + 2);
    this.offset += 3;
    return [extType, this.bin(length)];
  // ext 16
  case 0xc8:
    length = this.buffer.readUInt16BE(this.offset + 1);
    extType = this.buffer.readUInt8(this.offset + 3);
    this.offset += 4;
    return [extType, this.bin(length)];
  // ext 32
  case 0xc9:
    length = this.buffer.readUInt32BE(this.offset + 1);
    extType = this.buffer.readUInt8(this.offset + 5);
    this.offset += 6;
    return [extType, this.bin(length)];
  // float 32
  case 0xca:
    value = this.buffer.readFloatBE(this.offset + 1);
    this.offset += 5;
    return value;
  // float 64 / double
  case 0xcb:
    value = this.buffer.readDoubleBE(this.offset + 1);
    this.offset += 9;
    return value;
  // uint8
  case 0xcc:
    value = this.buffer[this.offset + 1];
    this.offset += 2;
    return value;
  // uint 16
  case 0xcd:
    value = this.buffer.readUInt16BE(this.offset + 1);
    this.offset += 3;
    return value;
  // uint 32
  case 0xce:
    value = this.buffer.readUInt32BE(this.offset + 1);
    this.offset += 5;
    return value;
  // uint64
  case 0xcf:
    value = readUInt64BE(this.buffer, this.offset + 1);
    this.offset += 9;
    return value;
  // int 8
  case 0xd0:
    value = this.buffer.readInt8(this.offset + 1);
    this.offset += 2;
    return value;
  // int 16
  case 0xd1:
    value = this.buffer.readInt16BE(this.offset + 1);
    this.offset += 3;
    return value;
  // int 32
  case 0xd2:
    value = this.buffer.readInt32BE(this.offset + 1);
    this.offset += 5;
    return value;
  // int 64
  case 0xd3:
    value = readInt64BE(this.buffer, this.offset + 1);
    this.offset += 9;
    return value;

  // fixext 1 / undefined
  case 0xd4:
    extType = this.buffer.readUInt8(this.offset + 1);
    value = this.buffer.readUInt8(this.offset + 2);
    this.offset += 3;
    return (extType === 0 && value === 0) ? undefined : [extType, value];
  // fixext 2
  case 0xd5:
    extType = this.buffer.readUInt8(this.offset + 1);
    this.offset += 2;
    return [extType, this.bin(2)];
  // fixext 4
  case 0xd6:
    extType = this.buffer.readUInt8(this.offset + 1);
    this.offset += 2;
    return [extType, this.bin(4)];
  // fixext 8
  case 0xd7:
    extType = this.buffer.readUInt8(this.offset + 1);
    this.offset += 2;
    return [extType, this.bin(8)];
  // fixext 16
  case 0xd8:
    extType = this.buffer.readUInt8(this.offset + 1);
    this.offset += 2;
    return [extType, this.bin(16)];
  // str 8
  case 0xd9:
    length = this.buffer.readUInt8(this.offset + 1);
    this.offset += 2;
    return this.str(length);
  // str 16
  case 0xda:
    length = this.buffer.readUInt16BE(this.offset + 1);
    this.offset += 3;
    return this.str(length);
  // str 32
  case 0xdb:
    length = this.buffer.readUInt32BE(this.offset + 1);
    this.offset += 5;
    return this.str(length);
  // array 16
  case 0xdc:
    length = this.buffer.readUInt16BE(this.offset + 1);
    this.offset += 3;
    return this.array(length);
  // array 32
  case 0xdd:
    length = this.buffer.readUInt32BE(this.offset + 1);
    this.offset += 5;
    return this.array(length);
  // map 16:
  case 0xde:
    length = this.buffer.readUInt16BE(this.offset + 1);
    this.offset += 3;
    return this.map(length);
  // map 32
  case 0xdf:
    length = this.buffer.readUInt32BE(this.offset + 1);
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

function encodeableKeys (value) {
  return Object.keys(value).filter(function (e) {
    var val = value[e];
    return (val !== undefined) && ('function' !== typeof(val) || !!val.toJSON);
  })
}

function encode(value, buffer, offset) {
  var type = typeof value;
  var length, size;

  // Strings Bytes
  if (type === "string") {
    value = new Buffer(value, 'utf-8');
    length = value.length;
    // fixstr
    if (length < 0x20) {
      buffer[offset] = length | 0xa0;
      value.copy(buffer, offset + 1);
      return 1 + length;
    }
    // str 8
    if (length < 0x100) {
      buffer[offset] = 0xd9;
      buffer.writeUInt8(length, offset + 1);
      value.copy(buffer, offset + 2);
      return 2 + length;
    }
    // str 16
    if (length < 0x10000) {
      buffer[offset] = 0xda;
      buffer.writeUInt16BE(length, offset + 1);
      value.copy(buffer, offset + 3);
      return 3 + length;
    }
    // str 32
    if (length < 0x100000000) {
      buffer[offset] = 0xdb;
      buffer.writeUInt32BE(length, offset + 1);
      value.copy(buffer, offset + 5);
      return 5 + length;
    }
  }

  if (Buffer.isBuffer(value)) {
    length = value.length;
    // bin 8
    if (length < 0x100) {
      buffer[offset] = 0xc4;
      buffer.writeUInt8(length, offset + 1);
      value.copy(buffer, offset + 2);
      return 2 + length;
    }
    // bin 16
    if (length < 0x10000) {
      buffer[offset] = 0xc5;
      buffer.writeUInt16BE(length, offset + 1);
      value.copy(buffer, offset + 3);
      return 3 + length;
    }
    // bin 32
    if (length < 0x100000000) {
      buffer[offset] = 0xc6;
      buffer.writeUInt32BE(length, offset + 1);
      value.copy(buffer, offset + 5);
      return 5 + length;
    }
  }

  if (type === "number") {
    // Floating Point
    if (Math.floor(value) !== value) {
      buffer[offset] =  0xcb;
      buffer.writeDoubleBE(value, offset + 1);
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
        buffer.writeUInt16BE(value, offset + 1);
        return 3;
      }
      // uint 32
      if (value < 0x100000000) {
        buffer[offset] = 0xce;
        buffer.writeUInt32BE(value, offset + 1);
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
      buffer.writeInt8(value, offset);
      return 1;
    }
    // int 8
    if (value >= -0x80) {
      buffer[offset] = 0xd0;
      buffer.writeInt8(value, offset + 1);
      return 2;
    }
    // int 16
    if (value >= -0x8000) {
      buffer[offset] = 0xd1;
      buffer.writeInt16BE(value, offset + 1);
      return 3;
    }
    // int 32
    if (value >= -0x80000000) {
      buffer[offset] = 0xd2;
      buffer.writeInt32BE(value, offset + 1);
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
    return 0;
  }

  // null
  if (value === null) {
    buffer[offset] = 0xc0;
    return 1;
  }

  // Boolean
  if (type === "boolean") {
    buffer[offset] = value ? 0xc3 : 0xc2;
    return 1;
  }

  if('function' === typeof value.toJSON)
    return encode(value.toJSON(), buffer, offset)

  // Container Types
  if (type === "object") {

    size = 0;
    var isArray = Array.isArray(value);

    if (isArray) {
      length = value.length;
    }
    else {
      var keys = encodeableKeys(value)
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
      buffer.writeUInt16BE(length, offset + 1);
      size = 3;
    }
    // array 32 / map 32
    else if (length < 0x100000000) {
      buffer[offset] = isArray ? 0xdd : 0xdf;
      buffer.writeUInt32BE(length, offset + 1);
      size = 5;
    }

    if (isArray) {
      for (var i = 0; i < length; i++) {
        size += encode(value[i], buffer, offset + size);
      }
    }
    else {
      for (var i = 0; i < length; i++) {
        var key = keys[i];
        size += encode(key, buffer, offset + size);
        size += encode(value[key], buffer, offset + size);
      }
    }

    return size;
  }
  if(type === "function")
    return undefined
  throw new Error("Unknown type " + type);
}

function sizeof(value) {
  var type = typeof value;
  var length, size;

  // Raw Bytes
  if (type === "string") {
    // TODO: this creates a throw-away buffer which is probably expensive on browsers.
    length = value.toString('utf-8').length;
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

  if (Buffer.isBuffer(value)) {
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
  if (value === null) return 1;
  if (value === undefined) return 0;

  if('function' === typeof value.toJSON)
    return sizeof(value.toJSON())

  // Container Types
  if (type === "object") {

    size = 0;
    if (Array.isArray(value)) {
      length = value.length;
      for (var i = 0; i < length; i++) {
        size += sizeof(value[i]);
      }
    }
    else {
      var keys = encodeableKeys(value)
      length = keys.length;
      for (var i = 0; i < length; i++) {
        var key = keys[i];
        size += sizeof(key) + sizeof(value[key]);
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


