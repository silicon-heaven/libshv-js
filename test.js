"use strict"
import {toChainPack, fromChainPack} from "./src/chainpack.ts"
import {toCpon, fromCpon} from "./src/cpon.ts"

class Test
{
	checkEq(e1, e2, msg)
	{
		//console.log((e1 === e2)? "OK": "ERROR", ":", e1, "vs.", e2)
		if(e1 === e2)
			return;
		if(msg)
			throw msg;
		else
			throw "test check error: " + e1 + " === " + e2
	}

	testConversions()
	{
		for(const lst of [
			[(2**31 - 1) + "u", null],
			//[(2**32 - 1) + "u", null],  // too big for JS bitwise operations
			["" + (2**31 - 1), null],
			["" + (-(2**30 - 1)), null],
			["" + (2**53 - 1), null], // Number.MAX_SAFE_INTEGER
			["" + (-(2**53 - 1)), null], // Number.MIN_SAFE_INTEGER
			//["" + (2**32 - 1), null], // too big for JS bitwise operations
			["true", null],
			["false", null],
			["null", null],
			["1u", null],
			["134", null],
			["7", null],
			["-2", null],
			["0xab", "171"],
			["-0xCD", "-205"],
			["0x1a2b3c4d", "439041101"],
			["223.", null],
			["2.30", null],
			["12.3e-10", "123e-11"],
			["-0.00012", "-12e-5"],
			["-1234567890.", "-1234567890."],
			['"foo"', null],
			['b"a1\\d2"', null],
			['x"6131d2"', 'b"a1\\d2"'],
			["[]", null],
			["[1]", null],
			["[1,]", "[1]"],
			["[1,2,3]", null],
			["[[]]", null],
			["{\"foo\":\"bar\"}", null],
			["{\"login\":{\"password\":\"lautr\",\"type\":\"PLAIN\",\"user\":\"revitest\"}}", null],
			["i{1:2}", null],
			["i{\n\t1: \"bar\",\n\t345u : \"foo\",\n}", "i{1:\"bar\",345:\"foo\"}"],
			["[1u,{\"a\":1},2.30]", null],
			["<1:2>3", null],
			["[1,<7:8>9]", null],
			["<>1", null],
			["<8:3u>i{2:[[\".broker\",<1:2>true]]}", null],
			["<1:2,\"foo\":\"bar\">i{1:<7:8>9}", null],
			["<1:2,\"foo\":<5:6>\"bar\">[1u,{\"a\":1},2.30]", null],
			["i{1:2 // comment to end of line\n}", "i{1:2}"],
			[`/*comment 1*/{ /*comment 2*/
			\t\"foo\"/*comment \"3\"*/: \"bar\", //comment to end of line
			\t\"baz\" : 1,
			/*
			\tmultiline comment
			\t\"baz\" : 1,
			\t\"baz\" : 1, // single inside multi
			*/
			}`, "{\"foo\":\"bar\",\"baz\":1}"],
			//["a[1,2,3]", "[1,2,3]"], // unsupported array type
			["<1:2>[3,<4:5>6]", null],
			["<4:\"svete\">i{2:<4:\"svete\">[0,1]}", null],
			['d"2019-05-03T11:30:00-0700"', 'd"2019-05-03T11:30:00-07"'],
			['d""', null],
			['d"2018-02-02T00:00:00Z"', null],
			['d"2027-05-03T11:30:12.345+01"', null],
			])
		{
			let cpon1 = lst[0]
			let cpon2 = lst[1]? lst[1]: cpon1;

			let rv1 = fromCpon(cpon1);
			let cpn1 = toCpon(rv1);
			console.log("testing", cpon1, "\t--cpon------>\t", cpn1)
			this.checkEq(cpn1, cpon2);

			//let cpk1 = toChainPack(rv1);
			//let rv2 = fromChainPack(cpk1);
			//let cpn2 = toCpon(rv2);
			//console.log("testing", cpn1, "\t--chainpack->\t", cpn2, "\n")
			//this.checkEq(cpn1, cpn2);
		}
	}

	testDateTime()
	{
		// same points in time
		let v1 = RpcValue.fromCpon('d"2017-05-03T18:30:00Z"');
		let v2 = RpcValue.fromCpon('d"2017-05-03T22:30:00+04"');
		let v3 = RpcValue.fromCpon('d"2017-05-03T11:30:00-0700"');
		let v4 = RpcValue.fromCpon('d"2017-05-03T15:00:00-0330"');
		this.checkEq(v1.value.epochMsec, v2.value.epochMsec);
		this.checkEq(v2.value.epochMsec, v3.value.epochMsec);
		this.checkEq(v3.value.epochMsec, v4.value.epochMsec);
		this.checkEq(v4.value.epochMsec, v1.value.epochMsec);
	}

	testMapKeys()
	{
		{
			let c1 = '{"1":"a"}';
			let v1 = RpcValue.fromCpon(c1);
			let c2 = v1.toString();
			log(c1, " vs. ", c2)
			this.checkEq(c1, c2);
		}
		{
			let c1 = 'i{1:"a"}';
			let v1 = RpcValue.fromCpon(c1);
			let c2 = v1.toString();
			log(c1, " vs. ", c2)
			this.checkEq(c1, c2);
		}
	}

	static run()
	{
		//try {
			/*
			for(let i=0; i<7; i++) {
				log("---------", i, '---------------')
				for(const n of [1,255,256,65535, 65536, -1, -255, -65535, -65536]) {
					let bytes1 = ChainPack.uIntToBBE(n)
					let bytes2 = ChainPack.rotateLeftBBE(bytes1, i)
					log(n, "<<", i, '\t', bytes1, "->", bytes2)
				}
			}
			return
			*/
			let t = new Test();

			t.testConversions();
			t.testDateTime();
			t.testMapKeys();

			log("PASSED")
		//}
		//catch(err) {
		//	log("FAILED:", err)
		//}
	}
}

Test.run();
