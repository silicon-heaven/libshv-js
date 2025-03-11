import {UnpackContext} from './cpcontext';
import {CponReader, stringifyDate} from './cpon';
import {Decimal, Double, isIMap, isShvMap, makeIMap, makeMap, makeMetaMap, RpcValueWithMetaData, UInt, type RpcValue} from './rpcvalue';

// eslint-disable-next-line @typescript-eslint/ban-types -- Zod needs the default argument, otherwise it'll infer as UInt<unknown>
const decodeMap = (x: object) => makeMap(Object.fromEntries(Object.entries(x).map(([key, value]) => [key, decodeValueJson(value)])));

const decodeValueJson = (x: unknown): RpcValue => {
    switch (true) {
        case Array.isArray(x): {
            const list = x as unknown[];
            const handleType = (typeName: unknown, typeValue: unknown) => {
                switch (true) {
                    case typeName === 'Blob': {
                        if (typeof typeValue !== 'string' || typeValue.length % 2 !== 0) {
                            throw new TypeError(`Invalid JSON-encoded Blob: '${JSON.stringify(typeValue)}'`);
                        }

                        const buffer = new ArrayBuffer(typeValue.length / 2);
                        const array = new Uint8Array(buffer);

                        // I can assume even length because of the previous check.
                        for (let i = 0; i < typeValue.length / 2; i++) {
                            array[i] = Number.parseInt(typeValue.slice(i * 2, (i * 2) + 2), 16);
                        }

                        return buffer;
                    }

                    case typeName === 'IMap':
                        if (typeof typeValue !== 'object' || typeValue === null) {
                            throw new TypeError(`Invalid JSON-encoded IMap: '${JSON.stringify(typeValue)}'`);
                        }

                        if (Object.keys(typeValue).some(key => !/^-?\d+$/.test(key))) {
                            throw new TypeError(`Invalid JSON-encoded IMap (non-Int key): '${JSON.stringify(typeValue)}'`);
                        }

                        return makeIMap(decodeMap(typeValue));
                    case typeName === 'DateTime':
                        if (typeof typeValue !== 'string') {
                            throw new TypeError(`Invalid JSON-encoded DateTime: '${JSON.stringify(typeValue)}'`);
                        }

                        // Kinda lame that I'm encoding the datetime string, but this is the easiest way right now.
                        return new CponReader(new UnpackContext(new TextEncoder().encode(typeValue).buffer)).readDateTimeInner();
                    default:
                        throw new TypeError(`Invalid JSON-encoded type name: '${JSON.stringify(typeName)}'`);
                }
            };

            switch (true) {
                case list.length === 3 && list[0] === JSON_TAG_TYPE:
                    return handleType(list[1], list[2]);
                case list.length === 3 && list[0] === JSON_TAG_META:
                case list.length === 5 && list[0] === JSON_TAG_META && list[2] === JSON_TAG_TYPE: {
                    if (typeof list[1] !== 'object' || list[1] === null) {
                        throw new TypeError(`Invalid JSON-encoded MetaData: '${JSON.stringify(list[1])}'`);
                    }

                    const value = (() => {
                        if (list.length === 3) {
                            const decoded = decodeValueJson(list[2]);
                            if (decoded instanceof RpcValueWithMetaData) {
                                throw new TypeError('Logic error: got RpcValueWithMetaData as the value in JSON-encoded RpcValueWithMetaData, please report this bug to the maintainer.');
                            }

                            return decoded;
                        }

                        return handleType(list[3], list[4]);
                    })();

                    return new RpcValueWithMetaData(makeMetaMap(decodeMap(list[1])), value);
                }

                default:
                    return list.map(value => decodeValueJson(value));
            }
        }

        case x === null:
            return undefined;
        case typeof x === 'object':
            return decodeMap(x);
        case typeof x === 'number':
        case typeof x === 'boolean':
        case typeof x === 'string':
            return x;
        default:
            throw new Error(`Unknown JSON-encoded value: ${JSON.stringify(x)}`);
    }
};

export const fromJson = (str: string): RpcValue | Error => decodeValueJson(JSON.parse(str));

const JSON_TAG_META = '!shvMeta';
const JSON_TAG_TYPE = '!shvType';

const encodeValueJson = (x: RpcValue): unknown => {
    switch (true) {
        case x instanceof RpcValueWithMetaData: {
            const res = [JSON_TAG_META, encodeValueJson(makeMap(x.meta))] as const;
            const encoded = encodeValueJson(x.value);
            if (Array.isArray(encoded) && encoded[0] === JSON_TAG_TYPE) {
                return [...res, ...encoded as unknown[]];
            }

            return [...res, encoded];
        }

        case Array.isArray(x):
            return x.map(value => encodeValueJson(value));
        case isShvMap(x): {
            const map = x as Record<string, RpcValue>;
            return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, encodeValueJson(value)] as const));
        }

        case isIMap(x):
            return [JSON_TAG_TYPE, 'IMap', encodeValueJson(makeMap(x))];
        case x instanceof ArrayBuffer:
            return [JSON_TAG_TYPE, 'Blob', new Uint8Array(x).reduce((acc, v) => acc + v.toString(16).padStart(2, '0'), '')];
        case x instanceof Date:
            return [JSON_TAG_TYPE, 'DateTime', stringifyDate(x)];
        case x === undefined:
            return null;
        case x instanceof Decimal:
        case x instanceof UInt:
        case x instanceof Double:
            throw new TypeError('Decimal/Double/UInt not supported in JSON');
        default:
            return x;
    }
};

export const toJson = (value: RpcValue): string | Error => JSON.stringify(encodeValueJson(value));
