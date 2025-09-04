export type StringGetter = string | Promise<string> | (() => string | Promise<string>);

export const resolveString = (input: StringGetter) => {
    if (typeof input === 'function') {
        input = input();
    }

    return input;
};

