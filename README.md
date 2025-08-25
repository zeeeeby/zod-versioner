# zod-versioner

Type-safe data versioning library using Zod schemas

## Features

-   Type-safe data migration between versions
-   Data structure validation using Zod
-   Support for sequential migrations
-   Safe upgrade to latest or specific version

## Quick start

Install the package:

```bash
npm install zod-versioner
# or
yarn add zod-versioner
# or
pnpm add zod-versioner
```

Usage:

```typescript
import { Versioner } from "./versioner"
import z from "zod"

// Define schemas for different versions
const SchemaV1 = z.object({
	v: z.literal(1),
	title: z.string(),
})

const SchemaV2 = SchemaV1.extend({
	v: z.literal(2),
	content: z.string(),
})

// Create versioner and register schemas
const versioner = Versioner()
	.version(SchemaV1)
	.version(SchemaV2, (data) => {
        // typescript infers type data = SchemaV1
        // typescript infers return type = SchemaV2
		return {
			...data,
			content: "default content",
		}
	})

// typescript infers type equal to the last registered schema in versioner instance
const LatestSchema = versioner.latestSchema() 


const result = versioner.safeUpgradeToLatest({
	v: 1,
	title: "Hello",
})
// => { success: true, data: { v: 2, title: 'Hello', content: 'default content' } }
```

## API

#### `Versioner()`

Creates a new versioner instance.

#### `.latestSchema()`

Returns the typed schema of the latest registered version.


#### `.latestVersion()`

Returns the literal number of the latest registered version.

#### `.version(schema, migrationFn)`

Registers a new version schema:

-   `schema`: Zod object schema with required field `v: z.ZodLiteral<number>`
-   `migrationFn`: Migration function with fully inferred parameter and return types 

#### `.safeUpgradeToLatest(data)`

Safely upgrades data to the latest version. Returns `ZodSafeParseResult`

#### `.safeUpgradeTo(data, version)`

Safely upgrades data to the specified version. Returns `ZodSafeParseResult`

> Typescript only allows versions that are registered in versioner instance

#### `.isLatest(data)`

Checks if data matches the latest version schema.

#### `.hasLatestStructure(data)`

Checks if data structure matches the latest version schema (ignoring actual version value and extra fields).

## Error Handling

```typescript
import { isInvalidVersionType, isUnsupportedVersion } from "./versioner"

const result = versioner.safeUpgradeToLatest(data)
if (!result.success) {
	if (isUnsupportedVersion(result.error)) {
		// Valid version type but not registered in Versioner instance
	}
	if (isInvalidVersionType(result.error)) {
		// Invalid version type
	}
}
```
