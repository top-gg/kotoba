import { right } from "fp-ts/lib/Either"
import { generateTypings } from "./typegen"

describe("type generation", () => {
  it("produces output without crashing", async () => {
    const result = await generateTypings(
      {
        name: { a: "a", b: "b" },
        out: {
          a: '"a" | "b"',
        },
        something: {},
      },
      {
        destination: "./dist/example",
      }
    )
    expect(result).toStrictEqual(right(undefined))
  })
})
