"use strict"

function UnpackContext(uint8_array)
{
	if(uint8_array instanceof ArrayBuffer)
		uint8_array = new Uint8Array(uint8_array)
	else if(!(uint8_array instanceof Uint8Array))
		throw new TypeError("UnpackContext must be constructed with Uint8Array")
	this.data = uint8_array
	this.index = 0;
}

UnpackContext.prototype.getByte = function()
{
	if(this.index >= this.data.length)
		throw new RangeError("unexpected end of data")
	return this.data[this.index++]
}

UnpackContext.prototype.peekByte = function()
{
	if(this.index >= this.data.length)
		return -1
	return this.data[this.index]
}

UnpackContext.prototype.getBytes = function(str)
{
	for (var i = 0; i < str.length; i++) {
		if(str.charCodeAt(i) != this.getByte())
			throw new TypeError("'" + str + "'' expected");
	}
}

function PackContext()
{
	//this.buffer = new ArrayBuffer(PackContext.CHUNK_LEN)
	this.data = new Uint8Array(0)
	this.length = 0;
}

PackContext.CHUNK_LEN = 1024;

PackContext.transfer = function(source, length)
{
	if (!(source instanceof ArrayBuffer))
		throw new TypeError('Source must be an instance of ArrayBuffer');
	if (length <= source.byteLength)
		return source.slice(0, length);
	let source_view = new Uint8Array(source)
	let dest_view = new Uint8Array(new ArrayBuffer(length));
	dest_view.set(source_view);
	return dest_view.buffer;
}

PackContext.prototype.putByte = function(b)
{
	if(this.length >= this.data.length) {
		let buffer = PackContext.transfer(this.data.buffer, this.data.length + PackContext.CHUNK_LEN)
		this.data = new Uint8Array(buffer);
	}
	this.data[this.length++] = b;
}

PackContext.prototype.writeStringUtf8 = function(str)
{
	for (let i=0; i < str.length; i++) {
		let charcode = str.charCodeAt(i);
		this.writeCharCodeUtf8(charcode);
	}
}

PackContext.prototype.writeCharCodeUtf8 = function(charcode)
{
	if (charcode < 0x80)
		this.putByte(charcode);
	else if (charcode < 0x800) {
		this.putByte(0xc0 | (charcode >> 6));
		this.putByte(0x80 | (charcode & 0x3f));
	}
	else if (charcode < 0xd800 || charcode >= 0xe000) {
		this.putByte(0xe0 | (charcode >> 12));
		this.putByte(0x80 | ((charcode>>6) & 0x3f));
		this.putByte(0x80 | (charcode & 0x3f));
	}
	// surrogate pair
	else {
		i++;
		charcode = ((charcode&0x3ff)<<10)|(str.charCodeAt(i)&0x3ff)
		this.putByte(0xf0 | (charcode >>18));
		this.putByte(0x80 | ((charcode>>12) & 0x3f));
		this.putByte(0x80 | ((charcode>>6) & 0x3f));
		this.putByte(0x80 | (charcode & 0x3f));
	}
}
/*
PackContext.prototype.bytes = function()
{
	return this.data.subarray(0, this.length)
}
*/
PackContext.prototype.buffer = function()
{
	return this.data.buffer.slice(0, this.length)
}

export {PackContext, UnpackContext};
