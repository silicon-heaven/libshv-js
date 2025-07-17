import {accessLevelFromAccessString} from './access';
import {ChainPackReader, CHAINPACK_PROTOCOL_TYPE, ChainPackWriter, toChainPack} from './chainpack';
import {type CponReader, CPON_PROTOCOL_TYPE, toCpon} from './cpon';
import {ERROR_MESSAGE, ErrorCode, ERROR_CODE, RpcMessageZod, type RpcMessage, isSignal, isRequest, type RpcRequest, isResponse, ERROR_DATA, type ErrorMap, RPC_MESSAGE_METHOD, RPC_MESSAGE_SHV_PATH, RPC_MESSAGE_REQUEST_ID, RPC_MESSAGE_PARAMS, RPC_MESSAGE_ERROR, RPC_MESSAGE_RESULT, RPC_MESSAGE_CALLER_IDS, RpcResponseValue, RPC_MESSAGE_DELAY, RPC_MESSAGE_ABORT, RpcSignal, RpcResponse, RPC_MESSAGE_ACCESS_LEVEL} from './rpcmessage';
import {type RpcValue, type Null, type Int, type IMap, type ShvMap, makeMap, makeIMap, RpcValueWithMetaData, makeMetaMap, Double} from './rpcvalue';
import * as z from './zod';

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_PING_INTERVAL = 30 * 1000;

const dataToRpcValue = (buff: ArrayBuffer) => {
    const rd: ChainPackReader | CponReader = new ChainPackReader(buff);
    rd.readUIntData();
    const proto = rd.ctx.getByte();
    switch (proto) {
        case CHAINPACK_PROTOCOL_TYPE:
            break;
        case CPON_PROTOCOL_TYPE:
            throw new Error('CPON protocol type is not supported anymore');
        default:
            throw new Error(`Unsupported protocol type ${proto}`);
    }

    const rpcVal = rd.read();
    return rpcVal;
};

type SubscriptionCallback = (path: string, method: string, param?: RpcValue) => void;

type ResultOrError<T = RpcValue> = T | Error;

type RpcResponseResolver = (rpc_msg: ResultOrError) => void;

type Subscription = {
    subscriber: string;
    path: string;
    method: string;
    callback: SubscriptionCallback;
};

type Login = {
    type: 'PLAIN';
    user: string;
    password: string;
} | {
    type: 'TOKEN';
    token: string;
};

type WsClientOptionsCommon = {
    logDebug: (...args: string[]) => void;
    wsUri: string;
};

export class RequestHandler {
    constructor(public options: {
        result: Promise<RpcValue>;
        onAbort?: () => void;
        onProgressQuery?: () => number | Promise<number>;
    }) {
        /* nothing */
    }
}

export const LsParamZod = z.undefined().or(z.string());
export const DirParamZod = z.undefined().or(z.boolean()).or(z.string());
type DirParam = z.infer<typeof DirParamZod>;

export type DirEntry = IMap<{
    [DIR_NAME]: string;
    [DIR_FLAGS]: DirFlags;
    [DIR_PARAM]: string | Null;
    [DIR_RESULT]: string | Null;
    [DIR_ACCESS]: Int;
    [DIR_SIGNALS]: ShvMap<Record<string, string | Null>>;
    [DIR_EXTRA]: ShvMap;
}>;

export type DirResult = DirEntry[];

export type MethodHandler = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paramParser: z.ZodType<any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (shvPath: string, method: string, params: any, delay: (progress: number) => void) => Promise<RpcValue> | RpcValue | RequestHandler,
};

type WsClientOptionsLogin = WsClientOptionsCommon & {
    mountPoint?: string;
    login: Login;
    timeout?: number;
    pingInterval?: number;
    onConnected: () => void;
    onConnectionFailure: (error: Error) => void;
    onDisconnected: () => void;
    onRequest: (shvPath: string) => Array<{entry: DirEntry} & MethodHandler> | undefined;
};

type WsClientOptionsWorkflows = WsClientOptionsCommon & {
    onWorkflows: (workflows: RpcValue) => void;
    onWorkflowsFailed: () => void;
};

type WsClientOptions = WsClientOptionsLogin | WsClientOptionsWorkflows;

type LsResult = string[];
export enum DirFlags {
    Reserved = 1,
    Getter = 2,
    Setter = 4,
    LargeResultHint = 8,
    NotIdempotent = 16,
    RequiresClientId = 32,
}
export const DIR_NAME = 1;
export const DIR_FLAGS = 2;
export const DIR_PARAM = 3;
export const DIR_RESULT = 4;
export const DIR_ACCESS = 5;
export const DIR_SIGNALS = 6;
export const DIR_EXTRA = 63;

class RpcError extends Error {
    constructor(readonly err_info: ErrorMap) {
        const errorCodeToMessage = (code: ErrorMap[typeof ERROR_CODE]) => {
            switch (code) {
                case ErrorCode.InvalidRequest: return 'InvalidRequest';
                case ErrorCode.MethodNotFound: return 'MethodNotFound';
                case ErrorCode.InvalidParams: return 'InvalidParams';
                case ErrorCode.InternalError: return 'InternalError';
                case ErrorCode.ParseError: return 'ParseError';
                case ErrorCode.MethodCallTimeout: return 'MethodCallTimeout';
                case ErrorCode.MethodCallCancelled: return 'MethodCallCancelled';
                case ErrorCode.MethodCallException: return 'MethodCallException';
                case ErrorCode.Unknown: return 'Unknown';
                case ErrorCode.LoginRequired: return 'LoginRequired';
                case ErrorCode.UserIDRequired: return 'UserIDRequired';
                case ErrorCode.NotImplemented: return 'NotImplemented';
                default: return 'Unknown RpcError';
            }
        };

        super(err_info[ERROR_MESSAGE] ?? `${errorCodeToMessage(err_info[ERROR_CODE])} (${err_info[ERROR_CODE]})`);
    }

    data() {
        return this.err_info[ERROR_DATA];
    }
}

const makeErrInfo = (errInfoOrMsg: ErrorMap | string, code: ErrorCode) => {
    if (typeof errInfoOrMsg === 'object') {
        return errInfoOrMsg;
    }

    return makeIMap({
        [ERROR_CODE]: code,
        [ERROR_MESSAGE]: errInfoOrMsg,
        [ERROR_DATA]: undefined,
    });
};

const createErrorClass = (code: ErrorCode) => class extends RpcError {
    constructor(errInfoOrMsg: ErrorMap | string) {
        super(makeErrInfo(errInfoOrMsg, code));
    }
};

/* eslint-disable @typescript-eslint/naming-convention */
export const InvalidRequest = createErrorClass(ErrorCode.InvalidRequest);
export const MethodNotFound = createErrorClass(ErrorCode.MethodNotFound);
export const InvalidParams = createErrorClass(ErrorCode.InvalidParams);
export const InternalError = createErrorClass(ErrorCode.InternalError);
export const ParseError = createErrorClass(ErrorCode.ParseError);
export const MethodCallTimeout = createErrorClass(ErrorCode.MethodCallTimeout);
export const MethodCallCancelled = createErrorClass(ErrorCode.MethodCallCancelled);
export const MethodCallException = createErrorClass(ErrorCode.MethodCallException);
export const Unknown = createErrorClass(ErrorCode.Unknown);
export const LoginRequired = createErrorClass(ErrorCode.LoginRequired);
export const UserIDRequired = createErrorClass(ErrorCode.UserIDRequired);
export const NotImplemented = createErrorClass(ErrorCode.NotImplemented);
/* eslint-enable @typescript-eslint/naming-convention */

const makeTimeout = (ms: number, resolve: RpcResponseResolver) => globalThis.setTimeout(() => {
    resolve(new MethodCallTimeout(makeIMap({
        [ERROR_CODE]: ErrorCode.MethodCallTimeout,
        [ERROR_MESSAGE]: `Shv call timeout after: ${ms} msec.`,
        [ERROR_DATA]: undefined,
    })));
}, ms);

class RpcRequestPromise<Result> extends Promise<Result> {
    constructor(executor: (resolve: (value: Result | PromiseLike<Result>) => void, reject: (reason?: unknown) => void) => void, public readonly abort: () => void, public readonly progressQuery: () => void) {
        super(executor);
    }
}

class WsClient {
    private requestId = 1;
    private pingTimerId: ReturnType<typeof globalThis.setInterval> | undefined = undefined;
    private rpcHandlers: Array<{
        resolve: RpcResponseResolver;
        delayCallback?: (progress: number) => void;
        timeout_handle: ReturnType<typeof globalThis.setTimeout>;
    }> = [];
    private requestHandlers = new Map<number, RequestHandler>();
    private abortedRequests = new Set<number>();
    private readonly subscriptions: Subscription[] = [];
    private readonly websocket: WebSocket;
    private readonly options: WsClientOptions;
    private readonly timeout: number;

    constructor(options: WsClientOptions) {
        if (typeof options !== 'object') {
            throw new TypeError('No options object supplied');
        }

        this.options = options;
        this.timeout = 'timeout' in options && options.timeout !== undefined ? options.timeout : DEFAULT_TIMEOUT;

        this.websocket = new WebSocket(options.wsUri);
        this.websocket.binaryType = 'arraybuffer';

        const handleSignal = (signal: RpcSignal) => {
            for (const sub of this.subscriptions) {
                const shvPath = signal.meta[RPC_MESSAGE_SHV_PATH];
                const method = signal.meta[RPC_MESSAGE_METHOD];

                if (shvPath.startsWith(sub.path) && method === sub.method) {
                    sub.callback(shvPath, method, signal.value[RPC_MESSAGE_PARAMS]);
                }
            }
        };

        // eslint-disable-next-line complexity
        const handleRequest = async (request: RpcRequest) => {
            if ('onRequest' in this.options) {
                const requestId = request.meta[RPC_MESSAGE_REQUEST_ID];
                const respond = (value: RpcResponseValue) => {
                    this.sendRpcMessage(new RpcValueWithMetaData(
                        makeMetaMap({
                            [RPC_MESSAGE_CALLER_IDS]: request.meta[RPC_MESSAGE_CALLER_IDS],
                            [RPC_MESSAGE_REQUEST_ID]: requestId,
                        }),
                        value,
                    ));
                };

                const sendDelay = (progress: number) => {
                    respond(makeIMap({
                        [RPC_MESSAGE_DELAY]: new Double(progress),
                    }));
                };

                if (RPC_MESSAGE_ABORT in request.value) {
                    const requestHandler = this.requestHandlers.get(requestId);

                    if (request.value[RPC_MESSAGE_ABORT] === true && requestHandler?.options.onAbort !== undefined) {
                        this.abortedRequests.add(requestId);
                        requestHandler.options.onAbort();
                    }

                    if (request.value[RPC_MESSAGE_ABORT] === false && requestHandler?.options.onProgressQuery !== undefined) {
                        const progress = requestHandler.options.onProgressQuery();
                        sendDelay(progress instanceof Promise ? await progress : progress);
                    }

                    return;
                }

                try {
                    const shvPath = request.meta[RPC_MESSAGE_SHV_PATH];
                    const methodName = request.meta[RPC_MESSAGE_METHOD];
                    const unhandledMethod = () => {
                        throw new MethodNotFound(`No such path '${shvPath}' or method '${methodName}' or insufficient access rights.`);
                    };

                    const accessLevel = request.meta[RPC_MESSAGE_ACCESS_LEVEL];
                    if (accessLevel === undefined) {
                        unhandledMethod();
                        return;
                    }

                    const methods = this.options.onRequest(shvPath);
                    if (methods === undefined) {
                        unhandledMethod();
                        return;
                    }

                    const methodDefinition = ((): {entry: DirEntry} & MethodHandler | undefined => {
                        const dirEntry = makeIMap({
                            [DIR_NAME]: 'dir',
                            [DIR_FLAGS]: 0,
                            [DIR_PARAM]: 'DirParam',
                            [DIR_RESULT]: 'DirResult',
                            [DIR_ACCESS]: accessLevelFromAccessString('bws'),
                            [DIR_SIGNALS]: makeMap({}),
                            [DIR_EXTRA]: makeMap({}),
                        });
                        switch (methodName) {
                            case 'dir':
                                return {
                                    entry: dirEntry,
                                    paramParser: DirParamZod,
                                    handler(_shvPath, _method, param: DirParam) {
                                        const methodsResult = [dirEntry, ...methods.map(method => method.entry)];
                                        switch (true) {
                                            case typeof param === 'string':
                                                return methodsResult.find(method => method[DIR_NAME] === param) ?? false;
                                            case typeof param === 'boolean':
                                            case param === undefined:
                                                return methodsResult;
                                        }
                                    },
                                };
                            default:
                                return methods.find(method => method.entry[DIR_NAME] === methodName);
                        }
                    })();

                    if (methodDefinition === undefined) {
                        unhandledMethod();
                        return;
                    }

                    if (accessLevel < methodDefinition.entry[DIR_ACCESS]) {
                        unhandledMethod();
                        return;
                    }

                    const requestParam = request.value[RPC_MESSAGE_PARAMS];
                    const parsedParam = methodDefinition.paramParser.safeParse(requestParam);
                    if (!parsedParam.success) {
                        throw new InvalidParams(`Unexpected param for method ${methodName} on path ${shvPath}: ${toCpon(requestParam)}`);
                    }

                    let result = methodDefinition.handler(
                        shvPath,
                        methodName,
                        parsedParam.data,
                        sendDelay,
                    );
                    if (result instanceof RequestHandler) {
                        this.requestHandlers.set(requestId, result);
                        result = result.options.result;
                    }

                    const resultOrError = makeIMap({
                        [RPC_MESSAGE_RESULT]: result instanceof Promise ? await result : result,
                    });

                    if (!this.abortedRequests.has(requestId)) {
                        respond(resultOrError);
                    } else {
                        this.abortedRequests.delete(requestId);
                    }

                    if (requestId in this.requestHandlers) {
                        this.requestHandlers.delete(requestId);
                    }
                } catch (error: unknown) {
                    const sendError = (error: RpcError) => {
                        respond(makeIMap({
                            [RPC_MESSAGE_ERROR]: error.err_info,
                        }));
                    };

                    switch (true) {
                        case error instanceof RpcError:
                            sendError(error);
                            break;
                        case error instanceof Error:
                            sendError(new InternalError(error.message));
                            break;
                        default:
                            sendError(new InternalError('Unknown error'));
                            break;
                    }
                }
            }
        };

        const handleResponse = (response: RpcResponse) => {
            const requestId = response.meta[RPC_MESSAGE_REQUEST_ID];

            if (this.rpcHandlers[Number(requestId)] !== undefined) {
                const handler = this.rpcHandlers[Number(requestId)];
                clearTimeout(handler.timeout_handle);

                if (RPC_MESSAGE_DELAY in response.value) {
                    if (handler.delayCallback !== undefined) {
                        handler.delayCallback(response.value[RPC_MESSAGE_DELAY].value);
                    }

                    handler.timeout_handle = makeTimeout(this.timeout, handler.resolve);
                    return;
                }

                handler.resolve((() => {
                    if (RPC_MESSAGE_ERROR in response.value) {
                        const code = response.value[RPC_MESSAGE_ERROR][ERROR_CODE] as unknown;
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        const ErrorTypeCtor = (() => {
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

                        return new ErrorTypeCtor(response.value[RPC_MESSAGE_ERROR]);
                    }

                    if (RPC_MESSAGE_RESULT in response.value) {
                        return response.value[RPC_MESSAGE_RESULT];
                    }

                    // At this point, the RpcResponse either has:
                    // - no keys, which means that the response has an implicit Null result.
                    // - has some unknown keys, in which case we will produce an error for the client.
                    // https://silicon-heaven.github.io/shv-doc/rpcmessage.html#response
                    const rpcMessageKeys = Object.keys(response.value);
                    if (rpcMessageKeys.length !== 0) {
                        return new NotImplemented(`Got an RpcResponse with unsupported keys: ${rpcMessageKeys.join(' ')}`);
                    }
                })());
                // eslint-disable-next-line @typescript-eslint/no-array-delete
                delete this.rpcHandlers[Number(requestId)];
            }
        };

        this.websocket.addEventListener('message', async (evt: MessageEvent<ArrayBuffer>) => {
            const rpcVal = dataToRpcValue(evt.data);

            const rpcMsg = RpcMessageZod.parse(rpcVal);
            this.logDebug(`message received: ${toCpon(rpcMsg)}`);

            if (isSignal(rpcMsg)) {
                handleSignal(rpcMsg);
            } else if (isRequest(rpcMsg)) {
                await handleRequest(rpcMsg);
            } else if (isResponse(rpcMsg)) {
                handleResponse(rpcMsg);
            }
        });

        this.websocket.addEventListener('error', evt => {
            console.log('WebSocket ERROR', evt);
            this.logDebug('WebSocket ERROR');
        });

        if ('onWorkflows' in this.options) {
            this.workflowsProcedure(this.options);
        } else {
            this.loginProcedure(this.options);
        }
    }

    callRpcMethod(shvPath: '.broker/currentClient', method: 'accessGrantForMethodCall', params: [string, string], delayCallback?: (progress: number) => void): RpcRequestPromise<ResultOrError<string>>;
    callRpcMethod(shvPath: string | undefined, method: 'dir', params?: RpcValue, delayCallback?: (progress: number) => void): RpcRequestPromise<ResultOrError<DirResult>>;
    callRpcMethod(shvPath: string | undefined, method: 'ls', params?: RpcValue, delayCallback?: (progress: number) => void): RpcRequestPromise<ResultOrError<LsResult>>;
    callRpcMethod(shvPath: string | undefined, method: string, params?: RpcValue, delayCallback?: (progress: number) => void): RpcRequestPromise<ResultOrError>;
    callRpcMethod(shvPath: string | undefined, method: string, params?: RpcValue, delayCallback?: (progress: number) => void): RpcRequestPromise<ResultOrError> {
        const rqId = this.requestId++;
        const makeRq = (value: IMap) => new RpcValueWithMetaData(makeMetaMap({
            [RPC_MESSAGE_CALLER_IDS]: undefined,
            [RPC_MESSAGE_REQUEST_ID]: rqId,
            [RPC_MESSAGE_METHOD]: method ?? '',
            [RPC_MESSAGE_SHV_PATH]: shvPath ?? '',
        }), value);
        const rq: RpcRequest = makeRq(makeIMap({
            [RPC_MESSAGE_PARAMS]: params,
        }));

        this.sendRpcMessage(rq);

        const promise = new RpcRequestPromise<ResultOrError>(resolve => {
            this.rpcHandlers[rqId] = {resolve, timeout_handle: makeTimeout(this.timeout, resolve), delayCallback};
        }, () => {
            this.sendRpcMessage(makeRq(makeIMap({
                [RPC_MESSAGE_ABORT]: true,
            })));
        }, () => {
            this.sendRpcMessage(makeRq(makeIMap({
                [RPC_MESSAGE_ABORT]: false,
            })));
        });

        return promise;
    }

    sendRpcMessage(rpcMsg: RpcMessage) {
        if (this.websocket.readyState === WebSocket.OPEN) {
            this.logDebug('sending rpc message:', toCpon(rpcMsg));
            const msgData = new Uint8Array(toChainPack(rpcMsg));

            const wr = new ChainPackWriter();
            wr.writeUIntData(msgData.length + 1);
            const dgram = new Uint8Array(wr.ctx.length + 1 + msgData.length);
            let ix = 0;
            for (let i = 0; i < wr.ctx.length; i++) {
                dgram[ix++] = wr.ctx.data[i];
            }

            dgram[ix++] = CHAINPACK_PROTOCOL_TYPE;

            for (const msgDatum of msgData) {
                dgram[ix++] = msgDatum;
            }

            this.websocket.send(dgram.buffer);
        }
    }

    subscribe(subscriber: string, path: string, method: string, callback: SubscriptionCallback) {
        if (this.subscriptions.some(val => val.subscriber === subscriber && val.path === path && val.method === method)) {
            this.logDebug(`Already subscribed {$path}:${method} for subscriber ${subscriber}`);
            return;
        }

        // If this path:method has not been subscribed on the broker, do it now
        if (!this.subscriptions.some(val => val.path === path && val.method === method)) {
            this.callRpcMethod('.broker/app', 'subscribe', makeMap({
                method, path,
            })).catch(() => {
                this.logDebug(`Couldn't subscribe to ${path}, ${method}`);
            });
        }

        this.subscriptions.push({
            subscriber,
            path,
            method,
            callback,
        });
    }

    unsubscribe(subscriber: string, path: string, method: string) {
        const idx = this.subscriptions.findIndex(val => val.subscriber === subscriber && val.path === path && val.method === method);
        if (idx === -1) {
            this.logDebug(`No such subscription ${path}:${method} for subscriber ${subscriber}`);
            return;
        }

        this.subscriptions.splice(idx, 1);
        // Unsubscribe on the broker only if there are no other subscriptions of this path:method
        if (this.subscriptions.some(val => val.path === path && val.method === method)) {
            return;
        }

        this.callRpcMethod('.broker/app', 'unsubscribe', makeMap({
            method, path,
        })).catch(() => {
            this.logDebug(`Couldn't unsubscribe ${path}, ${method}`);
        });
    }

    sendPing() {
        this.callRpcMethod('.broker/app', 'ping').catch((error: unknown) => {
            console.log('Failed to send ping:', error);
        });
    }

    accessGrantForMethodCall(path: string, method: string) {
        return this.callRpcMethod('.broker/currentClient', 'accessGrantForMethodCall', [path, method]);
    }

    close() {
        this.websocket.close();
    }

    private logDebug(...args: string[]) {
        if (this.options.logDebug === undefined) {
            return;
        }

        this.options.logDebug(...args);
    }

    private workflowsProcedure(options: WsClientOptionsWorkflows) {
        let workflowsObtained = false;
        this.websocket.addEventListener('open', () => {
            this.options.logDebug('CONNECTED');
            const handleConnectionError = (error: Error) => {
                this.logDebug('FAILURE: couldn\'t retrieve workflows', error.message);
                options.onWorkflowsFailed();
            };

            this.callRpcMethod(undefined, 'workflows').then(response => {
                if (response instanceof Error) {
                    handleConnectionError(response);
                    return;
                }

                workflowsObtained = true;
                options.onWorkflows(response);

                this.close();
            }).catch(() => {
                options.onWorkflowsFailed();
            });
        });

        this.websocket.addEventListener('close', () => {
            this.logDebug('DISCONNECTED');
            if (!workflowsObtained) {
                options.onWorkflowsFailed();
            }
        });
    }

    private loginProcedure(options: WsClientOptionsLogin) {
        this.websocket.addEventListener('open', () => {
            this.options.logDebug('CONNECTED');
            const handleConnectionError = (error: Error) => {
                this.logDebug('FAILURE: couldn\'t perform initial handshake', error.message);
                options.onConnectionFailure(error);
            };

            const handleLoginResponse = (response: unknown) => {
                if (response instanceof Error) {
                    handleConnectionError(response);
                    return;
                }

                this.logDebug('SUCCESS: connected to shv broker');
                options.onConnected();
                this.pingTimerId = globalThis.setInterval(() => {
                    this.sendPing();
                }, options.pingInterval ?? DEFAULT_PING_INTERVAL);
            };

            const makeLoginParams = (loginMap: ShvMap) => makeMap({
                login: loginMap,
                options: makeMap({
                    device: typeof options.mountPoint === 'string' ? makeMap({mountPoint: options.mountPoint}) : undefined,
                }),
            });

            this.callRpcMethod(undefined, 'hello').then(response => {
                if (response instanceof Error) {
                    handleConnectionError(response);
                    return;
                }

                const makeLoginMap = () => {
                    switch (options.login.type) {
                        case 'PLAIN':
                            return makeMap({
                                password: options.login.password,
                                type: options.login.type,
                                user: options.login.user,
                            });
                        case 'TOKEN':
                            return makeMap({
                                token: options.login.token,
                                type: options.login.type,
                            });
                    }
                };

                return this.callRpcMethod(undefined, 'login', makeLoginParams(makeLoginMap()));
            }).then(handleLoginResponse).catch(() => {
                this.logDebug('FAILURE: couldn\' connected to shv broker');
            });
        });

        this.websocket.addEventListener('close', () => {
            this.logDebug('DISCONNECTED');
            this.subscriptions.length = 0;
            options.onDisconnected();
            globalThis.clearInterval(this.pingTimerId);
        });
    }
}

export {WsClient};
