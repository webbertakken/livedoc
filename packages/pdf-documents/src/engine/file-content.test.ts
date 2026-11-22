import { beforeAll, describe, expect, it } from 'vitest';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import type { PdfEngine, PdfOpened } from '../engine-contract';
import {
  PDF_FIELD_OPTIONS_MAX,
  PDF_MARK_TEXT_MAX_CHARS,
  PDF_MAX_COORDINATE,
  PDF_MAX_LAYERS,
} from '../limits';
import { PdfLiveChanges } from '../live-changes';
import { Mark } from '../mark';
import {
  embeddedFilesPdf,
  formPdf,
  layersPdf,
  marksPdf,
  protectedPdf,
  readerWasm,
  signaturesPdf,
  signedPdf,
  textPdf,
} from '../testing/fixtures';
import { createPdfEngine } from './index';
import { PdfReader, startReader } from './reader';
import { signerOf } from './signer';
import { layersOf, openWriter } from './writer';

let engine: PdfEngine;
let reader: PdfReader;
let plain: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
  engine = await createPdfEngine({ wasm: readerWasm() });
  reader = new PdfReader(await startReader(readerWasm()));
  plain = await textPdf(1);
});

const opened = (result: PdfOpened) => {
  if (!result.ok) throw new Error('the fixture did not open');
  return result.pages;
};

const BOX = [72, 700, 172, 720];
const unsaid = {
  rect: BOX,
  quads: [],
  colour: null,
  opacity: 1,
  author: '',
  words: '',
  subject: '',
  created: '',
  modified: '',
  answers: null,
  state: null,
};

// marks.md "In the file": what is read of a mark a file holds; comments.md "In the file": replies and states.
describe("a file's marks", () => {
  it('reads each mark as the file says it: its look, its author, its words and what it answers', async () => {
    opened(await engine.open(marksPdf(3)));
    expect(await engine.fileMarks(0)).toEqual([
      {
        id: 'hl-1',
        subtype: 'highlight',
        rect: BOX,
        quads: [[72, 720, 172, 720, 72, 700, 172, 700]],
        colour: '#ff7f00',
        opacity: 0.5,
        author: 'Grace',
        words: 'Check this',
        subject: 'Fact',
        created: 'D:20261120090000Z',
        modified: 'D:20261121140203Z',
        answers: null,
        state: null,
      },
      {
        ...unsaid,
        id: 're-1',
        subtype: 'text',
        author: 'Ada',
        words: 'Agreed',
        modified: 'D:20261121150000Z',
        answers: { mark: 'hl-1', grouped: false },
      },
      {
        ...unsaid,
        id: 'st-1',
        subtype: 'text',
        author: 'Ada',
        answers: { mark: 'hl-1', grouped: false },
        state: { model: 'Review', state: 'Accepted' },
      },
      { ...unsaid, id: 'ca-1', subtype: 'caret', answers: { mark: 'hl-1', grouped: true } },
      // A box past the page's reach is held within it; a colour that names no colour is none; an opacity past 1 is 1.
      {
        ...unsaid,
        id: 'o:9',
        subtype: 'text',
        rect: [-PDF_MAX_COORDINATE, 5, PDF_MAX_COORDINATE, 20],
      },
      // A reply to a mark the file gives no name names it by its object.
      { ...unsaid, id: 'o:10', subtype: 'text', answers: { mark: 'o:9', grouped: false } },
      { ...unsaid, id: 'long', subtype: 'text', words: 'www' },
    ]);
  });

  it('cuts a mark’s words to the most a mark holds', async () => {
    opened(await engine.open(marksPdf(PDF_MARK_TEXT_MAX_CHARS + 50)));
    const marks = await engine.fileMarks(0);
    expect(marks.at(-1)!.words).toHaveLength(PDF_MARK_TEXT_MAX_CHARS);
  });

  it('reads no more marks on a page than the limit, and none where there is no page or no file', async () => {
    reader.open(marksPdf());
    expect(reader.fileMarks(0, 2).map((mark) => mark.id)).toEqual(['hl-1', 're-1']);
    expect(reader.fileMarks(4)).toEqual([]);
    reader.close();
    expect(reader.fileMarks(0)).toEqual([]);
  });
});

const field = {
  on: null,
  onValue: '',
  options: [],
  label: '',
  readOnly: false,
  required: false,
  hidden: false,
  multiline: false,
  password: false,
  severalChoices: false,
  ownValue: false,
};
const place = (bottom: number) => [72, bottom, 272, bottom + 20];
const options = (...chosen: number[]) =>
  [1, 2, 3].map((n) => ({ label: `Option ${n}`, chosen: chosen.includes(n) }));

// fields.md "What a file's fields are"
describe("a page's fields", () => {
  it('reads each place a field shows, with its full name, type, value and what the file says of it', async () => {
    opened(await engine.open(formPdf()));
    expect(await engine.fields(0)).toEqual([
      {
        ...field,
        name: 'applicant.city',
        type: 'text',
        rect: place(700),
        value: 'Delft',
        label: 'The city you live in',
      },
      {
        ...field,
        name: 'notes',
        type: 'text',
        rect: place(660),
        value: 'Line one',
        readOnly: true,
        required: true,
        multiline: true,
      },
      // A password field's value is never read out of the file.
      { ...field, name: 'secret', type: 'text', rect: place(620), value: '', password: true },
      {
        ...field,
        name: 'agree',
        type: 'tick-box',
        rect: place(580),
        value: 'Yes',
        on: true,
        onValue: 'Yes',
      },
      // A radio group shows in two places: one field, one value, each place on or off.
      {
        ...field,
        name: 'colour',
        type: 'radio',
        rect: place(540),
        value: 'blue',
        on: false,
        onValue: 'red',
      },
      {
        ...field,
        name: 'colour',
        type: 'radio',
        rect: place(500),
        value: 'blue',
        on: true,
        onValue: 'blue',
      },
      {
        ...field,
        name: 'country',
        type: 'dropdown',
        rect: place(460),
        value: 'Option 2',
        options: options(2),
        ownValue: true,
      },
      {
        ...field,
        name: 'languages',
        type: 'list',
        rect: place(420),
        value: 'Option 1',
        options: options(1, 3),
        severalChoices: true,
      },
      { ...field, name: 'send', type: 'button', rect: place(380), value: '' },
      { ...field, name: 'signature', type: 'signature', rect: place(340), value: '' },
      { ...field, name: 'unseen', type: 'text', rect: place(300), value: 'kept', hidden: true },
    ]);
  });

  it('reads no more options of a field than the limit', async () => {
    opened(await engine.open(formPdf(PDF_FIELD_OPTIONS_MAX + 5)));
    const country = (await engine.fields(0)).find((read) => read.name === 'country')!;
    expect(country.options).toHaveLength(PDF_FIELD_OPTIONS_MAX);
  });

  it('reads no more places on a page than the limit', () => {
    reader.open(formPdf());
    expect(reader.fields(0, 2).map((read) => read.name)).toEqual(['applicant.city', 'notes']);
    expect(reader.fields(9)).toEqual([]);
    reader.close();
  });

  it('answers none for a file with no form, a page with marks alone, or no file', async () => {
    opened(await engine.open(plain));
    expect(await engine.fields(0)).toEqual([]);
    opened(await engine.open(marksPdf()));
    expect(await engine.fields(0)).toEqual([]);
    await engine.close();
    expect(await engine.fields(0)).toEqual([]);
  });

  it('reads another file’s fields after the first is closed', async () => {
    opened(await engine.open(formPdf()));
    expect(await engine.fields(0)).toHaveLength(11);
    opened(await engine.open(formPdf()));
    expect(await engine.fields(0)).toHaveLength(11);
  });
});

const ada = {
  name: 'Ada Lovelace',
  organisation: 'Analytical Engines',
  issuer: 'Ada Lovelace',
  validFrom: Date.UTC(2026, 0, 1),
  validTo: Date.UTC(2036, 0, 1),
  serial: '1234',
};

// signing.md "The signatures panel": what is read of a signature; nothing is checked here.
describe("a file's signatures", () => {
  let signed: Uint8Array<ArrayBuffer>;
  beforeAll(async () => {
    signed = await signedPdf();
  });

  it('reads a signature’s encoding, time, reason, what it covers and whom its certificate names', async () => {
    opened(await engine.open(signed));
    expect(await engine.signatures()).toEqual([
      {
        encoding: 'ETSI.CAdES.detached',
        time: 'D:20261121140203Z',
        reason: 'I approve',
        covers: 'whole-file',
        signedBytes: signed.length,
        certifies: null,
        signer: ada,
      },
    ]);
  });

  // signing.md "Changes after a signature": a mark is an addition, and the signature then covers the earlier state.
  it('says a signature covers the file before later changes once a mark is added', async () => {
    const [page] = opened(await engine.open(signed));
    const selection = await engine.selectText(0, { x: 74, y: 724 }, { x: 180, y: 724 });
    const changes = PdfLiveChanges.load();
    PdfLiveChanges.addMark(
      changes,
      Mark.highlight({
        id: 'after',
        page: page!.name,
        quads: selection!.quads,
        text: selection!.text,
        colour: '#fdf1a9',
        opacity: 1,
        author: 'Grace',
        createdAt: Date.UTC(2026, 10, 22),
      })!,
    );
    const baked = await engine.bake(PdfLiveChanges.encode(changes));
    if (!baked.ok) throw new Error(baked.refusal);
    opened(await engine.open(baked.bytes));
    expect(await engine.signatures()).toMatchObject([
      { covers: 'earlier-state', signedBytes: signed.length, signer: ada },
    ]);
  });

  it('reads what a certifying signature allows, and no signer from bytes that are no signature', async () => {
    opened(await engine.open(signaturesPdf()));
    expect(await engine.signatures()).toEqual([
      {
        encoding: 'adbe.pkcs7.detached',
        time: 'D:20261121140203Z',
        reason: 'Certified',
        covers: 'earlier-state',
        signedBytes: 50,
        certifies: 'fields',
        signer: null,
      },
      {
        encoding: '',
        time: '',
        reason: '',
        covers: 'unknown',
        signedBytes: null,
        certifies: null,
        signer: null,
      },
    ]);
  });

  it('reads no more signatures than the limit, and no bytes of one past its limit', () => {
    reader.open(signaturesPdf());
    expect(reader.signatures(1)).toHaveLength(1);
    expect(reader.signatures(5, 4).map((held) => held.contents)).toEqual([null, new Uint8Array(1)]);
    reader.close();
    expect(reader.signatures()).toEqual([]);
  });

  it('answers none for a file with no signature, or no file', async () => {
    opened(await engine.open(plain));
    expect(await engine.signatures()).toEqual([]);
    await engine.close();
    expect(await engine.signatures()).toEqual([]);
  });

  describe('the signer', () => {
    /** The signed fixture's own signature bytes, changed as given and written again. */
    const signatureWith = (change: (data: pkijs.SignedData) => void): Uint8Array => {
      reader.open(signed);
      const [held] = reader.signatures();
      reader.close();
      const parsed = asn1js.fromBER(held!.contents!.slice().buffer);
      const info = new pkijs.ContentInfo({ schema: parsed.result });
      const data = new pkijs.SignedData({ schema: info.content as unknown });
      change(data);
      info.content = data.toSchema(true);
      return new Uint8Array(info.toSchema().toBER(false));
    };

    it('is the certificate the signer names', () => {
      expect(signerOf(signatureWith(() => {}))).toEqual(ada);
    });

    it('is none where the signature carries no certificate its signer names', () => {
      const other = signatureWith((data) => {
        const named = data.signerInfos[0]!.sid as pkijs.IssuerAndSerialNumber;
        named.serialNumber = new asn1js.Integer({ value: 99 });
      });
      expect(signerOf(other)).toBeNull();
      const none = signatureWith((data) => {
        data.certificates = undefined;
      });
      expect(signerOf(none)).toBeNull();
    });

    it('is none where the signer is named by a key, not by issuer and serial number', () => {
      const byKey = signatureWith((data) => {
        data.signerInfos[0]!.version = 3;
        data.signerInfos[0]!.sid = new asn1js.Primitive({
          idBlock: { tagClass: 3, tagNumber: 0 },
          valueHex: new Uint8Array([1, 2, 3]).buffer,
        });
      });
      expect(signerOf(byKey)).toBeNull();
    });

    it('is none where the bytes are no signature', () => {
      expect(signerOf(new Uint8Array([0, 17, 34, 51, 68]))).toBeNull();
      expect(signerOf(new Uint8Array(0))).toBeNull();
    });
  });
});

// security.md "Embedded files": listed with name, size and type; never opened.
describe('embedded files', () => {
  it('lists each by what the PDF says of it, its name cleaned, with no size where the PDF says none', async () => {
    opened(await engine.open(embeddedFilesPdf()));
    expect(await engine.embeddedFiles()).toEqual({
      files: [
        { name: 'notes.txt', size: 5, type: 'text/plain', description: 'Meeting notes' },
        { name: '..run.exe', size: null, type: '', description: '' },
      ],
      cut: false,
    });
  });

  it('lists no more than the limit, and says there are more', () => {
    reader.open(embeddedFilesPdf());
    expect(reader.embeddedFiles(1)).toMatchObject({ files: [{ name: 'notes.txt' }], cut: true });
    reader.close();
  });

  it('answers none for a file that carries none, or no file', async () => {
    opened(await engine.open(plain));
    expect(await engine.embeddedFiles()).toEqual({ files: [], cut: false });
    await engine.close();
    expect(await engine.embeddedFiles()).toEqual({ files: [], cut: false });
  });
});

// reading-surface.md "The left panel": Layers, as the file sets them.
describe('PDF layers', () => {
  it('lists each layer in the file’s order, shown or hidden and locked or not as the file sets it', async () => {
    opened(await engine.open(layersPdf()));
    expect(await engine.layers()).toEqual([
      { id: 'o:4', name: 'Plan', visible: true, locked: false },
      { id: 'o:5', name: 'Notes', visible: false, locked: false },
      { id: 'o:6', name: 'Border', visible: true, locked: true },
    ]);
  });

  it('lists no more than the limit', async () => {
    opened(await engine.open(layersPdf(PDF_MAX_LAYERS + 2)));
    expect(await engine.layers()).toHaveLength(PDF_MAX_LAYERS);
  });

  it('reads the layers of the file open now, not of the one before', async () => {
    opened(await engine.open(layersPdf()));
    expect(await engine.layers()).toHaveLength(3);
    opened(await engine.open(plain));
    expect(await engine.layers()).toEqual([]);
  });

  it('reads the layers of a protected file with the password it was opened with', async () => {
    const locked = await protectedPdf({ userPassword: 'open sesame' });
    await engine.open(locked);
    opened(await engine.unlock('open sesame'));
    expect(await engine.layers()).toEqual([]);
  });

  it('answers none where the writer cannot read the file, or with no file open', async () => {
    expect(layersOf(await openWriter(new Uint8Array([1, 2, 3]), null))).toEqual([]);
    await engine.close();
    expect(await engine.layers()).toEqual([]);
  });
});
