/* eslint-disable */
"use strict"

import { PackContext, UnpackContext } from './cpcontext'
import { Cpon } from './cpon'
import { BInt } from './bint'
import { RpcValue } from './rpcvalue'

export function ChainPack()
{
}

ChainPack.ProtocolType = 1;

ChainPack.CP_Null = 128;
ChainPack.CP_UInt = 129;
ChainPack.CP_Int = 130;
ChainPack.CP_Double = 131;
ChainPack.CP_Bool = 132;
ChainPack.CP_Blob = 133;
ChainPack.CP_String = 134;
//ChainPack.CP_DateTimeEpoch_depr; // deprecated
ChainPack.CP_List = 136;
ChainPack.CP_Map = 137;
ChainPack.CP_IMap = 138;
ChainPack.CP_MetaMap = 139;
ChainPack.CP_Decimal = 140;
ChainPack.CP_DateTime = 141;
ChainPack.CP_CString = 142;
ChainPack.CP_FALSE = 253;
ChainPack.CP_TRUE = 254;
ChainPack.CP_TERM = 255;

// UTC msec since 2.2. 2018
// Fri Feb 02 2018 00:00:00 == 1517529600 EPOCH
ChainPack.SHV_EPOCH_MSEC = 1517529600000;
ChainPack.INVALID_MIN_OFFSET_FROM_UTC = (-64 * 15);

ChainPack.isLittleEndian = (function() {
	let buffer = new ArrayBuffer(2);
	new DataView(buffer).setInt16(0, 256, true /* littleEndian */);
	// Int16Array uses the platform's endianness.
	return new Int16Array(buffer)[0] === 256;
})();

export function ChainPackReader(unpack_context)
{
	if(unpack_context instanceof ArrayBuffer)
		unpack_context = new UnpackContext(unpack_context)
	else if(unpack_context instanceof Uint8Array)
		unpack_context = new UnpackContext(unpack_context)
	if(!(unpack_context instanceof UnpackContext))
		throw new TypeError("ChainpackReader must be constructed with UnpackContext")
	this.ctx = unpack_context;
}

ChainPackReader.prototype.read = function()
{
	let rpc_val = new RpcValue();
	let packing_schema = this.ctx.getByte();

	if(packing_schema == ChainPack.CP_MetaMap) {
		rpc_val.meta = this.readMap();
		packing_schema = this.ctx.getByte();
	}

	if(packing_schema < 128) {
		if(packing_schema & 64) {
			// tiny Int
			rpc_val.type = RpcValue.Type.Int;
			rpc_val.value = packing_schema & 63;
		}
		else {
			// tiny UInt
			rpc_val.type = RpcValue.Type.UInt;
			rpc_val.value = packing_schema & 63;
		}
	}
	else {
		switch(packing_schema) {
		case ChainPack.CP_Null: {
			rpc_val.type = RpcValue.Type.Null;
			rpc_val.value = null;
			break;
		}
		case ChainPack.CP_TRUE: {
			rpc_val.type = RpcValue.Type.Bool;
			rpc_val.value = true;
			break;
		}
		case ChainPack.CP_FALSE: {
			rpc_val.type = RpcValue.Type.Bool;
			rpc_val.value = false;
			break;
		}
		case ChainPack.CP_Int: {
			rpc_val.value = this.readIntData()
			rpc_val.type = RpcValue.Type.Int;
			break;
		}
		case ChainPack.CP_UInt: {
			rpc_val.value = this.readUIntData()
			rpc_val.type = RpcValue.Type.UInt;
			break;
		}
		case ChainPack.CP_Double: {
			let data = new Uint8Array(8);
			for (var i = 0; i < 8; i++)
				data[i] = this.ctx.getByte();
			rpc_val.value = new DataView(data.buffer).getFloat64(0, true); //little endian
			rpc_val.type = RpcValue.Type.Double;
			break;
		}
		case ChainPack.CP_Decimal: {
			let mant = this.readIntData();
			let exp = this.readIntData();
			rpc_val.value = {mantisa: mant, exponent: exp};
			rpc_val.type = RpcValue.Type.Decimal;
			break;
		}
		case ChainPack.CP_DateTime: {
			let bi = this.readUIntDataHelper();
			let lsb = bi.val[bi.val.length - 1]
			let has_tz_offset = lsb & 1;
			let has_not_msec = lsb & 2;
			bi.signedRightShift(2);
			lsb = bi.val[bi.val.length - 1]

			let offset = 0;
			if(has_tz_offset) {
				offset = lsb & 0x7F;
				if(offset & 0x40) {
					// sign extension
					offset = offset - 128;
				}
				bi.signedRightShift(7);
			}
			offset *= 15;
			if(offset == ChainPack.INVALID_MIN_OFFSET_FROM_UTC) {
				rpc_val.value = null;
			}
			else {
				let msec = bi.toNumber();
				if(has_not_msec)
					msec *= 1000;
				msec += ChainPack.SHV_EPOCH_MSEC;

				rpc_val.value = {epochMsec: msec, utcOffsetMin: offset};
			}
			rpc_val.type = RpcValue.Type.DateTime;
			break;
		}
		case ChainPack.CP_Map: {
			rpc_val.value = this.readMap();
			rpc_val.type = RpcValue.Type.Map;
			break;
		}
		case ChainPack.CP_IMap: {
			rpc_val.value = this.readMap();
			rpc_val.type = RpcValue.Type.IMap;
			break;
		}
		case ChainPack.CP_List: {
			rpc_val.value = this.readList();
			rpc_val.type = RpcValue.Type.List;
			break;
		}
		case ChainPack.CP_Blob: {
			let str_len = this.readUIntData();
			let arr = new Uint8Array(str_len)
			for (var i = 0; i < str_len; i++)
				arr[i] = this.ctx.getByte()
			rpc_val.value = arr.buffer;
			rpc_val.type = RpcValue.Type.Blob;
			break;
		}
		case ChainPack.CP_String: {
			let str_len = this.readUIntData();
			let arr = new Uint8Array(str_len)
			for (var i = 0; i < str_len; i++)
				arr[i] = this.ctx.getByte()
			rpc_val.value = Cpon.utf8ToString(arr.buffer);
			rpc_val.type = RpcValue.Type.String;
			break;
		}
		case ChainPack.CP_CString:
		{
			// variation of CponReader.readCString()
			let pctx = new PackContext();
			while(true) {
				let b = this.ctx.getByte();
				if(b == '\\'.charCodeAt(0)) {
					b = this.ctx.getByte();
					switch (b) {
					case '\\'.charCodeAt(0): pctx.putByte("\\"); break;
					case '0'.charCodeAt(0): pctx.putByte(0); break;
					default: pctx.putByte(b); break;
					}
				}
				else {
					if (b == 0) {
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
			break;
		}
		default:
			throw new TypeError("ChainPack - Invalid type info: " + packing_schema);
		}
	}
	return rpc_val;
}

ChainPackReader.prototype.readUIntDataHelper = function()
{
	let num = 0;
	let head = this.ctx.getByte();
	let bytes_to_read_cnt;
	if     ((head & 128) === 0) {bytes_to_read_cnt = 0; num = head & 127;}
	else if((head &  64) === 0) {bytes_to_read_cnt = 1; num = head & 63;}
	else if((head &  32) === 0) {bytes_to_read_cnt = 2; num = head & 31;}
	else if((head &  16) === 0) {bytes_to_read_cnt = 3; num = head & 15;}
	else {
		bytes_to_read_cnt = (head & 0xf) + 4;
	}
	let bytes = new Uint8Array(bytes_to_read_cnt + 1)
	bytes[0] = num;
	for (let i=0; i < bytes_to_read_cnt; i++) {
		let r = this.ctx.getByte();
		bytes[i + 1] = r;
	}
	return new BInt(bytes)
}

ChainPackReader.prototype.readUIntData = function()
{
	let bi = this.readUIntDataHelper();
	return bi.toNumber();
}

ChainPackReader.prototype.readIntData = function()
{
	let bi = this.readUIntDataHelper();
	let is_neg;
	if(bi.byteCount() < 5) {
		let sign_mask = 0x80 >> bi.byteCount();
		is_neg = bi.val[0] & sign_mask;
		bi.val[0] &= ~sign_mask;
	}
	else {
		is_neg = bi.val[1] & 128;
		bi.val[1] &= ~128;
	}
	let num = bi.toNumber();
	if(is_neg)
		num = -num;
	return num;
}

ChainPackReader.prototype.readList = function()
{
	let lst = []
	while(true) {
		let b = this.ctx.peekByte();
		if(b == ChainPack.CP_TERM) {
			this.ctx.getByte();
			break;
		}
		let item = this.read()
		lst.push(item);
	}
	return lst;
}

ChainPackReader.prototype.readMap = function()
{
	let map = {}
	while(true) {
		let b = this.ctx.peekByte();
		if(b == ChainPack.CP_TERM) {
			this.ctx.getByte();
			break;
		}
		let key = this.read()
		if(!key.isValid())
			throw new TypeError("Malformed map, invalid key");
		let val = this.read()
    if(key.type === RpcValue.Type.String)
 			map[key.toString()] = val;
		else
			map[key.toInt()] = val;
	}
	return map;
}

export function ChainPackWriter()
{
	this.ctx = new PackContext();
}

ChainPackWriter.prototype.write = function(rpc_val)
{
	if(!(rpc_val && rpc_val instanceof RpcValue))
		rpc_val = new RpcValue(rpc_val)
	if(rpc_val && rpc_val instanceof RpcValue) {
		if(rpc_val.meta) {
			this.writeMeta(rpc_val.meta);
		}
		switch (rpc_val.type) {
		case RpcValue.Type.Null: this.ctx.putByte(ChainPack.CP_Null); break;
		case RpcValue.Type.Bool: this.ctx.putByte(rpc_val.value? ChainPack.CP_TRUE: ChainPack.CP_FALSE); break;
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
		default:
			// better to write null than create invalid chain-pack
			this.ctx.putByte(ChainPack.CP_Null);
			break;
		}
	}
}

//ChainPackWriter.MAX_BIT_LEN = Math.log(Number.MAX_SAFE_INTEGER) / Math.log(2);
// logcal operator in JS works on 32 bit only
ChainPackWriter.MAX_BIT_LEN = 32;
	/*
	 0 ...  7 bits  1  byte  |0|s|x|x|x|x|x|x|<-- LSB
	 8 ... 14 bits  2  bytes |1|0|s|x|x|x|x|x| |x|x|x|x|x|x|x|x|<-- LSB
	15 ... 21 bits  3  bytes |1|1|0|s|x|x|x|x| |x|x|x|x|x|x|x|x| |x|x|x|x|x|x|x|x|<-- LSB
	22 ... 28 bits  4  bytes |1|1|1|0|s|x|x|x| |x|x|x|x|x|x|x|x| |x|x|x|x|x|x|x|x| |x|x|x|x|x|x|x|x|<-- LSB
	29+       bits  5+ bytes |1|1|1|1|n|n|n|n| |s|x|x|x|x|x|x|x| |x|x|x|x|x|x|x|x| |x|x|x|x|x|x|x|x| ... <-- LSB
											n ==  0 ->  4 bytes number (32 bit number)
											n ==  1 ->  5 bytes number
											n == 14 -> 18 bytes number
											n == 15 -> for future (number of bytes will be specified in next byte)
	*/

	// return max bit length >= bit_len, which can be encoded by same number of bytes

// number of bytes needed to encode bit_len
ChainPackWriter.bytesNeeded = function(bit_len)
{
	let cnt;
	if(bit_len <= 28)
		cnt = ((bit_len - 1) / 7 | 0) + 1;
	else
		cnt = ((bit_len - 1) / 8 | 0) + 2;
	return cnt;
}

ChainPackWriter.expandBitLen = function(bit_len)
{
	let ret;
	let byte_cnt = ChainPackWriter.bytesNeeded(bit_len);
	if(bit_len <= 28) {
		ret = byte_cnt * (8 - 1) - 1;
	}
	else {
		ret = (byte_cnt - 1) * 8 - 1;
	}
	return ret;
}

ChainPackWriter.prototype.writeUIntDataHelper = function(bint)
{
	let bytes = bint.val;
	//let byte_cnt = bint.byteCount();

	let head = bytes[0];
	if(bytes.length < 5) {
		let mask = (0xf0 << (4 - bytes.length)) & 0xff;
		head = head & ~mask;
		mask <<= 1;
		mask &= 0xff;
		head = head | mask;
	}
	else {
		head = 0xf0 | (bytes.length - 5);
	}
	this.ctx.putByte(head);
	for (let i = 1; i < bytes.length; ++i) {
		let r = bytes[i];
		this.ctx.putByte(r);
	}
}

ChainPackWriter.prototype.writeUIntData = function(num)
{
	let bi = new BInt(num)
	let bitcnt = bi.significantBitsCount();
	bi.resize(ChainPackWriter.bytesNeeded(bitcnt));
	this.writeUIntDataHelper(bi);
}

ChainPackWriter.prototype.writeIntData = function(snum)
{
	let neg = (snum < 0);
	let num = neg? -snum: snum;
	let bi = new BInt(num)
	let bitcnt = bi.significantBitsCount() + 1;
	bi.resize(ChainPackWriter.bytesNeeded(bitcnt));
	if(neg) {
		if(bi.byteCount() < 5) {
			let sign_mask = 0x80 >> bi.byteCount();
			bi.val[0] |= sign_mask;
		}
		else {
			bi.val[1] |= 128;
		}
	}
	this.writeUIntDataHelper(bi);
}

ChainPackWriter.prototype.writeUInt = function(n)
{
	if(n < 64) {
		this.ctx.putByte(n % 64);
	}
	else {
		this.ctx.putByte(ChainPack.CP_UInt);
		this.writeUIntData(n);
	}
}

ChainPackWriter.prototype.writeInt = function(n)
{
	if(n >= 0 && n < 64) {
		this.ctx.putByte((n % 64) + 64);
	}
	else {
		this.ctx.putByte(ChainPack.CP_Int);
		this.writeIntData(n);
	}
}

ChainPackWriter.prototype.writeDecimal = function(val)
{
	this.ctx.putByte(ChainPack.CP_Decimal);
	this.writeIntData(val.mantisa);
	this.writeIntData(val.exponent);
}

ChainPackWriter.prototype.writeList = function(lst)
{
	this.ctx.putByte(ChainPack.CP_List);
	for(let i=0; i<lst.length; i++)
		this.write(lst[i])
	this.ctx.putByte(ChainPack.CP_TERM);
}

ChainPackWriter.prototype.writeMapData = function(map)
{
	for (let p in map) {
		if (map.hasOwnProperty(p)) {
			let c = p.charCodeAt(0);
			if(c >= 48 && c <= 57) {
				this.writeInt(parseInt(p))
			}
			else {
				this.writeJSString(p);
			}
			this.write(map[p]);
		}
	}
	this.ctx.putByte(ChainPack.CP_TERM);
}

ChainPackWriter.prototype.writeMap = function(map)
{
	this.ctx.putByte(ChainPack.CP_Map);
	this.writeMapData(map);
}

ChainPackWriter.prototype.writeIMap = function(map)
{
	this.ctx.putByte(ChainPack.CP_IMap);
	this.writeMapData(map);
}

ChainPackWriter.prototype.writeMeta = function(map)
{
	this.ctx.putByte(ChainPack.CP_MetaMap);
	this.writeMapData(map);
}

ChainPackWriter.prototype.writeBlob = function(blob)
{
	this.ctx.putByte(ChainPack.CP_Blob);
	let arr = new Uint8Array(blob)
	this.writeUIntData(arr.length)
	for (let i=0; i < arr.length; i++)
		this.ctx.putByte(arr[i])
}
/*
ChainPackWriter.prototype.writeUtf8String = function(str)
{
	this.ctx.putByte(ChainPack.CP_String);
	let arr = new Uint8Array(str)
	this.writeUIntData(arr.length)
	for (let i=0; i < arr.length; i++)
		this.ctx.putByte(arr[i])
}
*/
ChainPackWriter.prototype.writeJSString = function(str)
{
	this.ctx.putByte(ChainPack.CP_String);
	let pctx = new PackContext();
	pctx.writeStringUtf8(str);
	this.writeUIntData(pctx.length)
	for (let i=0; i < pctx.length; i++)
		this.ctx.putByte(pctx.data[i])
}

ChainPackWriter.prototype.writeDateTime = function(dt)
{
	if(!dt || typeof(dt) !== "object" || dt.utcOffsetMin == ChainPack.INVALID_MIN_OFFSET_FROM_UTC) {
		// invalid datetime
		dt = {epochMsec: ChainPack.SHV_EPOCH_MSEC, utcOffsetMin: ChainPack.INVALID_MIN_OFFSET_FROM_UTC}
	}

	this.ctx.putByte(ChainPack.CP_DateTime);

	let msecs = dt.epochMsec;
	msecs = msecs - ChainPack.SHV_EPOCH_MSEC;
	if(msecs < 0)
		throw new RangeError("DateTime prior to 2018-02-02 are not supported in current ChainPack implementation.");

	let offset = (dt.utcOffsetMin / 15) & 0x7F;

	let ms = msecs % 1000;
	if(ms == 0)
		msecs /= 1000;
	let bi = new BInt(msecs);
	if(offset != 0) {
		bi.leftShift(7);
		bi.val[bi.val.length - 1] |= offset;
	}
	bi.leftShift(2);
	if(offset != 0)
		bi.val[bi.val.length - 1] |= 1;
	if(ms == 0)
		bi.val[bi.val.length - 1] |= 2;

	// save as signed int
	let bitcnt = bi.significantBitsCount() + 1;
	bi.resize(ChainPackWriter.bytesNeeded(bitcnt));
	this.writeUIntDataHelper(bi);
}
