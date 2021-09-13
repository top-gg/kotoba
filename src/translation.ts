import { Either, isLeft, isRight, left, right } from "fp-ts/lib/Either"
import { isSome, none, Option, some } from "fp-ts/lib/Option"
import glob from "fast-glob"
import { join } from "path"
import { promises as fs } from "fs"
import { logger } from "./logger"
import { ParseError } from "./parser"
import { TypeGenerationError } from "./typegen"

type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | JSONObject | JSONArray
type JSONObject = { [member: string]: JSONValue }
interface JSONArray extends Array<JSONValue> {}

export type Translations = Record<string, string>

export type FlatteningErrorWithoutFile =
  | { type: "emptyObject"; path: string }
  | { type: "unexpectedValue"; path: string; value: JSONValue }

export type FlatteningError = FlatteningErrorWithoutFile & { file: string }

const DEFAULT_KEY_DELIMITER = "."

export type TranslationGenerationError =
  | FlatteningError
  | ParseError
  | TypeGenerationError

function excludeGenerated(
  files: string[],
  rootFolder: string,
  excludedFileNames: string[] = []
): string[] {
  const excludedFullPaths = excludedFileNames.map(name =>
    join(rootFolder, name)
  )
  return files.filter(file =>
    excludedFullPaths.every(excluded => excluded !== file)
  )
}

export function flattenTranslation(
  declarations: JSONObject,
  prefix: Option<string> = none
): Either<FlatteningErrorWithoutFile, Translations> {
  let translations: Translations = {}

  for (const [key, value] of Object.entries(declarations)) {
    const path = isSome(prefix)
      ? `${prefix.value}${DEFAULT_KEY_DELIMITER}${key}`
      : key

    const invalidValue = (value: JSONValue) =>
      left({ type: "unexpectedValue", path, value } as const)

    if (typeof value === "string") {
      translations[path] = value
    } else if (typeof value === "object") {
      // javascript sucks
      if (Array.isArray(value) || value === null) {
        return invalidValue(value)
      }
      // objects with 0 items in it cannot be flattened without unsafely
      // disposing of the key itself. This is almost always a programmer mistake
      // so it should be handled as an error
      if (Object.keys(value).length === 0) {
        return left({ type: "emptyObject", path })
      }

      const next = flattenTranslation(value, some(path))

      if (isRight(next)) {
        translations = {
          ...translations,
          ...next.right,
        }
      } else {
        return left(next.left)
      }
    } else {
      return invalidValue(value)
    }
  }

  return right(translations)
}

type TopLevelKeys = Record<string, string>

export async function generateTranslations(
  rootFolder: string
): Promise<Either<TranslationGenerationError, Translations>> {
  // simulating a json glob pattern as if it's a real path
  const globPattern = join(rootFolder, "**/*.json")
  const files = await glob(globPattern).then(files =>
    excludeGenerated(files, rootFolder)
  )
  const topLevelKeys: TopLevelKeys = {}
  let out: Translations = {}

  function overlappingSourceKey(key: string): string | undefined {
    for (const [existingKey, source] of Object.entries(topLevelKeys)) {
      if (key === existingKey) {
        return source
      }
    }
  }

  for (const file of files) {
    const fileStr = await fs.readFile(file, "utf-8")
    let translations: JSONObject
    try {
      translations = JSON.parse(fileStr)
    } catch (err) {
      if (err instanceof Error && err.name === "SyntaxError") {
        return left({
          type: "invalidJsonFile",
          contents: fileStr,
          file,
        })
      } else {
        logger.error(err)
      }
      // TODO: remove this panic
      return process.exit(1)
    }

    // we only need to check the top level because that's where the translations
    // are being joined, in deeper levels the conflicts are already apparent.
    for (const key of Object.keys(translations)) {
      const maybeDuplicateKeySource = overlappingSourceKey(key)
      if (maybeDuplicateKeySource) {
        return left({
          type: "clashingKey",
          keyPath: key,
          reusedIn: file,
          declaredIn: maybeDuplicateKeySource,
          // just to satisfy the interface
          file,
        })
      }
      topLevelKeys[key] = file
    }
    const values = flattenTranslation(translations)
    if (isLeft(values)) {
      return left({
        ...values.left,
        file,
      })
    }
    out = { ...out, ...values.right }
  }
  return right(out)
}
