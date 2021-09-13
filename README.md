# Kotoba

Generate flat json files and intelligent typing from a directory of arbitrarily nested translations. 

## Usage
Install the cli with `npm` or `yarn`. it's recommended to set this as a dev dependency and not globally, in case you need to use different versions for different projects.

_npm package still WIP_
```
npm i -D @top-gg/kotoba
```

Target a directory that is split it up by language/language-region names

**Example translation directory**
```
/translations
  /en
    a.json
    b.json
  /kr
    a.json
    b.json
```

Optionally declare a language as a source to set default translations on all the other languages in case not all language translations are synced up with the source language.
```bash
kotoba \
  --input translations \
  --output compiled_translations/%lang/all.json \
  --source en \
  --declarations compiled_translations/_declarations.d.ts
```

Output
```
/compiled_translations
  _declarations.d.ts
  /en
    all.json
  /kr
    all.json
```

## File Merging

Most translation libraries like [`react-intl`](https://github.com/formatjs/formatjs) require translations to be in a flat structure in order for it to be usable on the frontend in a way that looks something like:

**translations.json**
```json
{
  "key1": "value1",
  "key2": "value2",
  "key3": "value3"
}
```

This system works initially, but becomes very difficult to maintain over time as your app grows. Libraries like [`next-i18next`](https://github.com/isaachinman/next-i18next) allow you to merge files but lack the ability to nest keys comfortably. Ideally, we'd like to be able to structure translations in a more readable/hierarchical way and split translations into different modules over time like such:

**translations/home.json**
```json
{
  "homepage": {
    "title": "Find awesome communities",
    "greeting": {
      "new-user": "Welcome to the site {user}!",
      "returning-user": "Welcome back {user}!"
    }
  }
}
```

**translations/user.json**
```json
{
  "user-page": {
    "title": "{user}'s profile",
  }
}
```

Kotoba allows converting a translation structure like the one above and merging it into

**compiled_translations/all.json**
```json
{
  "homepage.greeting.new-user": "Welcome to the site {user}!",
  "homepage.greeting.returning-user": "Welcome back {user}!",
  "homepage.title": "Find awesome communities",
  "user-page.title": "{user}'s profile"
}
```

## Type Generation

One of the most annoying things about working with translations is accidentally making a typo in the translation key and hoping you navigate to the right place to find out before the mistake gets pushed.

Kotoba can generate types for both translation keys and variables used in Format.js/MessageFormat compatible translations. Making sure the translations in your app are valid in compile-time instead of runtime.

```json
{
  "browse-prompt": "Browse some <b>cool</b> {entity, select, bot {servers} server {servers} other {stuff}}!",
  "vote": "You have voted {count, plural, one {one time} other {# times}} in {month}",
  "beta-opt-in": "Switch to beta?"
}
```

```ts
import type { ReactNode } from "react"

export interface TranslationArguments {
  "browser-prompt": {
    b: ReactNode
    entity: string
  }
  vote: {
    count: number
    month: ReactNode
  }
  "beta-opt-in": never
}
```

Want exhaustiveness checks for arguments on enums with limited inputs? Narrow your select cases down to string literal types by leaving the (mandatory) `other` case empty.

```json
{
  "user": {
    "status": "You are a {type, select, mod {Moderator} user {User} other {}}",
  }
}
```

```ts
export interface TranslationArguments {
  "user.status": {
    type: "mod" | "user"
  }
}
```
Narrow other argument types down further by specifying them in your translation source. 

```json
{
  "game-over": "This was your try #{tries, number}. You last played on {lastPlay, date}"
}
```

```ts
export interface TranslationArguments {
  "snake-game-over": {
    tries: number
    lastPlay: Date
  }
}
```
