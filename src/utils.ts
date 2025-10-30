import {ShvRI} from './shv-ri';

export type StringGetter = string | Promise<string> | (() => string | Promise<string>);

export const resolveString = (input: StringGetter) => {
    if (typeof input === 'function') {
        input = input();
    }

    return input;
};

export type RIGetter = ShvRI | Promise<ShvRI> | (() => ShvRI | Promise<ShvRI>);

export const resolveRI = (input: RIGetter) => {
    if (typeof input === 'function') {
        input = input();
    }

    return input;
};

