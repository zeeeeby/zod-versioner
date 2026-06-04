import z from "zod";
import type { VersionerType } from "./types";


const VersionSchema = z.looseObject({
    v: z.number()
})


type Handler = { v: number, schema: z.ZodObject<{ v: z.ZodLiteral<number> }>, up?: (data: any) => any }
type VersionerSelf = {
    handlers: Handler[],
    latestVersion: number,
    latestSchema: z.ZodObject<{ v: z.ZodLiteral<number> }>
    versionToIndex: Map<number, number>
}
export const Versioner = (): VersionerType => {
    const self: VersionerSelf = {
        handlers: [],
        latestVersion: 0,
        latestSchema: undefined as any,
        versionToIndex: new Map()
    }


    const validateInput = (schema: any, v: any) => {
        const existing = self.handlers.find(x => x.schema === schema || x.v === v)
        if (existing) {
            throw new Error(
                `Version registration error: version ${v} or schema is already registered. ` +
                `Existing version: ${existing.v}`
            )
        }
    }


    const methods: VersionerType<z.ZodObject<{ v: z.ZodLiteral<number> }>> = {
        latestSchema: () => self.latestSchema,
        version: (schema, up) => {
            const ver = schema._zod.def.shape.v.value;
            validateInput(schema, ver)

            self.latestVersion = ver
            self.latestSchema = schema;
            self.handlers.push({
                v: ver, schema, up: up ? (data) => {
                    const res = up(data)
                    return { ...res, v: ver }
                } : undefined
            });

            self.versionToIndex.set(ver, self.handlers.length - 1);

            return methods as any
        },
        latestVersion: () => self.latestVersion,
        safeUpgradeToLatest: (data) => {
            return migrateTo(data, self.handlers, self.versionToIndex) as any
        },
        safeUpgradeTo: (data, targetVersion) => {
            const target = self.handlers.find(h => h.v === targetVersion)
            if (!target) {
                return {
                    success: false,
                    error: new Error(`Target version ${targetVersion} is not registered. Supported versions: ${self.handlers.map(h => h.v).join(", ")}`)
                }
            }
            const targetIndex = self.handlers.indexOf(target)
            const handlers = self.handlers.slice(0, targetIndex + 1)
            return migrateTo(data, handlers, self.versionToIndex) as any
        },
        isLatest: (data: unknown): data is z.infer<typeof self.latestSchema> => {
            return self.latestSchema.safeParse(data).success
        },
        hasLatestStructure: (data: unknown): data is Omit<z.infer<typeof self.latestSchema>, "v"> & { v: number } => {
            const parsedData = VersionSchema.safeParse(data)
            if (!parsedData.success) {
                return false
            }
            parsedData.data.v = self.latestVersion // ignore version in data, check only structure
            const result = self.latestSchema.safeParse(parsedData.data)

            return result.success
        }
    }

    return methods as any as VersionerType

}

const migrateTo = (data: unknown, handlers: Handler[], versionToIndex: Map<number, number>): z.ZodSafeParseResult<any> => {
    const parsedData = VersionSchema.safeParse(data)
    if (!parsedData.success) {
        return parsedData
    }

    const version = parsedData.data.v;
    const lastIndex = handlers.length - 1;
    const latestHandler = handlers[lastIndex];

    if (version === latestHandler.v) {
        return latestHandler.schema.safeParse(data);
    }

    const startIndex = versionToIndex.get(version);


    if (startIndex == undefined || startIndex > lastIndex) {
        const supportedVersions = handlers.map(h => h.v);
        return {
            success: false,
            error: new z.ZodError([{
                code: "invalid_value",
                path: ["v"],
                message: `Invalid version ${version}, expected one of: ${supportedVersions.join(", ")}`,
                input: parsedData.data,
                values: supportedVersions,
            }])
        }
    }

    let currentData = parsedData.data;
    let lastResult: z.ZodSafeParseResult<any> | undefined;

    for (let i = startIndex + 1; i <= lastIndex; i++) {
        const handler = handlers[i];

        if (handler.up) {
            currentData = handler.up(currentData);
        }
        const result = handler.schema.safeParse(currentData);
        if (!result.success) return result

        if (i === handlers.length - 1) {
            return result;
        }

        currentData = result.data
        lastResult = result;

    }

    return lastResult!;
}

export const isInvalidVersionType = (error: z.ZodError<any>) => {
    return error.issues.some(issue => issue.path[0] === "v" && issue.code === "invalid_type")
}

export const isUnsupportedVersion = (error: z.ZodError<any>) => {
    return error.issues.some(issue => issue.path[0] === "v" && issue.code === "invalid_value")
}