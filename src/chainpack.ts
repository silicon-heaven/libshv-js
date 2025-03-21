/* eslint-disable no-bitwise */
import {utf8ToString} from './cpon';
import {type RpcValue, type RpcValueType, type DateTime, Decimal, Double, type IMap, type Int, type MetaMap, RpcValueWithMetaData, type ShvMap, UInt, withOffset, shvMapType} from './rpcvalue';
import {UnpackContext, PackContext} from './cpcontext';

enum PackingSchema {
    IntThreshold = 64,
    Null = 128,
    UInt = 129,
    Int = 130,
    Double = 131,
    Bool = 132,
    Blob = 133,
    String = 134,
    List = 136,
    Map = 137,
    IMap = 138,
    MetaMap = 139,
    Decimal = 140,
    DateTime = 141,
    CString = 142,
    False = 253,
    True = 254,
    Term = 255,
}

const SHV_EPOCH_MSEC = 1_517_529_600_000;
const INVALID_MIN_OFFSET_FROM_UTC = (-64 * 15);

const divInt = (n: bigint, d: bigint) => {
    const r = n % d;
    return [(n - r) / d, r] as const;
};

const uint8ArrayBoBigint = (bytes: Uint8Array, type: 'Int' | 'UInt') => {
    let isNeg = false;

    if (type === 'Int') {
        if (bytes.length < 5) {
            const signMask = 0x80 >> bytes.length;
            isNeg = Boolean(bytes[0] & signMask);
            bytes[0] &= ~signMask;
        } else {
            isNeg = Boolean(bytes[1] & 128);
            bytes[1] &= ~128;
        }
    }

    let ret = 0n;
    for (const byte of bytes) {
        ret = (ret * BigInt(256)) + BigInt(byte);
    }

    if (isNeg) {
        ret = -ret;
    }

    return ret;
};

const numberToUint8Array = (num: bigint) => {
    let bytes = new Uint8Array(8);
    let len = 0;
    do {
        const res = divInt(num, 256n);
        num = res[0];
        bytes[len++] = Number(res[1]);
    } while (num !== 0n);

    bytes = bytes.subarray(0, len);
    bytes.reverse();
    return bytes;
};

const significantBitsCount = (num: bigint) => {
    let ret = 0;
    while (num > 0) {
        ret++;
        num >>= 1n;
    }

    return ret;
};

class ChainPackReader {
    ctx: UnpackContext;

    constructor(data: ArrayBuffer | UnpackContext) {
        this.ctx = data instanceof UnpackContext ? data : new UnpackContext(data);
    }

    /* eslint-disable complexity */
    read(): RpcValue {
        let meta: MetaMap | undefined;
        let codePointAt = this.ctx.getByte() as PackingSchema;

        if (codePointAt === PackingSchema.MetaMap) {
            meta = this.readMetaMap();
            codePointAt = this.ctx.getByte();
        }

        const implReturn = (x: RpcValueType) => {
            const ret = meta !== undefined ? new RpcValueWithMetaData(meta, x) : x;
            return ret;
        };

        if (codePointAt < PackingSchema.Null) {
            if (codePointAt >= PackingSchema.IntThreshold) {
                return implReturn(codePointAt - 64);
            }

            return implReturn(new UInt(codePointAt));
        }

        switch (codePointAt) {
            case PackingSchema.Null: {
                return implReturn(undefined);
            }

            case PackingSchema.True: {
                return implReturn(true);
            }

            case PackingSchema.False: {
                return implReturn(false);
            }

            case PackingSchema.Int: {
                return implReturn(this.readIntData());
            }

            case PackingSchema.UInt: {
                return implReturn(new UInt(this.readUIntData()));
            }

            case PackingSchema.Double: {
                const data = new Uint8Array(8);
                for (let i = 0; i < 8; i++) {
                    data[i] = this.ctx.getByte();
                }

                return implReturn(new Double(new DataView(data.buffer).getFloat64(0, true))); // little endian
            }

            case PackingSchema.Decimal: {
                const mant = this.readIntData();
                const exp = this.readIntData();
                return implReturn(new Decimal(mant, exp));
            }

            case PackingSchema.DateTime: {
                let bi = this.readUIntDataHelper('UInt');
                const hasTzOffset = bi & 1n;
                const hasNotMsec = bi & 2n;
                bi >>= 2n;

                let offset = 0;
                if (hasTzOffset) {
                    offset = Number(bi & 0x7Fn);
                    if (offset & 0x40) {
                        // sign extension
                        offset -= 128;
                    }

                    bi >>= 7n;
                }

                offset *= 15;

                if (offset === INVALID_MIN_OFFSET_FROM_UTC) {
                    return implReturn(undefined);
                }

                let msec = Number(bi);
                if (hasNotMsec) {
                    msec *= 1000;
                }

                msec += SHV_EPOCH_MSEC;
                msec -= offset * 60_000;
                return withOffset(new Date(msec), offset ?? undefined);
            }

            case PackingSchema.Map: {
                return implReturn(this.readMap());
            }

            case PackingSchema.IMap: {
                return implReturn(this.readIMap());
            }

            case PackingSchema.List: {
                return implReturn(this.readList());
            }

            case PackingSchema.Blob: {
                const strLen = this.readUIntData();
                const arr = new Uint8Array(strLen);
                for (let i = 0; i < strLen; i++) {
                    arr[i] = this.ctx.getByte();
                }

                return implReturn(arr.buffer);
            }

            case PackingSchema.String: {
                const strLen = this.readUIntData();
                const arr = new Uint8Array(strLen);
                for (let i = 0; i < strLen; i++) {
                    arr[i] = this.ctx.getByte();
                }

                return implReturn(utf8ToString(arr.buffer));
            }

            case PackingSchema.CString: {
                // variation of CponReader.readCString()
                const pctx = new PackContext();
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    let b = this.ctx.getByte();
                    if (b === '\\'.codePointAt(0)) {
                        b = this.ctx.getByte();
                        switch (b) {
                            case '\\'.codePointAt(0):
                                pctx.putByte('\\'.codePointAt(0)!);
                                break;
                            case '0'.codePointAt(0):
                                pctx.putByte(0);
                                break;
                            default:
                                pctx.putByte(b);
                                break;
                        }
                    } else if (b === 0) {
                        // end of string
                        break;
                    } else {
                        pctx.putByte(b);
                    }
                }

                return implReturn(utf8ToString(pctx.buffer()));
            }

            default:
                throw new TypeError('ChainPack - Invalid type info: ' + codePointAt);
        }
    }
    /* eslint-enable complexity */

    readUIntDataHelper(type: 'Int' | 'UInt') {
        let num = 0;
        const head = this.ctx.getByte();
        let bytesToReadCnt;
        switch (0) {
            case head & 128: {
                bytesToReadCnt = 0;
                num = head & 127;
                break;
            }

            case head & 64: {
                bytesToReadCnt = 1;
                num = head & 63;
                break;
            }

            case head & 32: {
                bytesToReadCnt = 2;
                num = head & 31;
                break;
            }

            case head & 16: {
                bytesToReadCnt = 3;
                num = head & 15;
                break;
            }

            default: {
                bytesToReadCnt = (head & 0xF) + 4;
            }
        }

        const bytes = new Uint8Array(bytesToReadCnt + 1);
        bytes[0] = num;
        for (let i = 0; i < bytesToReadCnt; i++) {
            const r = this.ctx.getByte();
            bytes[i + 1] = r;
        }

        return uint8ArrayBoBigint(bytes, type);
    }

    readIntData() {
        const val = this.readUIntDataHelper('Int');
        if (val <= Number.MIN_SAFE_INTEGER) {
            return Number.MIN_SAFE_INTEGER;
        }

        if (val >= Number.MAX_SAFE_INTEGER) {
            return Number.MAX_SAFE_INTEGER;
        }

        return Number(val);
    }

    readUIntData() {
        const val = this.readUIntDataHelper('UInt');
        if (val >= Number.MAX_SAFE_INTEGER) {
            return Number.MAX_SAFE_INTEGER;
        }

        return Number(val);
    }

    readList() {
        const lst = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const b = this.ctx.peekByte();
            if (b as PackingSchema === PackingSchema.Term) {
                this.ctx.getByte();
                break;
            }

            lst.push(this.read());
        }

        return lst;
    }

    readMetaMap() {
        return this.implReadMap('metamap');
    }

    readMap() {
        return this.implReadMap('map');
    }

    readIMap() {
        return this.implReadMap('imap');
    }

    private implReadMap(map_type: 'map'): ShvMap;
    private implReadMap(map_type: 'imap'): IMap;
    private implReadMap(map_type: 'metamap'): MetaMap;
    private implReadMap(map_type: 'map' | 'imap' | 'metamap') {
        const map: ShvMap | IMap | MetaMap = {
            [shvMapType]: map_type,
        };
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const b = this.ctx.peekByte();
            if (b as PackingSchema === PackingSchema.Term) {
                this.ctx.getByte();
                break;
            }

            const key = this.read();
            const val = this.read();
            if (map[shvMapType] === 'metamap' && typeof key === 'string') {
                map[key] = val;
            } else if (map[shvMapType] === 'metamap' && typeof key === 'number') {
                map[Number(key)] = val;
            } else if (map[shvMapType] === 'map' && typeof key === 'string') {
                map[key] = val;
            } else if (map[shvMapType] === 'imap' && typeof key === 'number') {
                map[Number(key)] = val;
            } else {
                throw new TypeError('Malformed map, invalid key');
            }
        }

        return map;
    }
}

class ChainPackWriter {
    ctx: PackContext;

    constructor() {
        this.ctx = new PackContext();
    }

    write(rpc_val: RpcValue) {
        if (rpc_val instanceof RpcValueWithMetaData) {
            this.writeMeta(rpc_val.meta);
            rpc_val = rpc_val.value;
        }

        switch (true) {
            case rpc_val === undefined:
                this.ctx.putByte(PackingSchema.Null);
                break;
            case typeof rpc_val === 'boolean':
                this.ctx.putByte(rpc_val ? PackingSchema.True : PackingSchema.False);
                break;
            case typeof rpc_val === 'string':
                this.writeJSString(rpc_val);
                break;
            case rpc_val instanceof ArrayBuffer:
                this.writeBlob(rpc_val);
                break;
            case rpc_val instanceof UInt:
                this.writeUInt(rpc_val);
                break;
            case typeof rpc_val === 'number':
                this.writeInt(rpc_val);
                break;
            case rpc_val instanceof Decimal:
                this.writeDecimal(rpc_val);
                break;
            case Array.isArray(rpc_val):
                this.writeList(rpc_val);
                break;
            case rpc_val instanceof Date:
                this.writeDateTime(rpc_val);
                break;
            case rpc_val instanceof Double:
                throw new Error('writing doubles not implemented');
            case typeof rpc_val === 'object':
                switch (rpc_val[shvMapType]) {
                    case 'imap':
                        this.writeIMap(rpc_val);
                        break;
                    case 'map':
                        this.writeMap(rpc_val);
                        break;
                }

                break;
            default:
                console.log('Can\'t serialize', rpc_val);
                throw new Error('Can\'t serialize');
        }
    }

    writeUIntDataHelper(num: bigint, type: 'Int' | 'UInt') {
        const isNegative = num < 0;
        if (isNegative) {
            num = -num;
        }

        const significantBits = significantBitsCount(num) + (/* one more needed for sign bit */ type === 'Int' ? 1 : 0);
        const bytesNeeded = significantBits <= 28 ? Math.trunc((significantBits - 1) / 7) + 1 : Math.trunc((significantBits - 1) / 8) + 2;

        switch (bytesNeeded) {
            case 0:
                throw new Error(`Failed to count bytes needed for ${num}`);
            case 1:
                if (isNegative) {
                    num |= 0b0100_0000n;
                }

                break;
            case 2:
                num |= 0b1000_0000n << 8n;
                if (isNegative) {
                    num |= 0b0010_0000n << 8n;
                }

                break;
            case 3:
                num |= 0b1100_0000n << 16n;
                if (isNegative) {
                    num |= 0b0001_0000n << 16n;
                }

                break;
            case 4:
                num |= 0b1110_0000n << 24n;
                if (isNegative) {
                    num |= 0b0000_1000n << 24n;
                }

                break;
            default:
                num |= 0b1111_0000n << BigInt((bytesNeeded - 1) * 8);
                num |= BigInt(bytesNeeded - 4 /* n is offset by 4 */ - 1 /* for the control byte */) << BigInt((bytesNeeded - 1) * 8);
                if (isNegative) {
                    num |= 0b1000_0000n << BigInt((bytesNeeded - 2) * 8);
                }

                break;
        }

        const bytes = numberToUint8Array(num);
        for (const byte of bytes) {
            this.ctx.putByte(byte);
        }
    }

    writeUIntData(num: number) {
        this.writeUIntDataHelper(BigInt(num), 'UInt');
    }

    writeIntData(snum: number) {
        this.writeUIntDataHelper(BigInt(snum), 'Int');
    }

    writeInt(n: Int) {
        if (Number(n) >= 0 && Number(n) < 64) {
            this.ctx.putByte(Number(n) + 64);
            return;
        }

        this.ctx.putByte(PackingSchema.Int);
        this.writeIntData(Number(n));
    }

    writeUInt(n: UInt) {
        if (Number(n) < 64) {
            this.ctx.putByte(Number(n));
            return;
        }

        this.ctx.putByte(PackingSchema.UInt);
        this.writeUIntData(Number(n));
    }

    writeJSString(str: string) {
        this.ctx.putByte(PackingSchema.String);
        const pctx = new PackContext();
        pctx.writeStringUtf8(str);
        this.writeUIntData(pctx.length);
        for (let i = 0; i < pctx.length; i++) {
            this.ctx.putByte(pctx.data[i]);
        }
    }

    writeDecimal(val: Decimal) {
        this.ctx.putByte(PackingSchema.Decimal);
        this.writeIntData(val.mantisa);
        this.writeIntData(val.exponent);
    }

    writeBlob(blob: ArrayBuffer) {
        this.ctx.putByte(PackingSchema.Blob);
        const arr = new Uint8Array(blob);
        this.writeUIntData(arr.length);
        for (const element of arr) {
            this.ctx.putByte(element);
        }
    }

    writeDateTime(dt: DateTime) {
        this.ctx.putByte(PackingSchema.DateTime);

        let msecs = (dt.getTime() + (60_000 * (dt.utc_offset ?? 0))) - SHV_EPOCH_MSEC;
        if (msecs < 0) {
            throw new RangeError('DateTime prior to 2018-02-02 are not supported in current ChainPack implementation.');
        }

        const ms = msecs % 1000;
        if (ms === 0) {
            msecs /= 1000;
        }

        let bi = BigInt(msecs);
        if (dt.utc_offset !== undefined && dt.utc_offset !== 0) {
            bi <<= 7n;
            bi |= BigInt((dt.utc_offset / 15) & 0x7F);
        }

        bi <<= 2n;

        if (dt.utc_offset !== undefined && dt.utc_offset !== 0) {
            bi |= 1n;
        }

        if (ms === 0) {
            bi |= 2n;
        }

        // save as signed int
        this.writeUIntDataHelper(bi, 'UInt');
    }

    writeList(lst: RpcValue[]) {
        this.ctx.putByte(PackingSchema.List);
        for (const element of lst) {
            this.write(element);
        }

        this.ctx.putByte(PackingSchema.Term);
    }

    writeMeta(map: MetaMap) {
        this.ctx.putByte(PackingSchema.MetaMap);
        this.writeMapContent(map);
    }

    writeIMap(map: IMap) {
        this.ctx.putByte(PackingSchema.IMap);
        this.writeMapContent(map);
    }

    writeMap(map: ShvMap) {
        this.ctx.putByte(PackingSchema.Map);
        this.writeMapContent(map);
    }

    writeMapContent(map: MetaMap | ShvMap | IMap) {
        for (const [key, value] of Object.entries<RpcValue>(map)) {
            if (value === undefined) {
                continue;
            }

            if (map[shvMapType] === 'imap') {
                const intKey = Number(key);
                if (Number.isNaN(intKey)) {
                    throw new TypeError('Invalid NaN IMap key');
                }

                this.writeInt(intKey);
            } else if (map[shvMapType] === 'metamap') {
                const intKey = Number(key);
                if (Number.isNaN(intKey)) {
                    this.writeJSString(key.toString());
                } else {
                    this.writeInt(intKey);
                }
            } else {
                this.writeJSString(key.toString());
            }

            this.write(value);
        }

        this.ctx.putByte(PackingSchema.Term);
    }
}

const toChainPack = (value: RpcValue) => {
    const wr = new ChainPackWriter();
    wr.write(value);
    return wr.ctx.buffer();
};

const fromChainPack = (buffer: ArrayBuffer) => {
    const reader = new ChainPackReader(buffer);
    return reader.read();
};

const CHAINPACK_PROTOCOL_TYPE = 1;

export {toChainPack, fromChainPack, ChainPackReader, ChainPackWriter, CHAINPACK_PROTOCOL_TYPE};
