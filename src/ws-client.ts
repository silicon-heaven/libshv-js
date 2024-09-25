import {ChainPackReader, CHAINPACK_PROTOCOL_TYPE, ChainPackWriter, toChainPack} from './chainpack';
import {type CponReader, CPON_PROTOCOL_TYPE, toCpon} from './cpon';
import {ERROR_MESSAGE, ErrorCode, ERROR_CODE, RpcMessageZod, type RpcMessage, isSignal, isRequest, type RpcRequest, isResponse, ERROR_DATA, type ErrorMap, RPC_MESSAGE_METHOD, RPC_MESSAGE_SHV_PATH, RPC_MESSAGE_REQUEST_ID, RPC_MESSAGE_PARAMS, RPC_MESSAGE_ERROR, RPC_MESSAGE_RESULT} from './rpcmessage';
import {type RpcValue, type Null, type Int, type IMap, type ShvMap, makeMap, makeIMap, RpcValueWithMetaData, makeMetaMap} from './rpcvalue';

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

type WsClientOptions = {
    logDebug: (...args: string[]) => void;
    mountPoint?: string;
    user?: string;
    password: string;
    loginType?: 'PLAIN' | 'AZURE';
    timeout?: number;
    pingInterval?: number;
    wsUri: string;
    onConnected: () => void;
    onConnectionFailure: (error: Error) => void;
    onDisconnected: () => void;
    onRequest: (rpc_msg: RpcRequest) => void;
};

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
type DirResult = Array<IMap<{
    [DIR_NAME]: string;
    [DIR_FLAGS]: DirFlags;
    [DIR_PARAM]: string | Null;
    [DIR_RESULT]: string | Null;
    [DIR_ACCESS]: Int;
    [DIR_SIGNALS]: ShvMap<Record<string, string | Null>>;
    [DIR_EXTRA]: ShvMap;
}>>;

class RpcError extends Error {
    constructor(private readonly err_info: ErrorMap) {
        super(err_info[ERROR_MESSAGE] ?? 'Unknown RpcError');
    }

    data() {
        return this.err_info[ERROR_DATA];
    }
}

class ProtocolError extends Error {}

class InvalidRequest extends RpcError {}
class MethodNotFound extends RpcError {}
class InvalidParams extends RpcError {}
class InternalError extends RpcError {}
class ParseError extends RpcError {}
class MethodCallTimeout extends RpcError {}
class MethodCallCancelled extends RpcError {}
class MethodCallException extends RpcError {}
class Unknown extends RpcError {}
class LoginRequired extends RpcError {}
class UserIDRequired extends RpcError {}
class NotImplemented extends RpcError {}

class WsClient {
    requestId = 1;
    pingTimerId = -1;

    rpcHandlers: Array<{
        resolve: RpcResponseResolver;
        timeout_handle: number;
    }> = [];

    subscriptions: Subscription[] = [];
    websocket: WebSocket;

    logDebug: WsClientOptions['logDebug'];
    mountPoint: WsClientOptions['mountPoint'];
    user?: WsClientOptions['user'];
    password: WsClientOptions['password'];
    loginType: WsClientOptions['loginType'];
    onConnected: WsClientOptions['onConnected'];
    onConnectionFailure: WsClientOptions['onConnectionFailure'];
    onDisconnected: WsClientOptions['onDisconnected'];
    onRequest: WsClientOptions['onRequest'];
    timeout: WsClientOptions['timeout'];
    pingInterval: WsClientOptions['pingInterval'];

    constructor(options: WsClientOptions) {
        if (typeof options !== 'object') {
            throw new TypeError('No options object supplied');
        }

        this.logDebug = options.logDebug ?? (() => {/* nothing */});
        this.mountPoint = options.mountPoint;

        this.user = options.user ?? '';
        this.password = options.password;
        this.loginType = options.loginType ?? 'PLAIN';

        this.websocket = new WebSocket(options.wsUri);
        this.websocket.binaryType = 'arraybuffer';

        this.pingInterval = options.pingInterval ?? DEFAULT_PING_INTERVAL;
        this.onConnected = options.onConnected ?? (() => {/* nothing */});
        this.onConnectionFailure = options.onConnectionFailure ?? (() => {/* nothing */});
        this.onDisconnected = options.onDisconnected ?? (() => {/* nothing */});
        this.onRequest = options.onRequest ?? (() => {/* nothing */});

        this.timeout = options.timeout ?? DEFAULT_TIMEOUT;

        this.websocket.addEventListener('open', () => {
            this.logDebug('CONNECTED');
            const handleConnectionError = (error: Error) => {
                this.logDebug('FAILURE: couldn\'t perform initial handshake', error.message);
                this.onConnectionFailure(error);
            };

            this.callRpcMethod(undefined, 'hello').then(response => {
                if (response instanceof Error) {
                    handleConnectionError(response);
                    return;
                }

                const params = makeMap({
                    login: makeMap({
                        password: this.password,
                        type: this.loginType,
                        user: this.user,
                    }),
                    options: makeMap({
                        device: this.mountPoint === 'string' ? makeMap({mountPoint: this.mountPoint}) : undefined,
                    }),
                });
                return this.callRpcMethod(undefined, 'login', params);
            }).then(response => {
                if (response instanceof Error) {
                    handleConnectionError(response);
                    return;
                }

                this.logDebug('SUCCESS: connected to shv broker');
                this.onConnected();
                this.pingTimerId = window.setInterval(() => {
                    this.sendPing();
                }, this.pingInterval);
            }).catch(() => {
                this.logDebug('FAILURE: couldn\' connected to shv broker');
            });
        });

        this.websocket.addEventListener('close', () => {
            this.logDebug('DISCONNECTED');
            this.subscriptions.length = 0;
            this.onDisconnected();
            window.clearInterval(this.pingTimerId);
        });

        this.websocket.addEventListener('message', (evt: MessageEvent<ArrayBuffer>) => {
            const rpcVal = dataToRpcValue(evt.data);
            const rpcMsg = RpcMessageZod.parse(rpcVal);
            this.logDebug(`message received: ${toCpon(rpcMsg)}`);

            if (isSignal(rpcMsg)) {
                for (const sub of this.subscriptions) {
                    const shvPath = rpcMsg.meta[RPC_MESSAGE_SHV_PATH];
                    const method = rpcMsg.meta[RPC_MESSAGE_METHOD];

                    if (shvPath.startsWith(sub.path) && method === sub.method) {
                        sub.callback(shvPath, method, rpcMsg.value[RPC_MESSAGE_PARAMS]);
                    }
                }
            } else if (isRequest(rpcMsg)) {
                this.onRequest(rpcMsg);
            } else if (isResponse(rpcMsg)) {
                const requestId = rpcMsg.meta[RPC_MESSAGE_REQUEST_ID];

                if (this.rpcHandlers[Number(requestId)] !== undefined) {
                    const handler = this.rpcHandlers[Number(requestId)];
                    clearTimeout(handler.timeout_handle);
                    handler.resolve((() => {
                        if (RPC_MESSAGE_ERROR in rpcMsg.value) {
                            const code = rpcMsg.value[RPC_MESSAGE_ERROR][ERROR_CODE] as unknown;
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

                            return new ErrorTypeCtor(rpcMsg.value[RPC_MESSAGE_ERROR]);
                        }

                        if (RPC_MESSAGE_RESULT in rpcMsg.value) {
                            return rpcMsg.value[RPC_MESSAGE_RESULT];
                        }

                        return new ProtocolError('Response included neither result nor error');
                    })());
                    // eslint-disable-next-line @typescript-eslint/no-array-delete, @typescript-eslint/no-dynamic-delete
                    delete this.rpcHandlers[Number(requestId)];
                }
            }
        });

        this.websocket.addEventListener('error', evt => {
            console.log('WebSocket ERROR', evt);
            this.logDebug('WebSocket ERROR');
        });
    }

    callRpcMethod(shv_path: '.broker/currentClient', method: 'accessGrantForMethodCall', params: [string, string]): Promise<ResultOrError<string>>;
    callRpcMethod(shv_path: string | undefined, method: 'dir', params?: RpcValue): Promise<ResultOrError<DirResult>>;
    callRpcMethod(shv_path: string | undefined, method: 'ls', params?: RpcValue): Promise<ResultOrError<LsResult>>;
    callRpcMethod(shv_path: string | undefined, method: string, params?: RpcValue): Promise<ResultOrError>;
    callRpcMethod(shv_path: string | undefined, method: string, params?: RpcValue): Promise<ResultOrError> {
        const rqId = this.requestId++;
        const rq: RpcRequest = new RpcValueWithMetaData(makeMetaMap({
            [RPC_MESSAGE_REQUEST_ID]: rqId,
            [RPC_MESSAGE_METHOD]: method ?? '',
            [RPC_MESSAGE_SHV_PATH]: shv_path ?? '',
        }), makeIMap({
            [RPC_MESSAGE_PARAMS]: params,
        }),
        );

        this.sendRpcMessage(rq);

        const promise = new Promise<ResultOrError>(resolve => {
            this.rpcHandlers[rqId] = {resolve, timeout_handle: self.setTimeout(() => {
                resolve(new MethodCallTimeout(makeIMap({
                    [ERROR_CODE]: ErrorCode.MethodCallTimeout,
                    [ERROR_MESSAGE]: `Shv call timeout after: ${this.timeout} msec.`,
                    [ERROR_DATA]: undefined,
                })));
            }, this.timeout)};
        });

        return promise;
    }

    sendRpcMessage(rpc_msg: RpcMessage) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.logDebug('sending rpc message:', toCpon(rpc_msg));
            const msgData = new Uint8Array(toChainPack(rpc_msg));

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

            this.logDebug(`sending ${dgram.length} bytes of data`);
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
}

export {WsClient};
