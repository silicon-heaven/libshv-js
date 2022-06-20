/* eslint-disable */
"use strict"

import { CponWriter, Cpon, CponReader } from './cpon'
import { ChainPackWriter } from './chainpack'
import { UnpackContext } from './cpcontext'

export function RpcValue(value, meta, type)
{
	if(value)
		this.value = value;
	if(meta)
		this.meta = meta;
	if(type) {
		this.type = type;
	}
	else {
		if(typeof value == "null")
			this.type = RpcValue.Type.Null;
		else if(typeof value == "boolean")
			this.type = RpcValue.Type.Bool;
		else if(typeof value == "string") {
			this.type = RpcValue.Type.String;
		}
		else if(value instanceof String) {
			this.type = RpcValue.Type.String;
		}
		else if(value instanceof ArrayBuffer) {
			this.type = RpcValue.Type.Blob;
		}
		else if(Array.isArray(value))
			this.type = RpcValue.Type.List;
		else if(typeof value == "Object") {
			if(value instanceof Date) {
				this.value = {epochMsec: value.valueOf(), utcOffsetMin: -value.getTimezoneOffset()}
				this.type = RpcValue.Type.DateTime;
			}
			else {
				this.type = RpcValue.Type.Map;
			}
		}
		else if(Number.isInteger(value))
			this.type = RpcValue.Type.Int;
		else if(Number.isFinite(value))
			this.type = RpcValue.Type.Double;
	}
}

RpcValue.Type = Object.freeze({
	"Null": 1,
	"Bool": 2,
	"Int": 3,
	"UInt": 4,
	"Double": 5,
	"Decimal": 6,
	"String": 7,
	"DateTime": 8,
	"List": 9,
	"Map": 10,
	"IMap": 11,
	"Blob": 12,
})

RpcValue.fromCpon = function(cpon)
{
	let unpack_context = null;
	if(typeof cpon === 'string' || cpon instanceof String) {
		unpack_context = new UnpackContext(Cpon.stringToUtf8(cpon));
	}
	else if(cpon instanceof ArrayBuffer) {
		unpack_context = new UnpackContext(cpon);
	}
	if(unpack_context === null)
		throw new TypeError("Invalid input data type")
	let rd = new CponReader(unpack_context);
	return rd.read();
}

RpcValue.fromChainPack = function(data)
{
	let unpack_context = new UnpackContext(data);
	let rd = new ChainPackReader(unpack_context);
	return rd.read();
}

RpcValue.prototype.toInt = function()
{
	switch(this.type) {
		case RpcValue.Type.Int:
		case RpcValue.Type.UInt:
			return this.value;
		case RpcValue.Type.Decimal:
			return this.value.mantisa * (10 ** this.value.exponent);
		case RpcValue.Type.Double:
			return (this.value >> 0);
	}
	return 0;
}

RpcValue.prototype.asString = function()
{
	switch (this.type) {
	case RpcValue.Type.Null:
	case RpcValue.Type.UInt:
	case RpcValue.Type.Int:
	case RpcValue.Type.Double:
	case RpcValue.Type.Decimal:
	case RpcValue.Type.List:
	case RpcValue.Type.Map:
	case RpcValue.Type.IMap:
	case RpcValue.Type.DateTime:
	case RpcValue.Type.Bool:
	case RpcValue.Type.Blob:
		break;
	case RpcValue.Type.String: return this.value;
	}
	return "";
}

RpcValue.prototype.toString = function()
{
	switch (this.type) {
	case RpcValue.Type.Null:
	case RpcValue.Type.UInt:
	case RpcValue.Type.Int:
	case RpcValue.Type.Double:
	case RpcValue.Type.Decimal:
	case RpcValue.Type.List:
	case RpcValue.Type.Map:
	case RpcValue.Type.IMap:
	case RpcValue.Type.DateTime:
	case RpcValue.Type.Bool:
		let ba = this.toCpon();
		return Cpon.utf8ToString(ba);
	case RpcValue.Type.Blob:
			return Cpon.utf8ToString(this.value);
	case RpcValue.Type.String:
			return this.value;
	}
	return "";
}

RpcValue.prototype.toCpon = function()
{
	let wr = new CponWriter();
	wr.write(this);
	return wr.ctx.buffer();
}

RpcValue.prototype.toCponAsString = function()
{
  return Cpon.utf8ToString(this.toCpon());
}

RpcValue.prototype.toChainPack = function()
{
	let wr = new ChainPackWriter();
	wr.write(this);
	return wr.ctx.buffer();
}

RpcValue.prototype.isValid = function()
{
	return this.value && this.type;
}
