import {z, type ZodType} from 'zod';
import {type IMap, isIMap, isShvMap, type RpcValue, type ShvMap, UInt} from './rpcvalue';

export const map = <T extends Record<string, ZodType<any, any, any>>>(schema: T) => z.custom<ShvMap<{[K in keyof T]: z.infer<T[K]>}>>((data: RpcValue) => isShvMap(data) && z.object(schema).safeParse(data).success);
export const recmap = <T extends ZodType<any, any, any>>(schema: T) => z.custom<ShvMap<Record<string, z.infer<T>>>>((data: RpcValue) => isShvMap(data) && z.record(z.string(), schema).safeParse(data).success);
export const imap = <T extends Record<string, ZodType<any, any, any>>>(schema: T) => z.custom<IMap<{[K in keyof T]: z.infer<T[K]>}>>((data: RpcValue) => isIMap(data) && z.object(schema).safeParse(data).success);
export const int = () => z.number();
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- Zod needs the default argument, otherwise it'll infer as UInt<unknown>
export const uint = () => z.instanceof(UInt<number>);

export * from 'zod';
