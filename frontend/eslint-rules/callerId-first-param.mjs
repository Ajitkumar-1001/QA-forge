import fs from "node:fs";
import path from "node:path";

function candidateTestPaths(sourceFilename) {
  const dir = path.dirname(sourceFilename);

  const repoRoot = dir.slice(0, dir.indexOf(`${path.sep}src${path.sep}`) + 1);
  const base = path.basename(sourceFilename, path.extname(sourceFilename));
  return ["unit", "integration"].map((kind) => path.join(repoRoot, "tests", kind, `${base}.test.ts`));
}

function functionsFromDeclaration(declaration) {
  if (!declaration) return [];
  if (declaration.type === "FunctionDeclaration") return [{ node: declaration, fn: declaration }];
  if (declaration.type === "VariableDeclaration") {
    return declaration.declarations
      .filter((d) => d.init && (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression"))
      .map((d) => ({ node: d, fn: d.init }));
  }
  return [];
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "SEC-009: every function exported from src/lib/repositories/** must take callerId as its literal first parameter, and have a matching test file.",
    },
    schema: [],
    messages: {
      missingCallerId:
        "'{{name}}' is exported from src/lib/repositories/ but its first parameter is {{actual}}, not `callerId` (SEC-009). Every user-facing repository method must scope its query by callerId — see contracts/ownership-convention.md.",
      missingTestFile:
        "'{{name}}' is exported from src/lib/repositories/ but has no matching ownership-fixture test (expected one of: {{expected}}) (SEC-009).",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const testedInThisRun = new Set();

    return {
      ExportNamedDeclaration(node) {
        for (const { node: reportNode, fn } of functionsFromDeclaration(node.declaration)) {
          const name = fn.id?.name ?? reportNode.id?.name ?? (reportNode.type === "VariableDeclarator" ? reportNode.id.name : "<anonymous>");
          const first = fn.params[0];
          const firstName = first?.type === "Identifier" ? first.name : first ? `a ${first.type}` : "missing";

          if (firstName !== "callerId") {
            context.report({ node: reportNode, messageId: "missingCallerId", data: { name, actual: firstName } });
          }

          if (!testedInThisRun.has(name)) {
            testedInThisRun.add(name);
            const candidates = candidateTestPaths(filename);
            const hasTest = candidates.some((p) => fs.existsSync(p));
            if (!hasTest) {
              context.report({
                node: reportNode,
                messageId: "missingTestFile",
                data: { name, expected: candidates.map((p) => path.relative(path.dirname(filename), p)).join(" or ") },
              });
            }
          }
        }
      },
    };
  },
};

const plugin = { rules: { "callerId-first-param": rule } };
export default plugin;
