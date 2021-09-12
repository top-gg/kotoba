import { command, option, optional, positional, string } from "cmd-ts"
import { isLeft, isRight } from "fp-ts/lib/Either"
import { promises as fs } from "fs"
import { join } from "path"
import { injectLanguageToOutput, writeTranslations } from "./fs"
import { logger } from "./logger"
import {
  generateTranslations,
  TranslationGenerationError,
  Translations,
} from "./translation"
import { DiscriminateUnion } from "./utils"

const SOURCE_FOLDER = "en"
const GENERATED_NAME = "_generated.json"
const TRANSLATION_ROOT = "react/translations"
const TYPINGS_NAME = "_generated.d.ts"

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
      const base = await fs.readFile(
        join(input, source, GENERATED_NAME),
        "utf-8"
      )
      console.log(`⌨️️  Generating typings...`)
      await generateAllTypings(JSON.parse(base))
    }
    console.log("🎌 Generated all translations!")
    process.exit(0)
  },
})

type Formatters = {
  [T in TranslationGenerationError["type"]]: (
    error: DiscriminateUnion<TranslationGenerationError, "type", T>
  ) => string
}

export const errorFormatters: Formatters = {
  clashing_key(err) {
    return ""
  },
  empty_object(err) {
    return ""
  },
  invalid_json_file() {
    return ""
  },
  unexpected_value() {
    return ""
  },
}

export default app
