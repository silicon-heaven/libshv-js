import {type IMap, type Int, isIMap, makeIMap, makeMetaMap, type MetaMap, type RpcValue, RpcValueWithMetaData} from './rpcvalue';
import {toCpon} from './cpon';
import {toChainPack} from './chainpack';

const TagRequestId = 8;
const TagShvPath = 9;
const TagMethod = 10;
const TagCallerIds = 11;

const KeyParams = 1;
const KeyResult = 2;
const KeyError = 3;

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

export type ErrorMap = {
    [ERROR_CODE]: ErrorCode;
    [ERROR_MESSAGE]?: string;
    [ERROR_DATA]?: RpcValue;
};

class RpcError extends Error {
    constructor(private readonly err_info: ErrorMap) {
        super(err_info[ERROR_MESSAGE] ?? 'Unknown RpcError');
    }

    data() {
        return this.err_info[ERROR_DATA];
    }
}

export class ProtocolError extends Error {}

export class InvalidRequest extends RpcError {}
export class MethodNotFound extends RpcError {}
export class InvalidParams extends RpcError {}
export class InternalError extends RpcError {}
export class ParseError extends RpcError {}
export class MethodCallTimeout extends RpcError {}
export class MethodCallCancelled extends RpcError {}
export class MethodCallException extends RpcError {}
export class Unknown extends RpcError {}
export class LoginRequired extends RpcError {}
export class UserIDRequired extends RpcError {}
export class NotImplemented extends RpcError {}

class RpcMessage {
    value: IMap;
    meta: MetaMap;
    constructor(rpc_val?: RpcValue) {
        if (rpc_val === undefined) {
            this.value = makeIMap({});
            this.meta = makeMetaMap({});
            return;
        }

        if (!(rpc_val instanceof RpcValueWithMetaData && isIMap(rpc_val.value))) {
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
        return (this.meta[TagRequestId] as Int);
    }

    setRequestId(id: number) {
        this.meta[TagRequestId] = id;
    }

    callerIds(): RpcValue[] | undefined {
        return this.meta[TagCallerIds] as RpcValue[];
    }

    setCallerIds(ids: RpcValue[]) {
        this.meta[TagCallerIds] = ids;
    }

    shvPath(): string | undefined {
        return (this.meta[TagShvPath] as string);
    }

    setShvPath(val: string) {
        this.meta[TagShvPath] = val;
    }

    method(): string | undefined {
        return (this.meta[TagMethod] as string);
    }

    setMethod(val: string) {
        this.meta[TagMethod] = val;
    }

    params() {
        return this.value[KeyParams];
    }

    setParams(params: RpcValue) {
        this.value[KeyParams] = params;
    }

    resultOrError() {
        if (Object.hasOwn(this.value, KeyError)) {
            if (!isIMap(this.value[KeyError])) {
                return new ProtocolError('Response had an error, but this error was not a map');
            }

            const errorMap = this.value[KeyError];
            if (typeof errorMap[ERROR_CODE] !== 'number') {
                return new ProtocolError('Response had an error, but this error did not contain at least an error code');
            }

            const code = errorMap[ERROR_CODE] as unknown;

            const errorTypeCtor = (() => {
                switch (code) {
                    case ErrorCode.InvalidRequest: return InvalidRequest;
                    case ErrorCode.MethodNotFound: return MethodNotFound;
                    case ErrorCode.InvalidParams: return InvalidParams;
                    case ErrorCode.InternalError: return InternalError;
                    case ErrorCode.ParseError: return ParseError;
                    case ErrorCode.MethodCallTimeout: return MethodCallTimeout;
                    case ErrorCode.MethodCallCancelled: return MethodCallCancelled;
                    case ErrorCode.MethodCallException: return MethodCallException;
                    case ErrorCode.Unknown: return Unknown;
                    case ErrorCode.LoginRequired: return LoginRequired;
                    case ErrorCode.UserIDRequired: return UserIDRequired;
                    case ErrorCode.NotImplemented: return NotImplemented;
                    default: return Unknown;
                }
            })();

            return new errorTypeCtor(this.value[KeyError] as unknown as ErrorMap);
        }

        if (Object.hasOwn(this.value, KeyResult)) {
            return this.value[KeyResult];
        }

        return new ProtocolError('Response included neither result nor error');
    }

    setResult(result: RpcValue) {
        this.value[KeyResult] = result;
    }

    setError(error: string) {
        this.value[KeyError] = error;
    }

    toCpon() {
        return toCpon(new RpcValueWithMetaData(this.value, this.meta));
    }

    toChainPack() {
        return toChainPack(new RpcValueWithMetaData(this.value, this.meta));
    }
}

export type RpcResponse<T = RpcValue> = T | Error;

export {RpcMessage, RpcError, ErrorCode};
