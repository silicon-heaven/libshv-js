import {DIR_NAME, WsClient, WsClientOptions} from './ws-client';
import {type RpcValue} from './rpcvalue';
import * as z from './zod';
import {ERROR_CODE, ERROR_DATA, ERROR_MESSAGE, RPC_MESSAGE_ABORT, RPC_MESSAGE_ACCESS_LEVEL, RPC_MESSAGE_CALLER_IDS, RPC_MESSAGE_DELAY, RPC_MESSAGE_ERROR, RPC_MESSAGE_METHOD, RPC_MESSAGE_PARAMS, RPC_MESSAGE_REQUEST_ID, RPC_MESSAGE_RESULT, RPC_MESSAGE_SHV_PATH} from './rpcmessage';

const ErrorMapZod = z.imap({
    [ERROR_CODE]: z.number(),
    [ERROR_MESSAGE]: z.string().optional(),
    [ERROR_DATA]: z.rpcvalue().optional(),
});

const RpcRequestMetaZod = z.metamap({
    [RPC_MESSAGE_CALLER_IDS]: z.int().or(z.array(z.int())).optional(),
    [RPC_MESSAGE_REQUEST_ID]: z.number(),
    [RPC_MESSAGE_METHOD]: z.string(),
    [RPC_MESSAGE_SHV_PATH]: z.string(),
    [RPC_MESSAGE_ACCESS_LEVEL]: z.int().gte(0).lte(63).optional(),
});

const RpcRequestValueZod = z.imap({
    [RPC_MESSAGE_PARAMS]: z.rpcvalue().optional(),
}).or(z.imap({
    [RPC_MESSAGE_ABORT]: z.boolean(),
}));

const RpcResponseMetaZod = z.metamap({
    [RPC_MESSAGE_CALLER_IDS]: z.int().or(z.array(z.int())).optional(),
    [RPC_MESSAGE_REQUEST_ID]: z.number(),
});

const RpcResponseValueZod = z.imap({
    [RPC_MESSAGE_RESULT]: z.rpcvalue(),
}).or(z.imap({
    [RPC_MESSAGE_ERROR]: ErrorMapZod,
})).or(z.imap({
    [RPC_MESSAGE_DELAY]: z.double(),
}));

const RpcSignalMetaZod = z.metamap({
    [RPC_MESSAGE_SHV_PATH]: z.string(),
    [RPC_MESSAGE_METHOD]: z.string(),
});
const RpcSignalValueZod = z.imap({
    [RPC_MESSAGE_PARAMS]: z.rpcvalue().optional(),
});

const RpcRequestZod = z.withMeta(RpcRequestMetaZod, RpcRequestValueZod);
const RpcResponseZod = z.withMeta(RpcResponseMetaZod, RpcResponseValueZod);
const RpcSignalZod = z.withMeta(RpcSignalMetaZod, RpcSignalValueZod);
const RpcMessageZod = z.union([RpcRequestZod, RpcResponseZod, RpcSignalZod]);

export const LsParamZod = z.undefined().or(z.string());
export const DirParamZod = z.undefined().or(z.boolean()).or(z.string());

export type ZodMethodHandler = {
    paramParser: z.ZodType<RpcValue>;
    handler: (shvPath: string, method: string, params: RpcValue, delay: (progress: number) => void) => Promise<RpcValue> | RpcValue | import('./ws-client').RequestHandler;
};

function createZodWsClient(options: WsClientOptions<ZodMethodHandler>): WsClient {
    const parseMessage = (rpcVal: RpcValue): z.infer<typeof RpcMessageZod> => {
        try {
            return RpcMessageZod.parse(rpcVal);
        } catch (error) {
            console.error('RPC Message validation failed:', error);
            throw error;
        }
    };

    const convertedOptions = 'login' in options ? {
        ...options,
        parseMessage,
        onRequest(shvPath: string) {
            const zodHandlers = options.onRequest(shvPath);
            if (zodHandlers === undefined) {
                return;
            }

            return {
                ls: zodHandlers.ls,
                dirEntries: zodHandlers.dirEntries.map(zodHandler => ({
                    entry: zodHandler.entry,
                    paramValidator(param: RpcValue) {
                        const result = zodHandler.paramParser.safeParse(param);
                        if (!result.success) {
                            console.error(`Parameter validation failed for '${shvPath}:${zodHandler.entry[DIR_NAME]}':`, result.error.message);
                            return false;
                        }

                        return true;
                    },
                    handler: zodHandler.handler,
                })),
            };
        },
    } : {
        ...options,
        parseMessage,
    };

    return new WsClient(convertedOptions);
}

export {createZodWsClient};
