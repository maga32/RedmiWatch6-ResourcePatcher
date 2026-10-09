#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const ROMFS_MAGIC = Buffer.from('-rom1fs-');
const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;
const MAX_EOCD_SEARCH = 0xffff + 22;

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`사용법:
  node ${path.basename(process.argv[1])} FULL.bin

FULL.bin 패키지를 이 스크립트 기준 ./output/extract/package/에 풀고,
발견한 ROMFS를 ./output/extract/romfs/<이미지명>/offset-<16진수>/ 아래에
경로대로 추출합니다. 기존 ./output/extract 폴더는 먼저 삭제합니다.
외부 npm 패키지는 필요하지 않습니다.`);
  process.exit(exitCode);
}

if (process.argv.includes('-h') || process.argv.includes('--help')) usage(0);
const [inputArg] = process.argv.slice(2);
if (!inputArg || process.argv.length !== 3) usage(2);

const inputPath = path.resolve(inputArg);
const outputDir = path.join(__dirname, 'output', 'extract');
const packageDir = path.join(outputDir, 'package');
const romfsDir = path.join(outputDir, 'romfs');
const replacementDir = path.join(__dirname, 'input');
let outputPrepared = false;

function hex(value, width = 8) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function safeParts(name) {
  const normalized = name.replaceAll('\\', '/');
  if (normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`안전하지 않은 경로: ${JSON.stringify(name)}`);
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`안전하지 않은 경로: ${JSON.stringify(name)}`);
  }
  return parts;
}

function safeJoin(root, name) {
  const result = path.join(root, ...safeParts(name));
  const relative = path.relative(root, result);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`출력 경로 이탈: ${name}`);
  return result;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}

function updateCrc(crc, chunk) {
  let value = crc;
  for (const byte of chunk) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

class DigestTransform extends Transform {
  constructor() {
    super();
    this.crc = 0xffffffff;
    this.sha = crypto.createHash('sha256');
    this.size = 0;
  }
  _transform(chunk, encoding, callback) {
    this.crc = updateCrc(this.crc, chunk);
    this.sha.update(chunk);
    this.size += chunk.length;
    callback(null, chunk);
  }
  result() {
    return { crc32: (this.crc ^ 0xffffffff) >>> 0, sha256: this.sha.digest('hex'), size: this.size };
  }
}

async function readAt(handle, length, position) {
  const data = Buffer.alloc(length);
  const { bytesRead } = await handle.read(data, 0, length, position);
  if (bytesRead !== length) throw new Error(`${hex(position)}에서 ${length}바이트를 읽지 못했습니다`);
  return data;
}

async function parseZip(handle, fileSize) {
  const tailSize = Math.min(fileSize, MAX_EOCD_SEARCH);
  const tail = await readAt(handle, tailSize, fileSize - tailSize);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) === ZIP_EOCD && i + 22 + tail.readUInt16LE(i + 20) === tail.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP 중앙 디렉터리 끝(EOCD)을 찾지 못했습니다');
  const disk = tail.readUInt16LE(eocd + 4);
  const centralDisk = tail.readUInt16LE(eocd + 6);
  const count = tail.readUInt16LE(eocd + 10);
  const centralSize = tail.readUInt32LE(eocd + 12);
  const centralOffset = tail.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0) throw new Error('분할 ZIP은 지원하지 않습니다');
  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 패키지는 지원하지 않습니다');
  }
  const central = await readAt(handle, centralSize, centralOffset);
  const entries = [];
  let cursor = 0;
  while (cursor < central.length) {
    if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== ZIP_CENTRAL) {
      throw new Error(`잘못된 ZIP 중앙 디렉터리 항목: ${hex(centralOffset + cursor)}`);
    }
    const flags = central.readUInt16LE(cursor + 8);
    const method = central.readUInt16LE(cursor + 10);
    const crc32 = central.readUInt32LE(cursor + 16);
    const compressedSize = central.readUInt32LE(cursor + 20);
    const size = central.readUInt32LE(cursor + 24);
    const nameLength = central.readUInt16LE(cursor + 28);
    const extraLength = central.readUInt16LE(cursor + 30);
    const commentLength = central.readUInt16LE(cursor + 32);
    const localOffset = central.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > central.length) throw new Error('잘린 ZIP 중앙 디렉터리입니다');
    if (flags & 1) throw new Error('암호화된 ZIP 항목은 지원하지 않습니다');
    if (method !== 0 && method !== 8) throw new Error(`지원하지 않는 ZIP 압축 방식 ${method}`);
    const nameBuffer = central.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBuffer.toString((flags & 0x800) ? 'utf8' : 'utf8');
    safeParts(name);
    entries.push({ name, method, crc32, compressedSize, size, localOffset, directory: name.endsWith('/') });
    cursor = end;
  }
  if (entries.length !== count) throw new Error(`ZIP 항목 수 불일치: 헤더 ${count}, 실제 ${entries.length}`);
  return entries;
}

async function extractZipEntry(handle, entry) {
  const destination = safeJoin(packageDir, entry.name);
  if (entry.directory) {
    await fsp.mkdir(destination, { recursive: true });
    return { ...entry, output: path.relative(outputDir, destination), sha256: null };
  }
  const local = await readAt(handle, 30, entry.localOffset);
  if (local.readUInt32LE(0) !== ZIP_LOCAL) throw new Error(`${entry.name}: 로컬 ZIP 헤더가 잘못되었습니다`);
  const nameLength = local.readUInt16LE(26);
  const extraLength = local.readUInt16LE(28);
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const digest = new DigestTransform();
  const source = fs.createReadStream(inputPath, {
    start: dataOffset,
    end: dataOffset + entry.compressedSize - 1,
  });
  const streams = entry.method === 8
    ? [source, zlib.createInflateRaw(), digest, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 })]
    : [source, digest, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 })];
  await pipeline(...streams);
  const result = digest.result();
  if (result.size !== entry.size) throw new Error(`${entry.name}: 해제 크기 불일치`);
  if (result.crc32 !== entry.crc32) throw new Error(`${entry.name}: CRC32 불일치`);
  return { ...entry, output: path.relative(outputDir, destination), sha256: result.sha256 };
}

function wordSum(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum = (sum + data.readUInt32BE(i)) >>> 0;
  return sum;
}

async function findRomfsCandidates(imagePath) {
  const stat = await fsp.stat(imagePath);
  const handle = await fsp.open(imagePath, 'r');
  const found = [];
  const chunkSize = 1024 * 1024;
  let overlap = Buffer.alloc(0);
  try {
    for (let position = 0; position < stat.size;) {
      const length = Math.min(chunkSize, stat.size - position);
      const chunk = await readAt(handle, length, position);
      const searchable = Buffer.concat([overlap, chunk]);
      const base = position - overlap.length;
      for (let index = searchable.indexOf(ROMFS_MAGIC); index >= 0; index = searchable.indexOf(ROMFS_MAGIC, index + 1)) {
        const offset = base + index;
        if (found.includes(offset) || offset + 16 > stat.size) continue;
        const header = await readAt(handle, Math.min(512, stat.size - offset), offset);
        const declaredSize = header.readUInt32BE(8);
        const checksumLength = Math.min(512, declaredSize);
        if (declaredSize >= 32 && offset + declaredSize <= stat.size && checksumLength % 4 === 0 &&
            header.length >= checksumLength && wordSum(header.subarray(0, checksumLength)) === 0) found.push(offset);
      }
      overlap = searchable.subarray(Math.max(0, searchable.length - (ROMFS_MAGIC.length - 1)));
      position += length;
    }
  } finally {
    await handle.close();
  }
  return found;
}

async function extractRomfs(imagePath, baseOffset, destination) {
  const imageStat = await fsp.stat(imagePath);
  const handle = await fsp.open(imagePath, 'r');
  const imageName = path.basename(imagePath);
  const number = (value) => ({ decimal: value, hex: hex(value) });
  try {
    const first = await readAt(handle, 512, baseOffset);
    const declaredSize = first.readUInt32BE(8);
    if (first.subarray(0, 8).compare(ROMFS_MAGIC) !== 0 || baseOffset + declaredSize > imageStat.size) {
      throw new Error(`${imageName}@${hex(baseOffset)}: 잘못된 ROMFS 헤더`);
    }
    if (wordSum(first.subarray(0, Math.min(512, declaredSize))) !== 0) throw new Error('ROMFS superblock 체크섬 오류');

    async function readCString(relativeOffset, maximum = 4096) {
      const length = Math.min(maximum, declaredSize - relativeOffset);
      if (length <= 0) throw new Error(`ROMFS 문자열 오프셋 초과: ${hex(relativeOffset)}`);
      const data = await readAt(handle, length, baseOffset + relativeOffset);
      const end = data.indexOf(0);
      if (end < 0) throw new Error(`종료되지 않은 ROMFS 문자열: ${hex(relativeOffset)}`);
      return { text: data.subarray(0, end).toString('utf8'), bytes: end + 1 };
    }

    async function readEntry(offset) {
      if ((offset & 15) || offset < 0 || offset + 16 > declaredSize) throw new Error(`잘못된 ROMFS 엔트리: ${hex(offset)}`);
      const fixed = await readAt(handle, 16, baseOffset + offset);
      const name = await readCString(offset + 16);
      const dataOffset = Math.ceil((offset + 16 + name.bytes) / 16) * 16;
      const header = await readAt(handle, dataOffset - offset, baseOffset + offset);
      const size = fixed.readUInt32BE(8);
      if (dataOffset + size > declaredSize) throw new Error(`ROMFS 데이터 범위 초과: ${hex(offset)}`);
      return {
        offset,
        nextType: fixed.readUInt32BE(0),
        next: fixed.readUInt32BE(0) & 0xfffffff0,
        type: fixed.readUInt32BE(0) & 7,
        executable: Boolean(fixed.readUInt32BE(0) & 8),
        spec: fixed.readUInt32BE(4),
        size,
        checksum: fixed.readUInt32BE(12),
        name: name.text,
        dataOffset,
        checksumValid: wordSum(header) === 0,
      };
    }

    const volume = await readCString(16);
    const rootOffset = Math.ceil((16 + volume.bytes) / 16) * 16;
    const entries = [];
    const visitedDirectories = new Set();

    async function walk(firstOffset, parent) {
      if (!firstOffset || visitedDirectories.has(firstOffset)) return;
      visitedDirectories.add(firstOffset);
      const siblings = new Set();
      for (let offset = firstOffset; offset;) {
        if (siblings.has(offset)) throw new Error(`ROMFS 형제 엔트리 순환: ${hex(offset)}`);
        siblings.add(offset);
        const entry = await readEntry(offset);
        if (!entry.checksumValid) throw new Error(`ROMFS 엔트리 체크섬 오류: ${hex(offset)}`);
        const special = entry.name === '.' || entry.name === '..';
        const fullName = special ? parent : path.posix.join(parent, entry.name);
        if (!special) {
          safeParts(fullName);
          entries.push({ ...entry, path: fullName });
          if (entry.type === 1 && entry.spec) await walk(entry.spec, fullName);
        }
        offset = entry.next;
      }
    }
    await walk(rootOffset, '');

    await fsp.mkdir(destination, { recursive: true });
    const manifestEntries = [];
    for (const entry of entries) {
      const target = safeJoin(destination, entry.path);
      const common = {
        path: `/${entry.path}`,
        type: entry.type,
        executable: entry.executable,
        entryOffset: number(entry.offset),
        dataOffset: number(entry.dataOffset),
        size: entry.size,
        checksum: hex(entry.checksum),
      };
      if (entry.type === 1) {
        await fsp.mkdir(target, { recursive: true });
        manifestEntries.push({ ...common, kind: 'directory' });
      } else if (entry.type === 2) {
        await fsp.mkdir(path.dirname(target), { recursive: true });
        const digest = new DigestTransform();
        if (entry.size === 0) {
          await fsp.writeFile(target, Buffer.alloc(0), { flag: 'wx', mode: entry.executable ? 0o700 : 0o600 });
          digest.end();
          await new Promise((resolve, reject) => digest.on('finish', resolve).on('error', reject));
        } else {
          await pipeline(
            fs.createReadStream(imagePath, { start: baseOffset + entry.dataOffset, end: baseOffset + entry.dataOffset + entry.size - 1 }),
            digest,
            fs.createWriteStream(target, { flags: 'wx', mode: entry.executable ? 0o700 : 0o600 }),
          );
        }
        manifestEntries.push({ ...common, kind: 'file', sha256: digest.result().sha256 });
      } else if (entry.type === 3) {
        const data = await readAt(handle, entry.size, baseOffset + entry.dataOffset);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, data, { flag: 'wx', mode: 0o600 });
        manifestEntries.push({ ...common, kind: 'symlink-placeholder', target: data.toString('utf8').replace(/\0+$/, '') });
      } else {
        manifestEntries.push({ ...common, kind: ['hardlink', 'directory', 'file', 'symlink', 'block-device', 'char-device', 'socket', 'fifo'][entry.type] || 'unknown', spec: number(entry.spec) });
      }
    }

    const manifest = {
      format: 'romfs-v1-extraction',
      sourceImage: path.relative(outputDir, imagePath),
      imageOffset: number(baseOffset),
      declaredSize: number(declaredSize),
      volumeName: volume.text,
      entryCount: manifestEntries.length,
      note: 'ROMFS 심볼릭 링크는 외부 경로 접근을 막기 위해 링크 대신 대상 문자열을 담은 일반 파일로 추출했습니다.',
      entries: manifestEntries,
    };
    await fsp.writeFile(path.join(destination, 'romfs-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    return manifest;
  } finally {
    await handle.close();
  }
}

async function sha256File(filename) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filename), new Transform({
    transform(chunk, encoding, callback) { hash.update(chunk); callback(); },
  }));
  return hash.digest('hex');
}

async function main() {
  const inputStat = await fsp.stat(inputPath);
  if (!inputStat.isFile()) throw new Error(`입력 파일이 아닙니다: ${inputPath}`);

  console.log(`[1/3] 패키지 구조 확인: ${inputPath}`);
  const handle = await fsp.open(inputPath, 'r');
  let zipEntries;
  try { zipEntries = await parseZip(handle, inputStat.size); } finally { await handle.close(); }
  const patchEntries = zipEntries.filter((entry) => entry.name.toLowerCase().endsWith('.patch'));
  if (patchEntries.length > 0) {
    throw new Error(
      `증분 업데이트 패키지입니다(${patchEntries.map((entry) => entry.name).join(', ')}). ` +
      '이 도구에는 vela_*.bin이 든 full BIN을 입력해야 합니다.',
    );
  }

  if (fs.existsSync(outputDir)) {
    console.log(`기존 출력 폴더 삭제: ${outputDir}`);
    await fsp.rm(outputDir, { recursive: true, force: true });
  }
  if (fs.existsSync(replacementDir)) {
    console.log(`기존 입력 폴더 삭제: ${replacementDir}`);
    await fsp.rm(replacementDir, { recursive: true, force: true });
  }
  await fsp.mkdir(packageDir, { recursive: true });
  await fsp.mkdir(replacementDir, { recursive: true });
  outputPrepared = true;

  console.log(`[2/3] ZIP 항목 ${zipEntries.length}개 추출 및 CRC32 검증`);
  const extracted = [];
  const zipHandle = await fsp.open(inputPath, 'r');
  try {
    for (const entry of zipEntries) {
      console.log(`  ${entry.name}`);
      extracted.push(await extractZipEntry(zipHandle, entry));
    }
  } finally {
    await zipHandle.close();
  }

  console.log('[3/3] 내부 ROMFS 탐색 및 경로별 추출');
  const romfs = [];
  for (const entry of extracted.filter((item) => !item.directory)) {
    const imagePath = path.join(outputDir, entry.output);
    const offsets = await findRomfsCandidates(imagePath);
    for (const offset of offsets) {
      const stem = path.basename(entry.name).replace(/[^A-Za-z0-9._-]/g, '_');
      const destination = path.join(romfsDir, stem, `offset-${offset.toString(16).padStart(8, '0')}`);
      console.log(`  ${entry.name} @ ${hex(offset)} -> ${path.relative(outputDir, destination)}`);
      romfs.push(await extractRomfs(imagePath, offset, destination));
    }
  }

  const manifest = {
    format: 'rw6-full-bin-extraction-v1',
    source: { path: inputPath, size: inputStat.size, sha256: await sha256File(inputPath) },
    packageDirectory: 'package',
    romfsDirectory: 'romfs',
    zipEntryCount: extracted.length,
    romfsCount: romfs.length,
    zipEntries: extracted,
    romfs: romfs.map((item) => ({
      sourceImage: item.sourceImage,
      imageOffset: item.imageOffset,
      declaredSize: item.declaredSize,
      volumeName: item.volumeName,
      entryCount: item.entryCount,
    })),
  };
  await fsp.writeFile(path.join(outputDir, 'extraction-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(`완료: ${outputDir}`);
  console.log(`ZIP ${extracted.length}개, ROMFS ${romfs.length}개, manifest: extraction-manifest.json`);
}

main().catch(async (error) => {
  console.error(`오류: ${error.message}`);
  if (outputPrepared && fs.existsSync(outputDir)) {
    console.error(`불완전한 출력은 자동 삭제하지 않았습니다: ${outputDir}`);
  }
  process.exitCode = 1;
});
