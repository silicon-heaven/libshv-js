"use strict"

function BInt(n)
{
	if(Number.isInteger(n)) {
		this.val = BInt.parseInt(n);
	}
	else if(n instanceof Uint8Array) {
		this.val = n;
	}
	else {
		throw TypeError(n + " is not convertible to BInt");
	}
}

BInt.divInt = function(n, d)
{
	let r = n % d;
	if(!Number.isInteger(r))
		throw new RangeError("Number too big for current implementation of DIV function: " + n + " DIV " + d)
	return [(n - r) / d, r];
}

BInt.parseInt = function(num)
{
	let bytes = new Uint8Array(8);
	let len = 0;
	while(true) {
		[num, bytes[len++]] = BInt.divInt(num, 256)
		if(num == 0)
			break;
	}
	bytes = bytes.subarray(0, len)
	bytes.reverse();
	return bytes
}

BInt.prototype.byteCount = function()
{
	if(this.val)
		return this.val.length;
	return 0;
}

BInt.prototype.resize = function(byte_cnt)
{
	if(!(this.val instanceof Uint8Array))
		throw TypeError(this.val + " cannot be resized");
	if(byte_cnt < this.val.length) {
		this.val = this.val.subarray(this.val.length - byte_cnt)
	}
	else if(byte_cnt > this.val.length) {
		let nbytes = new Uint8Array(byte_cnt)
		nbytes.set(this.val, byte_cnt - this.val.length)
		this.val = nbytes
	}
}

BInt.prototype.resizeSigned = function(byte_cnt)
{
	let old_len = this.val.length;
	this.resize(byte_cnt);
	if(byte_cnt > old_len) {
		if(this.val[byte_cnt - old_len] & 128) {
			// extend sign
			for(let i = 0; i < byte_cnt - old_len; i++)
				this.val[i] = 0xff;
		}
	}
}

BInt.prototype.significantBitsCount = function()
{
	let n = this.val[0];
	const mask = 128;
	let len = 8;
	for (; n && !(n & mask); --len) {
		n <<= 1;
	}
	let cnt = n? len: 0;
	cnt += 8 * (this.val.length - 1)
	return cnt;
}

BInt.prototype.leftShift = function(cnt)
{
	let nbytes = new Uint8Array(this.val.length)
	nbytes.set(this.val)
	let is_neg = nbytes[0] & 128;

	for(let j=0; j<cnt; j++) {
		let cy = 0;
		for(let i=nbytes.length - 1; i >= 0; i--) {
			let cy1 = nbytes[i] & 128;
			nbytes[i] <<= 1;
			if(cy)
				nbytes[i] |= 1
			cy = cy1
		}
		if(cy) {
			// prepend byte
			let nbytes2 = new Uint8Array(nbytes.length + 1)
			nbytes2.set(nbytes, 1);
			nbytes = nbytes2
			nbytes[0] = 1
		}
	}
	if(is_neg) for(let i=0; i<cnt; i++) {
		let mask = 128;
		for(let j = 0; j < 8; j++) {
			if(nbytes[i] & mask) {
				this.val = nbytes;
				return;
			}
			nbytes[i] |= mask;
			mask >>= 1;
		}
	}
	this.val = nbytes;
}

BInt.prototype.signedRightShift = function(cnt)
{
	let bytes = this.val;
	for(let j=0; j<cnt; j++) {
		let cy = 0;
		for(let i=0; i < bytes.length; i++) {
			let cy1 = bytes[i] & 1;
			if(i == 0) {
				bytes[i] >>>= 1;
			}
			else {
				bytes[i] >>= 1;
				if(cy)
					bytes[i] |= 128
			}
			cy = cy1
		}
	}
}

BInt.prototype.toNumber = function()
{
	let num = 0;
	for (let i=0; i < this.val.length; i++) {
		num = (num * 256) + this.val[i];
	}
	return num;
}
