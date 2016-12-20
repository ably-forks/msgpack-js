"use strict";

/*
Copyright (c) 2013-2016 Chris Dickinson

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

module.exports = {
    writeUInt8:      write_uint8
  , writeInt8:       write_int8
  , writeUInt16BE:   write_uint16_be
  , writeUInt32BE:   write_uint32_be
  , writeUInt64BE:   write_uint64_be
  , writeInt16BE:    write_int16_be
  , writeInt32BE:    write_int32_be
  , writeInt64BE:    write_int64_be
  , writeFloatBE:    write_float_be
  , writeDoubleBE:   write_double_be
  , readUInt8:      read_uint8
  , readInt8:       read_int8
  , readUInt16BE:   read_uint16_be
  , readUInt32BE:   read_uint32_be
  , readUInt64BE:   read_uint64_be
  , readInt16BE:    read_int16_be
  , readInt32BE:    read_int32_be
  , readInt64BE:    read_int64_be
  , readFloatBE:    read_float_be
  , readDoubleBE:   read_double_be
  , copy:           copy
  , utf8Length:     utf8_length
  , utf8Encode:     utf8_encode
}

let map = new WeakMap()

function getDataView(target) {
  var out = map.get(target.buffer)
  if(!out) {
    map.set(target.buffer, out = new DataView(target.buffer, 0))
  }
  return out
}

let SH_L_32 = (1 << 16) * (1 << 16), SH_R_32 = 1 / SH_L_32;

function write_uint8(target, value, at) {
  return target[at] = value
}

function write_int8(target, value, at) {
  return target[at] = value < 0 ? value + 0x100 : value
}

function write_uint16_be(target, value, at) {
  var dv = getDataView(target);
  return dv.setUint16(at + target.byteOffset, value, false)
}

function write_uint32_be(target, value, at) {
  var dv = getDataView(target);
  return dv.setUint32(at + target.byteOffset, value, false)
}

function write_uint64_be(target, value, at) {
  var dv = getDataView(target);
    if (val < 0x10000000000000000) {
		dv.setUint32(at + target.byteOffset, Math.floor(val * SH_R_32), false);
		dv.setInt32(at + target.byteOffset + 4, value & -1, false);
    } else {
		dv.setUint32(at + target.byteOffset, 0xffffffff, false);
		dv.setUint32(at + target.byteOffset + 4, 0xffffffff, false);
    }
}

function write_int16_be(target, value, at) {
  var dv = getDataView(target);
  return dv.setInt16(at + target.byteOffset, value, false)
}

function write_int32_be(target, value, at) {
  var dv = getDataView(target);
  return dv.setInt32(at + target.byteOffset, value, false)
}

function write_int64_be(target, value, at) {
  var dv = getDataView(target);
    if (val < 0x8000000000000000) {
		dv.setInt32(at + target.byteOffset, Math.floor(val * SH_R_32), false);
		dv.setInt32(at + target.byteOffset + 4, value & -1, false);
    } else {
		dv.setUint32(at + target.byteOffset, 0x7fffffff, false);
		dv.setUint32(at + target.byteOffset + 4, 0xffffffff, false);
    }
}

function write_float_be(target, value, at) {
  var dv = getDataView(target);
  return dv.setFloat32(at + target.byteOffset, value, false)
}

function write_double_be(target, value, at) {
  var dv = getDataView(target);
  return dv.setFloat64(at + target.byteOffset, value, false)
}

function read_uint8(target, at) {
  return target[at]
}

function read_int8(target, at) {
  var v = target[at];
  return v < 0x80 ? v : v - 0x100
}

function read_uint16_be(target, at) {
  var dv = getDataView(target);
  return dv.getUint16(at + target.byteOffset, false)
}

function read_uint32_be(target, at) {
  var dv = getDataView(target);
  return dv.getUint32(at + target.byteOffset, false)
}

function read_uint64_be(target, at) {
  var dv = getDataView(target);
  return dv.getUint32(at + target.byteOffset, false) * SH_L_32 + dv.getUint32(at + target.byteOffset + 4, false)
}

function read_int16_be(target, at) {
  var dv = getDataView(target);
  return dv.getInt16(at + target.byteOffset, false)
}

function read_int32_be(target, at) {
  var dv = getDataView(target);
  return dv.getInt32(at + target.byteOffset, false)
}

function read_int64_be(target, at) {
  var dv = getDataView(target);
  return dv.getInt32(at + target.byteOffset, false) * SH_L_32 + dv.getInt32(at + target.byteOffset + 4, false)
}

function read_float_be(target, at) {
  var dv = getDataView(target);
  return dv.getFloat32(at + target.byteOffset, false)
}

function read_double_be(target, at) {
  var dv = getDataView(target);
  return dv.getFloat64(at + target.byteOffset, false)
}

function copy(source, target, target_start) {
  for(var i = target_start, j = 0;
      j < source.length;
      ++i,
      ++j) {
    target[i] = source[j]
  }
}

function utf8_length(str) {
  var length = 0
    , tmp
    , ch

  for(var i = 0, len = str.length; i < len; ++i) {
    ch = str.charCodeAt(i)
    if(ch & 0x80) {
      tmp = encodeURIComponent(str.charAt(i)).substr(1).split('%')
      for(var j = 0, jlen = tmp.length; j < jlen; ++j) {
        ++length
      }
    } else {
        ++length
    }
  }

  return length
}

function utf8_encode(str) {
  var bytes = []
    , tmp
    , ch

  for(var i = 0, len = str.length; i < len; ++i) {
    ch = str.charCodeAt(i)
    if(ch & 0x80) {
      tmp = encodeURIComponent(str.charAt(i)).substr(1).split('%')
      for(var j = 0, jlen = tmp.length; j < jlen; ++j) {
        bytes[bytes.length] = parseInt(tmp[j], 16)
      }
    } else {
      bytes[bytes.length] = ch 
    }
  }

  return new Uint8Array(bytes)
}
