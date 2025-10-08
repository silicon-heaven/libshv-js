import {Double, IMap, MetaMap, RpcValue, type RpcValueWithMetaData} from './rpcvalue';

export const RPC_MESSAGE_REQUEST_ID = 8;
export const RPC_MESSAGE_SHV_PATH = 9;
export const RPC_MESSAGE_METHOD = 10;
export const RPC_MESSAGE_CALLER_IDS = 11;
export const RPC_MESSAGE_ACCESS_LEVEL = 17;

export const RPC_MESSAGE_PARAMS = 1;
export const RPC_MESSAGE_RESULT = 2;
export const RPC_MESSAGE_ERROR = 3;
export const RPC_MESSAGE_DELAY = 4;
export const RPC_MESSAGE_ABORT = 5;

export const ERROR_CODE = 1;
export const ERROR_MESSAGE = 2;
export const ERROR_DATA = 3;

export enum ErrorCode {
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

export type ErrorMap = IMap<{
    [ERROR_CODE]: number;
    [ERROR_MESSAGE]?: string | undefined;
    [ERROR_DATA]?: RpcValue;
}>;

type RpcRequestMeta = MetaMap<{
    [RPC_MESSAGE_REQUEST_ID]: number;
    [RPC_MESSAGE_SHV_PATH]: string;
    [RPC_MESSAGE_METHOD]: string;
    [RPC_MESSAGE_CALLER_IDS]?: number | number[] | undefined;
    [RPC_MESSAGE_ACCESS_LEVEL]?: number | undefined;
}>;

type RpcRequestValue = IMap<{
    [RPC_MESSAGE_PARAMS]?: RpcValue;
}> | IMap<{
    [RPC_MESSAGE_ABORT]: boolean;
}>;

export type RpcRequest = RpcValueWithMetaData<RpcRequestMeta, RpcRequestValue>;

type RpcResponseMeta = MetaMap<{
    [RPC_MESSAGE_REQUEST_ID]: number;
    [RPC_MESSAGE_CALLER_IDS]?: number | number[] | undefined;
}>;

export type RpcResponseValue = IMap<{
    [RPC_MESSAGE_RESULT]: RpcValue;
}> | IMap<{
    [RPC_MESSAGE_ERROR]: ErrorMap;
}> | IMap<{
    [RPC_MESSAGE_DELAY]: Double;
}>;

export type RpcResponse = RpcValueWithMetaData<RpcResponseMeta, RpcResponseValue>;

type RpcSignalMeta = MetaMap<{
    [RPC_MESSAGE_SHV_PATH]: string;
    [RPC_MESSAGE_METHOD]: string;
}>;
type RpcSignalValue = IMap<{
    [RPC_MESSAGE_PARAMS]?: RpcValue;
}>;
export type RpcSignal = RpcValueWithMetaData<RpcSignalMeta, RpcSignalValue>;

export type RpcMessage = RpcRequest | RpcResponse | RpcSignal;

export const isSignal = (message: RpcMessage): message is RpcSignal => !(RPC_MESSAGE_REQUEST_ID in message.meta) && RPC_MESSAGE_METHOD in message.meta;
export const isRequest = (message: RpcMessage): message is RpcRequest => RPC_MESSAGE_REQUEST_ID in message.meta && RPC_MESSAGE_METHOD in message.meta;
export const isResponse = (message: RpcMessage): message is RpcResponse => RPC_MESSAGE_REQUEST_ID in message.meta && !(RPC_MESSAGE_METHOD in message.meta);
