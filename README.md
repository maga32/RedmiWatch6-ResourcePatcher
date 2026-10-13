# RedmiWatch6 Resource Patcher

## 0. 소개

Redmi Watch 6의 full BIN에서 `vela_resource.bin`과 파일들을 추출하고,<br>
ROMFS 파일 엔트리 범위만 수정하거나 복원할 수 있는 패치를 생성하는 도구입니다.

### 준비물:

- Node.js 18 이상
- full버전의 워치 펌웨어 

### Files:

- patches: raw파일 배포용 배치 완료된 리소스
- watchface: 패치에 필요한 워치페이스 소스
- extract-full-bin.js: 원본 bin 추출도구
- create-patch.js: 패치 생성 도구
- creat-font-pathches.js: 폰트 패치 일괄 생성 도구
- [method.md](./method.md): 작업방식을 설명 및 에이전트 주입용 설명서

### clone :

- 로컬 용량상 clone시 `--sparse`로 `patches/`의 일부를 제외하고 받습니다.

```bash
git clone --filter=blob:none --sparse https://github.com/maga32/RedmiWatch6-ResourcePatcher.git
cd RedmiWatch6-ResourcePatcher
git sparse-checkout set --no-cone \
  '/*' \
  '!/patches/**' \
  '/patches/**/' \
  '/patches/**/manifest.json' \
  '/patches/**/list.txt'
```
### commit :
- `patches/`이하경로 commit시 `--sparse`로 add해줍니다.

```bash
git add --sparse patches/
```


## 1. 원본 추출
full BIN을 `output/extract/`에 추출하고 빈 `input/` 폴더를 만듭니다. 기존 추출 결과와 `input/` 내용은 자동으로 삭제됩니다.

```bash
node extract-full-bin.js /path/to/full.bin
```

증분 업데이트 펌웨어는 사용할 수 없습니다.

## 2. 패치 생성

`input/`에 원본 resource와 같은 경로로 교체 파일을 하나 이상 넣습니다.

```text
input/
├── i18n/zh_CN/LC_MESSAGES/messages.mo
└── font/
    ├── MiSans-Demibold.ttf
    ├── MiSans-Medium.ttf
    └── MiSans-Regular.ttf
```

```bash
node create-patch.js
```

결과는 배포에 사용할 수 있는 폴더 구조로 `output/patch/`에 생성됩니다.

```text
output/patch/
├── messages/
│   └── {manifest.json,patch.partNNN,restore.partNNN,patch·restore 쉘}
└── font/
    ├── MiSans-Demibold/
    ├── MiSans-Medium/
    └── MiSans-Regular/
```

`output/patch/`의 내용을 `patches/<제품>/korean/<버전>/`에 복사하여 배포합니다. 각 파일은 서로 독립적으로 패치하고 복원할 수 있습니다.

## 3. 폰트 패치 생성

`font/` 폴더에 ttf 파일들을 넣습니다.

```bash
node creat-font-pathches.js
```

위 작업은 create-patch.js를 사용하며, 각 ttf를 MiSans-Medium·Demibold·Regular 패치로 만들고, 이름순 `list.txt`과 복원 파일을 함께 생성합니다.

```text
output/fontpatch/
├── list.txt
├── 폰트명/
│   └── MiSans-*/{manifest.json,patch.partNNN,patch.sh,patch-verify.sh}
└── restore/
    └── MiSans-*/{manifest.json,restore.partNNN,restore.sh,restore-verify.sh}
```

결과 내용물을 `patches/<제품>/font/<버전>/`에 복사하여 배포합니다.

- 기존 `input/`, `output/patch/`, `output/fontpatch/` 내용은 교체됩니다.
- 파일명은 영문·숫자·밑줄·하이픈·점만 사용하며, `restore`는 사용할 수 없습니다.
- 원본보다 큰 폰트 등 생성 오류가 발생하면 중단됩니다.

*) 폰트별 라이선스는 `License`에서 확인하실 수 있습니다.

## 4. 주의사항

- `input/`에는 일반 교체 파일을 하나 이상 넣을 수 있습니다.
- 폴더 구조와 파일명은 원본 resource 경로와 같아야 합니다.
- 교체 파일은 원본 파일보다 클 수 없습니다.
- patch와 restore는 엔트리 헤더부터 다음 엔트리 직전까지 생성합니다.
- 양쪽 비정렬 구간은 16바이트, 가운데 정렬 구간은 64KiB(65,536) 단위로 기록할 수 있게 분할합니다. 각 조각은 최대 1MiB입니다.
- 모든 조각을 다시 결합하여 원본 payload와 같은지 자동 검증합니다.
- 워치페이스는 Medium, Demibold, Regular, messages 순서로 파일 하나를 완료할 때마다 진행 상태를 저장하고 재부팅합니다.
- 다운로드 조각은 `/data/tmp-patch/`에 개별 저장하며 다음 파일을 시작할 때 삭제합니다.
- 생성된 설치·검증 쉘을 내려받아 실행하므로 Lua에서 긴 명령행을 만들지 않습니다.
- 대상이 resource 최초 512바이트와 겹치면 자동 생성하지 않으며, 슈퍼블록 체크섬을 포함한 수동 작업이 필요합니다.
- 1번을 다시 실행하면 기존 `input/` 내용이 삭제됩니다.
