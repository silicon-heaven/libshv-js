import {toChainPack, fromChainPack} from '../src/chainpack';
import {toCpon, fromCpon} from '../src/cpon';
import {type DateTime} from '../src/rpcvalue';

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
    ['d"2024-10-30T16:30:57.890Z"', null],
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

for (const vector of [
    {cpon: 'd"2018-02-02T00:00:00.001"', len: 2, dump: '10001101|00000100'},
    {cpon: 'd"2018-02-02T01:00:00.001+01"', len: 3, dump: '10001101|10000010|00010001'},
    {cpon: 'd"2018-12-02T00:00:00"', len: 5, dump: '10001101|11100110|00111101|11011010|00000010'},
    {cpon: 'd"2018-01-01T00:00:00"', len: 5, dump: '10001101|11101000|10101000|10111111|11111110'},
    {cpon: 'd"2019-01-01T00:00:00"', len: 5, dump: '10001101|11100110|11011100|00001110|00000010'},
    {cpon: 'd"2020-01-01T00:00:00"', len: 6, dump: '10001101|11110000|00001110|01100000|11011100|00000010'},
    {cpon: 'd"2021-01-01T00:00:00"', len: 6, dump: '10001101|11110000|00010101|11101010|11110000|00000010'},
    {cpon: 'd"2031-01-01T00:00:00"', len: 6, dump: '10001101|11110000|01100001|00100101|10001000|00000010'},
    {cpon: 'd"2041-01-01T00:00:00"', len: 7, dump: '10001101|11110001|00000000|10101100|01100101|01100110|00000010'},
    {cpon: 'd"2041-03-04T00:00:00-1015"', len: 7, dump: '10001101|11110001|01010110|11010111|01001101|01001001|01011111'},
    {cpon: 'd"2041-03-04T00:00:00.123-1015"', len: 9, dump: '10001101|11110011|00000001|01010011|00111001|00000101|11100010|00110111|01011101'},
    {cpon: 'd"1970-01-01T00:00:00"', len: 7, dump: '10001101|11110001|10000001|01101001|11001110|10100111|11111110'},
    {cpon: 'd"2017-05-03T05:52:03"', len: 5, dump: '10001101|11101101|10101000|11100111|11110010'},
    {cpon: 'd"2017-05-03T15:52:03.923Z"', len: 7, dump: '10001101|11110001|10010110|00010011|00110100|10111110|10110100'},
    {cpon: 'd"2017-05-03T15:52:31.123+10"', len: 8, dump: '10001101|11110010|10001011|00001101|11100100|00101100|11011001|01011111'},
    {cpon: 'd"2017-05-03T15:52:03Z"', len: 5, dump: '10001101|11101101|10100110|10110101|01110010'},
    {cpon: 'd"2017-05-03T15:52:03.000-0130"', len: 7, dump: '10001101|11110001|10000010|11010011|00110000|10001000|00010101'},
    {cpon: 'd"2017-05-03T15:52:03.923+00"', len: 7, dump: '10001101|11110001|10010110|00010011|00110100|10111110|10110100'},
]) {
    const rv = fromCpon(vector.cpon) as DateTime;
    let cpk: ArrayBuffer;
    try {
        cpk = toChainPack(rv);
    } catch (error) {
        if (error instanceof RangeError) {
            if (error.message === 'DateTime prior to 2018-02-02 are not supported in current ChainPack implementation.') {
                continue;
            }
        }

        throw error;
    }

    const bytes = new Uint8Array(cpk);
    const expected = vector.dump.split('|').map(x => Number.parseInt(x, 2));

    checkEq(bytes.length, vector.len);
    checkEq(bytes.length, expected.length);

    for (let i = 0; i < bytes.length; i++) {
        checkEq(bytes[i]!, expected[i]!);
    }
}

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
