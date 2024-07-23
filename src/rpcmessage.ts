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
            throw new TypeError(`RpcMessage initialized with a non-IMap: ${toCpon(rpc_val)}`);
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

    resultOrError() {
        if (this.value.value[KeyError] !== undefined) {
            return new RpcError(this.value.value[KeyError] as ErrorMap);
        }

        return this.value.value[KeyResult];
    }

    setResult(result: RpcValue) {
        this.value.value[KeyResult] = result;
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

export const ERROR_CODE = 1;
export const ERROR_MESSAGE = 2;
export const ERROR_DATA = 3;

enum ErrorCode {
    InvalidRequest = 1,
    MethodNotFound = 2,
    InvalidParams = 3,
    InternalError = 4,
    ParseError = 5,
    MethodCallTimeout = 6,
    MethodCallCancelled = 7,
    MethodCallException = 8,
    Unknown = 9,
    LoginRequired = 10,
    UserIDRequired = 11,
    NotImplemented = 12,
}

type ErrorMap = IMap<{
    [ERROR_CODE]: Int<ErrorCode>;
    [ERROR_MESSAGE]?: string;
    [ERROR_DATA]?: RpcValue;
}>;

class RpcError {
    constructor(private readonly err_info: ErrorMap) {}
    code() {
        return this.err_info.value[ERROR_CODE];
    }

    message() {
        return this.err_info.value[ERROR_MESSAGE];
    }

    data() {
        return this.err_info.value[ERROR_DATA];
    }
}

export type RpcResponse<T = RpcValue> = T | RpcError;

export {RpcMessage, RpcError, ErrorCode};
