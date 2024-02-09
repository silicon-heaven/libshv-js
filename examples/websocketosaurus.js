//document.getElementById("edUri").value = "wss://nirvana.elektroline.cz:3778";
document.getElementById("edUri").value = "wss://localhost:3778";
document.getElementById("edUser").value = "user";
document.getElementById("edPassword").value = "pwd";

document.getElementById("edShvPath").value = ".broker/app";
document.getElementById("edMethod").value = "echo";
document.getElementById("edParams").value = "42";

let txtLog = document.getElementById("txtLog");

const debug = (...args) => {
	let line = "";
	for (let i = 0; i < args.length; i++) {
		if (i > 0) {
			line += " ";
		}
		line += args[i];
	}
	txtLog.value += line + "\n";
	txtLog.scrollTop = txtLog.scrollHeight;
};

let ws_client;

const sendMessage = () => {
	if (ws_client && ws_client.websocket.readyState == 1 ) {
		const shv_path = document.getElementById("edShvPath").value;
		const method = document.getElementById("edMethod").value;
		const params = document.getElementById("edParams").value;

		ws_client.callRpcMethod(shv_path, method, params).then((rpc_msg) => {
			const txtResult = document.getElementById("txtResult");
			// result == 2
			// error == 3
			const err = rpc_msg.error();
			if (err) {
				txtResult.value = err.toString();
				txtResult.style.background = "salmon";
			} else {
				const result = rpc_msg.result();
				txtResult.value = result.toString();
				txtResult.style.background = "";
			}
		});
	}
}

const initWebSocket = (use_chainpack) => {
	const wsUri = document.getElementById("edUri").value;
	const user = document.getElementById("edUser").value;
	const password = document.getElementById("edPassword").value;


	const isUseCpon = !use_chainpack;
	const txtLog = document.getElementById("txtLog");
	txtLog.value = `Connection to shvbroker using ${isUseCpon? "Cpon": "ChainPack"}serialization.`;
	try {
		ws_client = new WsClient({
			user,
			password,
			wsUri,
			logDebug: debug,
			onRequest: (rpc_msg) => {
				const method = rpc_msg.method().asString();
				const resp = new RpcMessage();
				if(method == "dir") {
					resp.setResult(["ls", "dir", "appName"]);
				}
				else if(method == "ls") {
					resp.setResult([]);
				}
				else if(method == "appName") {
					resp.setResult("websocketosaurus");
				}
				else {
					debug(`ERROR: Method: ${method} is not defined.`);
					resp.setError(`Method: ${method} is not defined.`);
				}
				resp.setRequestId(rpc_msg.requestId());
				resp.setCallerIds(rpc_msg.callerIds());
				ws_client.sendRpcMessage(resp);
			}
		});
	} catch (exception) {
		debug(`EXCEPTION: ${exception}`);
	}
};

const stopWebSocket = () => {
	if (websocket) {
		websocket.close();
	}
};
