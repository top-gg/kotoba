import { left, right } from "fp-ts/lib/Either"
import { flattenTranslation, generateTranslations } from "./translation"

describe("flattening translations", () => {
  it("warns on empty objects", () => {
    const a = flattenTranslation({ key: { other: {} } })
    expect(a).toEqual(left({ type: "empty_object", path: "key.other" }))
  })
  it("warns on invalid values", () => {
    const object = {
      stan: {
        dreamcatcher: 1,
      },
    }
    expect(flattenTranslation(object)).toEqual(
      left({
        type: "unexpected_value",
        path: "stan.dreamcatcher",
        value: 1,
      })
    )
  })
  it("compiles nested objects", () => {
    const object = {
      some: {
        nested: {
          keys: "here",
        },
      },
      other: {
        nested: {
          here: "and",
          some: "there",
        },
      },
    }
    expect(flattenTranslation(object)).toEqual(
      right({
        "some.nested.keys": "here",
        "other.nested.here": "and",
        "other.nested.some": "there",
      })
    )
  })
})

describe("translation generation", () => {
  it("generates translations for valid en", async () => {
    const a = await generateTranslations("./src/__fixtures__/valid/en") // ??
    expect(a).toMatchSnapshot()
  })

  it("fails on invalid directory generation", async () => {
    const a = await generateTranslations("./src/__fixtures__/mixed/en_invalid") // ??
    expect(a).toMatchSnapshot()
  })
})
