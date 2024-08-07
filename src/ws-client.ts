import {ChainPackReader, ChainpackProtocolType, ChainPackWriter} from './chainpack';
import {type CponReader, CponProtocolType} from './cpon';
import {ERROR_MESSAGE, ErrorCode, ERROR_CODE, RpcMessage, type RpcResponse, MethodCallTimeout} from './rpcmessage';
import {type RpcValue, type Null, Int, IMap, ShvMap} from './rpcvalue';

const DEFAULT_TIMEOUT = 5000;

const dataToRpcValue = (buff: ArrayBuffer) => {
    const rd: ChainPackReader | CponReader = new ChainPackReader(buff);
    rd.readUIntData();
    const proto = rd.ctx.getByte();
    switch (proto) {
        case ChainpackProtocolType:
            break;
        case CponProtocolType:
            throw new Error('CPON protocol type is not supported anymore');
        default:
            throw new Error(`Unsupported protocol type ${proto}`);
    }
    const rpc_val = rd.read();
    return rpc_val;
};

type SubscriptionCallback = (path: string, method: string, param?: RpcValue) => void;

type RpcResponseResolver = (rpc_msg: RpcResponse) => void;

type Subscription = {
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
    wsUri: string;
    onConnected: () => void;
    onDisconnected: () => void;
    onRequest: (rpc_msg: RpcMessage) => void;
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
    [DIR_FLAGS]: Int<DirFlags>;
    [DIR_PARAM]: string | Null;
    [DIR_RESULT]: string | Null;
    [DIR_ACCESS]: Int;
    [DIR_SIGNALS]: ShvMap<Record<string, string | Null>>;
    [DIR_EXTRA]: ShvMap;
}>>;

class WsClient {
    requestId = 1;
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
    onDisconnected: WsClientOptions['onDisconnected'];
    onRequest: WsClientOptions['onRequest'];
    timeout: WsClientOptions['timeout'];

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

        this.onConnected = options.onConnected ?? (() => {/* nothing */});
        this.onDisconnected = options.onDisconnected ?? (() => {/* nothing */});
        this.onRequest = options.onRequest ?? (() => {/* nothing */});

        this.timeout = options.timeout ?? DEFAULT_TIMEOUT;

        this.websocket.addEventListener('open', () => {
            this.logDebug('CONNECTED');
            this.callRpcMethod(undefined, 'hello').then(() => {
                const params = new ShvMap({
                    login: new ShvMap({
                        password: this.password,
                        type: this.loginType,
                        user: this.user,
                    }),
                    options: new ShvMap({
                        device: this.mountPoint === 'string' ? new ShvMap({mountPoint: this.mountPoint}) : undefined,
                    }),
                });
                return this.callRpcMethod(undefined, 'login', params);
            }).then(() => {
                this.logDebug('SUCCESS: connected to shv broker');
                this.onConnected();
            }).catch(() => {
                this.logDebug('FAILURE: couldn\' connected to shv broker');
            });
        });

        this.websocket.addEventListener('close', () => {
            this.logDebug('DISCONNECTED');
            this.onDisconnected();
        });

        this.websocket.addEventListener('message', evt => {
            const rpc_val = dataToRpcValue(evt.data);
            const rpc_msg = new RpcMessage(rpc_val);
            this.logDebug(`message received: ${rpc_msg.toCpon()}`);

            if (rpc_msg.isSignal()) {
                for (const sub of this.subscriptions) {
                    const shv_path = rpc_msg.shvPath();
                    const method = rpc_msg.method();

                    if (shv_path?.startsWith(sub.path) && method === sub.method) {
                        sub.callback(shv_path, method, rpc_msg.params());
                    }
                }
            } else if (rpc_msg.isRequest()) {
                this.onRequest(rpc_msg);
            } else if (rpc_msg.isResponse()) {
                const requestId = rpc_msg.requestId();
                if (requestId === undefined) {
                    throw new Error('got RpcResponse without requestId');
                }

                if (this.rpcHandlers[Number(requestId)] !== undefined) {
                    const handler = this.rpcHandlers[Number(requestId)];
                    clearTimeout(handler.timeout_handle);
                    handler.resolve(rpc_msg.resultOrError());
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

    callRpcMethod(shv_path: string | undefined, method: 'dir', params?: RpcValue): Promise<RpcResponse<DirResult>>;
    callRpcMethod(shv_path: string | undefined, method: 'ls', params?: RpcValue): Promise<RpcResponse<LsResult>>;
    callRpcMethod(shv_path: string | undefined, method: string, params?: RpcValue): Promise<RpcResponse>;
    callRpcMethod(shv_path: string | undefined, method: string, params?: RpcValue) {
        const rq = new RpcMessage();
        const rq_id = this.requestId++;
        rq.setRequestId(rq_id);
        if (shv_path !== undefined) {
            rq.setShvPath(shv_path);
        }
        rq.setMethod(method);
        if (params !== undefined) {
            rq.setParams(params);
        }
        this.sendRpcMessage(rq);

        const promise = new Promise<RpcResponse>(resolve => {
            this.rpcHandlers[rq_id] = {resolve, timeout_handle: self.setTimeout(() => {
                resolve(new MethodCallTimeout(new IMap({
                    [ERROR_CODE]: new Int(ErrorCode.MethodCallTimeout),
                    [ERROR_MESSAGE]: `Shv call timeout after: ${this.timeout} msec.`,
                })));
            }, this.timeout)};
        });

        return promise;
    }

    sendRpcMessage(rpc_msg: RpcMessage) {
        if (this.websocket && this.websocket.readyState === 1) {
            this.logDebug('sending rpc message:', rpc_msg.toCpon());
            const msg_data = new Uint8Array(rpc_msg.toChainPack());

            const wr = new ChainPackWriter();
            wr.writeUIntData(msg_data.length + 1);
            const dgram = new Uint8Array(wr.ctx.length + 1 + msg_data.length);
            let ix = 0;
            for (let i = 0; i < wr.ctx.length; i++) {
                dgram[ix++] = wr.ctx.data[i];
            }

            dgram[ix++] = ChainpackProtocolType;

            for (const msg_datum of msg_data) {
                dgram[ix++] = msg_datum;
            }
            this.logDebug(`sending ${dgram.length} bytes of data`);
            this.websocket.send(dgram.buffer);
        }
    }

    subscribe(path: string, method: string, callback: SubscriptionCallback) {
        this.callRpcMethod('.broker/app', 'subscribe', new ShvMap({
            method, path,
        })).catch(() => {
            this.logDebug(`Couldn't subscribe to ${path}, ${method}`);
        });

        this.subscriptions.push({
            path,
            method,
            callback,
        });
    }

    close() {
        this.websocket.close();
    }
}

export {WsClient};
