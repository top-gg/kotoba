import { Translations } from "./translation"
import { promises as fs } from "fs"
import { left, Either, right } from "fp-ts/lib/Either"

export const writeTranslations = async (
  translationFileOutput: string,
  flatTranslations: Translations
): Promise<void> => {
  const outString = JSON.stringify(flatTranslations, null, 2)
  await fs.writeFile(translationFileOutput, outString)
}

const LANGUAGE_PLACEHOLDER = "%lang"

export type LanguageInjectionError = {
  type: "missing_variable"
  variable: string
}

export const injectLanguageToOutput = (
  template: string,
  language: string
): Either<LanguageInjectionError, string> => {
  if (!template.includes(LANGUAGE_PLACEHOLDER)) {
    return left({ type: "missing_variable", variable: LANGUAGE_PLACEHOLDER })
  }
  return right(template.replace(LANGUAGE_PLACEHOLDER, language))
}
