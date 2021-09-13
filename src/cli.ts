import { command, option, string } from "cmd-ts"
import { isLeft } from "fp-ts/lib/Either"
import { promises as fs } from "fs"
import { join, resolve } from "path"
import { injectLanguageToOutput, writeTranslations } from "./fs"
import { logger } from "./logger"
import { generateTranslations, TranslationGenerationError } from "./translation"
import { generateTypings } from "./typegen"
import { DiscriminateUnion } from "./utils"

const app = command({
  name: "process translations",
  args: {
    input: option({
      type: string,
      long: "input",
      description: "The directory with all translations",
    }),
    output: option({
      short: "o",
      type: string,
      long: "output",
      description: "The directory merged translations will be emitted to",
    }),
    declarations: option({
      type: string,
      long: "declarations",
      // displayName: "Type declarations",
      description: "The directory merged translations will be emitted to",
    }),
    source: option({
      type: string,
      defaultValue: () => "en",
      long: "source",
      short: "s",
    }),
  },
  async handler({ input, source, output, declarations }) {
    const allLanguages = (await fs.readdir(input, { withFileTypes: true }))
      .filter(dir => dir.isDirectory())
      .map(dir => dir.name)
    logger.info(
      `🏎️  Preparing to generate translation files for ${allLanguages.length} languages.`
    )
    const englishTranslations = await generateTranslations(join(input, source))
    if (isLeft(englishTranslations)) {
      // TODO: error
      return
    }
    for (const language of allLanguages) {
      const outputPath = injectLanguageToOutput(output, language)
      if (isLeft(outputPath)) {
        if (outputPath.left.type === "missing_variable") {
          return logger.error(
            `Missing required template ${outputPath.left.variable}.\nExample: ./outputs/%lang/all.json`
          )
        }
        return
      }
      console.log(`⌛ Generating translation files for ${language}`)
      const rootFolder = join(input, language)
      const translations = await generateTranslations(rootFolder)
      if (isLeft(translations)) {
        // I can't figure out the typing to this lmfao
        const a = translations.left as any
        const message = errorFormatters[translations.left.type](a)
        logger.error(message)
        process.exit(1)
      }
      const defaultedTranslations = {
        ...englishTranslations.right,
        ...translations.right,
      }
      await writeTranslations(outputPath.right, defaultedTranslations)
    }
    if (declarations) {
      const destination = resolve(declarations)

      console.log(`⌨️️  Generating typings...`)
      // await generateTypings(englishTranslations.right, {
      //   destination,
      // })
    }
    console.log("🎌 Generated all translations!")
    process.exit(0)
  },
})

type Formatters = {
  [T in TranslationGenerationError["type"]]: (
    error: Omit<
      DiscriminateUnion<TranslationGenerationError, "type", T>,
      "type"
    >
  ) => string
}

export const errorFormatters: Formatters = {
  clashingKey: err =>
    `Top-level key "${err.keyPath}" in ${err.reusedIn} already exists in ${err.declaredIn}.\nNamespaces in json files must be unique across every file in a language folder`,
  emptyObject: err =>
    `Found an empty object in [${err.file}] on key '${err.path}'.\nNested namespaces in translation files must have at least one key-value pair.`,
  unexpectedValue: err =>
    `Found an unexpected key-value pair in [${err.file}] '${err.path}: ${err.value}'`,
  invalidJsonFile: err =>
    `JSON file in '${err.file}' is not valid\n${err.contents}`,
  missingOtherBranch: err =>
    `Select statement in key "${err.path}" is missing a required "other" case.\nIf the pattern is meant to be exhaustive use "other {}" to ignore other values. For more context check https://github.com/format-message/format-message/issues/320`,
  replaceComplexTag: err =>
    `Translation source '${err.key}' in [${err.file}] has tag input <${err.tagName}>{${err.argumentName}}</${err.tagName}> that can be reduced to {${err.argumentName}}.\nVariables can already be values wrapped around React components.`,
  typeGenerationError: err => `Failed to generate types: ${err.message}`,
}

export default app
