import { Project } from "ts-morph"
import { REACT_NODE_TYPE, Types } from "./parser"

type TypeGenerationOptions = {
  destination: string
  fileName?: string
  interfaceName?: string
}

export const generateTypings = (types: Types, opts: TypeGenerationOptions) => {
  const {
    interfaceName = "TranslationArguments",
    fileName = "_generated.d.ts",
    destination,
  } = opts
  // TODO: use user's tsconfig settings
  const project = new Project({
    compilerOptions: { outDir: destination, declaration: true },
  })
  const source = project.createSourceFile(fileName, "const num = 1;")
  source.addImportDeclaration({
    moduleSpecifier: "react",
    isTypeOnly: true,
    namedImports: [{ name: REACT_NODE_TYPE }],
  })
  source.addTypeAlias({
    name: "TagMapper",
    isExported: true,
    type: `(input: any) => ${REACT_NODE_TYPE}`,
  })
  source.addInterface({
    name: interfaceName,
    isExported: true,
    properties: Object.entries(types).map(([key, value]) => {
      return {
        name: key,
        type: value,
      }
    }),
  })
  return project.emit()
}
