'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

process.chdir(__dirname);
const output = 'output/fontpatch';
const targets = ['MiSans-Medium', 'MiSans-Demibold', 'MiSans-Regular'];

try {
    const fonts = fs.readdirSync('font', { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.ttf$/i.test(entry.name))
        .map(entry => entry.name)
        .sort();
    if (!fonts.length) throw new Error('font/에 TTF 파일이 없습니다.');
    const names = fonts.map(file => file.slice(0, -4));
    for (const name of names) {
        if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(name) || name === 'restore') {
            throw new Error(`폰트 파일명은 영문·숫자·밑줄·하이픈·점으로 지정하세요: ${name}`);
        }
    }
    if (new Set(names).size !== names.length) throw new Error('중복된 폰트 이름입니다.');

    // 기존 입력과 일괄 출력은 비우고, 원본 추출 데이터는 그대로 사용한다.
    fs.rmSync('input', { recursive: true, force: true });
    fs.mkdirSync('input/font', { recursive: true });
    fs.rmSync(output, { recursive: true, force: true });
    fs.mkdirSync(output, { recursive: true });

    fonts.forEach((file, index) => {
        console.log(`[${index + 1}/${fonts.length}] ${file}`);
        for (const target of targets) {
            fs.copyFileSync(`font/${file}`, `input/font/${target}.ttf`);
        }
        execFileSync(process.execPath, ['create-patch.js'], { stdio: 'inherit' });
        const destination = `${output}/${names[index]}`;
        fs.renameSync('output/patch/font', destination);

        // 첫 결과의 복원 파일만 공통 폴더에 보관한다.
        for (const target of targets) {
            const folder = `${destination}/${target}`;
            const restore = `${output}/restore/${target}`;
            if (index === 0) {
                fs.mkdirSync(restore, { recursive: true });
                fs.copyFileSync(`${folder}/manifest.json`, `${restore}/manifest.json`);
            }
            for (const name of fs.readdirSync(folder)) {
                if (!name.startsWith('restore')) continue;
                if (index === 0) fs.renameSync(`${folder}/${name}`, `${restore}/${name}`);
                else fs.unlinkSync(`${folder}/${name}`);
            }
        }
    });

    fs.writeFileSync(`${output}/list.txt`, names.join('\n') + '\n');
    for (const target of targets) fs.unlinkSync(`input/font/${target}.ttf`);
    fs.rmdirSync('output/patch');
    console.log(`완료: ${output}`);
} catch (error) {
    console.error(`중단: ${error.message}`);
    process.exitCode = 1;
}
