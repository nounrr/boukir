import fs from 'fs/promises';

const SIGNATURES = {
  pdf: Buffer.from('%PDF-'),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  riff: Buffer.from('RIFF'),
  webp: Buffer.from('WEBP'),
};

export async function detectFileKind(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const value = header.subarray(0, bytesRead);
    if (value.subarray(0, SIGNATURES.pdf.length).equals(SIGNATURES.pdf)) return 'pdf';
    if (value.subarray(0, SIGNATURES.png.length).equals(SIGNATURES.png)) return 'png';
    if (value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) return 'jpeg';
    if (
      value.length >= 12
      && value.subarray(0, SIGNATURES.riff.length).equals(SIGNATURES.riff)
      && value.subarray(8, 12).equals(SIGNATURES.webp)
    ) return 'webp';
    return null;
  } finally {
    await handle.close();
  }
}

export async function assertUploadedFileKind(file, allowedKinds) {
  if (!file?.path) {
    const error = new Error('Fichier manquant');
    error.status = 400;
    throw error;
  }
  const kind = await detectFileKind(file.path);
  if (!kind || !allowedKinds.includes(kind)) {
    await fs.unlink(file.path).catch(() => {});
    const error = new Error('Le contenu réel du fichier ne correspond pas au format autorisé');
    error.status = 400;
    throw error;
  }
  return kind;
}
