// A tab's search text (docs/specs/013-workspace/content-search.md "What is searched",
// docs/specs/013-workspace/content-search.md): what content search finds a tab by. Its name; every
// element's texts that the `find` view searches; its articles' text, its pages' names and its form's words; and on a
// Sheet tab, its cells' inputs. Read defensively from the stored body, as the views read it.

import { elementFindTexts } from './find';
import { arrayField, isObject, objectField, stringField, textField } from './fields';
import type { Element } from '@livedoc/document';

function articleTexts(tab: object): string[] {
  const flows = objectField(tab, 'articles');
  if (!flows) return [];
  return Object.values(flows)
    .filter(isObject)
    .flatMap((flow) => arrayField(flow, 'blocks').filter(isObject))
    .map((block) => {
      const code = stringField(block, 'text');
      if (code !== null) return code;
      return arrayField(block, 'runs')
        .filter(isObject)
        .map((run) => stringField(run, 'text') ?? '')
        .join('');
    });
}

function formTexts(tab: object): string[] {
  const form = objectField(tab, 'form');
  if (!form) return [];
  const sections = arrayField(form, 'sections').filter(isObject);
  return [
    stringField(form, 'heading'),
    textField(form, 'description'),
    ...sections.flatMap((section) => [
      stringField(section, 'title'),
      textField(section, 'description'),
      ...arrayField(section, 'questions')
        .filter(isObject)
        .flatMap((q) => [
          stringField(q, 'prompt'),
          textField(q, 'help'),
          ...arrayField(q, 'options').map((o) => (typeof o === 'string' ? o : null)),
        ]),
    ]),
  ].filter((t): t is string => t !== null);
}

/** One tab's search text, a line per text, empty texts skipped; `sheetInputs` are a Sheet tab's cells' inputs. */
export function tabSearchText(tab: object, sheetInputs: readonly string[] = []): string {
  const elements = arrayField(tab, 'elements').filter(isObject) as Element[];
  const pages = arrayField(tab, 'pages')
    .filter(isObject)
    .map((page) => stringField(page, 'name'));
  return [
    stringField(tab, 'name'),
    ...elements.flatMap(elementFindTexts),
    ...articleTexts(tab),
    ...pages,
    ...formTexts(tab),
    ...sheetInputs,
  ]
    .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    .join('\n');
}
