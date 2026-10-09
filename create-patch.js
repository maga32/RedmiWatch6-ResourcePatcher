#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const INPUT = path.join(ROOT, 'input');
const IMAGE = path.join(ROOT, 'output/extract/package/vela_resource.bin');
const OUTPUT = path.join(ROOT, 'output/patch');
const BLOCK_SIZE = 4096;
const CHUNK_SIZE = 1024 * 1024;
const ROMFS_MAGIC = Buffer.from('-rom1fs-');

if (process.argv.includes('-h') || process.argv.includes('--help')) {
    console.log(`사용법:
  node create-patch.js

input/에 resource 경로대로 교체 파일을 넣습니다.
결과: output/patch/<원본 경로>/<확장자를 뺀 파일명>/{patch.partNNN,restore.partNNN,manifest.json}`);
    process.exit(0);
}

if (process.argv.length !== 2) {
    console.error('사용법: node create-patch.js');
    process.exit(2);
}

function align(value, unit) {
    return Math.ceil(value / unit) * unit;
}

function hex(value) {
    return `0x${value.toString(16).padStart(8, '0')}`;
}

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function wordSum(data, start, end) {
    let value = 0;
    for (let offset = start; offset < end; offset += 4) {
        value = (value + data.readUInt32BE(offset)) >>> 0;
    }
    return value;
}

async function listInputFiles(directory, relative = '') {
    const result = [];

    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
        const relativePath = path.join(relative, entry.name);
        const absolutePath = path.join(directory, entry.name);

        if (entry.isSymbolicLink()) {
            throw new Error(`심볼릭 링크 금지: input/${relativePath}`);
        }
        if (entry.isDirectory()) {
            result.push(...await listInputFiles(absolutePath, relativePath));
        } else if (entry.isFile()) {
            result.push(relativePath);
        } else {
            throw new Error(`일반 파일이 아님: input/${relativePath}`);
        }
    }

    return result;
}

function findRomfsCandidates(image) {
    const result = [];

    for (let base = image.indexOf(ROMFS_MAGIC);
        base >= 0;
        base = image.indexOf(ROMFS_MAGIC, base + 1)) {
        if (base + 16 > image.length) {
            continue;
        }

        const size = image.readUInt32BE(base + 8);
        const checksumSize = Math.min(512, size);
        if (size >= 32
            && base + size <= image.length
            && checksumSize % 4 === 0
            && wordSum(image, base, base + checksumSize) === 0) {
            result.push({ base, size });
        }
    }

    return result;
}

function findRomfsEntries(image, base, size, wantedPath) {
    const limit = base + size;

    function readString(relativeOffset) {
        const absoluteOffset = base + relativeOffset;
        const end = image.indexOf(0, absoluteOffset);
        if (end < 0 || end >= limit) {
            throw new Error(`종료되지 않은 이름: ${hex(absoluteOffset)}`);
        }
        return {
            text: image.subarray(absoluteOffset, end).toString('utf8'),
            end: end - base,
        };
    }

    function readEntry(relativeOffset) {
        if ((relativeOffset & 15) || relativeOffset < 0 || relativeOffset + 16 > size) {
            throw new Error(`잘못된 엔트리: ${hex(base + relativeOffset)}`);
        }

        const offset = base + relativeOffset;
        const nextType = image.readUInt32BE(offset);
        const name = readString(relativeOffset + 16);
        const relativeDataOffset = align(name.end + 1, 16);
        const dataOffset = base + relativeDataOffset;
        const entrySize = image.readUInt32BE(offset + 8);
        const relativeNext = nextType & 0xfffffff0;

        if (relativeDataOffset + entrySize > size) {
            throw new Error(`데이터 범위 초과: ${hex(offset)}`);
        }

        return {
            relativeOffset,
            offset,
            relativeNext,
            next: relativeNext ? base + relativeNext : 0,
            type: nextType & 7,
            spec: image.readUInt32BE(offset + 4),
            size: entrySize,
            checksum: image.readUInt32BE(offset + 12),
            dataOffset,
            valid: wordSum(image, offset, dataOffset) === 0,
        };
    }

    const volume = readString(16);
    const found = [];
    const visited = new Set();

    function walk(first, parent) {
        if (!first || visited.has(first)) {
            return;
        }

        visited.add(first);
        const siblings = new Set();

        for (let relativeOffset = first; relativeOffset;) {
            if (siblings.has(relativeOffset)) {
                throw new Error(`엔트리 순환: ${hex(base + relativeOffset)}`);
            }
            siblings.add(relativeOffset);

            const entry = readEntry(relativeOffset);
            if (!entry.valid) {
                throw new Error(`엔트리 체크섬 오류: ${hex(entry.offset)}`);
            }

            const name = readString(relativeOffset + 16).text;
            const special = name === '.' || name === '..';
            const fullPath = special ? parent : path.posix.join(parent, name);

            if (!special && fullPath === wantedPath) {
                found.push({
                    ...entry,
                    path: fullPath,
                    romfsBase: base,
                    romfsSize: size,
                });
            }
            if (!special && entry.type === 1 && entry.spec) {
                walk(entry.spec, fullPath);
            }

            relativeOffset = entry.relativeNext;
        }
    }

    walk(align(volume.end + 1, 16), '/');
    return found;
}

function outputRelativeDirectory(resourcePath) {
    const parts = resourcePath.split('/').filter(Boolean);
    const filename = parts.at(-1);
    const extension = path.posix.extname(filename);
    parts[parts.length - 1] = extension
        ? filename.slice(0, -extension.length)
        : filename;
    return path.join(...parts);
}

function applyPayloads(baseImage, items, payloadKey, reverse = false) {
    const result = Buffer.from(baseImage);
    const ordered = reverse ? [...items].reverse() : items;

    for (const item of ordered) {
        item[payloadKey].copy(result, item.blockStart);
    }

    return result;
}

function splitPayload(payload, prefix) {
    const chunks = [];
    const count = Math.ceil(payload.length / CHUNK_SIZE);

    for (let index = 0; index < count; index += 1) {
        const start = index * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, payload.length);
        chunks.push({
            name: `${prefix}.part${String(index).padStart(3, '0')}`,
            data: Buffer.from(payload.subarray(start, end)),
        });
    }

    return chunks;
}

async function collectTargets(image, romfsCandidates, inputPaths) {
    const rootRomfs = romfsCandidates[0];
    const targets = [];
    const outputPaths = new Set();

    for (const relativePath of inputPaths.sort()) {
        const wantedPath = `/${relativePath.split(path.sep).join('/')}`;
        const matches = findRomfsEntries(
            image,
            rootRomfs.base,
            rootRomfs.size,
            wantedPath,
        );

        if (matches.length !== 1) {
            const nestedMatches = romfsCandidates
                .slice(1)
                .flatMap((candidate) => findRomfsEntries(
                    image,
                    candidate.base,
                    candidate.size,
                    wantedPath,
                ));

            if (nestedMatches.length) {
                throw new Error(
                    `최상위 resource에는 없고 내부 펌웨어 이미지의 중첩 ROMFS에만 존재하므로 패치할 수 없음: ${wantedPath}`,
                );
            }
            throw new Error(`원본 resource에서 파일을 정확히 하나 찾지 못함: ${wantedPath}`);
        }

        const entry = matches[0];
        const replacement = await fsp.readFile(path.join(INPUT, relativePath));
        const oldEnd = entry.dataOffset + entry.size;
        const allocatedEnd = align(oldEnd, 16);
        const outputRelative = outputRelativeDirectory(wantedPath);

        if (entry.type !== 2) {
            throw new Error(`일반 파일이 아님: ${wantedPath}`);
        }
        if (replacement.length > entry.size) {
            throw new Error(
                `교체 파일이 원본보다 큼: ${wantedPath}: ${replacement.length} > ${entry.size} bytes`,
            );
        }
        if (entry.next && allocatedEnd > entry.next) {
            throw new Error(`원본 파일 영역이 다음 엔트리와 겹침: ${wantedPath}`);
        }
        if (entry.relativeOffset < Math.min(512, rootRomfs.size)) {
            throw new Error(`대상이 ROMFS 최초 512바이트와 겹침: ${wantedPath}`);
        }
        if (outputPaths.has(outputRelative)) {
            throw new Error(`출력 경로 충돌: ${outputRelative}`);
        }

        outputPaths.add(outputRelative);
        targets.push({
            wantedPath,
            entry,
            replacement,
            oldEnd,
            allocatedEnd,
            outputRelative,
        });
    }

    return targets;
}

function buildFinalImage(originalImage, targets, romfsSize) {
    const finalImage = Buffer.from(originalImage);

    for (const target of targets) {
        const { entry, replacement, allocatedEnd } = target;

        finalImage.writeUInt32BE(replacement.length, entry.offset + 8);
        finalImage.writeUInt32BE(0, entry.offset + 12);
        target.newChecksum = (-wordSum(finalImage, entry.offset, entry.dataOffset)) >>> 0;
        finalImage.writeUInt32BE(target.newChecksum, entry.offset + 12);
        replacement.copy(finalImage, entry.dataOffset);
        finalImage.fill(0, entry.dataOffset + replacement.length, allocatedEnd);

        target.blockStart = Math.floor(entry.offset / BLOCK_SIZE) * BLOCK_SIZE;
        target.blockEnd = align(allocatedEnd, BLOCK_SIZE);
        if (target.blockEnd > romfsSize) {
            throw new Error(`패치 범위 초과: ${target.wantedPath}`);
        }
    }

    for (const target of targets) {
        const { entry, replacement, allocatedEnd } = target;
        if (wordSum(finalImage, entry.offset, entry.dataOffset) !== 0
            || finalImage.readUInt32BE(entry.offset + 8) !== replacement.length
            || !finalImage
                .subarray(entry.dataOffset, entry.dataOffset + replacement.length)
                .equals(replacement)
            || finalImage
                .subarray(entry.dataOffset + replacement.length, allocatedEnd)
                .some((byte) => byte !== 0)) {
            throw new Error(`최종 이미지 자체 검증 실패: ${target.wantedPath}`);
        }
    }

    return finalImage;
}

function verifyApplicationOrder(originalImage, finalImage, generated) {
    const unionStart = Math.min(...generated.map((item) => item.blockStart));
    const unionEnd = Math.max(...generated.map((item) => item.blockEnd));

    for (const reverse of [false, true]) {
        const patched = applyPayloads(originalImage, generated, 'patchPayload', reverse);
        const restored = applyPayloads(finalImage, generated, 'restorePayload', reverse);

        if (!patched.subarray(unionStart, unionEnd)
            .equals(finalImage.subarray(unionStart, unionEnd))) {
            throw new Error(`패치 적용 순서 검증 실패: ${reverse ? '역순' : '정순'}`);
        }
        if (!restored.subarray(unionStart, unionEnd)
            .equals(originalImage.subarray(unionStart, unionEnd))) {
            throw new Error(`복원 적용 순서 검증 실패: ${reverse ? '역순' : '정순'}`);
        }
    }
}

function createManifest(originalImage, generated, item, patchChunks, restoreChunks) {
    const number = (value) => ({ decimal: value, hex: hex(value) });
    const overlappingTargets = generated
        .filter((other) => other !== item
            && item.blockStart < other.blockEnd
            && other.blockStart < item.blockEnd)
        .map((other) => other.wantedPath);

    return {
        format: 'rw6-romfs-block-patch-v1',
        source: {
            image: 'output/extract/package/vela_resource.bin',
            imageSize: originalImage.length,
            imageSha256: sha256(originalImage),
            romfsBaseOffset: number(item.entry.romfsBase),
            romfsDeclaredSize: number(item.entry.romfsSize),
        },
        batch: {
            targetCount: generated.length,
            targets: generated.map((target) => target.wantedPath),
            overlappingTargets,
        },
        target: {
            device: '/dev/resource',
            path: item.wantedPath,
            entryOffset: number(item.entry.offset),
            dataOffset: number(item.entry.dataOffset),
            nextHeaderOffset: number(item.entry.next),
            originalSize: number(item.entry.size),
            newSize: number(item.replacement.length),
            originalAllocatedEnd: number(item.allocatedEnd),
            originalChecksum: hex(item.entry.checksum),
            newChecksum: hex(item.newChecksum),
            originalFileSha256: sha256(
                originalImage.subarray(item.entry.dataOffset, item.oldEnd),
            ),
            newFileSha256: sha256(item.replacement),
        },
        payload: {
            transfer: 'chunks',
            blockSize: BLOCK_SIZE,
            blockStart: number(item.blockStart),
            blockEndExclusive: number(item.blockEnd),
            size: item.patchPayload.length,
            seek: item.blockStart / BLOCK_SIZE,
            count: item.patchPayload.length / BLOCK_SIZE,
            patchChunkPrefix: 'patch.part',
            patchChunkSize: CHUNK_SIZE,
            patchChunkCount: patchChunks.length,
            patchLastChunkSize: patchChunks.at(-1).data.length,
            patchSha256: sha256(item.patchPayload),
            restoreChunkPrefix: 'restore.part',
            restoreChunkSize: CHUNK_SIZE,
            restoreChunkCount: restoreChunks.length,
            restoreLastChunkSize: restoreChunks.at(-1).data.length,
            restoreSha256: sha256(item.restorePayload),
        },
        install: {
            write: `dd if=/data/k of=/dev/resource bs=${BLOCK_SIZE} seek=${item.blockStart / BLOCK_SIZE} count=${item.patchPayload.length / BLOCK_SIZE} conv=notrunc`,
            readback: `dd if=/dev/resource of=/data/r bs=${BLOCK_SIZE} skip=${item.blockStart / BLOCK_SIZE} count=${item.patchPayload.length / BLOCK_SIZE}`,
            forbiddenOption: 'verify',
        },
    };
}

async function writeOutputs(originalImage, generated) {
    await fsp.rm(OUTPUT, { recursive: true, force: true });
    const summaries = [];

    for (const item of generated) {
        const patchChunks = splitPayload(item.patchPayload, 'patch');
        const restoreChunks = splitPayload(item.restorePayload, 'restore');
        const manifest = createManifest(
            originalImage,
            generated,
            item,
            patchChunks,
            restoreChunks,
        );
        const outputDirectory = path.join(OUTPUT, item.outputRelative);

        await fsp.mkdir(outputDirectory, { recursive: true });
        await Promise.all([
            ...patchChunks.map((chunk) => fsp.writeFile(
                path.join(outputDirectory, chunk.name),
                chunk.data,
                { flag: 'wx', mode: 0o600 },
            )),
            ...restoreChunks.map((chunk) => fsp.writeFile(
                path.join(outputDirectory, chunk.name),
                chunk.data,
                { flag: 'wx', mode: 0o600 },
            )),
            fsp.writeFile(
                path.join(outputDirectory, 'manifest.json'),
                `${JSON.stringify(manifest)}\n`,
                { flag: 'wx', mode: 0o600 },
            ),
        ]);

        const writtenPatch = Buffer.concat(await Promise.all(
            patchChunks.map((chunk) => fsp.readFile(path.join(outputDirectory, chunk.name))),
        ));
        const writtenRestore = Buffer.concat(await Promise.all(
            restoreChunks.map((chunk) => fsp.readFile(path.join(outputDirectory, chunk.name))),
        ));
        if (!writtenPatch.equals(item.patchPayload)
            || !writtenRestore.equals(item.restorePayload)
            || sha256(writtenPatch) !== manifest.payload.patchSha256
            || sha256(writtenRestore) !== manifest.payload.restoreSha256) {
            await fsp.rm(OUTPUT, { recursive: true, force: true });
            throw new Error(`조각 출력 파일 재결합 검증 실패: ${item.wantedPath}`);
        }

        summaries.push({
            targetPath: item.wantedPath,
            output: path.relative(ROOT, outputDirectory),
            payloadSize: item.patchPayload.length,
            patchChunkCount: patchChunks.length,
            restoreChunkCount: restoreChunks.length,
            seek: item.blockStart / BLOCK_SIZE,
            count: item.patchPayload.length / BLOCK_SIZE,
            overlappingTargets: manifest.batch.overlappingTargets,
        });
    }

    return summaries;
}

async function main() {
    if (!fs.existsSync(INPUT) || !fs.existsSync(IMAGE)) {
        throw new Error('먼저 원본 추출을 실행하십시오.');
    }

    const inputPaths = await listInputFiles(INPUT);
    if (!inputPaths.length) {
        throw new Error('input/에 교체 파일을 하나 이상 넣어야 합니다.');
    }

    const originalImage = await fsp.readFile(IMAGE);
    const romfsCandidates = findRomfsCandidates(originalImage);
    if (!romfsCandidates.length || romfsCandidates[0].base !== 0) {
        throw new Error('vela_resource.bin의 최상위 ROMFS가 올바르지 않습니다.');
    }

    const targets = await collectTargets(originalImage, romfsCandidates, inputPaths);
    const finalImage = buildFinalImage(
        originalImage,
        targets,
        romfsCandidates[0].size,
    );
    const generated = targets.map((target) => ({
        ...target,
        patchPayload: Buffer.from(
            finalImage.subarray(target.blockStart, target.blockEnd),
        ),
        restorePayload: Buffer.from(
            originalImage.subarray(target.blockStart, target.blockEnd),
        ),
    }));

    verifyApplicationOrder(originalImage, finalImage, generated);
    const summaries = await writeOutputs(originalImage, generated);

    console.log(JSON.stringify(summaries, null, 2));
    console.log(`완료: ${OUTPUT}`);
}

main().catch((error) => {
    console.error(`오류: ${error.message}`);
    process.exitCode = 1;
});
