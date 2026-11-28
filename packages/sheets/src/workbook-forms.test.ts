import { describe, expect, it } from 'vitest';
import { WORKBOOK_FORMS_MAX, WorkbookForms } from './workbook-forms';
import { WorkbookRecord } from './workbook-record';

const form = { documentId: 'doc-a', tabId: 'tab-a', sheetId: 'sheet-aa' };
const other = { documentId: 'doc-b', tabId: 'tab-b', sheetId: 'sheet-bb' };

describe('WorkbookForms', () => {
  it('reads connections, each form once', () => {
    expect(WorkbookForms.read([form, other])).toEqual([form, other]);
    expect(WorkbookForms.read([form, { ...form, sheetId: 'sheet-cc' }])).toBeNull();
  });

  it('refuses what is not a connection', () => {
    expect(WorkbookForms.read([])).toBeNull();
    expect(WorkbookForms.read([{ ...form, sheetId: 'x' }])).toBeNull();
    expect(WorkbookForms.read([{ ...form, documentId: 'a b' }])).toBeNull();
    expect(WorkbookForms.read('nope')).toBeNull();
    const many = Array.from({ length: WORKBOOK_FORMS_MAX + 1 }, (_, i) => ({
      ...form,
      tabId: `t${i}`,
    }));
    expect(WorkbookForms.read(many)).toBeNull();
  });

  it('drops parts it does not know', () => {
    expect(WorkbookForms.read([{ ...form, by: 'someone' }])).toEqual([form]);
  });

  it('admits a form only to its own sheet', () => {
    expect(WorkbookForms.admits([form], form)).toBe(true);
    expect(WorkbookForms.admits([form], { ...form, sheetId: 'sheet-zz' })).toBe(false);
    expect(WorkbookForms.admits([form], { ...form, tabId: 'tab-z' })).toBe(false);
    expect(WorkbookForms.admits(undefined, form)).toBe(false);
  });

  it('connects a form once, moving it to its new sheet', () => {
    const moved = { ...form, sheetId: 'sheet-cc' };
    expect(WorkbookForms.connect([form, other], moved)).toEqual([other, moved]);
    expect(WorkbookForms.connect(undefined, form)).toEqual([form]);
  });

  it('refuses a connection past the bound', () => {
    const full = Array.from({ length: WORKBOOK_FORMS_MAX }, (_, i) => ({
      ...form,
      tabId: `t${i}`,
    }));
    expect(WorkbookForms.connect(full, other)).toBeNull();
    expect(WorkbookForms.connect(full, { ...full[0]!, sheetId: 'sheet-cc' })).toHaveLength(
      WORKBOOK_FORMS_MAX,
    );
  });

  it('unlinks one form, or every form of a sheet', () => {
    const second = { ...other, sheetId: form.sheetId };
    expect(WorkbookForms.unlink([form, second], { form })).toEqual([second]);
    expect(
      WorkbookForms.unlink([form, second, { ...other, tabId: 'x' }], { sheetId: form.sheetId }),
    ).toEqual([{ ...other, tabId: 'x' }]);
  });

  it('says which sheets take responses', () => {
    expect(WorkbookForms.takesResponses([form], form.sheetId)).toBe(true);
    expect(WorkbookForms.takesResponses([form], other.sheetId)).toBe(false);
  });
});

describe('WorkbookRecord forms', () => {
  const base = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

  it('reads a record with its forms, and refuses one whose forms do not read', () => {
    expect(WorkbookRecord.read({ ...base, forms: [form] })?.forms).toEqual([form]);
    expect(WorkbookRecord.read({ ...base, forms: [{ nope: 1 }] })).toBeNull();
  });

  it('never carries forms to a copy', () => {
    expect(WorkbookRecord.copied({ ...base, forms: [form] }).forms).toBeUndefined();
  });
});
