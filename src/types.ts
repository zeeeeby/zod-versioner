import type z from "zod";

type IsEmptyObject<T> = T extends Record<string, never> ? true : false;

export type VersionerType<Current extends z.ZodObject<{}> = z.ZodObject<{}>, Versions extends {v: number, schema: z.ZodObject<{ v: z.ZodLiteral<number> }>}[] = []> =
    Current extends z.ZodObject<infer U>
    ? IsEmptyObject<U> extends true
        ? {
            version: <New extends z.ZodObject<{ v: z.ZodLiteral<number> }>, 
                        V = New extends z.ZodObject<{ v: z.ZodLiteral<infer Version> }> 
                        ? Version 
                        : never>
                      (schema: New) => VersionerType<New,[...Versions, V extends number ? { v: V, schema: New } : never]  >;
        }
        : {
            version: <New extends z.ZodObject<{ v: z.ZodLiteral<number> }>, 
                        V = New extends z.ZodObject<{ v: z.ZodLiteral<infer Version> }> 
                        ? Version 
                        : never>
                     (schema: V extends Versions[number]['v'] ? never : New, up: (data: Omit<z.infer<Current>, "v">) => Omit<z.infer<New>, "v">) => VersionerType<New, [...Versions, V extends number ? { v: V, schema: New } : never]>;
            latestSchema: () => Current
            latestVersion: () => Current extends z.ZodObject<{ v: z.ZodLiteral<infer U> }> ? U : number
            safeUpgradeToLatest: (data: unknown) => z.ZodSafeParseResult<z.infer<Current>>
            safeUpgradeTo: <V extends Versions[number]['v']>(data: unknown, targetVersion: V) => z.ZodSafeParseResult<z.infer<Extract<Versions[number], { v: V }>['schema']>>
            isLatest: (data: unknown) => data is z.infer<Current>
            hasLatestStructure: (data: unknown) => data is Omit<z.infer<Current>, "v"> & { v: number }
        }
    : never;

