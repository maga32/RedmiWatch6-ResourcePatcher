# RW6 ROMFS 파일 블록 패치 표준

## 1. 무엇을 하려는가

Redmi Watch 6의 `/resource`는 읽기 전용 ROMFS라서 파일을 직접 덮어쓸 수 없다.

```sh
cp /data/messages.mo /resource/i18n/zh_CN/LC_MESSAGES/messages.mo
```

대신 원본 장치 `/dev/resource`에서 해당 파일이 들어 있는 블록만 교체한다. 이 문서는 실제 대상인 다음 파일로 표준 방식을 설명한다.

```text
/i18n/zh_CN/LC_MESSAGES/messages.mo
```

사용자는 ROMFS 내부 전체 경로와 새 파일만 지정하고, 도구가 위치·크기·체크섬·블록을 계산한다.

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

## 9. 블록 payload와 `dd` 값을 계산한다

변경 범위는 엔트리 헤더부터 원본 파일 할당 끝까지다.

```text
changedStart = 0x05bf9fe0
changedEnd   = 0x05c43220
```

이를 포함하도록 4KiB(4096) 경계로 확장한다.

```text
blockStart = 0x05bf9000
blockEnd   = 0x05c44000
payload    = 0x4b000 = 307,200바이트 = 75블록
seek       = 0x05bf9000 / 4096 = 23545
count      = 75
```

공식 원본의 `[blockStart, blockEnd)`를 payload로 복사한 뒤 그 안에서 헤더, 새 파일과 0 정리 영역만 바꾼다.

```text
0x05bf9000
┌──────────────────────────────────────────────┐
│ 엔트리 앞부분: 원본 보존                     │
├──────────────────────────────────────────────┤
│ ROMFS 엔트리: size와 checksum만 변경          │
├──────────────────────────────────────────────┤
│ 새 한국어 MO 287,660바이트                    │
├──────────────────────────────────────────────┤
│ 새 EOF부터 기존 할당 끝: 0x00 11,892바이트    │
├──────────────────────────────────────────────┤
│ 다음 엔트리부터 블록 끝: 원본 보존            │
└──────────────────────────────────────────────┘
0x05c44000
```

기록 명령:

```sh
dd if=/data/k of=/dev/resource \
  bs=4096 seek=23545 count=75 conv=notrunc
```

## 10. 별도 readback 후 정상 재부팅한다

NuttX `dd`의 `verify` 옵션은 RW6 `/dev/resource` 부분 기록에서 변경을 반영하지 못했으므로 사용하지 않는다.

```sh
# 사용 금지
dd ... verify conv=notrunc
```

기록 후 같은 블록을 별도 파일로 읽는다.

```sh
dd if=/dev/resource of=/data/r \
  bs=4096 skip=23545 count=75
```

호스트에서 크기, SHA-256과 바이트가 payload와 모두 같은지 확인한다. 검증이 끝나면 `miwear`를 강제로 종료하지 않고 정상 재부팅해 새 리소스를 로드한다.

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

공개 배포에서는 `manifest.json`을 먼저 받고, 그 안의 조각 개수에 따라 `patch.part000`부터 차례로 내려받아 `/tmp/patch/`에서 하나의 payload로 결합한다. 복원할 때는 같은 방식으로 `restore.partNNN`을 사용한다.

```text
patch.part000 ─┐
patch.part001 ─┼─> 순서대로 결합 ─> manifest의 크기 확인 ─> dd 기록
patch.partNNN ─┘
```

각 조각 다운로드는 별도 실행 단계로 처리한다. 모든 조각이 준비된 뒤 manifest의 `blockSize`, `seek`, `count`로 기록하고, 같은 범위를 다시 읽어 결합한 payload와 비교한다.

```sh
dd if=/tmp/patch/payload of=/dev/resource \
  bs=4096 seek=23545 count=75 conv=notrunc

dd if=/dev/resource of=/tmp/patch/readback \
  bs=4096 skip=23545 count=75

cmp /tmp/patch/payload /tmp/patch/readback
```

임시 파일은 `/tmp/patch/`에 두고 완료 후 삭제한다. 단일 `os.execute()` 작업은 10초 안에 완료가 예상되는 크기로 제한한다.

## 14. 도구 출력과 필수 검증

생성 파일:

```text
patch.partNNN     1MiB 단위로 분할된 수정 블록 payload
restore.partNNN   1MiB 단위로 분할된 공식 원본 블록
manifest.json     경로, offset, 크기, 조각 정보, dd 값과 해시
```

도구는 다음을 확인하고 하나라도 실패하면 출력을 만들지 않는다.

```text
입력이 유효한 ROMFS이고 슈퍼블록 체크섬이 맞는가
전체 경로로 regular file 하나를 정확히 찾았는가
원본 엔트리 체크섬과 dataOffset이 유효한가
새 파일이 원래 슬롯 안에 들어가는가
수정한 size와 엔트리 체크섬이 유효한가
새 EOF부터 슬롯 끝까지 모두 0인가
payload 크기가 4KiB(4096) 배수이며 count × 4096과 같은가
대상 밖의 블록 바이트가 원본과 같은가
restore payload가 공식 원본 블록과 같은가
모든 조각을 다시 결합한 결과가 원래 patch·restore payload와 같은가
원본 복사본에 적용 후 대상 파일이 새 입력과 같은가
```

manifest에는 위 계산값, 조각 크기와 개수, 원본·새 파일·patch·restore의 SHA-256을 기록한다.
