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
const CHUNK_SIZE = 1024 * 1024;
const FAST_BLOCK_SIZE = 64 * 1024;
const EDGE_BLOCK_SIZE = 16;
const ROMFS_MAGIC = Buffer.from('-rom1fs-');

if (process.argv.includes('-h') || process.argv.includes('--help')) {
    console.log(`사용법:
  node create-patch.js

input/에 resource 경로대로 교체 파일을 넣습니다.
결과: output/patch/파일별 폴더/{patch.partNNN,restore.partNNN,manifest.json}`);
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

function applyPayloads(baseImage, items, payloadKey, reverse = false) {
    const result = Buffer.from(baseImage);
    const ordered = reverse ? [...items].reverse() : items;

    for (const item of ordered) {
        item[payloadKey].copy(result, item.rangeStart);
    }

    return result;
}

function splitPayload(payload, prefix, rangeStart) {
    const chunks = [];
    let payloadOffset = 0;

    while (payloadOffset < payload.length) {
        const deviceOffset = rangeStart + payloadOffset;
        const edgeSize = deviceOffset % FAST_BLOCK_SIZE
            ? FAST_BLOCK_SIZE - (deviceOffset % FAST_BLOCK_SIZE)
            : 0;
        const remaining = payload.length - payloadOffset;
        let blockSize;
        let size;

        if (edgeSize) {
            blockSize = EDGE_BLOCK_SIZE;
            size = Math.min(edgeSize, remaining);
        } else if (remaining >= FAST_BLOCK_SIZE) {
            blockSize = FAST_BLOCK_SIZE;
            size = Math.min(
                Math.floor(remaining / FAST_BLOCK_SIZE) * FAST_BLOCK_SIZE,
                CHUNK_SIZE,
            );
        } else {
            blockSize = EDGE_BLOCK_SIZE;
            size = remaining;
        }

        if (deviceOffset % blockSize || size % blockSize) {
            throw new Error(`기록 조각 정렬 오류: ${hex(deviceOffset)}, ${size}`);
        }

        const index = chunks.length;
        const end = payloadOffset + size;
        chunks.push({
            name: `${prefix}.part${String(index).padStart(3, '0')}`,
            data: Buffer.from(payload.subarray(payloadOffset, end)),
            deviceOffset,
            blockSize,
            seek: deviceOffset / blockSize,
            count: size / blockSize,
        });
        payloadOffset = end;
    }

    return chunks;
}

async function collectTargets(image, romfsCandidates, inputPaths) {
    const rootRomfs = romfsCandidates[0];
    const targets = [];

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
        targets.push({
            wantedPath,
            entry,
            replacement,
            oldEnd,
            allocatedEnd,
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

        target.rangeStart = entry.offset;
        target.rangeEnd = entry.next || allocatedEnd;
        if (target.rangeEnd < allocatedEnd || target.rangeEnd > romfsSize) {
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

function createItems(originalImage, finalImage, targets) {
    return [...targets]
        .sort((a, b) => a.rangeStart - b.rangeStart)
        .map((target, index) => ({
        id: `file-${String(index + 1).padStart(3, '0')}`,
        outputPath: path.extname(target.wantedPath).toLowerCase() === '.ttf'
            ? `font/${path.posix.basename(target.wantedPath, '.ttf')}`
            : path.posix.basename(target.wantedPath, path.posix.extname(target.wantedPath)),
        rangeStart: target.rangeStart,
        rangeEnd: target.rangeEnd,
        target,
        patchPayload: Buffer.from(finalImage.subarray(target.rangeStart, target.rangeEnd)),
        restorePayload: Buffer.from(originalImage.subarray(target.rangeStart, target.rangeEnd)),
    }));
}

function verifyApplicationOrder(originalImage, finalImage, items) {
    const unionStart = Math.min(...items.map((item) => item.rangeStart));
    const unionEnd = Math.max(...items.map((item) => item.rangeEnd));

    for (const reverse of [false, true]) {
        const patched = applyPayloads(originalImage, items, 'patchPayload', reverse);
        const restored = applyPayloads(finalImage, items, 'restorePayload', reverse);

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

function chunkMetadata(chunks) {
    return chunks.map((chunk) => ({
        name: chunk.name,
        size: chunk.data.length,
        sha256: sha256(chunk.data),
        deviceOffset: { decimal: chunk.deviceOffset, hex: hex(chunk.deviceOffset) },
        blockSize: chunk.blockSize,
        seek: chunk.seek,
        count: chunk.count,
    }));
}

function verifyChunkLayout(item, chunks) {
    let expectedOffset = item.rangeStart;

    for (const chunk of chunks) {
        if (chunk.deviceOffset !== expectedOffset
            || ![EDGE_BLOCK_SIZE, FAST_BLOCK_SIZE].includes(chunk.blockSize)
            || chunk.deviceOffset % chunk.blockSize
            || chunk.data.length % chunk.blockSize
            || chunk.seek * chunk.blockSize !== chunk.deviceOffset
            || chunk.count * chunk.blockSize !== chunk.data.length) {
            throw new Error(`기록 조각 검증 실패: ${item.outputPath}/${chunk.name}`);
        }
        expectedOffset += chunk.data.length;
    }

    if (expectedOffset !== item.rangeEnd) {
        throw new Error(`기록 범위 검증 실패: ${item.outputPath}`);
    }
}

function commitChunkIndexes(item, chunks) {
    const indexes = [item.target].map((target) => (
        chunks.findIndex((chunk) => (
            target.entry.offset >= chunk.deviceOffset
            && target.entry.offset < chunk.deviceOffset + chunk.data.length
        ))
    ));
    if (indexes.some((index) => index < 0)) {
        throw new Error(`헤더 조각을 찾지 못함: ${item.outputPath}`);
    }
    return indexes;
}

function createScripts(item, chunks, prefix) {
    const commit = new Set(commitChunkIndexes(item, chunks));
    const order = [
        ...chunks.filter((_, index) => !commit.has(index)),
        ...chunks.filter((_, index) => commit.has(index)),
    ];
    const installStatus = '/data/tmp-patch/install.status';
    const verifyStatus = '/data/tmp-patch/verify.status';
    const readback = '/data/tmp-patch/readback.tmp';
    const install = ['set +e', `echo INSTALL_START >${installStatus}`];
    const verify = ['set +e', `echo VERIFY_START >${verifyStatus}`];

    for (const chunk of order) {
        const index = chunks.indexOf(chunk);
        const marker = String(index).padStart(3, '0');
        install.push(
            `if dd if=/data/tmp-patch/${chunk.name} of=/dev/resource bs=${chunk.blockSize} seek=${chunk.seek} count=${chunk.count} conv=notrunc; then echo W${marker}_OK >>${installStatus}; fi`,
        );
    }
    for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const marker = String(index).padStart(3, '0');
        verify.push(
            `rm ${readback}`,
            `dd if=/dev/resource of=${readback} bs=${chunk.blockSize} skip=${chunk.seek} count=${chunk.count}`,
            `if cmp /data/tmp-patch/${chunk.name} ${readback}; then echo V${marker}_OK >>${verifyStatus}; fi`,
        );
    }
    verify.push(`rm ${readback}`);

    return {
        install: Buffer.from(`${install.join('\n')}\n`),
        verify: Buffer.from(`${verify.join('\n')}\n`),
        prefix,
    };
}

function createItemManifest(originalImage, item, patchChunks, restoreChunks, scripts) {
    const number = (value) => ({ decimal: value, hex: hex(value) });
    const commitChunks = [item.target].map((target) => (
        patchChunks.findIndex((chunk) => (
            target.entry.offset >= chunk.deviceOffset
            && target.entry.offset < chunk.deviceOffset + chunk.data.length
        ))
    ));

    if (commitChunks.some((index) => index < 0)) {
        throw new Error(`헤더 조각을 찾지 못함: ${item.outputPath}`);
    }

    return {
        format: 'rw6-romfs-entry-patch-v1',
        id: item.id,
        source: {
            image: 'output/extract/package/vela_resource.bin',
            imageSize: originalImage.length,
            imageSha256: sha256(originalImage),
            romfsBaseOffset: number(item.target.entry.romfsBase),
            romfsDeclaredSize: number(item.target.entry.romfsSize),
        },
        target: {
            path: item.target.wantedPath,
            entryOffset: number(item.target.entry.offset),
            dataOffset: number(item.target.entry.dataOffset),
            nextHeaderOffset: number(item.target.entry.next),
            originalSize: number(item.target.entry.size),
            newSize: number(item.target.replacement.length),
            originalAllocatedEnd: number(item.target.allocatedEnd),
            originalChecksum: hex(item.target.entry.checksum),
            newChecksum: hex(item.target.newChecksum),
            originalFileSha256: sha256(
                originalImage.subarray(item.target.entry.dataOffset, item.target.oldEnd),
            ),
            newFileSha256: sha256(item.target.replacement),
        },
        payload: {
            transfer: 'chunks',
            device: '/dev/resource',
            rangeStart: number(item.rangeStart),
            rangeEndExclusive: number(item.rangeEnd),
            size: item.patchPayload.length,
            patchChunkPrefix: 'patch.part',
            patchChunkSize: CHUNK_SIZE,
            patchChunkCount: patchChunks.length,
            patchSha256: sha256(item.patchPayload),
            patchChunks: chunkMetadata(patchChunks),
            restoreChunkPrefix: 'restore.part',
            restoreChunkSize: CHUNK_SIZE,
            restoreChunkCount: restoreChunks.length,
            restoreSha256: sha256(item.restorePayload),
            restoreChunks: chunkMetadata(restoreChunks),
        },
        install: {
            commitChunks: commitChunks.join(','),
            fastBlockSize: FAST_BLOCK_SIZE,
            edgeBlockSize: EDGE_BLOCK_SIZE,
            forbiddenOption: 'verify',
            patchScript: 'patch.sh',
            patchScriptSize: scripts.patch.install.length,
            patchVerifyScript: 'patch-verify.sh',
            patchVerifyScriptSize: scripts.patch.verify.length,
            restoreScript: 'restore.sh',
            restoreScriptSize: scripts.restore.install.length,
            restoreVerifyScript: 'restore-verify.sh',
            restoreVerifyScriptSize: scripts.restore.verify.length,
        },
    };
}

async function writeOutputs(originalImage, items) {
    await fsp.rm(OUTPUT, { recursive: true, force: true });
    await fsp.mkdir(OUTPUT, { recursive: true });
    const summaries = [];

    for (const item of items) {
        const patchChunks = splitPayload(item.patchPayload, 'patch', item.rangeStart);
        const restoreChunks = splitPayload(item.restorePayload, 'restore', item.rangeStart);
        verifyChunkLayout(item, patchChunks);
        verifyChunkLayout(item, restoreChunks);
        const scripts = {
            patch: createScripts(item, patchChunks, 'patch'),
            restore: createScripts(item, restoreChunks, 'restore'),
        };
        const manifest = createItemManifest(
            originalImage,
            item,
            patchChunks,
            restoreChunks,
            scripts,
        );
        const outputDirectory = path.join(OUTPUT, item.outputPath);

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
            fsp.writeFile(path.join(outputDirectory, 'patch.sh'), scripts.patch.install,
                { flag: 'wx', mode: 0o600 }),
            fsp.writeFile(path.join(outputDirectory, 'patch-verify.sh'), scripts.patch.verify,
                { flag: 'wx', mode: 0o600 }),
            fsp.writeFile(path.join(outputDirectory, 'restore.sh'), scripts.restore.install,
                { flag: 'wx', mode: 0o600 }),
            fsp.writeFile(path.join(outputDirectory, 'restore-verify.sh'), scripts.restore.verify,
                { flag: 'wx', mode: 0o600 }),
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
        const writtenScripts = await Promise.all([
            'patch.sh', 'patch-verify.sh', 'restore.sh', 'restore-verify.sh',
        ].map((name) => fsp.readFile(path.join(outputDirectory, name))));
        if (!writtenPatch.equals(item.patchPayload)
            || !writtenRestore.equals(item.restorePayload)
            || sha256(writtenPatch) !== manifest.payload.patchSha256
            || sha256(writtenRestore) !== manifest.payload.restoreSha256
            || !writtenScripts[0].equals(scripts.patch.install)
            || !writtenScripts[1].equals(scripts.patch.verify)
            || !writtenScripts[2].equals(scripts.restore.install)
            || !writtenScripts[3].equals(scripts.restore.verify)) {
            await fsp.rm(OUTPUT, { recursive: true, force: true });
            throw new Error(`조각 출력 파일 재결합 검증 실패: ${item.outputPath}`);
        }

        summaries.push({
            id: item.id,
            target: item.target.wantedPath,
            output: path.relative(ROOT, outputDirectory),
            payloadSize: item.patchPayload.length,
            patchChunkCount: patchChunks.length,
            restoreChunkCount: restoreChunks.length,
            rangeStart: item.rangeStart,
            rangeEndExclusive: item.rangeEnd,
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
    const items = createItems(originalImage, finalImage, targets);
    verifyApplicationOrder(originalImage, finalImage, items);
    const summaries = await writeOutputs(originalImage, items);

    console.log(JSON.stringify(summaries, null, 2));
    console.log(`완료: ${OUTPUT}`);
}

main().catch((error) => {
    console.error(`오류: ${error.message}`);
    process.exitCode = 1;
});
