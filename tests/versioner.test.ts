import { isInvalidVersionType, isUnsupportedVersion, Versioner } from '../src'
import { describe, it, expect } from 'vitest'
import z from 'zod'

describe('versioner', () => {
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