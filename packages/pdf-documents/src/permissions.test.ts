import { describe, expect, it } from 'vitest';
import { PdfPermissions } from './permissions';

// opening.md "Passwords": what the permissions ask, read from the standard's permission bits (ISO 32000-2, table 22).
describe('PdfPermissions', () => {
  it('asks nothing of a file with no protection', () => {
    expect(PdfPermissions.all()).toEqual({
      print: true,
      printSharp: true,
      changeContent: true,
      copy: true,
      mark: true,
      fill: true,
      organise: true,
    });
    expect(PdfPermissions.asksNothing(PdfPermissions.all())).toBe(true);
  });

  it('reads each answer from its own bit', () => {
    // Bits 3, 4, 5, 6, 9, 11 and 12, counted from 1.
    const bit = (n: number) => 1 << (n - 1);
    expect(PdfPermissions.of(0)).toEqual({
      print: false,
      printSharp: false,
      changeContent: false,
      copy: false,
      mark: false,
      fill: false,
      organise: false,
    });
    expect(PdfPermissions.of(bit(3))).toMatchObject({ print: true, printSharp: false });
    expect(PdfPermissions.of(bit(3) | bit(12))).toMatchObject({ print: true, printSharp: true });
    expect(PdfPermissions.of(bit(4))).toMatchObject({ changeContent: true, mark: false });
    expect(PdfPermissions.of(bit(5))).toMatchObject({ copy: true });
    expect(PdfPermissions.of(bit(11))).toMatchObject({ organise: true, changeContent: false });
  });

  it('lets a file that allows marks be filled too, and never prints sharp what may not print', () => {
    const bit = (n: number) => 1 << (n - 1);
    // Bit 6 allows marks and filling; bit 9 filling alone (the standard's own reading).
    expect(PdfPermissions.of(bit(6))).toMatchObject({ mark: true, fill: true });
    expect(PdfPermissions.of(bit(9))).toMatchObject({ mark: false, fill: true });
    expect(PdfPermissions.of(bit(12))).toMatchObject({ print: false, printSharp: false });
  });

  it('reads the bits whatever sign the number carries', () => {
    // Readers hand the 32 bits over as a signed or an unsigned number.
    expect(PdfPermissions.of(-1)).toEqual(PdfPermissions.all());
    expect(PdfPermissions.of(0xffffffff)).toEqual(PdfPermissions.all());
    expect(PdfPermissions.asksNothing(PdfPermissions.of(-3904))).toBe(false);
  });

  // opening.md "Passwords": a file forbids changes where it allows none of the four kinds of change.
  it('forbids changes only where no kind of change is allowed', () => {
    const none = { changeContent: false, mark: false, fill: false, organise: false };
    expect(PdfPermissions.forbidsChanges({ ...PdfPermissions.all(), ...none })).toBe(true);
    expect(PdfPermissions.forbidsChanges({ ...PdfPermissions.all(), ...none, fill: true })).toBe(
      false,
    );
    expect(PdfPermissions.forbidsChanges({ ...PdfPermissions.all(), copy: false })).toBe(false);
    expect(PdfPermissions.forbidsChanges(PdfPermissions.all())).toBe(false);
  });
});
