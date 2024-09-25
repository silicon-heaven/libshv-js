class UInt<T extends number = number> {
    readonly value: T;

    constructor(u: T | UInt<T>) {
        if (u instanceof UInt) {
            this.value = u.value;
            return;
        }

        if (u < 0 || !Number.isInteger(u)) {
            throw new Error(`Invalid value '${u}' for UInt must a positive integral number`);
        }

        this.value = u;
    }

    [Symbol.toPrimitive](_hint: string) {
        return this.value;
    }

    toString() {
        return `${this.value.toString()}`;
    }
}

class Double {
    readonly value: number;

    constructor(u: number) {
        this.value = u;
    }
}

class Decimal {
    mantisa: number;
    exponent: number;
    constructor(mantisa: number, exponent: number) {
        if (!Number.isInteger(exponent)) {
            throw new TypeError(`Decimal: exponent must be integral (${exponent})`);
        }

        this.mantisa = mantisa;
        this.exponent = exponent;
    }
}

export type Null = undefined;
export type Bool = boolean;
export type Blob = ArrayBuffer;
export type ShvString = string;
export type DateTime = Date & {utc_offset?: number};
const withOffset = (date: Date, utc_offset?: number) => {
    const clonedDate: DateTime = new Date(date.getTime());
    clonedDate.utc_offset = utc_offset;
    return clonedDate;
};

export type List = RpcValue[];

const shvMapType = Symbol('shvMapType');

type IMap<T extends Record<number, RpcValue> = Record<number, any>> = {
    [Key in keyof T]: T[Key];
} & {
    [shvMapType]: 'imap';
};

type ShvMap<T extends Record<string, RpcValue> = Record<string, any>> = {
    [Key in keyof T]: T[Key];
} & {
    [shvMapType]: 'map';
};

export type Int = number;

export type RpcValueType =
    Null |
    Bool |
    Int |
    UInt |
    Double |
    Decimal |
    Blob |
    ShvString |
    DateTime |
    List |
    ShvMap |
    IMap;

type MetaMap<T extends Record<string | number, RpcValue> = Record<string | number, RpcValue>> = {
    [Key in keyof T]: T[Key];
} & {
    [shvMapType]: 'metamap';
};

const isShvMap = (x: unknown): x is ShvMap => typeof x === 'object' && (x as ShvMap)[shvMapType] === 'map';

const isIMap = (x: unknown): x is IMap => typeof x === 'object' && (x as IMap)[shvMapType] === 'imap';

const makeMetaMap = <T extends Record<string | number, RpcValue> = Record<string | number, RpcValue>, U extends Record<number, RpcValue> = Omit<T, typeof shvMapType>>(x: U = {} as U): MetaMap<U> => ({
    ...x,
    [shvMapType]: 'metamap',
});

const makeIMap = <T extends Record<number, RpcValue> = Record<number, RpcValue>, U extends Record<number, RpcValue> = Omit<T, typeof shvMapType>>(x: U = {} as U): IMap<U> => ({
    ...x,
    [shvMapType]: 'imap',
});

const makeMap = <T extends Record<string, RpcValue> = Record<string, RpcValue>, U extends Record<string, RpcValue> = Omit<T, typeof shvMapType>>(x: U = {} as U): ShvMap<U> => ({
    ...x,
    [shvMapType]: 'map',
});

class RpcValueWithMetaData {
    constructor(public value: RpcValueType, public meta: MetaMap) {}
}

export type RpcValue = RpcValueType | RpcValueWithMetaData;

export {shvMapType, Decimal, Double, type IMap, type MetaMap, RpcValueWithMetaData, type ShvMap, UInt, withOffset, makeMap, makeIMap, makeMetaMap, isIMap, isShvMap};
