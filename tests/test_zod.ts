import { fromCpon } from '../src/cpon';
import { makeIMap, makeMap, makeMetaMap } from '../src/rpcvalue';
import * as z from '../src/zod';

z.map({ ok: z.boolean(), })
	.parse(makeMap({ok: true}))
	.ok;
z.imap({ 1: z.boolean(), })
	.parse(makeIMap({1: true}))[1];

{
	const x = z.metamap({1: z.boolean(), ok: z.boolean()})
		.parse(makeMetaMap({1: true, ok: true}))
	x.ok;
	x[1];
}

const SiteInfoZod = z.recmap(z.map({
    optKey: z.map({
    }).optional(),
}));

const lol = fromCpon(`{"key": {}}`);
SiteInfoZod.parse(lol);
