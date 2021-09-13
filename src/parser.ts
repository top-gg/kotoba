import {
  ArgumentElement,
  MessageFormatElement,
  parse,
  PluralOrSelectOption,
  TYPE,
} from "@formatjs/icu-messageformat-parser"
import { Either, right, left, isLeft } from "fp-ts/lib/Either"

export const REACT_NODE_TYPE = "ReactNode"
export const STRING_TYPE = "string"
export const TAG_MAPPER_TYPE = "TagMapper"
export const NUMBER_TYPE = "number"
export const DATE_TYPE = "Date"

export type TranslationArguments = Record<string, string | string[]>

export type ParseErrorWithoutFile =
  | {
      type: "invalidJsonFile"
      contents: string
    }
  | {
      type: "clashingKey"
      keyPath: string
      declaredIn: string
      reusedIn: string
    }
  | { type: "missingOtherBranch"; path: string }
  | {
      type: "replaceComplexTag"
      tagName: string
      argumentName: string
      key: string
    }

export type ParseError = ParseErrorWithoutFile & { file: string }

const extractTypeFromElement = (
  elem: MessageFormatElement,
  key: string
): Either<ParseErrorWithoutFile, TranslationArguments> => {
  let out: TranslationArguments = {}

  const parseOutBranchesImpurely = (
    options: PluralOrSelectOption | MessageFormatElement[]
  ): ParseErrorWithoutFile | undefined => {
    for (const child of "value" in options ? options.value : options) {
      const nested = extractTypeFromElement(child, key)

      // why doesn't this language have do notation I'm so angry
      if (isLeft(nested)) {
        return nested.left
      }
      out = { ...out, ...nested.right }
    }
  }

  if (elem.type === TYPE.tag) {
    const tagName = elem.value
    out[tagName] = TAG_MAPPER_TYPE

    const hasUnnecessarilyNestedArguments =
      elem.children.length === 1 && elem.children[0].type === TYPE.argument

    if (hasUnnecessarilyNestedArguments) {
      const argumentName = (elem.children[0] as ArgumentElement).value
      // simplify <?>{elem}</?> to {elem}
      return left({
        type: "replaceComplexTag",
        key,
        tagName,
        argumentName,
      })
    }

    const error = parseOutBranchesImpurely(elem.children)
    if (error) {
      return left(error)
    }
  } else if (elem.type === TYPE.number) {
    out[elem.value] = NUMBER_TYPE
  } else if (elem.type === TYPE.select) {
    /**
     * Unfortunately ICU syntax is the dumbest thing humankind has ever
     * created and doesn't allow select statements without a default case
     * which means that if we want to represent an finite enum of inputs
     * that we can use exhaustive checks on we MUST attach an empty `other` case. Otherwise
     * sites like Crowdin will not consider the translation to be valid.
     *
     * @example { "entity": "Discord {type, select, bot {Bots} server {Servers} other {}}" }
     * @see https://github.com/format-message/format-message/issues/320
     */
    if (!("other" in elem.options)) {
      return left({
        type: "missingOtherBranch",
        path: key,
      })
    }

    const rawOptions = Object.keys(elem.options)
    const cases = rawOptions.filter(key => key !== "other")

    const hasStrictInputs = Object.entries(elem.options).some(
      ([key, { value }]) => key === "other" && value.length === 0
    )
    out[elem.value] = hasStrictInputs ? cases : STRING_TYPE

    const errors = Object.values(elem.options).map(parseOutBranchesImpurely)
    for (const err of errors) {
      if (err) {
        return left(err)
      }
    }
  } else if (elem.type === TYPE.date) {
    // This should really never be used but whatever
    out[elem.value] = DATE_TYPE
  } else if (elem.type === TYPE.argument) {
    // an argument can be a separate component as well
    out[elem.value] = REACT_NODE_TYPE
  } else if (elem.type === TYPE.plural) {
    out[elem.value] = NUMBER_TYPE
    const errors = Object.values(elem.options).map(parseOutBranchesImpurely)
    for (const err of errors) {
      if (err) {
        return left(err)
      }
    }
  }
  return right(out)
}

export function parseTypes(
  icu: string,
  key: string
): Either<ParseErrorWithoutFile, TranslationArguments> {
  let out: TranslationArguments = {}
  const parseResult = parse(icu)
  for (const elem of parseResult) {
    const result = extractTypeFromElement(elem, key)
    if (isLeft(result)) {
      return result
    }
    out = { ...out, ...result.right }
  }
  return right(out)
}

type PreparedTypings = {
  file: string
  declarations: Record<string, string>
}

export type TranslationTypes = Record<string, TranslationArguments>

export async function generateAllTypings(
  generatedTranslations: PreparedTypings[]
): Promise<Either<ParseError, TranslationTypes>> {
  const types: TranslationTypes = {}
  for (const { file, declarations } of generatedTranslations) {
    for (const [key, value] of Object.entries(declarations)) {
      const result = parseTypes(value, key)
      if (isLeft(result)) {
        return left({
          ...result.left,
          file,
        })
      }
      types[key] = result.right
    }
  }
  return right(types)
}
