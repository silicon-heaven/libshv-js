import {IMap, Int, MetaMap, type RpcValue, RpcValueWithMetaData} from './rpcvalue.ts';
import {toCpon} from './cpon.ts';
import {toChainPack} from './chainpack.ts';

const TagRequestId = 8;
const TagShvPath = 9;
const TagMethod = 10;
const TagCallerIds = 11;

const KeyParams = 1;
const KeyResult = 2;
const KeyError = 3;

class RpcMessage {
    value: IMap;
    meta: MetaMap;
    constructor(rpc_val?: RpcValue) {
        if (rpc_val === undefined) {
            this.value = new IMap();
            this.meta = new MetaMap();
            return;
        }

        if (!(rpc_val instanceof RpcValueWithMetaData && rpc_val.value instanceof IMap)) {
            throw new TypeError(`RpcMessage initialized with a non-IMap: ${new TextDecoder().decode(toCpon(rpc_val))}`);
        }

        this.value = rpc_val.value;
        this.meta = rpc_val.meta;
    }

    isValid() {
        return this.shvPath() && (this.isRequest() || this.isResponse || this.isSignal());
    }

    isRequest(): boolean {
        return this.requestId() !== undefined && this.method() !== undefined;
    }

    isResponse(): boolean {
        return this.requestId() !== undefined && this.method() === undefined;
    }

    isSignal(): boolean {
        return this.requestId() === undefined && this.method() !== undefined;
    }

    requestId(): Int | undefined {
        return (this.meta.value[TagRequestId] as Int);
    }

    setRequestId(id: number | Int) {
        this.meta.value[TagRequestId] = new Int(id);
    }

    callerIds(): RpcValue[] | undefined {
        return this.meta.value[TagCallerIds] as RpcValue[];
    }

    setCallerIds(ids: RpcValue[]) {
        this.meta.value[TagCallerIds] = ids;
    }

    shvPath(): string | undefined {
        return (this.meta.value[TagShvPath] as string);
    }

    setShvPath(val: string) {
        this.meta.value[TagShvPath] = val;
    }

    method(): string | undefined {
        return (this.meta.value[TagMethod] as string);
    }

    setMethod(val: string) {
        this.meta.value[TagMethod] = val;
    }

    params() {
        return this.value.value[KeyParams];
    }

    setParams(params: RpcValue) {
        this.value.value[KeyParams] = params;
    }

    result() {
        return this.value.value[KeyResult];
    }

    setResult(result: RpcValue) {
        this.value.value[KeyResult] = result;
    }

    error() {
        return this.value.value[KeyError];
    }

    setError(error: string) {
        this.value.value[KeyError] = error;
    }

    toCpon() {
        return toCpon(new RpcValueWithMetaData(this.value, this.meta));
    }

    toChainPack() {
        return toChainPack(new RpcValueWithMetaData(this.value, this.meta));
    }
}

export type RpcResponse<T = RpcValue> = {
    result: T;
};

export {RpcMessage};
