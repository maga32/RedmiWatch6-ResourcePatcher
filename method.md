# RW6 ROMFS 파일 엔트리 패치 표준

## 1. 무엇을 하려는가

Redmi Watch 6의 `/resource`는 읽기 전용 ROMFS라서 파일을 직접 덮어쓸 수 없다.

```sh
cp /data/messages.mo /resource/i18n/zh_CN/LC_MESSAGES/messages.mo
```

대신 원본 장치 `/dev/resource`에서 해당 파일의 ROMFS 엔트리 범위만 교체한다. 이 문서는 실제 대상인 다음 파일로 표준 방식을 설명한다.

```text
/i18n/zh_CN/LC_MESSAGES/messages.mo
```

사용자는 ROMFS 내부 전체 경로와 새 파일만 지정하고, 도구가 위치·크기·체크섬·기록 범위를 계산한다.

## 2. 원본 파일을 경로로 찾는다

공식 `vela_resource.bin`의 ROMFS에서 전체 경로가 정확히 일치하는 엔트리를 찾는다. 같은 파일명이 여러 디렉터리에 있을 수 있으므로 이름만으로 찾으면 안 된다.

```text
대상 경로:          /i18n/zh_CN/LC_MESSAGES/messages.mo
ROMFS 엔트리 시작: 0x05bf9fe0 - 96,444,384
파일 데이터 시작:  0x05bfa000 - 96,444,416
원본 파일 크기:    299,552바이트 - 0x49220
```

## 3. 실제 ROMFS 헤더를 읽는다

`messages.mo` 엔트리의 원본 바이트:

```text
05bf9fe0: 05 c4 32 22   next/type
05bf9fe4: 00 00 00 00   spec
05bf9fe8: 00 04 92 20   size = 299,552
05bf9fec: fc fc f3 d8   checksum
05bf9ff0: 6d 65 73 73   m e s s 파일명
05bf9ff4: 61 67 65 73   a g e s
05bf9ff8: 2e 6d 6f 00   . m o \0 (+00종료)
05bf9ffc: 00 00 00 00   파일명부터 16단위로 공백
05bfa000: ...           MO 데이터 시작(무조건 16단위에서 시작)
```

ROMFS 엔트리의 기본 구조:

```text
엔트리 +0x00  next/type     4바이트, big-endian
엔트리 +0x04  spec          4바이트, big-endian
엔트리 +0x08  file size     4바이트, big-endian
엔트리 +0x0c  checksum      4바이트, big-endian
엔트리 +0x10  filename      NUL 종료 문자열
                padding      16바이트 경계까지
                file data
```

파일명 영역 크기는 따로 저장되지 않는다. `entryOffset + 16`부터 최초 `0x00`까지 읽고, NUL을 포함한 길이를 16바이트 단위로 올림하면 데이터 시작점이 나온다.

현재 파일은 `messages.mo` 11바이트와 NUL 1바이트를 합친 12바이트가 16바이트 영역에 들어가므로 다음과 같다.

```text
0x05bf9fe0 + 고정 헤더 0x10 + 파일명 영역 0x10
= 0x05bfa000
```

```js
nameStart = entryOffset + 16;
nameEnd = firstNulOffset;
nameAreaSize = align16(nameEnd - nameStart + 1);
dataOffset = nameStart + nameAreaSize;
```

ROMFS가 보장하는 데이터 정렬은 16바이트이며 4KiB(4096) 정렬은 보장하지 않는다.

## 4. `next/type`으로 다음 구조를 확인한다

현재 값 `0x05c43222`의 하위 4비트를 제거하면 다음 ROMFS 엔트리 헤더 위치가 나온다. 하위 type 값 `0x2`는 일반 파일을 뜻한다.

```text
원시 값:             0x05c43222
다음 엔트리 헤더:    0x05c43220 - 96,743,968
엔트리 종류:         0x2 = regular file
실행 플래그:         없음
```

`0x05c43220`은 다음 파일의 데이터가 아니라 같은 디렉터리 목록에서 이어지는 다음 엔트리의 **헤더 위치**다.

```text
nextHeaderOffset = nextType & 0xfffffff0
type             = nextType & 0x00000007
executable       = (nextType & 0x00000008) != 0
```

`spec`은 엔트리 종류에 따라 의미가 다르며 현재 일반 파일에서는 사용하지 않아 0이다.

## 5. 원본 파일이 차지하던 영역을 계산한다

```text
originalDataEnd
= dataOffset + originalSize
= 0x05bfa000 + 0x49220
= 0x05c43220

originalAllocatedEnd
= align16(originalDataEnd)
= 0x05c43220
```

현재는 원본 파일 할당 끝과 다음 엔트리 시작이 `0x05c43220`으로 같다. 즉 파일 바로 뒤에서 다음 엔트리가 시작한다.

도구는 `originalAllocatedEnd`가 다른 구조와 충돌하지 않는지 반드시 검사한다. 파일 할당 끝과 다음 엔트리 사이에 별도 간격이 있더라도 그 공간을 자동으로 파일 영역에 포함하지 않는다.

## 6. 새 파일 크기를 확인하고 헤더를 바꾼다

새 한국어 MO:

```text
파일:          input/i18n/zh_CN/LC_MESSAGES/messages.mo
크기:          287,660바이트 - 0x463ac
새 데이터 끝:  0x05bfa000 + 0x463ac = 0x05c403ac
기존 할당 끝:  0x05c43220
```

새 데이터 끝이 기존 할당 끝을 넘지 않으므로 교체할 수 있다.

```text
dataOffset + newSize <= originalAllocatedEnd
```

새 파일은 실제 크기 그대로 기록하므로 ROMFS 헤더의 `size`를 바꾼다.

```text
변경 전  05bf9fe8: 00 04 92 20   299,552
변경 후  05bf9fe8: 00 04 63 ac   287,660
```

## 7. 엔트리 체크섬을 다시 계산한다

체크섬 범위는 엔트리 시작부터 파일 데이터 직전까지다.

```text
0x05bf9fe0 ~ 0x05bf9fff
```

고정 헤더, 파일명, NUL과 정렬 공백이 포함되고 실제 MO 데이터는 포함되지 않는다. 이 범위를 big-endian 32비트 값으로 모두 더한 결과가 0이어야 한다.

```text
sum(all big-endian uint32 words) mod 2^32 = 0
```

`checksum` 필드를 0으로 놓고 나머지를 더한 뒤 합계의 2의 보수를 기록한다.

```text
기존 checksum: 0xfcfcf3d8
새 checksum:   0xfcfd224c

변경 전  05bf9fec: fc fc f3 d8
변경 후  05bf9fec: fc fd 22 4c
```

공식 `vela_resource.bin`의 ROMFS 엔트리 8,867개가 이 계산으로 모두 유효함을 확인했다.

## 8. 새 파일을 넣고 남은 파일 영역을 지운다

새 MO를 `0x05bfa000`부터 287,660바이트 기록한다. 새 EOF부터 기존 파일 할당 끝까지는 과거 데이터가 남지 않도록 `0x00`으로 채운다.

```text
새 파일:   0x05bfa000 ~ 0x05c403ab
0 정리:    0x05c403ac ~ 0x05c4321f
정리 크기: 0x2e74 = 11,892바이트
다음 헤더: 0x05c43220부터 원본 보존
```

일반식:

```text
zeroStart = dataOffset + newSize
zeroEnd   = originalAllocatedEnd
```

대상 파일의 사용 종료 영역은 0으로 지우고, 다음 엔트리와 다른 주변 데이터는 건드리지 않는다.

## 9. 파일별 payload와 `dd` 값을 계산한다

payload 범위는 엔트리 헤더부터 다음 엔트리 헤더 직전까지다.

```text
changedStart = 0x05bf9fe0
changedEnd   = 0x05c43220  # 다음 엔트리 헤더 직전
```

이 범위를 주변 블록으로 확장하지 않고 그대로 payload로 만든다.

```text
payload = [0x05bf9fe0, 0x05c43220)
size    = 299,584바이트
```

공식 원본의 해당 범위를 복사한 뒤 헤더, 새 파일과 0 정리 영역만 바꾼다. 다음 엔트리 헤더부터는 포함하지 않는다.

```text
0x05bf9fe0
┌──────────────────────────────────────────────┐
│ ROMFS 엔트리: size와 checksum만 변경          │
├──────────────────────────────────────────────┤
│ 새 한국어 MO 287,660바이트                    │
├──────────────────────────────────────────────┤
│ 새 EOF부터 기존 할당 끝: 0x00 11,892바이트    │
└──────────────────────────────────────────────┘
0x05c43220 (다음 엔트리 헤더, 미포함)
```

입력 파일이 여러 개여도 각각 독립된 payload로 만든다. payload는 다음 방식으로 나누므로 빠르게 기록하면서 정확한 범위만 변경할 수 있다.

- 엔트리 시작부터 다음 64KiB(65,536) 경계까지: 16바이트 단위
- 가운데 정렬 구간: 64KiB(65,536) 단위, 조각당 최대 1MiB
- 마지막 64KiB(65,536) 경계부터 payload 끝까지: 16바이트 단위

`messages.mo`의 실제 분할 예:

```text
patch.part000  0x05bf9fe0부터 24,608바이트  bs=16
patch.part001  0x05c00000부터 262,144바이트 bs=65536
patch.part002  0x05c40000부터 12,832바이트  bs=16
```

각 조각은 manifest에 기록된 `blockSize`, `seek`, `count`를 그대로 사용한다.

```sh
dd if=patch.part001 of=/dev/resource \
  bs=65536 seek=1472 count=4 conv=notrunc
```

## 10. 별도 readback 후 정상 재부팅한다

NuttX `dd`의 `verify` 옵션은 RW6 `/dev/resource` 부분 기록에서 변경을 반영하지 못했으므로 사용하지 않는다.

```sh
# 사용 금지
dd ... verify conv=notrunc
```

기록 후 워치에서 같은 범위를 임시 파일로 다시 읽는다.

```sh
dd if=/dev/resource of=/data/tmp-patch/readback.tmp \
  bs=65536 skip=1472 count=4
cmp /data/tmp-patch/patch.part001 /data/tmp-patch/readback.tmp
```

각 조각을 기록한 뒤 생성된 검증 쉘이 같은 범위를 다시 읽고, 원본 조각과 `cmp`로 즉시 비교한다. 모든 조각의 비교가 성공한 경우에만 완료로 처리한다. 검증이 끝나면 `miwear`를 강제로 종료하지 않고 정상 재부팅해 새 리소스를 로드한다.

## 11. 슈퍼블록 체크섬

ROMFS 시작부터 `min(512, declaredSize)`바이트까지 big-endian 32비트 값으로 더한 결과도 0이어야 한다.

```text
ROMFS +0x00  "-rom1fs-"
ROMFS +0x08  declared size
ROMFS +0x0c  superblock checksum
ROMFS +0x10  volume name
```

`messages.mo`는 ROMFS 시작에서 약 96MB 떨어져 있어 슈퍼블록 체크섬에 영향을 주지 않는다. 대상 변경이 첫 512바이트 안에 있거나 ROMFS 선언 크기가 바뀔 때만 이를 다시 계산한다.

## 12. 반복 패치와 크기 초과

공식 원본 manifest에 `entryOffset`, `dataOffset`, `originalSize`, `originalAllocatedEnd`, `nextHeaderOffset`과 원본 해시를 저장한다. 반복 패치에서도 공식 원본의 `originalAllocatedEnd`를 고정된 슬롯 끝으로 사용하고 새 EOF 이후를 0으로 지운다.

새 파일이 슬롯보다 크면 패치를 만들지 않는다.

```text
dataOffset + newSize <= originalAllocatedEnd
```

이를 넘으면 뒤 데이터 이동, 엔트리 위치와 `next` 포인터 및 체크섬 갱신이 필요한 ROMFS 재구성 문제다.

## 13. Lua 워치페이스 적용

워치페이스에 포함되는 `watchface/rw6korpatcher/app/lua/main.lua`는 화면을 표시하고 최신 Lua를 불러오는 로더다.<br>
실제 패치 화면과 동작은 GitHub Raw의 `lua/rw6-main.lua`를 내려받아 실행하므로 이하의 Lua는 `rw6-main.lua`의 설명이다.

배포 구조는 네 파일별 디렉터리로 구성한다. 버전 디렉터리 바로 아래에는 별도 manifest를 두지 않는다.

```text
messages/{manifest.json,patch.partNNN,restore.partNNN,patch·restore 쉘}
font/MiSans-Regular/{manifest.json,patch.partNNN,restore.partNNN,patch·restore 쉘}
font/MiSans-Medium/{manifest.json,patch.partNNN,restore.partNNN,patch·restore 쉘}
font/MiSans-Demibold/{manifest.json,patch.partNNN,restore.partNNN,patch·restore 쉘}
```

Lua는 위 네 경로의 manifest를 각각 받아 모두 존재하는지 확인한 뒤 다음 순서로 처리한다.

```text
MiSans-Medium → 재부팅
MiSans-Demibold → 재부팅
MiSans-Regular → 재부팅
messages.mo → 재부팅
```

패치는 `patch.partNNN`, 복원은 `restore.partNNN`을 `/data/tmp-patch/`에 개별 파일로 받으며 별도 payload로 결합하지 않는다. 다운로드만 버튼 한 번에 최대 5개씩 처리한다. 한 파일의 조각을 모두 받은 뒤 설치 쉘이 전체 조각을 기록하고, 다음 타이머에서 검증 쉘이 전체 조각을 다시 읽어 비교한다.

```text
조각 다운로드 → 크기 확인 → manifest의 bs/seek/count로 기록
             → 같은 범위 재읽기 → cmp → 임시 조각 삭제
```

JS는 각 파일에 `patch.sh`, `patch-verify.sh`, `restore.sh`, `restore-verify.sh`를 함께 생성한다. 설치 쉘은 헤더가 없는 조각을 먼저 기록하고 ROMFS 엔트리 헤더가 든 조각을 마지막에 기록한다. Lua는 긴 명령행을 조립하지 않고 짧은 `sh <파일>`만 실행한다. NuttX에서는 성공한 쉘도 `os.execute()` 반환값이 일반 Lua와 다를 수 있으므로 반환값은 성공 판정에 사용하지 않는다. 설치와 검증은 서로 다른 LVGL 타이머에서 실행하며, 상태 파일의 모든 성공 표시를 확인한 뒤에만 완료로 처리한다.

manifest와 기기 정보는 `/tmp/patch/`에 두고, 다운로드 조각과 readback 파일은 `/data/tmp-patch/`에 둔다. 다음 파일 다운로드를 시작할 때 `/data/tmp-patch/`의 패치 임시 파일을 비운다. 재부팅 후 진행 상태를 복구하기 위해 `/data/rw6patch.state`를 별도로 저장한다.

```text
kor-patch.patch 또는 kor-patch.restore
제품 ID
펌웨어 버전
다음 파일 번호(0~4)
```

저장된 작업 이름·제품·버전이 현재 작업과 다르면 번호를 0으로 초기화하고 현재 정보로 덮어쓴다. 한 파일의 모든 조각을 기록하고 검증한 뒤에만 다음 번호를 저장하고, 완료 문구를 표시한 다음 5초 뒤 재부팅한다. 예상하지 못한 재부팅에서는 번호가 올라가지 않으므로 같은 파일을 처음부터 다시 처리한다. 단일 `os.execute()` 작업은 10초 안에 완료가 예상되는 크기로 제한한다.

## 14. 도구 출력과 필수 검증

생성 파일:

```text
파일별/manifest.json          대상 경로, 범위, 조각, commitChunks와 해시
파일별/patch.partNNN          수정 엔트리 payload
파일별/restore.partNNN        공식 원본 엔트리 payload
파일별/patch.sh               패치 조각 전체 연속 기록
파일별/patch-verify.sh        패치 기록 전체 재읽기·비교
파일별/restore.sh             복원 조각 전체 연속 기록
파일별/restore-verify.sh      복원 기록 전체 재읽기·비교
```

도구는 다음을 확인하고 하나라도 실패하면 출력을 만들지 않는다.

```text
입력이 유효한 ROMFS이고 슈퍼블록 체크섬이 맞는가
전체 경로로 regular file 하나를 정확히 찾았는가
원본 엔트리 체크섬과 dataOffset이 유효한가
새 파일이 원래 슬롯 안에 들어가는가
수정한 size와 엔트리 체크섬이 유효한가
새 EOF부터 슬롯 끝까지 모두 0인가
각 조각의 시작·크기가 16 또는 64KiB 기록 단위에 맞는가
모든 조각이 엔트리 시작부터 다음 엔트리 직전까지 빈틈없이 이어지는가
restore payload가 공식 원본 엔트리 범위와 같은가
모든 조각을 다시 결합한 결과가 원래 patch·restore payload와 같은가
원본 복사본에 적용 후 대상 파일이 새 입력과 같은가
전체 파일을 정순·역순으로 적용해도 최종 패치·복원 이미지가 같은가
```

manifest에는 위 계산값, 조각 크기와 개수, 원본·새 파일·patch·restore의 SHA-256을 기록한다.
