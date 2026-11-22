// docs/specs/006-document/blob-store.md "This Browser": the bytes live in the origin private file system, one file
// per key in a `blobs` directory; where it is missing or cannot be written from a page there is none.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blobKeyOf } from '@livedoc/document';
import { LOCAL_BLOBS_DIRECTORY, opfsBlobBytes } from './local-blob-opfs';
import { fakeBlobDirectory, quotaExceeded } from './local-blob-testing';

const bytesOf = (text: string) => new TextEncoder().encode(text);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bytes in the origin private file system', () => {
  it('is the browser’s own, asked of its storage', async () => {
    const root = fakeBlobDirectory();
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
    const place = (await opfsBlobBytes())!;
    const bytes = bytesOf('in the browser');
    const key = await blobKeyOf(bytes);
    await place.write(key, bytes);
    expect(root.directories.get(LOCAL_BLOBS_DIRECTORY)!.files.has(key)).toBe(true);
  });

  it('keeps one file a key in the blobs directory, and reads it back', async () => {
    const root = fakeBlobDirectory();
    const place = (await opfsBlobBytes(async () => root))!;
    expect(place.where).toBe('opfs');
    const bytes = bytesOf('%PDF-1.4 kept');
    const key = await blobKeyOf(bytes);
    await place.write(key, bytes);
    const directory = root.directories.get(LOCAL_BLOBS_DIRECTORY)!;
    expect([...directory.files.keys()]).toEqual([key]);
    expect(await place.read(key)).toEqual(bytes);
  });

  it('reads a key it has no file for as null, and removes one twice without failing', async () => {
    const place = (await opfsBlobBytes(async () => fakeBlobDirectory()))!;
    const bytes = bytesOf('here, then gone');
    const key = await blobKeyOf(bytes);
    expect(await place.read(key)).toBeNull();
    await place.write(key, bytes);
    await place.remove(key);
    await place.remove(key);
    expect(await place.read(key)).toBeNull();
  });

  it('leaves the file as it was when a write fails, and says why', async () => {
    const root = fakeBlobDirectory();
    const place = (await opfsBlobBytes(async () => root))!;
    const bytes = bytesOf('the first keep');
    const key = await blobKeyOf(bytes);
    await place.write(key, bytes);
    root.directories.get(LOCAL_BLOBS_DIRECTORY)!.failWrite = quotaExceeded();
    await expect(place.write(key, bytesOf('a second, refused'))).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    expect(await place.read(key)).toEqual(bytes);
    // A stream that cannot even be abandoned still says why the write failed.
    const directory = root.directories.get(LOCAL_BLOBS_DIRECTORY)!;
    const open = directory.getFileHandle.bind(directory);
    directory.getFileHandle = async (name, opening) => {
      const handle = await open(name, opening);
      return {
        ...handle,
        createWritable: async () => ({
          write: async () => {
            throw quotaExceeded();
          },
          close: async () => {},
          abort: async () => {
            throw new Error('already closed');
          },
        }),
      };
    };
    await expect(place.write(key, bytesOf('a third'))).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
  });

  it('passes on a failure that is not a missing file', async () => {
    const root = fakeBlobDirectory();
    const place = (await opfsBlobBytes(async () => root))!;
    const directory = root.directories.get(LOCAL_BLOBS_DIRECTORY)!;
    const failing = async () => {
      throw new Error('the disk failed');
    };
    directory.getFileHandle = failing;
    directory.removeEntry = failing;
    const key = await blobKeyOf(bytesOf('any'));
    await expect(place.read(key)).rejects.toThrow('the disk failed');
    await expect(place.remove(key)).rejects.toThrow('the disk failed');
  });

  it('is none where the browser has no such file system', async () => {
    expect(await opfsBlobBytes(() => null)).toBeNull();
    // Outside a browser there is no navigator's storage to ask.
    expect(await opfsBlobBytes()).toBeNull();
  });

  it('is none where a page cannot write a file there', async () => {
    expect(await opfsBlobBytes(async () => fakeBlobDirectory({ writable: false }))).toBeNull();
  });

  it('is none where the browser offers the file system and then refuses it', async () => {
    const refusing = async () => {
      throw Object.assign(new Error('refused in a private window'), { name: 'SecurityError' });
    };
    expect(await opfsBlobBytes(refusing)).toBeNull();
  });
});
