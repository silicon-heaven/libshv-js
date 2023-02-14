/* eslint-disable */
"use strict"

import { PackContext } from './cpcontext'
import { RpcValue } from './rpcvalue'

function Cpon()
{
}

Cpon.ProtocolType = 2;

Cpon.hexify = function(byte)
{
	if(byte < 10)
		return 48 + byte;
	if(byte < 16)
		return 97 + byte - 10;
	return '?'.charCodeAt(0);
}

Cpon.unhex = function(byte)
{
	if(byte >= 48 && byte <= 57) // 0-9
		return byte - 48;
	if(byte >= 65 && byte <= 70) // A-F
		return byte - 65 + 10;
	if(byte >= 97 && byte <= 102) // a-f
		return byte - 97 + 10;
	throw TypeError("Invalid HEX digit: " + byte)
}

Cpon.utf8ToString = function(bytearray)
{
	let uint8_array = new Uint8Array(bytearray)
	var str = '';
	for (let i = 0; i < uint8_array.length; i++) {
		var value = uint8_array[i];

		if (value < 0x80) {
			str += String.fromCharCode(value);
		}
		else if (value > 0xBF && value < 0xE0) {
			str += String.fromCharCode((value & 0x1F) << 6 | uint8_array[i + 1] & 0x3F);
			i += 1;
		}
		else if (value > 0xDF && value < 0xF0) {
			str += String.fromCharCode((value & 0x0F) << 12 | (uint8_array[i + 1] & 0x3F) << 6 | uint8_array[i + 2] & 0x3F);
			i += 2;
		}
		else {
			// surrogate pair
			var char_code = ((value & 0x07) << 18 | (uint8_array[i + 1] & 0x3F) << 12 | (uint8_array[i + 2] & 0x3F) << 6 | uint8_array[i + 3] & 0x3F) - 0x010000;

			str += String.fromCharCode(char_code >> 10 | 0xD800, char_code & 0x03FF | 0xDC00);
			i += 3;
		}
	}
	return str;
}

Cpon.stringToUtf8 = function(str)
{
	let wr = new CponWriter();
	wr.ctx.writeStringUtf8(str);
	return wr.ctx.buffer();
}

function CponReader(unpack_context)
{
	this.ctx = unpack_context;
}

CponReader.prototype.skipWhiteIsignificant = function()
{
	const SPACE = ' '.charCodeAt(0);
	const SLASH = '/'.charCodeAt(0);
	const STAR = '*'.charCodeAt(0);
	const LF = '\n'.charCodeAt(0);
	const KEY_DELIM = ':'.charCodeAt(0);
	const FIELD_DELIM = ','.charCodeAt(0);
	// BOM characters
  	const B = 239
  	const O = 187
  	const M = 191

	while(true) {
		let b = this.ctx.peekByte();
		if(b < 1)
			return;
		if(b > SPACE) {
			if(b === SLASH) {
				this.ctx.getByte();
				b = this.ctx.getByte();
				if(b === STAR) {
					//multiline_comment_entered;
					while(true) {
						b = this.ctx.getByte();
						if(b === STAR) {
							b = this.ctx.getByte();
							if(b === SLASH)
								break;
						}
					}
				}
				else if(b === SLASH) {
					// to end of line comment entered;
					while(true) {
						b = this.ctx.getByte();
						if(b === LF)
							break;
					}
				}
				else {
					throw new TypeError("Malformed comment");
				}
			}
			else if(b === KEY_DELIM) {
				this.ctx.getByte();
				continue;
			}
			// skip BOM characters
			else if(b === B) {
				this.ctx.getByte();
				continue;
			}
			else if(b === O) {
				this.ctx.getByte();
				continue;
			}
			else if(b === M) {
				this.ctx.getByte();
				continue;
			}
			else if(b === FIELD_DELIM) {
				this.ctx.getByte();
				continue;
			}
			else {
				break;
			}
		}
		else {
			this.ctx.getByte();
		}
	}
}

CponReader.prototype.read = function()
{
	let ret = new RpcValue();
	this.skipWhiteIsignificant();
	let b = this.ctx.peekByte();
	if(b == '<'.charCodeAt(0)) {
		let rv = new RpcValue();
		this.readMap(rv, ">".charCodeAt(0));
		ret.meta = rv.value;
	}

	this.skipWhiteIsignificant();
	b = this.ctx.peekByte();
	//console.log("CHAR:", b, String.fromCharCode(b));
	// [0-9+-]
	if((b >= 48 && b <= 57) || b == 43 || b == 45) {
		this.readNumber(ret);
	}
	else if(b == '"'.charCodeAt(0)) {
		this.readCString(ret);
	}
	else if(b == 'b'.charCodeAt(0)) {
		this.ctx.getByte();
		b = this.ctx.peekByte();
		if(b == "\"".charCodeAt(0)) {
			this.readBlobEsc(ret);
		}
		else {
			throw TypeError("Invalid Blob prefix.")
		}
	}
	else if(b == 'x'.charCodeAt(0)) {
		this.ctx.getByte();
		b = this.ctx.peekByte();
		if(b == "\"".charCodeAt(0)) {
			this.readBlobHex(ret);
		}
		else {
			throw TypeError("Invalid HEX Blob prefix.")
		}
	}
	else if(b == "[".charCodeAt(0)) {
		this.readList(ret);
		ret.type = RpcValue.Type.List;
	}
	else if(b == "{".charCodeAt(0)) {
		this.readMap(ret);
		ret.type = RpcValue.Type.Map;
	}
	else if(b == "i".charCodeAt(0)) {
		this.ctx.getByte();
		b = this.ctx.peekByte();
		if(b == "{".charCodeAt(0)) {
			this.readMap(ret);
			ret.type = RpcValue.Type.IMap;
		}
		else {
			throw TypeError("Invalid IMap prefix.")
		}
	}
	else if(b == "d".charCodeAt(0)) {
		this.ctx.getByte();
		b = this.ctx.peekByte();
		if(b == '"'.charCodeAt(0)) {
			this.readDateTime(ret);
		}
		else {
			throw TypeError("Invalid DateTime prefix.")
		}
	}
	else if(b == 't'.charCodeAt(0)) {
		this.ctx.getBytes("true");
		ret.value = true;
		ret.type = RpcValue.Type.Bool;
	}
	else if(b == 'f'.charCodeAt(0)) {
		this.ctx.getBytes("false");
		ret.value = false;
		ret.type = RpcValue.Type.Bool;
	}
	else if(b == 'n'.charCodeAt(0)) {
		this.ctx.getBytes("null");
		ret.value = null;
		ret.type = RpcValue.Type.Null;
	}
	else {
		throw TypeError("Malformed Cpon input.")
	}
	return ret;
}
/*
// see http://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html#tag_04_15
// see https://stackoverflow.com/questions/16647819/timegm-cross-platform
// see https://www.boost.org/doc/libs/1_62_0/boost/chrono/io/time_point_io.hpp
CponReader.isLeapYear = function(year)
{
	return (year % 4) == 0 && ((year % 100) != 0 || (year % 400) == 0);
}

CponReader.daysFromYear0 = function(year)
{
	year--;
	return 365 * year + ((year / 400) >> 0) - ((year/100) >> 0) + ((year / 4) >> 0);
}

CponReader.daysFrom1970 = function(year)
{
	return daysFromYear0(year) - days_from_0(1970);
}

CponReader.daysFromJan1st = function(year, month, mday)
{
	const days = [
		[ 0,31,59,90,120,151,181,212,243,273,304,334],
		[ 0,31,60,91,121,152,182,213,244,274,305,335]
	]

	return days[CponReader.isLeapYear(year)? 1: 0][month] + mday - 1;
}

CponReader.timegm = function(year, month, mday, hour, min, sec)
{
	// leap seconds are not part of Posix
	let res = 0;
	year = year + 1900;
	// month  0 - 11
	// mday  1 - 31
	res = CponReader.daysFrom1970(year);
	res += CponReader.daysFromJan1st(year, month, mday);
	res *= 24;
	res += hour;
	res *= 60;
	res += min;
	res *= 60;
	res += sec;
	return res;
}
*/
CponReader.prototype.readDateTime = function(rpc_val)
{

	let year = 0;
	let month = 0;
	let day = 1;
	let hour = 0;
	let min = 0;
	let sec = 0;
	let msec = 0;
	let utc_offset = 0;

	this.ctx.getByte(); // eat '"'
	let b = this.ctx.peekByte();
	if(b === '"'.charCodeAt(0)) {
		// d"" invalid data time
		this.ctx.getByte();
		rpc_val.value = null;
		rpc_val.type = RpcValue.Type.DateTime;
		return;
	}

	year = this.readInt();

	b = this.ctx.getByte();
	if(b !== '-'.charCodeAt(0))
		throw new TypeError("Malformed year-month separator in DateTime");
	month = this.readInt();

	b = this.ctx.getByte();
	if(b !== '-'.charCodeAt(0))
		throw new TypeError("Malformed year-month separator in DateTime");
	day = this.readInt();

	b = this.ctx.getByte();
	if(b !== ' '.charCodeAt(0) && b !== 'T'.charCodeAt(0))
		throw new TypeError("Malformed date-time separator in DateTime");
	hour = this.readInt();

	b = this.ctx.getByte();
	if(b !== ':'.charCodeAt(0))
		throw new TypeError("Malformed year-month separator in DateTime");
	min = this.readInt();

	b = this.ctx.getByte();
	if(b !== ':'.charCodeAt(0))
		throw new TypeError("Malformed year-month separator in DateTime");
	sec = this.readInt();

	b = this.ctx.peekByte();
	if(b === '.'.charCodeAt(0)) {
		this.ctx.getByte();
		msec = this.readInt();
	}

	b = this.ctx.peekByte();
	if(b == 'Z'.charCodeAt(0)) {
		// zulu time
		this.ctx.getByte();
	}
	else if(b === '+'.charCodeAt(0) || b === '-'.charCodeAt(0)) {
		// UTC time offset
		this.ctx.getByte();
		let ix1 = this.ctx.index;
		let val = this.readInt();
		let n = this.ctx.index - ix1;
		if(!(n === 2 || n === 4))
			throw new TypeError("Malformed TS offset in DateTime.");
		if(n === 2)
			utc_offset = 60 * val;
		else if(n === 4)
			utc_offset = 60 * ((val / 100) >> 0) + (val % 100);
		if(b == '-'.charCodeAt(0))
			utc_offset = -utc_offset;
	}

	b = this.ctx.getByte();
	if(b !== '"'.charCodeAt(0))
		throw new TypeError("DateTime literal should be terminated by '\"'.");

	//let epoch_sec = CponReader.timegm(year, month, mday, hour, min, sec);
	let epoch_msec = Date.UTC(year, month - 1, day, hour, min, sec);
	epoch_msec -= utc_offset * 60000;
	rpc_val.type = RpcValue.Type.DateTime;
	rpc_val.value = {epochMsec: epoch_msec + msec, utcOffsetMin: utc_offset};
}

CponReader.prototype.readCString = function(rpc_val)
{
	let pctx = new PackContext();
	this.ctx.getByte(); // eat '"'
	while(true) {
		let b = this.ctx.getByte();
		if(b == '\\'.charCodeAt(0)) {
			b = this.ctx.getByte();
			switch (b) {
			case '\\'.charCodeAt(0): pctx.putByte('\\'.charCodeAt(0)); break;
			case '"'.charCodeAt(0): pctx.putByte('"'.charCodeAt(0)); break;
			case 'b'.charCodeAt(0): pctx.putByte('\b'.charCodeAt(0)); break;
			case 'f'.charCodeAt(0): pctx.putByte('\f'.charCodeAt(0)); break;
			case 'n'.charCodeAt(0): pctx.putByte('\n'.charCodeAt(0)); break;
			case 'r'.charCodeAt(0): pctx.putByte('\r'.charCodeAt(0)); break;
			case 't'.charCodeAt(0): pctx.putByte('\t'.charCodeAt(0)); break;
			case '0'.charCodeAt(0): pctx.putByte(0); break;
			default: pctx.putByte(b); break;
			}
		}
		else {
			if (b == '"'.charCodeAt(0)) {
				// end of string
				break;
			}
			else {
				pctx.putByte(b);
			}
		}
	}
	rpc_val.value = Cpon.utf8ToString(pctx.buffer());
	rpc_val.type = RpcValue.Type.String;
}

CponReader.prototype.readBlobEsc = function(rpc_val)
{
	let pctx = new PackContext();
	this.ctx.getByte(); // eat '"'
	while(true) {
		let b = this.ctx.getByte();
		if(b == '\\'.charCodeAt(0)) {
			b = this.ctx.getByte();
			switch (b) {
			case '\\'.charCodeAt(0): pctx.putByte('\\'.charCodeAt(0)); break;
			case '"'.charCodeAt(0): pctx.putByte('"'.charCodeAt(0)); break;
			//case 'b'.charCodeAt(0): pctx.putByte('\b'.charCodeAt(0)); break;
			//case 'f'.charCodeAt(0): pctx.putByte('\f'.charCodeAt(0)); break;
			case 'n'.charCodeAt(0): pctx.putByte('\n'.charCodeAt(0)); break;
			case 'r'.charCodeAt(0): pctx.putByte('\r'.charCodeAt(0)); break;
			case 't'.charCodeAt(0): pctx.putByte('\t'.charCodeAt(0)); break;
			case '0'.charCodeAt(0): pctx.putByte(0); break;
			case 'x'.charCodeAt(0): {
				let b2 = Cpon.unhex(this.ctx.getByte()) * 16 + Cpon.unhex(this.ctx.getByte());
				pctx.putByte(b2);
				break;
			}
			default:
				throw TypeError("Invalid escaped Blob character, code: " + b);
				break;
			}
		}
		else {
			if (b == '"'.charCodeAt(0)) {
				// end of string
				break;
			}
			else {
				if(b < 128)
					pctx.putByte(b);
				else
					throw TypeError("Escaped Blob characters must be lower than 128, code: " + b);
			}
		}
	}
	rpc_val.value = pctx.buffer();
	rpc_val.type = RpcValue.Type.Blob;
}

CponReader.prototype.readBlobHex = function(rpc_val)
{
	let pctx = new PackContext();
	this.ctx.getByte(); // eat '"'
	while(true) {
		let b = this.ctx.getByte();
		if (b == '"'.charCodeAt(0)) {
			// end of string
			break;
		}
		else {
			let b2 = Cpon.unhex(b) * 16 + Cpon.unhex(this.ctx.getByte());
			pctx.putByte(b2);
		}
	}
	rpc_val.value = pctx.buffer();
	rpc_val.type = RpcValue.Type.Blob;
}
CponReader.prototype.readList = function(rpc_val)
{
	let lst = []
	this.ctx.getByte(); // eat '['
	while(true) {
		this.skipWhiteIsignificant();
		let b = this.ctx.peekByte();
		if(b == "]".charCodeAt(0)) {
			this.ctx.getByte();
			break;
		}
		let item = this.read()
		lst.push(item);
	}
	rpc_val.value = lst;
	rpc_val.type = RpcValue.Type.List;
}

CponReader.prototype.readMap = function(rpc_val, terminator = "}".charCodeAt(0))
{
	let map = {}
	this.ctx.getByte(); // eat '{'
	while(true) {
		this.skipWhiteIsignificant();
		let b = this.ctx.peekByte();
		if(b == terminator) {
			this.ctx.getByte();
			break;
		}
		let key = this.read()
		if(!key.isValid())
			throw new TypeError("Malformed map, invalid key");
		this.skipWhiteIsignificant();
		let val = this.read()
		if(key.type === RpcValue.Type.String)
			map[key.toString()] = val;
		else
			map[key.toInt()] = val;
	}
	rpc_val.value = map;
}

CponReader.prototype.readInt = function()
{
	let base = 10;
	let val = 0;
	let neg = 0;
	let n = 0;
	for (; ; n++) {
		let b = this.ctx.peekByte();
		if(b < 0)
			break;
		if (b === 43 || b === 45) { // '+','-'
			if(n != 0)
				break;
			this.ctx.getByte();
			if(b === 45)
				neg = 1;
		}
		else if (b === 120) { // 'x'
			if(n === 1 && val !== 0)
				break;
			if(n !== 1)
				break;
			this.ctx.getByte();
			base = 16;
		}
		else if( b >= 48 && b <= 57) { // '0' - '9'
			this.ctx.getByte();
			val *= base;
			val += b - 48;
		}
		else if( b >= 65 && b <= 70) { // 'A' - 'F'
			if(base !== 16)
				break;
			this.ctx.getByte();
			val *= base;
			val += b - 65 + 10;
		}
		else if( b >= 97 && b <= 102) { // 'a' - 'f'
			if(base !== 16)
				break;
			this.ctx.getByte();
			val *= base;
			val += b - 97 + 10;
		}
		else {
			break;
		}
	}

	if(neg)
		val = -val;
	return val;

}

CponReader.prototype.readNumber = function(rpc_val)
{
	let mantisa = 0;
	let exponent = 0;
	let decimals = 0;
	let dec_cnt = 0;
	let is_decimal = false;
	let is_uint = false;
	let is_neg = false;

	let b = this.ctx.peekByte();
	if(b == 43) {// '+'
		is_neg = false
		b = this.ctx.getByte();
	}
	else if(b == 45) {// '-'
		is_neg = true
		b = this.ctx.getByte();
	}

	mantisa = this.readInt();
	b = this.ctx.peekByte();
	while(b > 0) {
		if(b == "u".charCodeAt(0)) {
			is_uint = 1;
			this.ctx.getByte();
			break;
		}
		if(b == ".".charCodeAt(0)) {
			is_decimal = 1;
			this.ctx.getByte();
			let ix1 = this.ctx.index;
			decimals = this.readInt();
			//if(n < 0)
			//	UNPACK_ERROR(CCPCP_RC_MALFORMED_INPUT, "Malformed number decimal part.")
			dec_cnt = this.ctx.index - ix1;
			b = this.ctx.peekByte();
			if(b < 0)
				break;
		}
		if(b == 'e'.charCodeAt(0) || b == 'E'.charCodeAt(0)) {
			is_decimal = 1;
			this.ctx.getByte();
			let ix1 = this.ctx.index;
			exponent = this.readInt();
			if(ix1 == this.ctx.index)
				throw "Malformed number exponetional part."
			break;
		}
		break;
	}
	if(is_decimal) {
		for (let i = 0; i < dec_cnt; ++i)
			mantisa *= 10;
		mantisa += decimals;
		rpc_val.type = RpcValue.Type.Decimal;
		mantisa = is_neg? -mantisa: mantisa;
		rpc_val.value = {"mantisa": mantisa, "exponent":  exponent - dec_cnt}
	}
	else if(is_uint) {
		rpc_val.type = RpcValue.Type.UInt;
		rpc_val.value = mantisa;

	}
	else {
		rpc_val.type = RpcValue.Type.Int;
		rpc_val.value = is_neg? -mantisa: mantisa;
	}
}

function CponWriter()
{
	this.ctx = new PackContext();
}

CponWriter.prototype.write = function(rpc_val)
{
	if(!(rpc_val && rpc_val instanceof RpcValue))
		rpc_val = new RpcValue(rpc_val)
	if(rpc_val && rpc_val instanceof RpcValue) {
		if(rpc_val.meta) {
			this.writeMeta(rpc_val.meta);
		}
		switch (rpc_val.type) {
		case RpcValue.Type.Null: this.ctx.writeStringUtf8("null"); break;
		case RpcValue.Type.Bool: this.writeBool(rpc_val.value); break;
		case RpcValue.Type.String: this.writeJSString(rpc_val.value); break;
		case RpcValue.Type.Blob: this.writeBlob(rpc_val.value); break;
		case RpcValue.Type.UInt: this.writeUInt(rpc_val.value); break;
		case RpcValue.Type.Int: this.writeInt(rpc_val.value); break;
		case RpcValue.Type.Double: this.writeDouble(rpc_val.value); break;
		case RpcValue.Type.Decimal: this.writeDecimal(rpc_val.value); break;
		case RpcValue.Type.List: this.writeList(rpc_val.value); break;
		case RpcValue.Type.Map: this.writeMap(rpc_val.value); break;
		case RpcValue.Type.IMap: this.writeIMap(rpc_val.value); break;
		case RpcValue.Type.DateTime: this.writeDateTime(rpc_val.value); break;
		/*
		case RpcValue::Type::Invalid:
			if(WRITE_INVALID_AS_NULL) {
				write_p(nullptr);
			}
			break;
			*/
		}
	}
}
/*
CponWriter.prototype.writeStringUtf8 = function(str)
{
	for (let i=0; i < str.length; i++) {
		let charcode = str.charCodeAt(i);
		if (charcode < 0x80)
			this.ctx.putByte(charcode);
		else if (charcode < 0x800) {
			this.ctx.putByte(0xc0 | (charcode >> 6));
			this.ctx.putByte(0x80 | (charcode & 0x3f));
		}
		else if (charcode < 0xd800 || charcode >= 0xe000) {
			this.ctx.putByte(0xe0 | (charcode >> 12));
			this.ctx.putByte(0x80 | ((charcode>>6) & 0x3f));
			this.ctx.putByte(0x80 | (charcode & 0x3f));
		}
		// surrogate pair
		else {
			i++;
			charcode = ((charcode&0x3ff)<<10)|(str.charCodeAt(i)&0x3ff)
			this.ctx.putByte(0xf0 | (charcode >>18));
			this.ctx.putByte(0x80 | ((charcode>>12) & 0x3f));
			this.ctx.putByte(0x80 | ((charcode>>6) & 0x3f));
			this.ctx.putByte(0x80 | (charcode & 0x3f));
		}
	}
}
*/
CponWriter.prototype.writeJSString = function(str)
{
	this.ctx.writeStringUtf8("\"");
	for (let i=0; i < str.length; i++) {
		let charcode = str.charCodeAt(i);
		switch(charcode) {
		case 0:
			this.ctx.writeStringUtf8("\\0");
			break;
		case '\\'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\\\");
			break;
		case '\t'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\t");
			break;
		case '\b'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\b");
			break;
		case '\r'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\r");
			break;
		case '\n'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\n");
			break;
		case '"'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\\"");
			break;
		default:
			this.ctx.writeCharCodeUtf8(charcode);
		}
	}
	this.ctx.writeStringUtf8("\"");
}

CponWriter.prototype.writeBlob = function(buffer)
{
	this.ctx.writeStringUtf8("b\"");
	let data = new Uint8Array(buffer);
	for (let i=0; i < data.length; i++) {
		let b = data[i];
		switch(b) {
		case 0:
			this.ctx.writeStringUtf8("\\0");
			break;
		case '\\'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\\\");
			break;
		case '\t'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\t");
			break;
		case '\r'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\r");
			break;
		case '\n'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\n");
			break;
		case '"'.charCodeAt(0):
			this.ctx.writeStringUtf8("\\\"");
			break;
		default:
			if (b < 128) {
				this.ctx.putByte(b);
			}
			else {
				this.ctx.writeStringUtf8("\\x");
				this.ctx.putByte(Cpon.hexify(b / 16));
				this.ctx.putByte(Cpon.hexify(b % 16));
			}
		}
	}
	this.ctx.writeStringUtf8("\"");
}

CponWriter.prototype.writeDateTime = function(dt)
{
	if(!dt) {
		this.ctx.writeStringUtf8('d""');
		return;
	}
	let epoch_msec = dt.epochMsec;
	let utc_offset = dt.utcOffsetMin;
	let msec = epoch_msec + 60000 * utc_offset;
	let s = new Date(msec).toISOString();
	let rtrim = (msec % 1000)? 1: 5;
	this.ctx.writeStringUtf8('d"');
	for (let i = 0; i < s.length-rtrim; i++)
		this.ctx.putByte(s.charCodeAt(i));
	if(!utc_offset) {
		this.ctx.writeStringUtf8('Z');
	}
	else {
		if(utc_offset < 0) {
			this.ctx.writeStringUtf8('-');
			utc_offset = -utc_offset;
		}
		else {
			this.ctx.writeStringUtf8('+');
		}
		s = ((utc_offset / 60) >> 0).toString().padStart(2, "0");
		if(utc_offset % 60)
			s += (utc_offset % 60).toString().padStart(2, "0");
		for (let i = 0; i < s.length; i++)
			this.ctx.putByte(s.charCodeAt(i));
	}
	this.ctx.writeStringUtf8('"');
}

CponWriter.prototype.writeBool = function(b)
{
	this.ctx.writeStringUtf8(b? "true": "false");
}

CponWriter.prototype.writeMeta = function(map)
{
	this.ctx.writeStringUtf8("<");
	this.writeMapContent(map, RpcValue.Type.Meta);
	this.ctx.writeStringUtf8(">")
}

CponWriter.prototype.writeIMap = function(map)
{
	this.ctx.writeStringUtf8("i{");
	this.writeMapContent(map, RpcValue.Type.IMap);
	this.ctx.writeStringUtf8("}")
}

CponWriter.prototype.writeMap = function(map)
{
	this.ctx.writeStringUtf8("{")
	this.writeMapContent(map, RpcValue.Type.Map);
	this.ctx.writeStringUtf8("}")
}

CponWriter.prototype.writeMapContent = function(map, map_type)
{
	let i = 0;
	for (let p in map) {
		if (map.hasOwnProperty(p)) {
			if(i++ > 0)
				this.ctx.putByte(",".charCodeAt(0))
			do {
				if(map_type == RpcValue.Type.IMap || map_type == RpcValue.Type.Meta) {
					let c = p.charCodeAt(0);
					if(c >= 48 && c <= 57) {
						let i = parseInt(p);
						if(isNaN(i)) {
							if(map_type == RpcValue.Type.IMap)
								throw TypeError("Invalid IMap key: " + p);
						}
						else {
							this.writeInt(i);
							break;
						}
					}
				}
				this.ctx.putByte('"'.charCodeAt(0))
				this.ctx.writeStringUtf8(p);
				this.ctx.putByte('"'.charCodeAt(0))
			} while(false);
			this.ctx.writeStringUtf8(":")
			this.write(map[p]);
		}
	}
}

CponWriter.prototype.writeList = function(lst)
{
	this.ctx.putByte("[".charCodeAt(0))
	for(let i=0; i<lst.length; i++) {
		if(i > 0)
			this.ctx.putByte(",".charCodeAt(0))
		this.write(lst[i])
	}
	this.ctx.putByte("]".charCodeAt(0))
}

CponWriter.prototype.writeUInt = function(num)
{
	var s = num.toString();
	this.ctx.writeStringUtf8(s);
	this.ctx.putByte("u".charCodeAt(0))
}
CponWriter.prototype.writeInt = function(num)
{
	var s = num.toString();
	this.ctx.writeStringUtf8(s);
}
CponWriter.prototype.writeDouble = function(num)
{
	var s = num.toString();
	if(s.indexOf(".") < 0)
		s += "."
	this.ctx.writeStringUtf8(s);
}
CponWriter.prototype.writeDecimal = function(val)
{
	let mantisa = val.mantisa;
	let exponent = val.exponent;
	if(mantisa < 0) {
		mantisa = -mantisa;
		this.ctx.putByte("-".charCodeAt(0));
	}
	let str = mantisa.toString();
	let n = str.length;
	let dec_places = -exponent;
	if(dec_places > 0 && dec_places < n) {
		let dot_ix = n - dec_places;
		str = str.slice(0, dot_ix) + "." + str.slice(dot_ix)
	}
	else if(dec_places > 0 && dec_places <= 3) {
		let extra_0_cnt = dec_places - n;
		let str0 = "0.";
		for (let i = 0; i < extra_0_cnt; ++i)
			str0 += '0';
		str = str0 + str;
	}
	else if(dec_places < 0 && n + exponent <= 9) {
		for (let i = 0; i < exponent; ++i)
			str += '0';
		str += '.';
	}
	else if(dec_places == 0) {
		str += '.';
	}
	else {
		str += 'e' + exponent;
	}
	for (let i = 0; i < str.length; ++i) {
		this.ctx.putByte(str.charCodeAt(i));
	}
}

export { Cpon, CponWriter, CponReader }
