import {DIR_NAME, WsClient, WsClientOptions} from './ws-client';
import {RpcMessageZod, type RpcMessage} from './rpcmessage';
import {type RpcValue} from './rpcvalue';
import * as z from './zod';

export const LsParamZod = z.undefined().or(z.string());
export const DirParamZod = z.undefined().or(z.boolean()).or(z.string());

export type ZodMethodHandler = {
    paramParser: z.ZodType<RpcValue>;
    handler: (shvPath: string, method: string, params: RpcValue, delay: (progress: number) => void) => Promise<RpcValue> | RpcValue | import('./ws-client').RequestHandler;
};

function createZodWsClient(options: WsClientOptions<ZodMethodHandler>): WsClient {
    const parseMessage = (rpcVal: RpcValue): RpcMessage => {
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
