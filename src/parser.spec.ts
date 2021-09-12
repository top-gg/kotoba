import { isLeft, isRight } from "fp-ts/lib/Either"
import {
  DATE_TYPE,
  generateTypings,
  NUMBER_TYPE,
  REACT_NODE_TYPE,
  STRING_TYPE,
  TAG_MAPPER_TYPE,
} from "./typegen"

const typedAs = (text: string, o: unknown) => {
  const input = generateTypings(text, "")
  if (isLeft(input)) {
    throw input
  }
  expect(input.right).toEqual(o)
}

const erroredAs = (text: string, o: unknown) => {
  const input = generateTypings(text, "")
  if (isRight(input)) {
    throw input
  }
  expect(input.left).toEqual(o)
}

describe("type generation", () => {
  it("parses arguments", () => {
    typedAs("This bot {botName} has {voteCount, number} upvotes", {
      botName: REACT_NODE_TYPE,
      voteCount: NUMBER_TYPE,
    })
  })

  it("parses numbers", () => {
    typedAs("This bot has {count, plural, one {# review} other {# reviews}}", {
      count: NUMBER_TYPE,
    })
  })

  it("parses dates", () => {
    typedAs("Your account was created on {creationDate, date}", {
      creationDate: DATE_TYPE,
    })
  })

  it("parses html tags", () => {
    typedAs("Press <kbd>Enter</kbd> or <kbd>Space</kbd> to restart", {
      kbd: TAG_MAPPER_TYPE,
    })
  })

  it("parses strict select statements", () => {
    typedAs(
      "Top voted {type, select, bot {bots} server {servers} other {}} on Top.gg",
      {
        type: '"bot" | "server"',
      }
    )
  })

  it("parses loose select statements", () => {
    typedAs(
      "Top voted {type, select, bot {bots} server {servers} other {entities}} on Top.gg",
      {
        type: STRING_TYPE,
      }
    )
  })

  it("suggests corrections for unnecessarily nested elements", () => {
    // Arguments can be typed with ReactNode so this translation should be typed as
    // "Are you sure you want to permanently delist and delete {entityName} from Top.gg?"
    erroredAs(
      "Are you sure you want to permanently delist and delete <b>{entityName}</b> from Top.gg?",
      {
        type: "replace_tag_and_argument_with_argument",
        key: "",
        tagName: "b",
        argumentName: "entityName",
      }
    )
  })

  it("parses complex expressions in plurals", () => {
    typedAs(
      "{votes, plural, one {<b>#</b> vote} other {<b>#</b> votes}} this month",
      {
        b: TAG_MAPPER_TYPE,
        votes: NUMBER_TYPE,
      }
    )
  })
})
