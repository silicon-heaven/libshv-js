import {z, type ZodType} from 'zod';
import {Int, shvMapType, UInt} from './rpcvalue';

export const map = <T extends Record<string, ZodType<any, any, any>>>(schema: T) => z.object(schema).and(z.object({[shvMapType]: z.literal('map')}));
export const recmap = <T extends ZodType<any, any, any>>(schema: T) => z.record(z.string(), schema).and(z.object({[shvMapType]: z.literal('map')}));
export const imap = <T extends Record<string, ZodType<any, any, any>>>(schema: T) => z.object(schema).and(z.object({[shvMapType]: z.literal('imap')}));
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- Zod needs the default argument, otherwise it'll infer as Int<unknown>
export const int = () => z.instanceof(Int<number>);
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- Zod needs the default argument, otherwise it'll infer as UInt<unknown>
export const uint = () => z.instanceof(UInt<number>);

export * from 'zod';
