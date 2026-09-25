import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';

/**
 * Inflates the entries of `zip` that `keep` accepts, counting the bytes
 * actually inflated: nothing an archive declares is trusted. Stops at the
 * first limit crossed. Same rules as QuizDock's importer.
 *
 * @param {Uint8Array} zip
 * @param {(name: string) => boolean} keep
 * @param {{ maxEntries: number, maxEntryBytes: number, maxTotalBytes: number }} limits
 * @returns {Record<string, Uint8Array>}
 * @throws {Error} with `code` `too_large` or `not_a_zip`
 */
export function readArchive(zip, keep, limits) {
  const files = {};
  let entries = 0;
  let total = 0;
  /** @type {'too_large' | 'not_a_zip' | null} */
  let failure = null;

  const unzip = new Unzip((file) => {
    if (failure) return;
    entries += 1;
    if (entries > limits.maxEntries) {
      failure = 'too_large';
      return;
    }
    if (!keep(file.name)) return;
    const chunks = [];
    let size = 0;
    file.ondata = (err, chunk, final) => {
      if (failure) return;
      if (err) {
        failure = 'not_a_zip';
        return;
      }
      size += chunk.length;
      total += chunk.length;
      if (size > limits.maxEntryBytes || total > limits.maxTotalBytes) {
        failure = 'too_large';
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) files[file.name] = concat(chunks, size);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  try {
    unzip.push(zip, true);
  } catch {
    failure ??= 'not_a_zip';
  }
  if (failure) throw Object.assign(new Error(failure), { code: failure });
  return files;
}

function concat(chunks, size) {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** A zip starts with a local file header. */
export function looksLikeZip(bytes) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}
