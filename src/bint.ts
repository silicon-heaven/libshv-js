const div_int = (n: number, d: number) => {
    const r = n % d;
    if (!Number.isInteger(r)) {
        throw new RangeError(`Number too big for current implementation of DIV function: ${n} DIV ${d}`);
    }

    return [(n - r) / d, r];
};

const number_to_uint8_array = (num: number) => {
    let bytes = new Uint8Array(8);
    let len = 0;
    while (true) {
        [num, bytes[len++]] = div_int(num, 256);
        if (num === 0) {
            break;
        }
    }

    bytes = bytes.subarray(0, len);
    bytes.reverse();
    return bytes;
};

class BInt {
    val: Uint8Array;

    constructor(num: number | Uint8Array) {
        if (num instanceof Uint8Array) {
            this.val = num;
            return;
        }

        this.val = number_to_uint8_array(num);
    }

    byteCount() {
        return this.val.length;
    }

    resize(byte_cnt: number) {
        if (byte_cnt < this.val.length) {
            this.val = this.val.subarray(this.val.length - byte_cnt);
            return;
        }

        if (byte_cnt > this.val.length) {
            const nbytes = new Uint8Array(byte_cnt);
            nbytes.set(this.val, byte_cnt - this.val.length);
            this.val = nbytes;
        }
    }

    resizeSigned(byte_cnt: number) {
        const old_len = this.val.length;
        this.resize(byte_cnt);
        if (byte_cnt > old_len && this.val[byte_cnt - old_len] & 128) {
            // Extend sign
            for (let i = 0; i < byte_cnt - old_len; i++) {
                this.val[i] = 0xFF;
            }
        }
    }

    significantBitsCount() {
        let n = this.val[0];
        const mask = 128;
        let len = 8;
        for (; n && !(n & mask); --len) {
            n <<= 1;
        }

        let cnt = n ? len : 0;
        cnt += 8 * (this.val.length - 1);
        return cnt;
    }

    leftShift(count: number) {
        let nbytes = new Uint8Array(this.val.length);
        nbytes.set(this.val);
        const is_neg = nbytes[0] & 128;

        for (let j = 0; j < count; j++) {
            let cy = 0;
            for (let i = nbytes.length - 1; i >= 0; i--) {
                const cy1 = nbytes[i] & 128;
                nbytes[i] <<= 1;
                if (cy) {
                    nbytes[i] |= 1;
                }

                cy = cy1;
            }

            if (cy) {
                // Prepend byte
                const nbytes2 = new Uint8Array(nbytes.length + 1);
                nbytes2.set(nbytes, 1);
                nbytes = nbytes2;
                nbytes[0] = 1;
            }
        }

        if (is_neg) {
            for (let i = 0; i < count; i++) {
                let mask = 128;
                for (let j = 0; j < 8; j++) {
                    if (nbytes[i] & mask) {
                        this.val = nbytes;
                        return;
                    }

                    nbytes[i] |= mask;
                    mask >>= 1;
                }
            }
        }

        this.val = nbytes;
    }

    signedRightShift(count: number) {
        const bytes = this.val;
        for (let j = 0; j < count; j++) {
            let cy = 0;
            for (let i = 0; i < bytes.length; i++) {
                const cy1 = bytes[i] & 1;
                if (i === 0) {
                    bytes[i] >>>= 1;
                } else {
                    bytes[i] >>= 1;
                    if (cy) {
                        bytes[i] |= 128;
                    }
                }

                cy = cy1;
            }
        }
    }

    toNumber() {
        let num = 0;
        for (const byte of this.val) {
            num = (num * 256) + byte;
        }

        return num;
    }
}

export default BInt;
