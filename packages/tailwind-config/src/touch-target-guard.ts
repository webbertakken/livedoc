// The static touch-target guard (docs/specs/004-interface-design/touch-targets.md, "How").
//
// `touch-target` and `touch-target-y` draw an absolutely positioned `::before` pad, so the control that carries one
// must be positioned itself. A static host lets the pad fill its nearest positioned ancestor instead: the help
// centre's last popular-topic chip took every tap on the hero, its search box included, and a Plan column's Remove
// Column took every tap in its popover on a phone. So a class list that names either utility names a position too
// (`relative`, `absolute`, `fixed` or `sticky`), in the same className attribute or `className:` property.

import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { parseSourceFiles } from '@livedoc/source-ast';
import { isTypeScriptSource, listSourceFiles } from './source-files';
import {
  isIdentifier,
  isJsxAttribute,
  isNoSubstitutionTemplateLiteral,
  isPropertyAssignment,
  isStringLiteral,
  isTemplateExpression,
  type Node,
  type SourceFile,
} from 'typescript/unstable/ast';

type TouchTargetViolation = { file: string; line: number; snippet: string };

const PAD = /(^|\s)touch-target(-y)?(\s|$)/;
const POSITIONED = /(^|\s)(relative|absolute|fixed|sticky)(\s|$)/;

/** Every static class chunk under a node: string literals, template heads and spans. */
function classText(node: Node): string {
  const parts: string[] = [];
  const visit = (n: Node): void => {
    if (isStringLiteral(n) || isNoSubstitutionTemplateLiteral(n)) parts.push(n.text);
    else if (isTemplateExpression(n)) {
      parts.push(n.head.text);
      for (const span of n.templateSpans) {
        visit(span.expression);
        parts.push(span.literal.text);
      }
      return;
    }
    n.forEachChild(visit);
  };
  visit(node);
  return parts.join(' ');
}

/** A className attribute's value, or a `className:` property's (props built for an element). */
function classValue(node: Node, sf: SourceFile): Node | undefined {
  if (isJsxAttribute(node) && node.name.getText(sf) === 'className') return node.initializer;
  if (isPropertyAssignment(node) && isIdentifier(node.name) && node.name.text === 'className')
    return node.initializer;
  return undefined;
}

export function checkTouchTargets({ root }: { root: string }): TouchTargetViolation[] {
  const violations: TouchTargetViolation[] = [];
  // Only a file naming the utility can break the rule; skipping the rest keeps the guard fast on a busy runner.
  const candidates = listSourceFiles(root, isTypeScriptSource).filter((path) =>
    readFileSync(path, 'utf8').includes('touch-target'),
  );
  for (const sf of parseSourceFiles(candidates)) {
    const visit = (node: Node): void => {
      const value = classValue(node, sf);
      if (value) {
        const text = classText(value);
        if (PAD.test(text) && !POSITIONED.test(text)) {
          violations.push({
            file: relative(root, sf.fileName).split(sep).join('/'),
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            snippet: text.replace(/\s+/g, ' ').trim().slice(0, 70),
          });
        }
        return;
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return violations;
}

export function formatTouchTargetViolations(violations: TouchTargetViolation[]): string {
  return violations
    .map(
      (v) =>
        `${v.file}:${v.line}  ${v.snippet}  (a touch-target host must be positioned: add relative)`,
    )
    .join('\n');
}
