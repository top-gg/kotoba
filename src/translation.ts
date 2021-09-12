import { Either, isRight, left, right } from "fp-ts/lib/Either"
import { isSome, none, Option, some } from "fp-ts/lib/Option"
import glob from "fast-glob"
import { join } from "path"
import { promises as fs } from "fs"
import { logger } from "./logger"

type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | JSONObject | JSONArray
type JSONObject = { [member: string]: JSONValue }
interface JSONArray extends Array<JSONValue> {}

export type Translations = Record<string, string>

export type FlatteningError =
  | { type: "empty_object"; path: string }
  | { type: "unexpected_value"; path: string; value: JSONValue }

const DEFAULT_KEY_DELIMITER = "."

export type TranslationGenerationError =
  | FlatteningError
  | {
      type: "invalid_json_file"
      contents: string
      path: string
    }
  | {
      type: "empty_object"
      path: string
    }
  | {
      type: "clashing_key"
      keyPath: string
      declaredIn: string
      reusedIn: string
    }

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
): Either<FlatteningError, Translations> {
  let translations: Translations = {}

  for (const [key, value] of Object.entries(declarations)) {
    const path = isSome(prefix)
      ? `${prefix.value}${DEFAULT_KEY_DELIMITER}${key}`
      : key

    const invalidValue = (value: JSONValue) =>
      left({ type: "unexpected_value", path, value } as const)

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
        return left({ type: "empty_object", path })
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

function findEmptyObject(obj: Record<string, any>): string | undefined {
  function go(obj: Record<string, any>, paths: string[]): string | undefined {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "object") {
        const currentPath = [...paths, key]
        if (Object.keys(obj[key]).length === 0) {
          return currentPath.join(".")
        }
        return go(obj[key], currentPath)
      }
    }
  }

  return go(obj, [])
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
  let out: JSONObject = {}

  function overlappingSourceKey(key: string): string | undefined {
    for (const [existingKey, source] of Object.entries(topLevelKeys)) {
      if (key === existingKey) {
        return source
      }
    }
  }

  for (const file of files) {
    const fileStr = await fs.readFile(file, "utf-8")
    let translations
    try {
      translations = JSON.parse(fileStr)
    } catch (err) {
      if (err instanceof Error && err.name === "SyntaxError") {
        return left({
          type: "invalid_json_file",
          contents: fileStr,
          path: file,
        })
      } else {
        logger.error(err)
      }
      return process.exit(1)
    }

    const maybeEmptyObjectKey = findEmptyObject(translations)

    if (maybeEmptyObjectKey) {
      return left({
        type: "empty_object",
        path: file,
      })
      // throw Error(
      //   `Source string "${maybeEmptyObjectKey}" in ${file} is an empty object. All translations must be valid key-value mappings.
      // )
    }

    // we only need to check the top level because that's where the translations
    // are being joined, in deeper levels the conflicts are already apparent.
    for (const key of Object.keys(translations)) {
      const maybeDuplicateKeySource = overlappingSourceKey(key)
      if (maybeDuplicateKeySource) {
        return left({
          type: "clashing_key",
          keyPath: key,
          reusedIn: file,
          declaredIn: maybeDuplicateKeySource,
        })
        // throw Error(
        //   `Top-level key "${key}" in ${file} already exists in ${maybeDuplicateKeySource}. https://www.notion.so/Internationalization-43ce8c6742a04a75a3afd3daf89128eb#d6b644a33d7e49808bb8cc7576454e5b`
        // )
      }
      topLevelKeys[key] = file
    }
    out = { ...out, ...translations }
  }
  return flattenTranslation(out)
}
