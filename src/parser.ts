import {
  ArgumentElement,
  MessageFormatElement,
  parse,
  PluralOrSelectOption,
  TYPE,
} from "@formatjs/icu-messageformat-parser"
import { Either, right, left, isLeft } from "fp-ts/lib/Either"
import { format } from "prettier"
import { promises as fs } from "fs"

export const REACT_NODE_TYPE = "ReactNode"
export const STRING_TYPE = "string"
export const TAG_MAPPER_TYPE = "TagMapper"
export const NUMBER_TYPE = "number"
export const DATE_TYPE = "Date"

export type Types = Record<string, string>

type TypeGenerationError =
  | { type: "missing_other_branch"; path: string }
  | { type: "tag_syntax"; input: string }
  | { type: "tag_mismatch"; input: string }
  | {
      type: "replace_tag_and_argument_with_argument"
      tagName: string
      argumentName: string
      key: string
    }

const extractTypeFromElement = (
  elem: MessageFormatElement,
  key: string
): Either<TypeGenerationError, Types> => {
  let out: Types = {}

  const parseOutBranchesImpurely = (
    options: PluralOrSelectOption | MessageFormatElement[]
  ): TypeGenerationError | undefined => {
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
        type: "replace_tag_and_argument_with_argument",
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
        type: "missing_other_branch",
        path: key,
      })
      // throw Error(
      //   `Select statement in key "${key}" is missing a required "other" case. If the pattern is meant to be exhaustive use "other {}" to ignore other values. For more context check https://github.com/format-message/format-message/issues/320`
      // )
    }

    const rawOptions = Object.keys(elem.options)
    const cases = rawOptions
      .filter(key => key !== "other")
      .map(key => JSON.stringify(key))

    const hasStrictInputs = Object.entries(elem.options).some(
      ([key, { value }]) => key === "other" && value.length === 0
    )
    out[elem.value] = hasStrictInputs ? cases.join(" | ") : STRING_TYPE

    const errors = Object.values(elem.options).map(parseOutBranchesImpurely)
    for (const err of errors) {
      if (err) {
        return left(err)
      }
    }
    !selectCaseHasO
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
): Either<TypeGenerationError, Types> {
  let out: Types = {}
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

function serializeTypes(obj: Record<string, string>) {
  return `{
      ${Object.entries(obj).map(([key, value]) => `"${key}": ${value}`)}
    }`
}

export async function generateAllTypings(
  generatedTranslations: Record<string, string>,
  typingsOutput: string
) {
  const types: Record<string, Types> = {}
  for (const [key, value] of Object.entries(generatedTranslations)) {
    const result = parseTypes(value, key)
    if (isLeft(result)) {
      return result
    }
    types[key] = result.right
  }
  const body = Object.entries(types)
    .map(([key, value]) => {
      const hasTypes = Object.keys(value).length > 0
      return `  "${key}": ${hasTypes ? serializeTypes(value) : "never"};`
    })
    .join("\n")
  const out = format(
    `
    import { ReactNode } from "react";
    export type TagMapper = (...input: any[]) => ReactNode;
    export interface TranslationArguments {
      ${body}
    }
  `,
    { semi: true, parser: "typescript" }
  )
  await fs.writeFile(typingsOutput, out)
}
