import ts from 'typescript';
import { posix } from 'node:path';

export function inspectPublicSource(file: string, source: string): string[] {
  const normalized = file.replaceAll('\\', '/');
  const root = /^(apps\/(?:player|operator)|packages\/(?:client|contracts|ui))\/src\//.exec(
    normalized,
  )?.[1];
  if (!root) return [];
  const errors: string[] = [];
  const check = (specifier: string) => {
    const target = specifier.startsWith('.')
      ? posix.normalize(posix.join(posix.dirname(normalized), specifier))
      : specifier;
    if (
      specifier.startsWith('.')
        ? !target.startsWith(`${root}/src/`)
        : specifier.startsWith('@hunter-world/')
          ? !/^@hunter-world\/(contracts|client|ui)(\/|$)/.test(specifier)
          : /^(node:|pg$|pg-boss$|drizzle-orm|dotenv|\/|[A-Za-z]:)/.test(specifier)
    ) {
      errors.push(`${normalized}: forbidden public dependency ${specifier}`);
    }
  };
  const ast = ts.createSourceFile(
    normalized,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      check(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(ast);
      if (
        expression === 'import' ||
        expression === 'require' ||
        expression === 'import.meta.glob'
      ) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument)) check(argument.text);
        else
          errors.push(`${normalized}: computed dependencies require an explicit reviewed import`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return errors;
}
