import { parseTypes } from "./parser"
import { generateTypings } from "./typegen"

describe("typegeneration", () => {
  it("produces correct output", () => {
    generateTypings(
      {
        name: "string",
        out: '"memes" | "nice"',
      },
      {
        destination: "./example",
      }
    )
  })
})
