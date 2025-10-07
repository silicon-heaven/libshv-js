/* eslint-disable @typescript-eslint/no-explicit-any */
import {z, type ZodType} from 'zod/v4';
import {Decimal, Double, isIMap, isMetaMap, isShvMap, type MetaMap, RpcValue, type RpcValueType, RpcValueWithMetaData, shvMapType, typeName, UInt} from './rpcvalue';

const implMakeMapParser = <MapBrand extends string, ObjectParser extends ZodType<object>>(mapValidator: (val: unknown) => boolean, _mapBrand: MapBrand, mapName: string, objectParser: ObjectParser) => z.custom<z.infer<ObjectParser> & {[shvMapType]: MapBrand}>().check(ctx => {
    if (!mapValidator(ctx.value)) {
        ctx.issues.push({
            expected: 'map',
            code: 'invalid_type',
            input: ctx.value,
            message: `Invalid input: expected ${mapName}, received ${typeName(ctx.value)}`,
        });
        return;
    }

    // For record, Zod finds out map brand, and calls the record's value parser with the value. There's no way to detect
    // it, because Zod does not supply the parser with the key. To prevent this, remove the key before passing the value
    // to Zod. This unfortunately means that we need to copy the whole object. :/
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {[shvMapType]: zodMustNotHaveThis, ...rest} = {...ctx.value};
    const parsedObject = objectParser.safeParse(rest);

    if (!parsedObject.success) {
        ctx.issues = parsedObject.error.issues as typeof ctx.issues;
    }
});

export const map = <T extends Record<string, ZodType<any>>>(schema: T) => implMakeMapParser(isShvMap, 'map', 'ShvMap', z.object(schema));
export const imap = <T extends Record<number, ZodType<any>>>(schema: T) => implMakeMapParser(isIMap, 'imap', 'IMap', z.object(schema));
export const metamap = <T extends Record<string | number, ZodType<any>>>(schema: T) => implMakeMapParser(isMetaMap, 'metamap', 'MetaMap', z.object(schema));
export const recmap = <T extends ZodType<any>>(schema: T) => implMakeMapParser(val => isShvMap(val) || isIMap(val), 'map', 'ShvMap', z.record(z.any(), schema));

export const uint = () => z.instanceof(UInt<number>);
export const double = () => z.instanceof(Double);
export const decimal = () => z.instanceof(Decimal);
export const blob = () => z.instanceof(ArrayBuffer);
export const list: () => z.ZodArray<z.ZodLazy<z.ZodType<RpcValue>>> = () => z.array(z.lazy<z.ZodType<RpcValue>>(rpcvalue));

const withMetaInstanceParser = z.instanceof(RpcValueWithMetaData);
export const rpcvalue: () => ZodType<RpcValue> = () => z.lazy(() => z.union([
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
    recmap(rpcvalue()),
    withMetaInstanceParser,
]) as z.ZodType<RpcValue>);

export const withMeta = <MetaSchema extends MetaMap, ValueSchema extends RpcValueType>(metaParser: ZodType<MetaSchema>, valueParser: ZodType<ValueSchema>) =>
    z.custom<RpcValueWithMetaData<z.infer<typeof metaParser>, z.infer<typeof valueParser>>>().check(ctx => {
        if (!withMetaInstanceParser.safeParse(ctx.value).success) {
            ctx.issues.push({
                expected: 'map',
                code: 'invalid_type',
                input: ctx.value,
                message: 'Invalid input: expected a value with metadata, got a value with no metadata}',
            });
            return;
        }

        const parsedMeta = metaParser.safeParse(ctx.value.meta);
        if (!parsedMeta.success) {
            ctx.issues = [
                {
                    expected: 'map',
                    code: 'invalid_type',
                    input: ctx.value,
                    message: 'Wrong RpcValueWithMetaData meta',
                },
                ...parsedMeta.error.issues as typeof ctx.issues,
            ];
            return;
        }

        const parsedValue = valueParser.safeParse(ctx.value.value);
        if (!parsedValue.success) {
            ctx.issues = [
                {
                    expected: 'map',
                    code: 'invalid_type',
                    input: ctx.value,
                    message: 'Wrong RpcValueWithMetaData value',
                },
                ...parsedValue.error.issues as typeof ctx.issues,
            ];
        }
    });

export * from 'zod/v4';
export {z} from 'zod/v4';
