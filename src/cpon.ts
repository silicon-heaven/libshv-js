/* eslint-disable no-bitwise */
import {type RpcValue, type RpcValueType, type DateTime, type List, Decimal, Double, type IMap, type Int, type MetaMap, RpcValueWithMetaData, type ShvMap, UInt, withOffset, shvMapType, isShvMap, isIMap} from './rpcvalue';
import {PackContext, UnpackContext} from './cpcontext';

export const stringifyDate = (dt: DateTime) => {
    const epochMsec = dt.getTime();
    let utcOffset = dt.utc_offset;
    const localMsec = epochMsec + (60_000 * (utcOffset ?? 0));
    let res = new Date(localMsec).toISOString();
    const rtrim = ((localMsec % 1000) !== 0) ? 1 : 5;
    res = res.slice(0, Math.max(0, res.length - rtrim));

    if (utcOffset === undefined || utcOffset === 0) {
        res += 'Z';
    } else {
        if (utcOffset < 0) {
            res += '-';
            utcOffset = -utcOffset;
        } else {
            res += '+';
        }

        res += (Math.trunc(utcOffset / 60)).toString().padStart(2, '0');
        if ((utcOffset % 60) !== 0) {
            res += (utcOffset % 60).toString().padStart(2, '0');
        }
    }

    return res;
};

const hexify = (byte: number) => {
    if (byte < 10) {
        return 48 + byte;
    }

    if (byte < 16) {
        return 97 + byte - 10;
    }

    return '?'.codePointAt(0)!;
};

const unhex = (byte: number) => {
    if (byte >= 48 && byte <= 57) { // 0-9
        return byte - 48;
    }

    if (byte >= 65 && byte <= 70) { // A-F
        return byte - 65 + 10;
    }

    if (byte >= 97 && byte <= 102) { // a-f
        return byte - 97 + 10;
    }

    throw new TypeError('Invalid HEX digit: ' + byte);
};

const utf8ToString = (bytearray: ArrayBuffer) => {
    const uint8Array = new Uint8Array(bytearray);
    let str = '';
    for (let i = 0; i < uint8Array.length; i++) {
        const value = uint8Array[i];

        if (value < 0x80) {
            str += String.fromCodePoint(value);
        } else if (value > 0xBF && value < 0xE0) {
            str += String.fromCodePoint(((value & 0x1F) << 6) | (uint8Array[i + 1] & 0x3F));
            i += 1;
        } else if (value > 0xDF && value < 0xF0) {
            str += String.fromCodePoint(((value & 0x0F) << 12) | ((uint8Array[i + 1] & 0x3F) << 6) | (uint8Array[i + 2] & 0x3F));
            i += 2;
        } else {
            // surrogate pair
            const charCode = (((value & 0x07) << 18) | ((uint8Array[i + 1] & 0x3F) << 12) | ((uint8Array[i + 2] & 0x3F) << 6) | (uint8Array[i + 3] & 0x3F)) - 0x01_00_00;

            str += String.fromCodePoint((charCode >> 10) | 0xD8_00, (charCode & 0x03_FF) | 0xDC_00);
            i += 3;
        }
    }

    return str;
};

class CponReader {
    ctx: UnpackContext;

    constructor(unpackContext: UnpackContext) {
        this.ctx = unpackContext;
    }

    read(): RpcValue {
        let meta: MetaMap | undefined;
        this.skipWhitespace();
        let b = this.ctx.peekByte();
        if (b === '<'.codePointAt(0)) {
            meta = this.readMetaMap();
        }

        const implReturn = (x: RpcValueType) => {
            const ret = meta !== undefined ? new RpcValueWithMetaData(meta, x) : x;
            return ret;
        };

        this.skipWhitespace();
        b = this.ctx.peekByte();
        // console.log("CHAR:", b, String.fromCodePoint(b));
        // [0-9+-]
        if ((b >= 48 && b <= 57) || b === 43 || b === 45) {
            return implReturn(this.readNumber());
        }

        if (b === '"'.codePointAt(0)) {
            return implReturn(this.readCString());
        }

        if (b === 'b'.codePointAt(0)) {
            this.ctx.getByte();
            b = this.ctx.peekByte();
            if (b === '"'.codePointAt(0)) {
                return implReturn(this.readBlobEsc());
            }

            throw new TypeError('Invalid Blob prefix.');
        }

        if (b === 'x'.codePointAt(0)) {
            this.ctx.getByte();
            b = this.ctx.peekByte();
            if (b === '"'.codePointAt(0)) {
                return implReturn(this.readBlobHex());
            }

            throw new TypeError('Invalid HEX Blob prefix.');
        }

        if (b === '['.codePointAt(0)) {
            return implReturn(this.readList());
        }

        if (b === '{'.codePointAt(0)) {
            return implReturn(this.readMap());
        }

        if (b === 'i'.codePointAt(0)) {
            this.ctx.getByte();
            b = this.ctx.peekByte();
            if (b === '{'.codePointAt(0)) {
                return implReturn(this.readIMap());
            }

            throw new TypeError('Invalid IMap prefix.');
        }

        if (b === 'd'.codePointAt(0)) {
            this.ctx.getByte();
            b = this.ctx.peekByte();
            if (b === '"'.codePointAt(0)) {
                return implReturn(this.readDateTime());
            }

            throw new TypeError('Invalid DateTime prefix.');
        }

        if (b === 't'.codePointAt(0)) {
            this.ctx.getBytes('true');
            return implReturn(true);
        }

        if (b === 'f'.codePointAt(0)) {
            this.ctx.getBytes('false');
            return implReturn(false);
        }

        if (b === 'n'.codePointAt(0)) {
            this.ctx.getBytes('null');
            return implReturn(undefined);
        }

        throw new TypeError('Malformed Cpon input.');
    }

    skipWhitespace() {
        const SPACE = ' '.codePointAt(0)!;
        const SLASH = '/'.codePointAt(0)!;
        const STAR = '*'.codePointAt(0)!;
        const LF = '\n'.codePointAt(0)!;
        const KEY_DELIM = ':'.codePointAt(0)!;
        const FIELD_DELIM = ','.codePointAt(0)!;
        /* eslint-disable max-depth */
        while (true) {
            let b = this.ctx.peekByte();
            if (b < 1) {
                return;
            }

            if (b > SPACE) {
                switch (b) {
                    case SLASH: {
                        this.ctx.getByte();
                        b = this.ctx.getByte();
                        if (b === STAR) {
                            // multiline_comment_entered;
                            while (true) {
                                b = this.ctx.getByte();
                                if (b === STAR) {
                                    b = this.ctx.getByte();
                                    if (b === SLASH) {
                                        break;
                                    }
                                }
                            }
                        } else if (b === SLASH) {
                            // to end of line comment entered;
                            while (true) {
                                b = this.ctx.getByte();
                                if (b === LF) {
                                    break;
                                }
                            }
                        } else {
                            throw new TypeError('Malformed comment');
                        }

                        break;
                    }

                    case KEY_DELIM: {
                        this.ctx.getByte();
                        continue;
                    }

                    case FIELD_DELIM: {
                        this.ctx.getByte();
                        continue;
                    }

                    default:
                        return;
                }
            } else {
                this.ctx.getByte();
            }
        }
        /* eslint-enable max-depth */
    }

    readDateTime() {
        this.ctx.getByte(); // eat '"'
        let b = this.ctx.peekByte();
        if (b === '"'.codePointAt(0)) {
            // d"" invalid data time
            this.ctx.getByte();
            throw new TypeError('Malformed empty date separator in DateTime');
        }

        const date = this.readDateTimeInner();

        b = this.ctx.getByte();
        if (b !== '"'.codePointAt(0)) {
            throw new TypeError('DateTime literal should be terminated by \'"\'.');
        }

        return date;
    }

    readDateTimeInner() {
        let year = 0;
        let month = 0;
        let day = 1;
        let hour = 0;
        let min = 0;
        let sec = 0;
        let msec = 0;
        let utcOffset = 0;

        year = Number(this.readInt());

        let b = this.ctx.getByte();
        if (b !== '-'.codePointAt(0)) {
            throw new TypeError('Malformed year-month separator in DateTime');
        }

        month = Number(this.readInt());

        b = this.ctx.getByte();
        if (b !== '-'.codePointAt(0)) {
            throw new TypeError('Malformed year-month separator in DateTime');
        }

        day = Number(this.readInt());

        b = this.ctx.getByte();
        if (b !== ' '.codePointAt(0) && b !== 'T'.codePointAt(0)) {
            throw new TypeError('Malformed date-time separator in DateTime');
        }

        hour = Number(this.readInt());

        b = this.ctx.getByte();
        if (b !== ':'.codePointAt(0)) {
            throw new TypeError('Malformed year-month separator in DateTime');
        }

        min = Number(this.readInt());

        b = this.ctx.getByte();
        if (b !== ':'.codePointAt(0)) {
            throw new TypeError('Malformed year-month separator in DateTime');
        }

        sec = Number(this.readInt());

        b = this.ctx.peekByte();
        if (b === '.'.codePointAt(0)) {
            this.ctx.getByte();
            msec = Number(this.readInt());
        }

        b = this.ctx.peekByte();
        if (b === 'Z'.codePointAt(0)) {
            // zulu time
            this.ctx.getByte();
        } else if (b === '+'.codePointAt(0) || b === '-'.codePointAt(0)) {
            // UTC time offset
            this.ctx.getByte();
            const ix1 = this.ctx.index;
            const val = Number(this.readInt());
            const n = this.ctx.index - ix1;
            if (!(n === 2 || n === 4)) {
                throw new TypeError('Malformed TS offset in DateTime.');
            }

            if (n === 2) {
                utcOffset = 60 * val;
            } else if (n === 4) {
                utcOffset = (60 * (Math.trunc(val / 100))) + (val % 100);
            }

            if (b === '-'.codePointAt(0)) {
                utcOffset = -utcOffset;
            }
        }

        // let epoch_sec = CponReader.timegm(year, month, mday, hour, min, sec);
        let epochMsec = Date.UTC(year, month - 1, day, hour, min, sec, msec);
        epochMsec -= utcOffset * 60_000;
        return withOffset(new Date(epochMsec), utcOffset ?? undefined);
    }

    readCString() {
        const pctx = new PackContext();
        this.ctx.getByte(); // eat '"'
        while (true) {
            let b = this.ctx.getByte();
            if (b === '\\'.codePointAt(0)) {
                b = this.ctx.getByte();
                switch (b) {
                    case '\\'.codePointAt(0):
                        pctx.putByte('\\'.codePointAt(0)!);
                        break;
                    case '"'.codePointAt(0):
                        pctx.putByte('"'.codePointAt(0)!);
                        break;
                    case 'b'.codePointAt(0):
                        pctx.putByte('\b'.codePointAt(0)!);
                        break;
                    case 'f'.codePointAt(0):
                        pctx.putByte('\f'.codePointAt(0)!);
                        break;
                    case 'n'.codePointAt(0):
                        pctx.putByte('\n'.codePointAt(0)!);
                        break;
                    case 'r'.codePointAt(0):
                        pctx.putByte('\r'.codePointAt(0)!);
                        break;
                    case 't'.codePointAt(0):
                        pctx.putByte('\t'.codePointAt(0)!);
                        break;
                    case '0'.codePointAt(0):
                        pctx.putByte(0);
                        break;
                    default:
                        pctx.putByte(b);
                        break;
                }
            } else if (b === '"'.codePointAt(0)) {
                // end of string
                break;
            } else {
                pctx.putByte(b);
            }
        }

        return utf8ToString(pctx.buffer());
    }

    readBlobEsc() {
        const pctx = new PackContext();
        this.ctx.getByte(); // eat '"'
        while (true) {
            let b = this.ctx.getByte();
            if (b === '\\'.codePointAt(0)) {
                b = this.ctx.getByte();
                switch (b) {
                    case '\\'.codePointAt(0):
                        pctx.putByte('\\'.codePointAt(0)!);
                        break;
                    case '"'.codePointAt(0):
                        pctx.putByte('"'.codePointAt(0)!);
                        break;
                    case 'n'.codePointAt(0):
                        pctx.putByte('\n'.codePointAt(0)!);
                        break;
                    case 'r'.codePointAt(0):
                        pctx.putByte('\r'.codePointAt(0)!);
                        break;
                    case 't'.codePointAt(0):
                        pctx.putByte('\t'.codePointAt(0)!);
                        break;
                    default: {
                        const b2 = (unhex(b) * 16) + unhex(this.ctx.getByte());
                        pctx.putByte(b2);
                        break;
                    }
                }
            } else if (b === '"'.codePointAt(0)) {
                // end of string
                break;
            } else if (b < 128) {
                pctx.putByte(b);
            } else {
                throw new TypeError('Escaped Blob characters must be lower than 128, code: ' + b);
            }
        }

        return pctx.buffer();
    }

    readBlobHex() {
        const pctx = new PackContext();
        this.ctx.getByte(); // eat '"'
        while (true) {
            const b = this.ctx.getByte();
            if (b === '"'.codePointAt(0)) {
                // end of string
                break;
            } else {
                const b2 = (unhex(b) * 16) + unhex(this.ctx.getByte());
                pctx.putByte(b2);
            }
        }

        return pctx.buffer();
    }

    readList() {
        const lst = [];
        this.ctx.getByte(); // eat '['
        while (true) {
            this.skipWhitespace();
            const b = this.ctx.peekByte();
            if (b === ']'.codePointAt(0)) {
                this.ctx.getByte();
                break;
            }

            const item = this.read();
            lst.push(item);
        }

        return lst;
    }

    readMetaMap() {
        return this.implReadMap('metamap', '>'.codePointAt(0)!);
    }

    readMap() {
        return this.implReadMap('map', '}'.codePointAt(0)!);
    }

    readIMap() {
        return this.implReadMap('imap', '}'.codePointAt(0)!);
    }

    readInt() {
        let base = 10;
        let val = 0;
        let neg = false;
        let n = 0;
        for (; ; n++) {
            const b = this.ctx.peekByte();
            if (b < 0) {
                break;
            }

            if (b === 43 || b === 45) { // '+','-'
                if (n !== 0) {
                    break;
                }

                this.ctx.getByte();
                if (b === 45) {
                    neg = true;
                }
            } else if (b === 120) { // 'x'
                if (n === 1 && val !== 0) {
                    break;
                }

                if (n !== 1) {
                    break;
                }

                this.ctx.getByte();
                base = 16;
            } else if (b >= 48 && b <= 57) { // '0' - '9'
                this.ctx.getByte();
                val *= base;
                val += b - 48;
            } else if (b >= 65 && b <= 70) { // 'A' - 'F'
                if (base !== 16) {
                    break;
                }

                this.ctx.getByte();
                val *= base;
                val += b - 65 + 10;
            } else if (b >= 97 && b <= 102) { // 'a' - 'f'
                if (base !== 16) {
                    break;
                }

                this.ctx.getByte();
                val *= base;
                val += b - 97 + 10;
            } else {
                break;
            }
        }

        if (neg) {
            val = -val;
        }

        return val;
    }

    readNumber() {
        let mantisa = 0;
        let exponent = 0;
        let decimals = 0;
        let decCnt = 0;
        let isDecimal = false;
        let isUint = false;
        let isNeg = false;

        let b = this.ctx.peekByte();
        if (b === 43) {// '+'
            isNeg = false;
            b = this.ctx.getByte();
        } else if (b === 45) {// '-'
            isNeg = true;
            b = this.ctx.getByte();
        }

        mantisa = Number(this.readInt());
        b = this.ctx.peekByte();
        (() => {
            while (true) {
                switch (b) {
                    case 'u'.codePointAt(0): {
                        isUint = true;
                        this.ctx.getByte();
                        return;
                    }

                    case '.'.codePointAt(0): {
                        isDecimal = true;
                        this.ctx.getByte();
                        const ix1 = this.ctx.index;
                        decimals = Number(this.readInt());
                        // if(n < 0)
                        //  UNPACK_ERROR(CCPCP_RC_MALFORMED_INPUT, "Malformed number decimal part.")
                        decCnt = this.ctx.index - ix1;
                        b = this.ctx.peekByte();
                        if (b >= 0) {
                            continue;
                        }

                        return;
                    }

                    case 'e'.codePointAt(0):
                    case 'E'.codePointAt(0): {
                        isDecimal = true;
                        this.ctx.getByte();
                        const ix1 = this.ctx.index;
                        exponent = Number(this.readInt());
                        if (ix1 === this.ctx.index) {
                            throw new TypeError('Malformed number exponential part.');
                        }

                        return;
                    }

                    default:
                        return;
                }
            }
        })();

        if (isDecimal) {
            for (let i = 0; i < decCnt; ++i) {
                mantisa *= 10;
            }

            mantisa += decimals;
            mantisa = isNeg ? -mantisa : mantisa;
            return new Decimal(mantisa, exponent - decCnt);
        }

        if (isUint) {
            return new UInt(mantisa);
        }

        return isNeg ? -mantisa : mantisa;
    }

    private implReadMap(mapType: 'map', terminator: number): ShvMap;
    private implReadMap(mapType: 'imap', terminator: number): IMap;
    private implReadMap(mapType: 'metamap', terminator: number): MetaMap;
    private implReadMap(mapType: 'map' | 'imap' | 'metamap', terminator: number) {
        const map: MetaMap | ShvMap | IMap = {
            [shvMapType]: mapType,
        };
        this.ctx.getByte(); // eat start
        while (true) {
            this.skipWhitespace();
            const b = this.ctx.peekByte();
            if (b === terminator) {
                this.ctx.getByte();
                break;
            }

            const key = this.read();
            if (key instanceof RpcValueWithMetaData) {
                throw new TypeError('Map/IMap/MetaMap key can\'t have its own MetaData');
            }

            this.skipWhitespace();
            const val = this.read();

            if (map[shvMapType] === 'metamap' && typeof key === 'string') {
                map[key] = val;
            } else if (map[shvMapType] === 'metamap' && (key instanceof UInt || typeof key === 'number')) {
                map[Number(key)] = val;
            } else if (map[shvMapType] === 'map' && typeof key === 'string') {
                map[key] = val;
            } else if (map[shvMapType] === 'imap' && (key instanceof UInt || typeof key === 'number')) {
                map[Number(key)] = val;
            } else {
                throw new TypeError('Malformed map, invalid key');
            }
        }

        return map;
    }
}

class CponWriter {
    ctx: PackContext;
    nestLevel = 0;

    constructor(private readonly indentString?: string, private oneLiners: OneLiners = OneLiners.Yes) {
        this.ctx = new PackContext();
    }

    write(rpcVal: RpcValue) {
        if (rpcVal instanceof RpcValueWithMetaData) {
            this.writeMeta(rpcVal.meta);
            rpcVal = rpcVal.value;
        }

        switch (true) {
            case rpcVal === undefined:
                this.ctx.writeStringUtf8('null');
                break;
            case typeof rpcVal === 'boolean':
                this.writeBool(rpcVal);
                break;
            case typeof rpcVal === 'string':
                this.writeJSString(rpcVal);
                break;
            case rpcVal instanceof ArrayBuffer:
                this.writeBlob(rpcVal);
                break;
            case rpcVal instanceof UInt:
                this.writeUInt(rpcVal);
                break;
            case typeof rpcVal === 'number':
                this.writeInt(rpcVal);
                break;
            case rpcVal instanceof Double:
                this.writeDouble(rpcVal);
                break;
            case rpcVal instanceof Decimal:
                this.writeDecimal(rpcVal);
                break;
            case Array.isArray(rpcVal):
                this.writeList(rpcVal);
                break;
            case rpcVal instanceof Date:
                this.writeDateTime(rpcVal);
                break;
            case typeof rpcVal === 'object':
                switch (rpcVal[shvMapType]) {
                    case 'imap':
                        this.writeIMap(rpcVal);
                        break;
                    case 'map':
                        this.writeMap(rpcVal);
                        break;
                }

                break;
            default:
                console.log('Can\'t serialize rpc value', rpcVal);
                throw new Error('Can\'t serialize rpc value');
        }
    }

    writeJSString(str: string) {
        this.ctx.writeStringUtf8('"');
        for (let i = 0; i < str.length; i++) {
            const charcode = str.codePointAt(i)!;
            switch (charcode) {
                case 0:
                    this.ctx.writeStringUtf8(String.raw`\0`);
                    break;
                case '\\'.codePointAt(0):
                    this.ctx.writeStringUtf8('\\\\');
                    break;
                case '\t'.codePointAt(0):
                    this.ctx.writeStringUtf8(String.raw`\t`);
                    break;
                case '\b'.codePointAt(0):
                    this.ctx.writeStringUtf8(String.raw`\b`);
                    break;
                case '\r'.codePointAt(0):
                    this.ctx.writeStringUtf8(String.raw`\r`);
                    break;
                case '\n'.codePointAt(0):
                    this.ctx.writeStringUtf8(String.raw`\n`);
                    break;
                case '"'.codePointAt(0):
                    this.ctx.writeStringUtf8(String.raw`\"`);
                    break;
                default:
                    this.ctx.writeCharCodeUtf8(charcode);
            }
        }

        this.ctx.writeStringUtf8('"');
    }

    writeBlob(buffer: ArrayBuffer) {
        this.ctx.writeStringUtf8('b"');
        const data = new Uint8Array(buffer);
        for (const b of data) {
            switch (b) {
                case '\\'.codePointAt(0):
                    this.ctx.writeStringUtf8('\\\\');
                    break;
                case '\t'.codePointAt(0):
                    this.ctx.writeStringUtf8(String.raw`\t`);
                    break;
                case '\r'.codePointAt(0):
                    this.ctx.writeStringUtf8(String.raw`\r`);
                    break;
                case '\n'.codePointAt(0):
                    this.ctx.writeStringUtf8(String.raw`\n`);
                    break;
                case '"'.codePointAt(0):
                    this.ctx.writeStringUtf8(String.raw`\"`);
                    break;
                default:
                    if (b >= 32 && b < 127) {
                        this.ctx.putByte(b);
                    } else {
                        this.ctx.putByte('\\'.codePointAt(0)!);
                        this.ctx.putByte(hexify(b / 16));
                        this.ctx.putByte(hexify(b % 16));
                    }
            }
        }

        this.ctx.writeStringUtf8('"');
    }

    writeDateTime(dt: DateTime) {
        this.ctx.writeStringUtf8('d"');
        this.ctx.writeStringUtf8(stringifyDate(dt));
        this.ctx.writeStringUtf8('"');
    }

    writeBool(b: boolean) {
        this.ctx.writeStringUtf8(b ? 'true' : 'false');
    }

    writeMeta(map: MetaMap) {
        this.writeMapContent(map, '<', '>');
    }

    writeIMap(map: IMap) {
        this.writeMapContent(map, 'i{', '}');
    }

    writeMap(map: ShvMap) {
        this.writeMapContent(map, '{', '}');
    }

    writeMapContent(map: MetaMap | ShvMap | IMap, delimiterStart: string, delimiterEnd: string) {
        this.ctx.writeStringUtf8(delimiterStart);
        this.increaseIndentIfNotOneLiner(map);
        this.doIndentIfNotOneliner(map);
        let first = true;
        for (const [key, value] of Object.entries<RpcValue>(map)) {
            if (!first) {
                this.ctx.putByte(','.codePointAt(0)!);
                this.doIndentIfNotOneliner(map);
            }

            first = false;

            if (map[shvMapType] === 'imap') {
                const intKey = Number(key);
                if (Number.isNaN(intKey)) {
                    throw new TypeError('Invalid NaN IMap key');
                }

                this.writeInt(intKey);
            } else if (map[shvMapType] === 'metamap') {
                const intKey = Number(key);
                if (Number.isNaN(intKey)) {
                    this.ctx.putByte('"'.codePointAt(0)!);
                    this.ctx.writeStringUtf8(key.toString());
                    this.ctx.putByte('"'.codePointAt(0)!);
                } else {
                    this.writeInt(intKey);
                }
            } else {
                this.writeJSString(key.toString());
            }

            this.ctx.writeStringUtf8(':');
            this.write(value);
        }

        this.decreaseIndentIfNotOneLiner(map);
        this.doIndentIfNotOneliner(map);
        this.ctx.writeStringUtf8(delimiterEnd);
    }

    writeList(lst: RpcValue[]) {
        this.ctx.putByte('['.codePointAt(0)!);
        this.increaseIndentIfNotOneLiner(lst);
        this.doIndentIfNotOneliner(lst);
        for (const [i, element] of lst.entries()) {
            if (i > 0) {
                this.ctx.putByte(','.codePointAt(0)!);
                this.doIndentIfNotOneliner(lst);
            }

            this.write(element);
        }

        this.decreaseIndentIfNotOneLiner(lst);
        this.doIndentIfNotOneliner(lst);
        this.ctx.putByte(']'.codePointAt(0)!);
    }

    writeUInt(num: UInt) {
        const s = Number(num).toString();
        this.ctx.writeStringUtf8(s);
        this.ctx.putByte('u'.codePointAt(0)!);
    }

    writeInt(num: Int) {
        const s = Number(num).toString();
        this.ctx.writeStringUtf8(s);
    }

    writeDouble(num: Double) {
        let s = num.value.toString();
        if (!s.includes('.')) {
            s += '.';
        }

        this.ctx.writeStringUtf8(s);
    }

    writeDecimal(val: Decimal) {
        let {mantisa} = val;
        const {exponent} = val;
        if (mantisa < 0) {
            mantisa = -mantisa;
            this.ctx.putByte('-'.codePointAt(0)!);
        }

        let str = mantisa.toString();
        const n = str.length;
        const decPlaces = -exponent;
        if (decPlaces > 0 && decPlaces < n) {
            const dotIx = n - decPlaces;
            str = str.slice(0, dotIx) + '.' + str.slice(dotIx);
        } else if (decPlaces > 0 && decPlaces <= 3) {
            const extraZeroCnt = decPlaces - n;
            let str0 = '0.';
            for (let i = 0; i < extraZeroCnt; ++i) {
                str0 += '0';
            }

            str = str0 + str;
        } else if (decPlaces < 0 && n + exponent <= 9) {
            for (let i = 0; i < exponent; ++i) {
                str += '0';
            }

            str += '.';
        } else if (decPlaces === 0) {
            str += '.';
        } else {
            str += 'e' + exponent;
        }

        for (let i = 0; i < str.length; ++i) {
            this.ctx.putByte(str.codePointAt(i)!);
        }
    }

    private doIndentIfNotOneliner(map: MetaMap | ShvMap | IMap | List) {
        if (this.indentString !== undefined && !this.isOneLiner(map)) {
            this.ctx.putByte('\n'.codePointAt(0)!);
            this.ctx.writeStringUtf8(this.indentString.repeat(this.nestLevel));
        }
    }

    private isOneLiner(value: MetaMap | ShvMap | IMap | List) {
        if (this.oneLiners === OneLiners.No) {
            return false;
        }

        const keyThreshold = Array.isArray(value) ? 10 : 5;

        if (Array.isArray(value)) {
            return value.length <= keyThreshold && !(value.some(x => Array.isArray(x) || isShvMap(x) || isIMap(x)));
        }

        return Object.keys(value).length <= keyThreshold && !(Object.values(value).some(x => Array.isArray(x) || isShvMap(x) || isIMap(x)));
    }

    private increaseIndentIfNotOneLiner(value: MetaMap | ShvMap | IMap | List) {
        if (!this.isOneLiner(value)) {
            this.nestLevel++;
        }
    }

    private decreaseIndentIfNotOneLiner(value: MetaMap | ShvMap | IMap | List) {
        if (!this.isOneLiner(value)) {
            this.nestLevel--;
        }
    }
}

export enum OneLiners {
    Yes,
    No,
}

const toCpon = (value: RpcValue, indentString?: string, oneLiners: OneLiners = OneLiners.Yes) => {
    const wr = new CponWriter(indentString, oneLiners);
    wr.write(value);
    return new TextDecoder().decode(wr.ctx.buffer());
};

const fromCpon = (str: string | Uint8Array) => {
    if (typeof str === 'string') {
        str = new TextEncoder().encode(str);
    }

    const rd = new CponReader(new UnpackContext(str.buffer));
    return rd.read();
};

const CPON_PROTOCOL_TYPE = 2;

export {utf8ToString, CponWriter, CponReader, CPON_PROTOCOL_TYPE, toCpon, fromCpon};
