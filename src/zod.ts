import {z, type ZodType} from 'zod';
import {IMap, Int, type RpcValue, ShvMap} from './rpcvalue';

export const map = <T extends Record<string, ZodType<any, any, any>>>(schema: T) => z.custom<ShvMap<{[K in keyof T]: z.infer<T[K]>}>>((data: RpcValue) => data instanceof ShvMap && z.object(schema).safeParse(data.value).success);
export const imap = <T extends Record<string, ZodType<any, any, any>>>(schema: T) => z.custom<IMap<{[K in keyof T]: z.infer<T[K]>}>>((data: RpcValue) => data instanceof IMap && z.object(schema).safeParse(data.value).success);
export const int = () => z.custom<Int>((data: RpcValue) => data instanceof Int);

export * from 'zod';
