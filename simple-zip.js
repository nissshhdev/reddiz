const zlib = require('zlib');

// Simple CRC32 table calculation
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

class SimpleZip {
  constructor() {
    this.files = [];
  }

  addFile(filename, buffer) {
    if (typeof buffer === 'string') {
      buffer = Buffer.from(buffer, 'utf8');
    }
    const compressed = zlib.deflateRawSync(buffer, { level: 6 });
    const crc = crc32(buffer);
    this.files.push({
      filename: filename.replace(/\\/g, '/'),
      uncompressed: buffer,
      compressed: compressed,
      crc: crc,
      uncompressedSize: buffer.length,
      compressedSize: compressed.length
    });
  }

  generateBuffer() {
    const parts = [];
    const centralDirectoryHeaders = [];
    let offset = 0;

    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    for (const file of this.files) {
      const fnBuf = Buffer.from(file.filename, 'utf8');
      
      // Local File Header (30 bytes + filename)
      const localHeader = Buffer.alloc(30 + fnBuf.length);
      localHeader.writeUInt32LE(0x04034b50, 0); // Signature
      localHeader.writeUInt16LE(20, 4);         // Version needed
      localHeader.writeUInt16LE(0x0800, 6);     // Flags (UTF-8)
      localHeader.writeUInt16LE(8, 8);          // Compression (deflate)
      localHeader.writeUInt16LE(dosTime, 10);
      localHeader.writeUInt16LE(dosDate, 12);
      localHeader.writeUInt32LE(file.crc, 14);
      localHeader.writeUInt32LE(file.compressedSize, 18);
      localHeader.writeUInt32LE(file.uncompressedSize, 22);
      localHeader.writeUInt16LE(fnBuf.length, 26);
      localHeader.writeUInt16LE(0, 28);         // Extra field length
      fnBuf.copy(localHeader, 30);

      parts.push(localHeader);
      parts.push(file.compressed);

      // Central directory header entry
      const cdEntry = Buffer.alloc(46 + fnBuf.length);
      cdEntry.writeUInt32LE(0x02014b50, 0);    // Signature
      cdEntry.writeUInt16LE(20, 4);            // Version made by
      cdEntry.writeUInt16LE(20, 6);            // Version needed
      cdEntry.writeUInt16LE(0x0800, 8);        // Flags
      cdEntry.writeUInt16LE(8, 10);            // Compression
      cdEntry.writeUInt16LE(dosTime, 12);
      cdEntry.writeUInt16LE(dosDate, 14);
      cdEntry.writeUInt32LE(file.crc, 16);
      cdEntry.writeUInt32LE(file.compressedSize, 20);
      cdEntry.writeUInt32LE(file.uncompressedSize, 24);
      cdEntry.writeUInt16LE(fnBuf.length, 28);
      cdEntry.writeUInt16LE(0, 30);            // Extra field len
      cdEntry.writeUInt16LE(0, 32);            // File comment len
      cdEntry.writeUInt16LE(0, 34);            // Disk number start
      cdEntry.writeUInt16LE(0, 36);            // Internal file attributes
      cdEntry.writeUInt32LE(0, 38);            // External file attributes
      cdEntry.writeUInt32LE(offset, 42);       // Relative offset of local header
      fnBuf.copy(cdEntry, 46);

      centralDirectoryHeaders.push(cdEntry);
      offset += localHeader.length + file.compressed.length;
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const h of centralDirectoryHeaders) {
      parts.push(h);
      cdSize += h.length;
    }

    // End of Central Directory Record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);          // Signature
    eocd.writeUInt16LE(0, 4);                   // Disk number
    eocd.writeUInt16LE(0, 6);                   // Start disk
    eocd.writeUInt16LE(this.files.length, 8);   // Entries on this disk
    eocd.writeUInt16LE(this.files.length, 10);  // Total entries
    eocd.writeUInt32LE(cdSize, 12);             // Size of central directory
    eocd.writeUInt32LE(cdOffset, 16);           // Offset of central directory
    eocd.writeUInt16LE(0, 20);                  // Comment len

    parts.push(eocd);
    return Buffer.concat(parts);
  }
}

module.exports = SimpleZip;
