// Reads BIFF8 ROW records from legacy .xls (OLE/CFB) files.
// DealerNet exports preserve filtered rows as the BIFF fDyZero flag, but SheetJS
// does not always surface that flag through worksheet['!rows'] for old .xls files.

const FREE = 0xffffffff;
const END = 0xfffffffe;

const u16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const u32 = (view: DataView, offset: number) => view.getUint32(offset, true);

const sectorBytes = (bytes: Uint8Array, sectorSize: number, sectorId: number) => {
  const start = 512 + sectorId * sectorSize;
  return bytes.slice(start, start + sectorSize);
};

export const hiddenRowsFromLegacyXls = (buffer: ArrayBuffer): Set<number> => {
  try {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 512) return new Set();
    const signature = [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
    if (!signature.every((value, index) => bytes[index] === value)) return new Set();

    const header = new DataView(buffer, 0, Math.min(buffer.byteLength, 512));
    const sectorSize = 1 << u16(header, 30);
    const fatSectorCount = u32(header, 44);
    const firstDirectorySector = u32(header, 48);
    const difat: number[] = [];
    for (let i = 0; i < 109; i++) {
      const sid = u32(header, 76 + i * 4);
      if (sid < 0xfffffffc) difat.push(sid);
    }
    const fatSectorIds = difat.slice(0, fatSectorCount);
    const fat: number[] = [];
    fatSectorIds.forEach(sid => {
      const sector = sectorBytes(bytes, sectorSize, sid);
      const view = new DataView(sector.buffer, sector.byteOffset, sector.byteLength);
      for (let offset = 0; offset + 4 <= sector.byteLength; offset += 4) fat.push(u32(view, offset));
    });

    const chain = (start: number) => {
      const ids: number[] = [];
      const seen = new Set<number>();
      let sid = start;
      while (sid !== END && sid !== FREE && sid < fat.length && !seen.has(sid)) {
        seen.add(sid); ids.push(sid); sid = fat[sid];
      }
      return ids;
    };
    const readChain = (start: number) => {
      const ids = chain(start);
      const out = new Uint8Array(ids.length * sectorSize);
      ids.forEach((sid, index) => out.set(sectorBytes(bytes, sectorSize, sid), index * sectorSize));
      return out;
    };

    const directory = readChain(firstDirectorySector);
    let workbookStart = -1;
    let workbookSize = 0;
    for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
      const entry = directory.slice(offset, offset + 128);
      const view = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
      const nameLength = u16(view, 64);
      if (nameLength < 2) continue;
      let name = '';
      for (let p = 0; p < nameLength - 2; p += 2) name += String.fromCharCode(u16(view, p));
      if (name !== 'Workbook' && name !== 'Book') continue;
      workbookStart = u32(view, 116);
      workbookSize = u32(view, 120);
      break;
    }
    if (workbookStart < 0 || workbookSize <= 0) return new Set();

    const workbook = readChain(workbookStart).slice(0, workbookSize);
    const hidden = new Set<number>();
    const view = new DataView(workbook.buffer, workbook.byteOffset, workbook.byteLength);
    let pos = 0;
    while (pos + 4 <= workbook.length) {
      const recordId = u16(view, pos);
      const length = u16(view, pos + 2);
      if (pos + 4 + length > workbook.length) break;
      if (recordId === 0x0208 && length >= 16) {
        const rowIndex = u16(view, pos + 4);
        const flags = u16(view, pos + 4 + 12);
        // BIFF8 ROW bit 5 (0x20) = zero-height / hidden row.
        if ((flags & 0x20) !== 0) hidden.add(rowIndex);
      }
      pos += 4 + length;
    }
    return hidden;
  } catch {
    return new Set();
  }
};
