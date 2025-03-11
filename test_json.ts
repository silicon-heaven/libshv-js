import { toCpon } from "./src/cpon";
import { fromJson, toJson } from "./src/json";
import {makeIMap, makeMap, makeMetaMap, RpcValue, RpcValueWithMetaData, withOffset} from "./src/rpcvalue";

const testJsonRoundTrip = (json: string, expected: RpcValue) => {
	const parsed = fromJson(json);
	if (parsed instanceof Error) {
		throw parsed;
	}
	const parsedCpon = toCpon(parsed);
	const expectedCpon = toCpon(expected);
	if (parsedCpon !== expectedCpon) {
		throw new Error(`Assertion error:\nExpected: '${expectedCpon}'\nActual: '${parsedCpon}'`);
	}

	const serializedJson = toJson(expected);
	if (serializedJson !== json.replaceAll(' ', '')) {
		throw new Error(`Assertion error:\nExpected: '${json}'\nActual: '${serializedJson}'`);
	}

};

const MINUTE = 1;
const HOUR = 60 * MINUTE;

const tests = [
	['{}', makeMap({})],
	['{"null-field": null}', makeMap({"null-field": undefined})],
	['["!shvType", "Blob", ""]', new Uint8Array().buffer],
	['["!shvType", "Blob", "6162a1"]', new Uint8Array([0x61, 0x62, 0xa1]).buffer],
	['["!shvType", "IMap", {}]', makeIMap({})],
	['["!shvType", "IMap", {"1": 2}]', makeIMap({1: 2})],
	['["!shvType", "IMap", {"1": 2, "2": "foo"}]', makeIMap({1: 2, 2: "foo"})],
	['["!shvType", "DateTime", "2021-11-08T01:02:03+05"]', withOffset(new Date("2021-11-08T01:02:03+05:00"), 5 * HOUR)],
	['["!shvType", "DateTime", "2021-11-08T01:02:03-0815"]', withOffset(new Date("2021-11-08T01:02:03-08:15"), -8 * HOUR - 15 * MINUTE)],
	['["!shvType", "DateTime", "2021-11-08T01:02:03.456-0815"]', withOffset(new Date("2021-11-08T01:02:03.456-08:15"), -8 * HOUR - 15 * MINUTE)],
	['["!shvMeta", {"1":2}, 42]', new RpcValueWithMetaData(makeMetaMap({1: 2}), 42)],
	['["!shvMeta", {"1":2}, "!shvType", "IMap", {"42": 7}]', new RpcValueWithMetaData(makeMetaMap({1: 2}), makeIMap({42: 7}))],
	['["!shvMeta", {"1": 2, "foo": "bar"}, [1,2,3]]', new RpcValueWithMetaData(makeMetaMap({1: 2, "foo": "bar"}), [1, 2, 3])],
] as const;

tests.forEach(([inputJson, expectedRpcValue]) => testJsonRoundTrip(inputJson, expectedRpcValue));

console.log('OK');
