import {z, type ZodType} from 'zod';
import {Decimal, Double, type IMap, isIMap, isMetaMap, isShvMap, type MetaMap, type RpcValue, type RpcValueType, RpcValueWithMetaData, type ShvMap, UInt} from './rpcvalue';

export const map = <T extends Record<string, ZodType<any, any, any>>>(schema?: T) => z.custom<ShvMap<{[K in keyof T]: z.infer<T[K]>}>>((data: RpcValue) => isShvMap(data) && (schema === undefined || z.object(schema).safeParse(data).success));
export const recmap = <T extends ZodType<any, any, any>>(schema: T) => z.custom<ShvMap<Record<string, z.infer<T>>>>((data: RpcValue) => isShvMap(data) && z.record(z.string(), schema).safeParse(data).success);
export const imap = <T extends Record<string, ZodType<any, any, any>>>(schema?: T) => z.custom<IMap<{[K in keyof T]: z.infer<T[K]>}>>((data: RpcValue) => isIMap(data) && (schema === undefined || z.object(schema).safeParse(data).success));
export const metamap = <T extends Record<string | number, ZodType<any, any, any>>>(schema?: T) => z.custom<MetaMap<{[K in keyof T]: z.infer<T[K]>}>>((data: RpcValue) => isMetaMap(data) && (schema === undefined || z.object(schema).safeParse(data).success));
export const int = () => z.number();
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- Zod needs the default argument, otherwise it'll infer as UInt<unknown>
export const uint = () => z.instanceof(UInt<number>);
export const double = () => z.instanceof(Double);
export const decimal = () => z.instanceof(Decimal);
export const blob = () => z.instanceof(ArrayBuffer);
export const list = () => z.array(z.lazy(rpcvalue));

const withMetaInstanceParser = z.instanceof(RpcValueWithMetaData);
export const rpcvalue: () => ZodType<RpcValue, any, any> = () => z.union([
    z.undefined(),
    z.boolean(),
    z.number(),
    uint(),
    double(),
    decimal(),
    blob(),
    z.string(),
    z.date(),
    list(),
    map(),
    imap(),
    withMetaInstanceParser,
]);

export const withMeta = <MetaSchema extends MetaMap, ValueSchema extends RpcValueType>(metaParser: ZodType<MetaSchema, any, any>, valueParser: ZodType<ValueSchema, any, any>) =>
    z.custom<RpcValueWithMetaData<z.infer<typeof metaParser>, z.infer<typeof valueParser>>>((data: any) => withMetaInstanceParser.and(z.object({
        meta: metaParser,
        value: valueParser,
    })).safeParse(data).success);

export * from 'zod';
