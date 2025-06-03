import * as z from './zod';

export const RPC_MESSAGE_REQUEST_ID = 8;
export const RPC_MESSAGE_SHV_PATH = 9;
export const RPC_MESSAGE_METHOD = 10;
export const RPC_MESSAGE_CALLER_IDS = 11;

export const RPC_MESSAGE_PARAMS = 1;
export const RPC_MESSAGE_RESULT = 2;
export const RPC_MESSAGE_ERROR = 3;

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

const ErrorMapZod = z.imap({
    [ERROR_CODE]: z.number(),
    [ERROR_MESSAGE]: z.string().optional(),
    [ERROR_DATA]: z.rpcvalue().optional(),
});

export type ErrorMap = z.infer<typeof ErrorMapZod>;

const RpcRequestMetaZod = z.metamap({
    [RPC_MESSAGE_CALLER_IDS]: z.int().or(z.array(z.int())).optional(),
    [RPC_MESSAGE_REQUEST_ID]: z.number(),
    [RPC_MESSAGE_METHOD]: z.string(),
    [RPC_MESSAGE_SHV_PATH]: z.string(),
});

const RpcRequestValueZod = z.imap({
    [RPC_MESSAGE_PARAMS]: z.rpcvalue().optional(),
});

const RpcResponseMetaZod = z.metamap({
    [RPC_MESSAGE_CALLER_IDS]: z.int().or(z.array(z.int())).optional(),
    [RPC_MESSAGE_REQUEST_ID]: z.number(),
});
const RpcResponseValueZod = z.imap({
    [RPC_MESSAGE_RESULT]: z.rpcvalue(),
}).or(z.imap({
    [RPC_MESSAGE_ERROR]: ErrorMapZod,
}));

const RpcSignalMetaZod = z.metamap({
    [RPC_MESSAGE_SHV_PATH]: z.string(),
    [RPC_MESSAGE_METHOD]: z.string(),
});
const RpcSignalValueZod = z.imap({
    [RPC_MESSAGE_PARAMS]: z.rpcvalue().optional(),
});

const RpcRequestZod = z.withMeta(RpcRequestMetaZod, RpcRequestValueZod);
const RpcResponseZod = z.withMeta(RpcResponseMetaZod, RpcResponseValueZod);
const RpcSignalZod = z.withMeta(RpcSignalMetaZod, RpcSignalValueZod);
const RpcMessageZod = z.union([RpcRequestZod, RpcResponseZod, RpcSignalZod]);
export type RpcRequest = z.infer<typeof RpcRequestZod>;
export type RpcResponse = z.infer<typeof RpcResponseZod>;
export type RpcResponseValue = z.infer<typeof RpcResponseValueZod>;
export type RpcSignal = z.infer<typeof RpcSignalZod>;
export type RpcMessage = z.infer<typeof RpcMessageZod>;

export const isSignal = (message: RpcMessage): message is RpcSignal => !(RPC_MESSAGE_REQUEST_ID in message.meta) && RPC_MESSAGE_METHOD in message.meta;
export const isRequest = (message: RpcMessage): message is RpcRequest => RPC_MESSAGE_REQUEST_ID in message.meta && RPC_MESSAGE_METHOD in message.meta;
export const isResponse = (message: RpcMessage): message is RpcResponse => RPC_MESSAGE_REQUEST_ID in message.meta && !(RPC_MESSAGE_METHOD in message.meta);

export {RpcMessageZod, ErrorCode};
