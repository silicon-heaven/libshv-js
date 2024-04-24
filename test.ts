import {toChainPack, fromChainPack} from './src/chainpack.ts';
import {toCpon, fromCpon} from './src/cpon.ts';
import {type DateTime} from './src/rpcvalue.ts';

const checkEq = (e1: string | number, e2: string | number) => {
    if (e1 !== e2) {
        throw new Error(`test check error: ${e1} === ${e2}`);
    }
};
for (const lst of [
    [((2 ** 31) - 1) + 'u', null],
    [((2 ** 32) - 1) + 'u', null], // too big for JS bitwise operations
    [String((2 ** 31) - 1), null],
    [String(-((2 ** 30) - 1)), null],
    [String((2 ** 53) - 1), null], // Number.MAX_SAFE_INTEGER
    [String(-((2 ** 53) - 1)), null], // Number.MIN_SAFE_INTEGER
    [String((2 ** 32) - 1), null], // too big for JS bitwise operations
    ['true', null],
    ['false', null],
    ['null', null],
    ['1u', null],
    ['134', null],
    ['7', null],
    ['-2', null],
    ['0xab', '171'],
    ['-0xCD', '-205'],
    ['0x1a2b3c4d', '439041101'],
    ['223.', null],
    ['2.30', null],
    ['12.3e-10', '123e-11'],
    ['-0.00012', '-12e-5'],
    ['-1234567890.', '-1234567890.'],
    ['"foo"', null],
    ['b"a1\\d2"', null],
    ['x"6131d2"', 'b"a1\\d2"'],
    ['[]', null],
    ['[1]', null],
    ['[1,]', '[1]'],
    ['[1,2,3]', null],
    ['[[]]', null],
    ['{"foo":"bar"}', null],
    ['{"login":{"password":"lautr","type":"PLAIN","user":"revitest"}}', null],
    ['i{1:2}', null],
    ['i{\n\t1: "bar",\n\t345u : "foo",\n}', 'i{1:"bar",345:"foo"}'],
    ['[1u,{"a":1},2.30]', null],
    ['<1:2>3', null],
    ['[1,<7:8>9]', null],
    ['<>1', null],
    ['<8:3u>i{2:[[".broker",<1:2>true]]}', null],
    ['<1:2,"foo":"bar">i{1:<7:8>9}', null],
    ['<1:2,"foo":<5:6>"bar">[1u,{"a":1},2.30]', null],
    ['i{1:2 // comment to end of line\n}', 'i{1:2}'],
    [`/*comment 1*/{ /*comment 2*/
	\t"foo"/*comment "3"*/: "bar", //comment to end of line
	\t"baz" : 1,
	/*
	\tmultiline comment
	\t"baz" : 1,
	\t"baz" : 1, // single inside multi
	*/
	}`, '{"foo":"bar","baz":1}'],
    ['<1:2>[3,<4:5>6]', null],
    ['<4:"svete">i{2:<4:"svete">[0,1]}', null],
    ['d"2019-05-03T11:30:00-0700"', 'd"2019-05-03T11:30:00-07"'],
    ['d"2018-02-02T00:00:00Z"', null],
    ['d"2027-05-03T11:30:12.345+01"', null],
]) {
    const cpon1 = lst[0];
    const cpon2 = lst[1] ?? cpon1!;

    console.log('testing', JSON.stringify(cpon1), '\t-------->\t', cpon2);
    const rv1 = fromCpon(cpon1!);
    const cpn1 = toCpon(rv1);
    checkEq(cpn1, cpon2);

    const cpk1 = toChainPack(rv1);
    const rv2 = fromChainPack(cpk1);
    const cpn2 = toCpon(rv2);
    checkEq(cpn1, cpn2);
}
// same points in time
const v1 = fromCpon('d"2017-05-03T18:30:00Z"') as DateTime;
const v2 = fromCpon('d"2017-05-03T22:30:00+04"') as DateTime;
const v3 = fromCpon('d"2017-05-03T11:30:00-0700"') as DateTime;
const v4 = fromCpon('d"2017-05-03T15:00:00-0330"') as DateTime;
checkEq(v1.getTime(), v2.getTime());
checkEq(v2.getTime(), v3.getTime());
checkEq(v3.getTime(), v4.getTime());
checkEq(v4.getTime(), v1.getTime());

{
    const c1 = '{"1":"a"}';
    const v1 = fromCpon(c1);
    const c2 = toCpon(v1);
    console.log(c1, 'vs.', c2);
    checkEq(c1, c2);
}

{
    const c1 = 'i{1:"a"}';
    const v1 = fromCpon(c1);
    const c2 = toCpon(v1);
    console.log(c1, 'vs.', c2);
    checkEq(c1, c2);
}

console.log('PASSED');
