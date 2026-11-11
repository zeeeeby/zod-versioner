import { isInvalidVersionType, isUnsupportedVersion, Versioner } from '../src'
import { describe, it, expect, vi } from 'vitest'
import z from 'zod'
import { Equal, Expect } from './test-utils'

describe('versioner', () => {
    it.each(['latest', 'target'] as const)('returns a ZodError with the failing transition and cause (%s)', method => {
        const cause = new TypeError('cannot migrate title')
        const afterFailure = vi.fn(data => data)
        const schema = z.object({ v: z.literal(1), title: z.string() })
        const versioner = Versioner()
            .version(schema)
            .version(schema.extend({ v: z.literal(2) }), data => data)
            .version(schema.extend({ v: z.literal(3) }), () => { throw cause })
            .version(schema.extend({ v: z.literal(4) }), afterFailure)
        const result = method === 'latest'
            ? versioner.safeUpgradeToLatest({ v: 1, title: 'Title' })
            : versioner.safeUpgradeTo({ v: 1, title: 'Title' }, 4)
        expect(result.success).toBe(false)
        if (result.success) throw new Error('Expected migration failure')
        expect(result.error).toBeInstanceOf(z.ZodError)
        expect(result.error.issues).toMatchObject([{
            code: 'custom', path: [], params: { fromVersion: 2, toVersion: 3 },
            message: 'Migration from version 2 to 3 failed: cannot migrate title',
        }])
        expect(Object.getOwnPropertyDescriptor(result.error, 'cause')?.value).toBe(cause)
        expect(isInvalidVersionType(result.error)).toBe(false)
        expect(isUnsupportedVersion(result.error)).toBe(false)
        expect(afterFailure).not.toHaveBeenCalled()
        expect(versioner.safeUpgradeTo({ v: 1, title: 'Title' }, 2)).toEqual({ success: true, data: { v: 2, title: 'Title' } })
    })

    it.each(['failure', null, { reason: 'failure' }])('handles non-Error thrown values: %j', cause => {
        const schema = z.object({ v: z.literal(1) })
        const versioner = Versioner().version(schema)
            .version(schema.extend({ v: z.literal(2) }), () => { throw cause })
        const result = versioner.safeUpgradeToLatest({ v: 1 })
        expect(result.success).toBe(false)
        if (result.success) throw new Error('Expected migration failure')
        expect(result.error).toBeInstanceOf(z.ZodError)
        expect(Object.getOwnPropertyDescriptor(result.error, 'cause')?.value).toBe(cause)
    })

    it('catches exceptions in current-version schema parsing and malformed source migrations', () => {
        const schema = z.object({ v: z.literal(1), title: z.string() })
        const versioner = Versioner().version(schema)
            .version(schema.extend({ v: z.literal(2), title: z.string().transform((): string => { throw new Error('transform failed') }) }), data => ({ ...data, title: data.title.toUpperCase() }))
        expect(versioner.safeUpgradeToLatest({ v: 1, title: null }).success).toBe(false)
        expect(versioner.safeUpgradeToLatest({ v: 2, title: 'Title' })).toMatchObject({ success: false, error: { issues: [{ code: 'custom' }] } })
        expect(versioner.safeUpgradeTo({ v: 2, title: 'Title' }, 2).success).toBe(false)
    })

    it('returns a ZodError for an unregistered target version', () => {
        const versioner = Versioner().version(z.object({ v: z.literal(1) }))
        // @ts-expect-error Runtime input can bypass the target-version union.
        const result = versioner.safeUpgradeTo({ v: 1 }, 99)
        expect(result.success).toBe(false)
        if (result.success) throw new Error('Expected unsupported target')
        expect(result.error).toBeInstanceOf(z.ZodError)
        expect(isUnsupportedVersion(result.error)).toBe(true)
    })
    it('should migrate from v1 to v2', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV2 = SchemaV1.extend({
            v: z.literal(2),
            content: z.string(),
        })
        const m = Versioner()
            .version(SchemaV1)
            .version(SchemaV2, (data) => {
                return {
                    ...data,
                    content: 'migrated',
                }
            })

        const input = { v: 1, title: 'Title' }
        const output = m.safeUpgradeToLatest(input)
        expect(output).toEqual({ success: true, data: { v: 2, title: 'Title', content: 'migrated' } })

        type Output = z.infer<typeof SchemaV2>

        type cases = [
            Expect<Equal<
                ReturnType<typeof m.safeUpgradeToLatest>['data'],
                Output | undefined
            >>,
        ]
    })

    it('should prefer version call order rather than version number', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV2 = SchemaV1.extend({
            v: z.literal(3),
            content: z.string(),
        })
        const SchemaV3 = SchemaV2.extend({
            v: z.literal(2),
            extra: z.string(),
        })
        const m = Versioner()
            .version(SchemaV1)
            .version(SchemaV2, (data) => {
                return {
                    ...data,
                    content: 'migrated to v2',
                }
            })
            .version(SchemaV3, (data) => {
                return {
                    ...data,
                    extra: 'migrated to v3',
                }
            })

        const input = { v: 1, title: 'Title' }
        const output = m.safeUpgradeToLatest(input)
        expect(output).toEqual({
            success: true, data: {
                v: 2,
                title: 'Title',
                content: 'migrated to v2',
                extra: 'migrated to v3',
            }
        })
    })

    it('should reject unsupported version', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV3 = z.object({
            v: z.literal(3),
            title: z.string(),
        })
        const m = Versioner().version(SchemaV1).version(SchemaV3, (data) => data)
        const result = m.safeUpgradeToLatest({ v: 2 })
        expect(result.success).toBe(false)
    })

    it('should reject invalid input data', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const m = Versioner().version(SchemaV1)
        const result = m.safeUpgradeToLatest({})
        expect(result.success).toBe(false)

        const result2 = m.safeUpgradeToLatest({ v: "1" })
        expect(result2.success).toBe(false)

        const result3 = m.safeUpgradeToLatest({ v: 1, test: 3 })
        expect(result3.success).toBe(false)
    })

    it("should have correct latestVersion and latestSchema", () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV2 = SchemaV1.extend({
            v: z.literal(2),
            content: z.string(),
        })
        const m = Versioner()
            .version(SchemaV1)
            .version(SchemaV2, (data) => {
                return {
                    ...data,
                    content: 'migrated',
                }
            })

        expect(m.latestVersion()).toBe(2)
        expect(m.latestSchema()).toBe(SchemaV2)

        type cases = [
            Expect<Equal<
                ReturnType<typeof m.latestSchema>,
                typeof SchemaV2
            >>,
            Expect<Equal<
                ReturnType<typeof m.latestVersion>,
                2
            >>
        ]
    })

    it("should migrate from latest version without changes", () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV2 = SchemaV1.extend({
            v: z.literal(2),
            content: z.string(),
        })
        const m = Versioner()
            .version(SchemaV1)
            .version(SchemaV2, (data) => {
                return {
                    ...data,
                    content: 'migrated',
                }
            })

        const input = { v: 2, title: 'Title', content: 'Content' }
        const output = m.safeUpgradeToLatest(input)
        expect(output).toEqual({ success: true, data: input })
    })

    it("should migrate from single version", () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const m = Versioner()
            .version(SchemaV1)

        const input = { v: 1, title: 'Title' }
        const output = m.safeUpgradeToLatest(input)
        expect(output).toEqual({ success: true, data: input })
    })

    it("should skip previous versions", () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV2 = SchemaV1.extend({
            v: z.literal(2),
            content: z.string(),
        })
        const SchemaV3 = SchemaV2.extend({
            v: z.literal(3),
            extra: z.string(),
        })
        const m = Versioner()
            .version(SchemaV1)
            .version(SchemaV2, (data) => {
                return {
                    ...data,
                    content: 'migrated to v2',
                }
            })
            .version(SchemaV3, (data) => {
                return {
                    ...data,
                    extra: 'migrated to v3',
                }
            })

        const input = { v: 2, title: 'Title', content: 'Content' }
        const output = m.safeUpgradeToLatest(input)
        expect(output).toEqual({
            success: true, data: {
                v: 3,
                title: 'Title',
                content: 'Content',
                extra: 'migrated to v3',
            }
        })
    })

    it('should throw error on version duplicate', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV2 = z.object({
            v: z.literal(1),
            title: z.string(),
        })

        const m = Versioner()
            .version(SchemaV1)

        expect(() => {
            // @ts-expect-error
            m.version(SchemaV2, (data) => data)
        }).toThrow()
    })

    it('should migrate to specific version', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV2 = SchemaV1.extend({
            v: z.literal(2),
            content: z.string(),
        })
        const SchemaV3 = SchemaV2.extend({
            v: z.literal(3),
            extra: z.string(),
        })
        const m = Versioner()
            .version(SchemaV1)
            .version(SchemaV2, (data) => {
                return {
                    ...data,
                    content: 'migrated to v2',
                }
            })
            .version(SchemaV3, (data) => {
                return {
                    ...data,
                    extra: 'migrated to v3',
                }
            })

        const input = { v: 1, title: 'Title' }
        const output = m.safeUpgradeTo(input, 2)
        expect(output).toEqual({
            success: true, data: {
                v: 2,
                title: 'Title',
                content: 'migrated to v2',
            }
        })

        const input2 = { v: 1, title: 'Title' }
        const output2 = m.safeUpgradeTo(input2, 3)
        expect(output2).toEqual({
            success: true, data: {
                v: 3,
                title: 'Title',
                content: 'migrated to v2',
                extra: 'migrated to v3',
            }
        })
    })

    it('shouldnt migrate to unsupported version', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV3 = z.object({
            v: z.literal(2),
            title: z.string(),
        })
        const m = Versioner().version(SchemaV1).version(SchemaV3, (data) => data)

        // @ts-expect-error
        const result = m.safeUpgradeTo({ v: 1, title: 'Title' }, 3)
        expect(result.success).toBe(false)
    })
    it('should migrate from specific version without changes', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV2 = SchemaV1.extend({
            v: z.literal(2),
            content: z.string(),
        })
        const m = Versioner().version(SchemaV1)
            .version(SchemaV2, (data) => {
                return {
                    ...data,
                    content: 'migrated',
                }
            })

        const result = m.safeUpgradeTo({ v: 2, title: 'Title', content: "test" }, 2)
        expect(result).toEqual({ success: true, data: { v: 2, title: 'Title', content: "test" } })
    })

    it("hasLatestStructure should work", () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV2 = SchemaV1.extend({
            v: z.literal(2),
            content: z.string(),
        })
        const m = Versioner()
            .version(SchemaV1)
            .version(SchemaV2, (data) => {
                return {
                    ...data,
                    content: 'migrated',
                }
            })

        expect(m.hasLatestStructure({ v: 2, title: 'Title', content: 'Content' })).toBe(true)
        expect(m.hasLatestStructure({ v: 999, title: 'Title', content: 'Content' })).toBe(true)
        expect(m.hasLatestStructure({ title: 'Title', content: 'Content' })).toBe(false)
        expect(m.hasLatestStructure({ v: 2, title: 'Title' })).toBe(false)
        expect(m.hasLatestStructure({})).toBe(false)
    })

    it("isLatest should work", () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const SchemaV2 = SchemaV1.extend({
            v: z.literal(2),
            content: z.string(),
        })
        const m = Versioner()
            .version(SchemaV1)
            .version(SchemaV2, (data) => {
                return {
                    ...data,
                    content: 'migrated',
                }
            })

        expect(m.isLatest({ v: 2, title: 'Title', content: 'Content' })).toBe(true)
        expect(m.isLatest({ v: 1, title: 'Title' })).toBe(false)
        expect(m.isLatest({})).toBe(false)
    })

    it("should enforce schema version over migrationFn version", () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
        })
        const SchemaV2 = SchemaV1.extend({
            v: z.literal(2),
        })
        const m = Versioner()
            .version(SchemaV1)
            .version(SchemaV2, (data) => {
                return {
                    ...data,
                    v: 34
                }
            })

        const result = m.safeUpgradeToLatest({ v: 1 })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toEqual({ v: 2 })
        }
    })
})


describe('isUnsupportedVersion', () => {
    it('should detect unsupported version error', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const m = Versioner().version(SchemaV1)
        const result = m.safeUpgradeToLatest({ v: 2 })
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(isUnsupportedVersion(result.error)).toBe(true)
        }
    })

    it('shouldnt detect unsupported version error for invalid data', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const m = Versioner().version(SchemaV1)
        const result = m.safeUpgradeToLatest({})
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(isUnsupportedVersion(result.error)).toBe(false)
        }
    })
})


describe('isInvalidVersionType', () => {
    it('should detect invalid version type error', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const m = Versioner().version(SchemaV1)
        const result = m.safeUpgradeToLatest({ v: "1" })
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(isInvalidVersionType(result.error)).toBe(true)
        }
    })

    it('shouldnt detect invalid version type error for unsupported version', () => {
        const SchemaV1 = z.object({
            v: z.literal(1),
            title: z.string(),
        })
        const m = Versioner().version(SchemaV1)
        const result = m.safeUpgradeToLatest({ v: 2 })
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(isInvalidVersionType(result.error)).toBe(false)
        }
    })

})
