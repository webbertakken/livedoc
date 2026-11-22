// What a download says of the pictures it left out (docs/specs/034-text-documents/objects.md "Where the bytes live"):
// a file written without a picture whose media could not be read says so, never silently.

/** The title row's notice for a file that left `count` pictures out. */
export const leftOutNotice = (count: number): string =>
  count === 1
    ? 'The file was downloaded without 1 picture LiveDoc could not read.'
    : `The file was downloaded without ${count} pictures LiveDoc could not read.`;
