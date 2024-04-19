import BInt from './bint.ts';
import {utf8ToString} from './cpon.ts';
import {type RpcValue, type RpcValueType, Decimal, Double, IMap, Int, MetaMap, RpcValueWithMetaData, ShvMap, UInt} from './rpcvalue.ts';
import {UnpackContext, PackContext} from './cpcontext.ts';

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

// number of bytes needed to encode bit_len
const bytesNeeded = (bit_len: number) => bit_len <= 28 ? Math.trunc((bit_len - 1) / 7) + 1 : Math.trunc((bit_len - 1) / 8) + 2;

class ChainPackReader {
    ctx: UnpackContext;

    constructor(data: ArrayBuffer | Uint8Array | UnpackContext) {
        this.ctx = data instanceof UnpackContext ? data : new UnpackContext(data);
    }

    read(): RpcValue {
        let meta: MetaMap | undefined;
        let codePointAt = this.ctx.getByte() as PackingSchema;

        if (codePointAt === PackingSchema.MetaMap) {
            meta = this.readMetaMap();
            codePointAt = this.ctx.getByte();
        }

        const impl_return = (x: RpcValueType) => {
            const ret = meta !== undefined ? new RpcValueWithMetaData(x, meta) : x;
            return ret;
        };

        if (codePointAt < PackingSchema.Null) {
            if (codePointAt >= PackingSchema.IntThreshold) {
                return impl_return(new Int(codePointAt - 64));
            }
            return impl_return(new UInt(codePointAt));
        }
        switch (codePointAt) {
            case PackingSchema.Null: {
                return impl_return(undefined);
            }
            case PackingSchema.True: {
                return impl_return(true);
            }
            case PackingSchema.False: {
                return impl_return(false);
            }
            case PackingSchema.Int: {
                return impl_return(new Int(this.readIntData()));
            }
            case PackingSchema.UInt: {
                return impl_return(new UInt(this.readUIntData()));
            }
            case PackingSchema.Double: {
                const data = new Uint8Array(8);
                for (let i = 0; i < 8; i++) {
                    data[i] = this.ctx.getByte();
                }
                return impl_return(new Double(new DataView(data.buffer).getFloat64(0, true))); // little endian
            }
            case PackingSchema.Decimal: {
                const mant = this.readIntData();
                const exp = this.readIntData();
                return impl_return(new Decimal(mant, exp));
            }
            case PackingSchema.DateTime: {
                const bi = this.readUIntDataHelper();
                let lsb = bi.val.at(-1)!;
                const has_tz_offset = lsb & 1;
                const has_not_msec = lsb & 2;
                bi.signedRightShift(2);
                lsb = bi.val.at(-1)!;

                let offset = 0;
                if (has_tz_offset) {
                    offset = lsb & 0x7F;
                    if (offset & 0x40) {
                        // sign extension
                        offset -= 128;
                    }
                    bi.signedRightShift(7);
                }

                offset *= 15;

                if (offset === INVALID_MIN_OFFSET_FROM_UTC) {
                    return impl_return(undefined);
                }

                let msec = bi.toNumber();
                if (has_not_msec) {
                    msec *= 1000;
                }
                msec += SHV_EPOCH_MSEC;
                msec -= offset * 60_000;
                return new Date(msec);
            }
            case PackingSchema.Map: {
                return impl_return(this.readMap());
            }
            case PackingSchema.IMap: {
                return impl_return(this.readIMap());
            }
            case PackingSchema.List: {
                return impl_return(this.readList());
            }
            case PackingSchema.Blob: {
                const str_len = this.readUIntData();
                const arr = new Uint8Array(str_len);
                for (let i = 0; i < str_len; i++) {
                    arr[i] = this.ctx.getByte();
                }
                return impl_return(arr.buffer);
            }
            case PackingSchema.String: {
                const str_len = this.readUIntData();
                const arr = new Uint8Array(str_len);
                for (let i = 0; i < str_len; i++) {
                    arr[i] = this.ctx.getByte();
                }
                return impl_return(utf8ToString(arr.buffer));
            }
            case PackingSchema.CString: {
                // variation of CponReader.readCString()
                const pctx = new PackContext();
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
                return impl_return(utf8ToString(pctx.buffer()));
            }
            default:
                throw new TypeError('ChainPack - Invalid type info: ' + codePointAt);
        }
    }

    readUIntDataHelper() {
        let num = 0;
        const head = this.ctx.getByte();
        let bytes_to_read_cnt;
        switch (0) {
            case head & 128: {
                bytes_to_read_cnt = 0;
                num = head & 127;
                break;
            }
            case head & 64: {
                bytes_to_read_cnt = 1;
                num = head & 63;
                break;
            }
            case head & 32: {
                bytes_to_read_cnt = 2;
                num = head & 31;
                break;
            }
            case head & 16: {
                bytes_to_read_cnt = 3;
                num = head & 15;
                break;
            }
            default: {
                bytes_to_read_cnt = (head & 0xF) + 4;
            }
        }
        const bytes = new Uint8Array(bytes_to_read_cnt + 1);
        bytes[0] = num;
        for (let i = 0; i < bytes_to_read_cnt; i++) {
            const r = this.ctx.getByte();
            bytes[i + 1] = r;
        }
        return new BInt(bytes);
    }

    readIntData() {
        const bi = this.readUIntDataHelper();
        let is_neg;
        if (bi.byteCount() < 5) {
            const sign_mask = 0x80 >> bi.byteCount();
            is_neg = bi.val[0] & sign_mask;
            bi.val[0] &= ~sign_mask;
        } else {
            is_neg = bi.val[1] & 128;
            bi.val[1] &= ~128;
        }
        let num = bi.toNumber();
        if (is_neg) {
            num = -num;
        }
        return num;
    }

    readUIntData() {
        return this.readUIntDataHelper().toNumber();
    }

    readList() {
        const lst = [];
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
        return this.implReadMap(MetaMap);
    }

    readMap() {
        return this.implReadMap(ShvMap);
    }

    readIMap() {
        return this.implReadMap(IMap);
    }

    private implReadMap<MapType extends MetaMap | ShvMap | IMap>(MapTypeCtor: new () => MapType) {
        const map = new MapTypeCtor();
        while (true) {
            const b = this.ctx.peekByte();
            if (b as PackingSchema === PackingSchema.Term) {
                this.ctx.getByte();
                break;
            }
            const key = this.read();
            const val = this.read();
            if (map instanceof MetaMap && typeof key === 'string') {
                map.value[key] = val;
            } else if (map instanceof MetaMap && key instanceof Int) {
                map.value[Number(key)] = val;
            } else if (map instanceof ShvMap && typeof key === 'string') {
                map.value[key] = val;
            } else if (map instanceof IMap && key instanceof Int) {
                map.value[Number(key)] = val;
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
            case rpc_val instanceof Int:
                this.writeInt(rpc_val);
                break;
            case rpc_val instanceof Decimal:
                this.writeDecimal(rpc_val);
                break;
            case Array.isArray(rpc_val):
                this.writeList(rpc_val);
                break;
            case rpc_val instanceof IMap:
                this.writeIMap(rpc_val);
                break;
            case rpc_val instanceof ShvMap:
                this.writeMap(rpc_val);
                break;
            case rpc_val instanceof Date:
                this.writeDateTime(rpc_val);
                break;
            default:
                console.log('Can\'t serialize', rpc_val);
                throw new Error('Can\'t serialize');
        }
    }

    writeUIntDataHelper(bint: BInt) {
        const bytes = bint.val;

        let head = bytes[0];
        if (bytes.length < 5) {
            let mask = (0xF0 << (4 - bytes.length)) & 0xFF;
            head &= ~mask;
            mask <<= 1;
            mask &= 0xFF;
            head |= mask;
        } else {
            head = 0xF0 | (bytes.length - 5);
        }

        this.ctx.putByte(head);

        for (let i = 1; i < bytes.length; ++i) {
            this.ctx.putByte(bytes[i]);
        }
    }

    writeUIntData(num: UInt) {
        const bi = new BInt(Number(num));
        const bitcnt = bi.significantBitsCount();
        bi.resize(bytesNeeded(bitcnt));
        this.writeUIntDataHelper(bi);
    }

    writeIntData(snum: number) {
        const neg = (snum < 0);
        const num = neg ? -snum : snum;
        const bi = new BInt(num);
        const bitcnt = bi.significantBitsCount() + 1;
        bi.resize(bytesNeeded(bitcnt));
        if (neg) {
            if (bi.byteCount() < 5) {
                const sign_mask = 0x80 >> bi.byteCount();
                bi.val[0] |= sign_mask;
            } else {
                bi.val[1] |= 128;
            }
        }
        this.writeUIntDataHelper(bi);
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
        this.writeUIntData(n);
    }

    writeJSString(str: string) {
        this.ctx.putByte(PackingSchema.String);
        const pctx = new PackContext();
        pctx.writeStringUtf8(str);
        this.writeUIntData(new UInt(pctx.length));
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
        this.writeUIntData(new UInt(arr.length));
        for (const element of arr) {
            this.ctx.putByte(element);
        }
    }

    writeDateTime(dt: Date) {
        this.ctx.putByte(PackingSchema.DateTime);

        let msecs = dt.getTime() - SHV_EPOCH_MSEC;
        if (msecs < 0) {
            throw new RangeError('DateTime prior to 2018-02-02 are not supported in current ChainPack implementation.');
        }

        const offset = (dt.getTimezoneOffset() / 15) & 0x7F;

        const ms = msecs % 1000;
        if (ms === 0) {
            msecs /= 1000;
        }

        const bi = new BInt(msecs);
        if (offset !== 0) {
            bi.leftShift(7);
            bi.val[bi.val.length - 1] |= offset;
        }

        bi.leftShift(2);

        if (offset !== 0) {
            bi.val[bi.val.length - 1] |= 1;
        }

        if (ms === 0) {
            bi.val[bi.val.length - 1] |= 2;
        }

        // save as signed int
        const bitcnt = bi.significantBitsCount() + 1;
        bi.resize(bytesNeeded(bitcnt));
        this.writeUIntDataHelper(bi);
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
        for (const [key, value] of Object.entries(map.value)) {
            if (value === undefined) {
                continue;
            }

            if (map instanceof IMap) {
                const int_key = Number(key);
                if (Number.isNaN(int_key)) {
                    throw new TypeError('Invalid NaN IMap key');
                }

                this.writeInt(new Int(int_key));
            } else if (map instanceof MetaMap) {
                const int_key = Number(key);
                if (Number.isNaN(int_key)) {
                    this.writeJSString(key.toString());
                } else {
                    this.writeInt(new Int(int_key));
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

const ChainpackProtocolType = 1;

export {toChainPack, ChainPackReader, ChainPackWriter, ChainpackProtocolType};
