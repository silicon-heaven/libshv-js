const dataToRpcValue = (buff) => {
	let rd = new ChainPackReader(new UnpackContext(buff));
	rd.readUIntData()
	const proto = rd.ctx.getByte();
	if (proto == Cpon.ProtocolType) {
		rd = new CponReader(rd.ctx)
	} else {
		rd = new ChainPackReader(rd.ctx)
	}
	const rpc_val = rd.read();
	return rpc_val;
};

const checkOption = (option, name, type) => {
	if (typeof option !== type) {
		throw new Error(`Required option ${name} missing`);
	}
};

class WsClient {
	constructor(options) {
		if (typeof options !== "object") {
			throw new Error("No options object supplied");
		}

		this.requestId = 1;
		this.rpcHandlers = [];
		this.subscriptions = [];
		this.requestHandler = options.requestHandler || (() => {});
		this.isUseCpon = options.isUseCpon || false;
		this.logDebug = options.logDebug || (() => {});
		this.mountPoint = options.mountPoint;

		checkOption(options.user, "user", "string");
		this.user = options.user;

		checkOption(options.password, "password", "string");
		this.password = options.password;

		checkOption(options.wsUri, "websocket URI", "string");

		this.websocket = new WebSocket(options.wsUri);
		this.websocket.binaryType = "arraybuffer";

		this.onConnected = options.onConnected || (() => {});
		this.onRequest = options.onRequest || (() => {});

		this.websocket.onopen = () => {
			this.logDebug("CONNECTED");
			this.callRpcMethod(null, "hello").then(() => {
				const params = `{"login":{"password":"${this.password}","type":"PLAIN","user":"${this.user}"},"options":{"device":{${typeof this.mountPoint === "string" ? `"mountPoint":"${this.mountPoint}"` : ""} },"idleWatchDogTimeOut": 60}}`;
				return this.callRpcMethod(null, "login", params);
			}).then(() => {
				this.logDebug("SUCCESS: connected to shv broker");
				this.onConnected();
			});
		};

		this.websocket.onclose = () => {
			this.logDebug("DISCONNECTED");
		};

		this.websocket.onmessage = (evt) => {
			const rpc_val = dataToRpcValue(evt.data);
			this.logDebug(`message received: ${rpc_val}`);
			const rpc_msg = new RpcMessage(rpc_val);

			if (rpc_msg.isSignal()) {
				this.subscriptions.forEach((sub) => {
					const shv_path = rpc_msg.rpcValue.meta[9].value;
					const method = rpc_msg.rpcValue.meta[10].value;

					if (shv_path.startsWith(sub.path) && method === sub.method) {
						sub.callback(rpc_msg.rpcValue.meta[9], method, rpc_msg.rpcValue.value);
					}
				});
			} else if (rpc_msg.isRequest()) {
				this.onRequest(rpc_msg);
			} else {
				const requestId = rpc_msg.requestId().toInt();
				if (typeof this.rpcHandlers[requestId] !== "undefined") {
					const cb = this.rpcHandlers[requestId];
					cb(rpc_msg);
					delete this.rpcHandlers[requestId];
				}
			}
		};

		this.websocket.onerror = (evt) => {
			this.logDebug(`ERROR: ${evt.data}`);
		};

		this.websocket.onclose = (evt) => {
			this.logDebug(`socket close code: ${evt.code}`);
		};

		this.callRpcMethod = (shv_path, method, params) => {
			const rq = new RpcMessage();
			rq.setRequestId(this.requestId++);
			if (shv_path) {
				rq.setShvPath(shv_path);
			}
			rq.setMethod(method);
			if (params) {
				rq.setParams(RpcValue.fromCpon(params));
			}
			this.sendRpcMessage(rq);

			let resolveFn;
			const promise = new Promise((resolve) => {
				resolveFn = resolve;
			});

			this.rpcHandlers[rq.requestId()] = resolveFn;

			return promise;
		};

		this.sendRpcMessage = (rpc_msg) => {
			if (this.websocket && this.websocket.readyState == 1) {
				this.logDebug("sending rpc message:", rpc_msg.toString());
				let msg_data;
				if (this.isUseCpon) {
					msg_data = new Uint8Array(rpc_msg.toCpon());
				} else {
					msg_data = new Uint8Array(rpc_msg.toChainPack());
				}

				const wr = new ChainPackWriter();
				wr.writeUIntData(msg_data.length + 1);
				const dgram = new Uint8Array(wr.ctx.length + 1 + msg_data.length);
				let ix = 0;
				for (let i = 0; i < wr.ctx.length; i++)
					dgram[ix++] = wr.ctx.data[i];

				if (this.isUseCpon) {
					dgram[ix++] = Cpon.ProtocolType;
				} else {
					dgram[ix++] = ChainPack.ProtocolType;
				}

				for (let i = 0; i < msg_data.length; i++) {
					dgram[ix++] = msg_data[i];
				}
				this.logDebug(`sending ${dgram.length} bytes of data`);
				this.websocket.send(dgram.buffer);
			}
		};

		this.subscribe = (path, method, callback) => {
			this.callRpcMethod(".broker/app", "subscribe", JSON.stringify({
				method,
				path
			}));

			this.subscriptions.push({
				path,
				method,
				callback
			});
		};

		this.close = () => {
			this.websocket.close();
		};
	}
};
