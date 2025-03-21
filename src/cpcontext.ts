class UnpackContext {
    index: number;
    private readonly data: Uint8Array;

    constructor(buf: ArrayBufferLike) {
        this.data = new Uint8Array(buf);
        this.index = 0;
    }

    getByte() {
        if (this.index >= this.data.length) {
            throw new RangeError('unexpected end of data');
        }

        return this.data[this.index++];
    }

    peekByte() {
        if (this.index >= this.data.length) {
            return -1;
        }

        return this.data[this.index];
    }

    getBytes(str: string) {
        for (let i = 0; i < str.length; i++) {
            if (str.codePointAt(i) !== this.getByte()) {
                throw new TypeError(`'${str}' expected`);
            }
        }
    }
}

const transfer = (source: ArrayBuffer, length: number) => {
    if (length <= source.byteLength) {
        return source.slice(0, length);
    }

    const sourceView = new Uint8Array(source);
    const destView = new Uint8Array(new ArrayBuffer(length));
    destView.set(sourceView);
    return destView.buffer;
};

class PackContext {
    static CHUNK_LEN = 1024;
    data = new Uint8Array(0);
    length = 0;

    putByte(b: number) {
        if (this.length >= this.data.length) {
            const buffer = transfer(this.data.buffer, this.data.length + PackContext.CHUNK_LEN);
            this.data = new Uint8Array(buffer);
        }

        this.data[this.length++] = b;
    }

    writeStringUtf8(str: string) {
        for (let i = 0; i < str.length; i++) {
            const charcode = str.codePointAt(i)!;
            this.writeCharCodeUtf8(charcode);
        }
    }

    writeCharCodeUtf8(charcode: number) {
        /* eslint-disable no-bitwise */
        if (charcode < 0x80) {
            this.putByte(charcode);
        } else if (charcode < 0x8_00) {
            this.putByte(0xC0 | (charcode >> 6));
            this.putByte(0x80 | (charcode & 0x3F));
        } else if (charcode < 0xD8_00 || charcode >= 0xE0_00) {
            this.putByte(0xE0 | (charcode >> 12));
            this.putByte(0x80 | ((charcode >> 6) & 0x3F));
            this.putByte(0x80 | (charcode & 0x3F));
        }
        /* eslint-enable no-bitwise */
    }

    buffer() {
        return this.data.buffer.slice(0, this.length);
    }
}

export {PackContext, UnpackContext};
