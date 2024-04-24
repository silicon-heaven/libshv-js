class Int<T = number> {
    readonly value: T;

    constructor(u: T | Int<T>) {
        if (u instanceof Int) {
            this.value = u.value;
            return;
        }
        if (!Number.isInteger(u)) {
            throw new TypeError('Value for Int must a positive integral number');
        }

        this.value = u;
    }

    [Symbol.toPrimitive](_hint: string) {
        return this.value;
    }
}

class UInt {
    readonly value: number;

    constructor(u: number) {
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
        if (Number.isInteger(exponent)) {
            throw new TypeError('Decimal: exponent must be integral');
        }

        if (mantisa < -10 || mantisa > 10) {
            throw new Error('Decimal: mantisa must be between -10 and 10');
        }

        this.mantisa = mantisa;
        this.exponent = exponent;
    }
}

export type Null = undefined;
export type Bool = boolean;
export type Blob = ArrayBuffer;
export type ShvString = string;
export type DateTime = Date;
export type List = RpcValue[];

type ShvMapDefaultType = Record<string, RpcValue | undefined>;
class ShvMap<T extends ShvMapDefaultType = ShvMapDefaultType> {
    constructor(public value: T = {} as T) {}
}

type IMapDefaultType = Record<number, RpcValue | undefined>;
class IMap<T extends IMapDefaultType = IMapDefaultType> {
    constructor(public value: T = {} as T) {}
}

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

class MetaMap {
    value: Record<number | string, RpcValue | undefined>;
    constructor(obj?: Record<number | string, RpcValue | undefined>) {
        this.value = obj ?? {};
    }
}

class RpcValueWithMetaData {
    constructor(public value: RpcValueType, public meta: MetaMap) {}
}

export type RpcValue = RpcValueType | RpcValueWithMetaData;

export {Decimal, Double, Int, IMap, MetaMap, RpcValueWithMetaData, ShvMap, UInt};
