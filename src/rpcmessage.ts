"use strict"
import RpcValue from "./rpcvalue"

function RpcMessage(rpc_val)
{
	if(typeof rpc_val === 'undefined')
		this.rpcValue = new RpcValue();
	else if(typeof rpc_val === 'null')
		this.rpcValue = null;
	else if(rpc_val && rpc_val instanceof RpcValue)
		this.rpcValue = rpc_val;
	else
		throw new TypeError("RpcMessage cannot be constructed with " + typeof rpc_val)

	if(this.rpcValue) {
		if(!this.rpcValue.meta)
			this.rpcValue.meta = {}
		if(!this.rpcValue.value)
			this.rpcValue.value = {}
		this.rpcValue.type = RpcValue.Type.IMap
	}
}

RpcMessage.TagRequestId = "8";
RpcMessage.TagShvPath = "9";
RpcMessage.TagMethod = "10";
RpcMessage.TagCallerIds = "11";

RpcMessage.KeyParams = "1";
RpcMessage.KeyResult = "2";
RpcMessage.KeyError = "3";

RpcMessage.prototype.isValid = function() {return this.rpcValue? true: false; }
RpcMessage.prototype.isRequest = function() {return this.requestId() && this.method(); }
RpcMessage.prototype.isResponse = function() {return this.requestId() && !this.method(); }
RpcMessage.prototype.isSignal = function() {return !this.requestId() && this.method(); }

RpcMessage.prototype.requestId = function() {return this.isValid()? this.rpcValue.meta[RpcMessage.TagRequestId]: 0; }
RpcMessage.prototype.setRequestId = function(id) {return this.rpcValue.meta[RpcMessage.TagRequestId] = id; }

RpcMessage.prototype.callerIds = function() {return this.isValid()? this.rpcValue.meta[RpcMessage.TagCallerIds]: []; }
RpcMessage.prototype.setCallerIds = function(id) {return this.rpcValue.meta[RpcMessage.TagCallerIds] = id; }

RpcMessage.prototype.shvPath = function() {return this.isValid()? this.rpcValue.meta[RpcMessage.TagShvPath]: null; }
RpcMessage.prototype.setShvPath = function(val) {return this.rpcValue.meta[RpcMessage.TagShvPath] = val; }

RpcMessage.prototype.method = function() {return this.isValid()? this.rpcValue.meta[RpcMessage.TagMethod]: null; }
RpcMessage.prototype.setMethod = function(val) {return this.rpcValue.meta[RpcMessage.TagMethod] = val; }

RpcMessage.prototype.params = function() {return this.isValid()? this.rpcValue.value[RpcMessage.KeyParams]: null; }
RpcMessage.prototype.setParams = function(params) {return this.rpcValue.value[RpcMessage.KeyParams] = params; }

RpcMessage.prototype.result = function() {return this.isValid()? this.rpcValue.value[RpcMessage.KeyResult]: null; }
RpcMessage.prototype.setResult = function(result) {return this.rpcValue.value[RpcMessage.KeyResult] = result; }

RpcMessage.prototype.error = function() {return this.isValid()? this.rpcValue.value[RpcMessage.KeyError]: null; }
RpcMessage.prototype.setError = function(err) {return this.rpcValue.value[RpcMessage.KeyError] = err; }

RpcMessage.prototype.toString = function() {return this.isValid()? this.rpcValue.toString(): ""; }
RpcMessage.prototype.toCpon = function() {return this.isValid()? this.rpcValue.toCpon(): ""; }
RpcMessage.prototype.toChainPack = function() {return this.isValid()? this.rpcValue.toChainPack(): ""; }

export default RpcMessage;
