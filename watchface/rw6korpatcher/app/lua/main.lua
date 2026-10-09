local lvgl = require("lvgl")

local screenWidth = lvgl.HOR_RES()
local screenHeight = lvgl.VER_RES()
local horizontalMargin = 20
local verticalMargin = 50
local gap = 8
local buttonHeight = 60
local contentWidth = screenWidth - horizontalMargin * 2
local buttonY = screenHeight - verticalMargin - buttonHeight
local logHeight = buttonY - verticalMargin - gap
local buttonWidth = (contentWidth - gap * 2) // 3
local patchDirectory = "/tmp/patch"
local device
local version
productId = nil
local patchStage = 0
local patchBusy = false
local patchTimer
local downloadStates = {}
local operationMode
local patchBaseUrl = "https://raw.githubusercontent.com/maga32/RedmiWatch6-ResourcePatcher/main/patches/"
local manifests = {
    { remote = "messages/manifest.json", file = "messages-manifest.json" },
    { remote = "font/MiSans-Demibold/manifest.json", file = "MiSans-Demibold-manifest.json" },
    { remote = "font/MiSans-Medium/manifest.json", file = "MiSans-Medium-manifest.json" },
    { remote = "font/MiSans-Regular/manifest.json", file = "MiSans-Regular-manifest.json" },
}
local logText = table.concat({
    "레드미워치6 내수용 한글패치 (by. 룽즈)",
    "-패치방법 : 정보확인 -> 패치",
    "-복원방법 : 정보확인 -> 복원",
    "",
    "- 개발자는 이 툴의 사용으로 발생한 기기 손상 등에 대한 책임을 지지 않습니다.",
}, "\n")

local root = lvgl.Object(nil, {
    w = screenWidth,
    h = screenHeight,
    align = lvgl.ALIGN.CENTER,
    border_width = 0,
    pad_all = 0,
    bg_color = "#16181d",
})
root:clear_flag(lvgl.FLAG.SCROLLABLE)
root:add_flag(lvgl.FLAG.EVENT_BUBBLE)

-- 서버 조회, 패치 및 복구 결과를 표시할 스크롤 가능한 로그 창
local logView = lvgl.Textarea(root, {
    x = horizontalMargin,
    y = verticalMargin,
    w = contentWidth,
    h = logHeight,
    text = logText,
    radius = 10,
    border_width = 1,
    border_color = "#454a55",
    bg_color = "#252830",
    text_color = "#e2e5eb",
    text_font = lvgl.Font("MiSans-Medium", 18),
    pad_all = 12,
})
logView:add_flag(lvgl.FLAG.SCROLLABLE)

local function createActionButton(index, text, color)
    local x = horizontalMargin + index * (buttonWidth + gap)

    local button = lvgl.Object(root, {
        x = x,
        y = buttonY,
        w = buttonWidth,
        h = buttonHeight,
        radius = 10,
        border_width = 1,
        border_color = color,
        bg_color = "#252830",
        pad_all = 0,
    })
    button:clear_flag(lvgl.FLAG.SCROLLABLE)
    button:add_flag(lvgl.FLAG.CLICKABLE)

    lvgl.Label(button, {
        text = text,
        align = lvgl.ALIGN.CENTER,
        border_width = 0,
        bg_opa = 0,
        text_color = color,
        text_font = lvgl.Font("MiSans-Medium", 18),
    })

    return button
end

local function readFirstLine(path)
    local file = io.open(path, "r")
    if not file then
        return nil
    end

    local value = file:read("*l")
    file:close()
    os.remove(path)

    return value
end

local function readFile(path)
    local file = io.open(path, "r")
    if not file then
        return nil
    end

    local value = file:read("*a")
    file:close()
    return value
end

local function appendLog(message)
    logText = logText .. "\n" .. message
    logView:set { text = logText }
end

local function runAfterRefresh(action)
    patchBusy = true
    patchTimer = lvgl.Timer {
        period = 100,
        repeat_count = 1,
        cb = function(timer)
            local ok, asynchronous = pcall(action)
            patchTimer = nil
            if not ok then
                patchBusy = false
                appendLog("작업에 실패하였습니다. 다시 시도해주세요.\n오류: " .. tostring(asynchronous))
            elseif asynchronous ~= true then
                patchBusy = false
            end
        end,
    }
end

local function ensurePatchDirectory()
    if os.execute("test -d " .. patchDirectory) ~= true then
        return os.execute("mkdir " .. patchDirectory) == true
    end

    return true
end

local function getInfo()
    if operationMode then
        appendLog("\n이미 " .. (operationMode == "patch" and "패치" or "복원") .. " 작업이 진행중입니다.")
        return
    end

    patchStage = 0
    downloadStates = {}

    if not ensurePatchDirectory() then
        appendLog("\n정보확인에 실패했습니다. 다시 시도해주세요.")
        return
    end

    local devicePath = patchDirectory .. "/device"
    local versionPath = patchDirectory .. "/version"

    os.execute("uname -n >" .. devicePath)
    os.execute("getprop ro.build.version >" .. versionPath)

    device = readFirstLine(devicePath)
    version = readFirstLine(versionPath)

    productId = nil
    if device and string.find(device, "REDMI Watch 6", 1, true) then
        productId = "miwear.watch.p65"
    end

    if not device or device == "" or not version or version == "" or not productId then
        appendLog("\n정보확인에 실패했습니다. 다시 시도해주세요.")
        return
    end

    patchStage = 1

    appendLog(table.concat({
        "",
        "device: " .. device,
        "version: " .. version,
        "패치 혹은 복원 버튼을 누르세요",
    }, "\n"))
end

local function isValidManifest(path)
    local content = readFile(path)
    return content
        and string.find(content, '"format":"rw6-romfs-block-patch-v1"', 1, true)
        and string.find(content, '"patchSha256"', 1, true)
        and string.find(content, '"restoreSha256"', 1, true)
end

local function commandSucceeded(command)
    local result, _, status = os.execute(command)
    return result == 0 or (result == true and (status == nil or status == 0))
end

local function fileSize(path)
    local file = io.open(path, "rb")
    if not file then
        return nil
    end

    local size = file:seek("end")
    file:close()
    return size
end

local function manifestString(content, key)
    return string.match(content, '"' .. key .. '"%s*:%s*"([^"]+)"')
end

local function manifestNumber(content, key)
    local value = string.match(content, '"' .. key .. '"%s*:%s*(%d+)')
    return value and tonumber(value) or nil
end

local function startChunkDownload(options)
    local manifest = readFile(options.manifestPath)
    if not manifest then
        error(options.manifestName .. "을 읽을 수 없습니다.")
    end

    local payloadSize = manifestNumber(manifest, "size")
    local chunkPrefix = options.operation == "restore" and "restore" or "patch"
    local chunkSize = manifestNumber(manifest, chunkPrefix .. "ChunkSize")
    local chunkCount = manifestNumber(manifest, chunkPrefix .. "ChunkCount")
    local lastChunkSize = manifestNumber(manifest, chunkPrefix .. "LastChunkSize")
    if manifestString(manifest, "transfer") ~= "chunks"
        or not payloadSize or not chunkSize or not chunkCount or not lastChunkSize
        or chunkCount < 1
        or (chunkCount - 1) * chunkSize + lastChunkSize ~= payloadSize then
        error(options.manifestName .. " 정보가 올바르지 않습니다.")
    end

    local state = downloadStates[options.outputPath]
    local signature = options.operation .. "/" .. productId .. "/" .. version .. "/" .. payloadSize
    if not state or state.signature ~= signature then
        os.remove(options.outputPath)
        os.remove(options.tempPath)
        state = { signature = signature, index = 0 }
        downloadStates[options.outputPath] = state
    end

    local currentSize = fileSize(options.outputPath) or 0
    if currentSize ~= state.index * chunkSize or currentSize > payloadSize then
        os.remove(options.outputPath)
        state.index = 0
        currentSize = 0
    end

    local function fail(message)
        os.remove(options.tempPath)
        patchBusy = false
        appendLog(options.failureMessage .. "\n오류: " .. message)
    end

    local function finish()
        if fileSize(options.outputPath) ~= payloadSize then
            os.remove(options.outputPath)
            downloadStates[options.outputPath] = nil
            fail("결합된 패치 파일 크기가 올바르지 않습니다.")
            return
        end

        local ok, failure = pcall(options.onComplete, options.outputPath, manifest)
        if not ok then
            if options.restartOnFailure then
                os.remove(options.outputPath)
                downloadStates[options.outputPath] = nil
            end
            fail(tostring(failure))
            return
        end

        downloadStates[options.outputPath] = nil
        patchBusy = false
    end

    local function scheduleNext()
        if state.index >= chunkCount then
            finish()
            return
        end

        patchTimer = lvgl.Timer {
            period = 100,
            repeat_count = 1,
            cb = function(timer)
                patchTimer = nil
                local index = state.index
                local expectedSize = index == chunkCount - 1 and lastChunkSize or chunkSize
                local filename = chunkPrefix .. ".part" .. string.format("%03d", index)
                local url = options.remoteDirectory .. "/" .. filename
                os.remove(options.tempPath)

                if not commandSucceeded("curl " .. url .. " -o" .. options.tempPath)
                    or fileSize(options.tempPath) ~= expectedSize then
                    fail(filename .. " 다운로드에 실패했습니다.")
                    return
                end

                local appendCommand
                if index == 0 then
                    appendCommand = "cp " .. options.tempPath .. " " .. options.outputPath
                else
                    appendCommand = "cat " .. options.tempPath .. " >>" .. options.outputPath
                end
                if not commandSucceeded(appendCommand) then
                    fail(filename .. " 결합에 실패했습니다.")
                    return
                end

                os.remove(options.tempPath)
                state.index = index + 1
                appendLog("다운로드 중 " .. state.index .. "/" .. chunkCount)
                scheduleNext()
            end,
        }
    end

    scheduleNext()
    return true
end

local function installMessages(payloadPath, manifest, operation)
    local readbackPath = patchDirectory .. "/messages-readback.bin"
    local deviceName = manifestString(manifest, "device")
    local blockSize = manifestNumber(manifest, "blockSize")
    local payloadSize = manifestNumber(manifest, "size")
    local seek = manifestNumber(manifest, "seek")
    local count = manifestNumber(manifest, "count")
    if deviceName ~= "/dev/resource" or not blockSize or not payloadSize or not seek or not count
        or blockSize * count ~= payloadSize then
        error("messages manifest 정보가 올바르지 않습니다.")
    end

    appendLog("다운로드 완료. 패치 진행중입니다.")
    local writeCommand = "dd if=" .. payloadPath .. " of=" .. deviceName
        .. " bs=" .. blockSize .. " seek=" .. seek .. " count=" .. count .. " conv=notrunc"
    if not commandSucceeded(writeCommand) then
        error("/dev/resource 기록에 실패했습니다.")
    end

    local readCommand = "dd if=" .. deviceName .. " of=" .. readbackPath
        .. " bs=" .. blockSize .. " skip=" .. seek .. " count=" .. count
    if not commandSucceeded(readCommand)
        or not commandSucceeded("cmp " .. payloadPath .. " " .. readbackPath) then
        os.remove(readbackPath)
        error("기록 후 검증에 실패했습니다.")
    end

    os.remove(readbackPath)
    os.remove(payloadPath)
    patchStage = 3
    if operation == "restore" then
        appendLog("한글메뉴 복원 완료. 폰트를 복원합니다.\n복원버튼을 눌러주세요 (1/6)")
    else
        appendLog("한글메뉴 패치 완료. 한글깨짐을 방지하기 위해 폰트를 다운받습니다.\n패치버튼을 눌러주세요 (1/6)")
    end
end

local function processMessages(operation)
    local actionName = operation == "restore" and "복원" or "패치"
    return startChunkDownload {
        operation = operation,
        manifestPath = patchDirectory .. "/messages-manifest.json",
        manifestName = "messages-manifest.json",
        remoteDirectory = patchBaseUrl .. productId .. "/" .. version .. "/messages",
        outputPath = patchDirectory .. "/messages-" .. operation .. ".bin",
        tempPath = patchDirectory .. "/messages-part.tmp",
        failureMessage = "한글메뉴 " .. actionName .. "에 실패하였습니다. 다시 시도해주세요.",
        restartOnFailure = true,
        onComplete = function(payloadPath, manifest)
            installMessages(payloadPath, manifest, operation)
        end,
    }
end

local function downloadFont(operation, fontName, nextStage, nextProgress)
    return startChunkDownload {
        operation = operation,
        manifestPath = patchDirectory .. "/" .. fontName .. "-manifest.json",
        manifestName = fontName .. "-manifest.json",
        remoteDirectory = patchBaseUrl .. productId .. "/" .. version .. "/font/" .. fontName,
        outputPath = patchDirectory .. "/" .. fontName .. "-" .. operation .. ".bin",
        tempPath = patchDirectory .. "/" .. fontName .. "-part.tmp",
        failureMessage = "폰트 다운로드에 실패하였습니다. 다시 시도해주세요.",
        onComplete = function(patchPath, manifest)
            patchStage = nextStage
            local buttonName = operation == "restore" and "복원" or "패치"
            appendLog("폰트 다운로드 완료. " .. buttonName .. "버튼을 눌러주세요 (" .. nextProgress .. "/6)")
        end,
    }
end

local function installFont(operation, fontName, nextStage, nextProgress)
    local patchPath = patchDirectory .. "/" .. fontName .. "-" .. operation .. ".bin"
    local readbackPath = patchDirectory .. "/" .. fontName .. "-readback.bin"
    os.remove(readbackPath)
    local ok, failure = pcall(function()
        local manifest = readFile(patchDirectory .. "/" .. fontName .. "-manifest.json")
        if not manifest then
            error(fontName .. "-manifest.json을 읽을 수 없습니다.")
        end

        local deviceName = manifestString(manifest, "device")
        local blockSize = manifestNumber(manifest, "blockSize")
        local payloadSize = manifestNumber(manifest, "size")
        local seek = manifestNumber(manifest, "seek")
        local count = manifestNumber(manifest, "count")
        if manifestString(manifest, "transfer") ~= "chunks"
            or deviceName ~= "/dev/resource"
            or not blockSize or not payloadSize or not seek or not count
            or blockSize * count ~= payloadSize or fileSize(patchPath) ~= payloadSize then
            error(fontName .. " 작업 정보 또는 파일이 올바르지 않습니다.")
        end

        local writeCommand = "dd if=" .. patchPath .. " of=" .. deviceName
            .. " bs=" .. blockSize .. " seek=" .. seek .. " count=" .. count .. " conv=notrunc"
        if not commandSucceeded(writeCommand) then
            error("/dev/resource 기록에 실패했습니다.")
        end

        local readCommand = "dd if=" .. deviceName .. " of=" .. readbackPath
            .. " bs=" .. blockSize .. " skip=" .. seek .. " count=" .. count
        if not commandSucceeded(readCommand)
            or not commandSucceeded("cmp " .. patchPath .. " " .. readbackPath) then
            error("기록 후 검증에 실패했습니다.")
        end
    end)

    os.remove(readbackPath)
    if not ok then
        local actionName = operation == "restore" and "복원" or "패치"
        appendLog("폰트 " .. actionName .. "에 실패하였습니다. 다시 시도해주세요.\n오류: " .. tostring(failure))
        return
    end

    os.remove(patchPath)
    patchStage = nextStage
    if nextStage == 9 then
        if operation == "restore" then
            appendLog(table.concat({
                "모든 복원이 완료되었습니다.",
                "재부팅 후 정상적으로 사용하실 수 있습니다.",
                "",
                "해당 워치페이스는 삭제하셔도 괜찮습니다.",
            }, "\n"))
        else
            appendLog(table.concat({
                "모든 패치가 완료되었습니다.",
                "재부팅 후 정상적으로 사용하실 수 있습니다.",
                "",
                "해당 워치페이스는 삭제하셔도 괜찮습니다.",
                "펌웨어 업데이트시 재설치 후 복원이 필요할 수 있습니다.",
            }, "\n"))
        end
        return
    end

    local actionName = operation == "restore" and "복원" or "설치"
    local buttonName = operation == "restore" and "복원" or "패치"
    appendLog("폰트 " .. actionName .. " 완료. 다음 폰트를 다운로드합니다.\n"
        .. buttonName .. "버튼을 눌러주세요 (" .. nextProgress .. "/6)")
end

local function checkPatchAvailability()
    local baseUrl = patchBaseUrl .. productId .. "/" .. version .. "/"
    for _, manifest in ipairs(manifests) do
        local destination = patchDirectory .. "/" .. manifest.file
        os.remove(destination)
        os.execute("curl " .. baseUrl .. manifest.remote .. " -o" .. destination)

        if not isValidManifest(destination) then
            patchStage = 1
            appendLog("현재 패치 또는 복원이 불가능한 버전입니다. 다시 시도해보거나 네이버 카페에 문의해주세요.")
            return
        end
    end

    patchStage = 2
    local actionName = operationMode == "restore" and "복원" or "패치"
    appendLog("해당버전 " .. actionName .. " 파일이 존재합니다. 한번 더 " .. actionName .. "버튼을 눌러주세요.")
end

local function runOperation(requestedMode)
    if patchBusy then
        return
    end

    if patchStage == 0 then
        appendLog("\n정보확인 버튼을 먼저 눌러주세요")
        return
    end

    if operationMode and operationMode ~= requestedMode then
        local actionName = operationMode == "restore" and "복원" or "패치"
        appendLog("\n이미 " .. actionName .. " 작업에 진입했습니다.")
        return
    end

    if not operationMode then
        operationMode = requestedMode
    end

    local restoring = operationMode == "restore"
    local actionName = restoring and "복원" or "패치"

    if patchStage == 2 then
        appendLog("\n한글메뉴 " .. actionName .. " 파일 다운로드 중입니다.")
        runAfterRefresh(function() return processMessages(operationMode) end)
        return
    end

    if patchStage == 3 then
        appendLog("\n폰트 다운로드 시작(1/6)")
        runAfterRefresh(function() return downloadFont(operationMode, "MiSans-Regular", 4, 2) end)
        return
    end

    if patchStage == 4 then
        appendLog("\n폰트 " .. actionName .. " 진행중입니다.(2/6)")
        runAfterRefresh(function() installFont(operationMode, "MiSans-Regular", 5, 3) end)
        return
    end

    if patchStage == 5 then
        appendLog("\n폰트 다운로드 시작(3/6)")
        runAfterRefresh(function() return downloadFont(operationMode, "MiSans-Demibold", 6, 4) end)
        return
    end

    if patchStage == 6 then
        appendLog("\n폰트 " .. actionName .. " 진행중입니다.(4/6)")
        runAfterRefresh(function() installFont(operationMode, "MiSans-Demibold", 7, 5) end)
        return
    end

    if patchStage == 7 then
        appendLog("\n폰트 다운로드 시작(5/6)")
        runAfterRefresh(function() return downloadFont(operationMode, "MiSans-Medium", 8, 6) end)
        return
    end

    if patchStage == 8 then
        appendLog("\n폰트 " .. actionName .. " 진행중입니다.(6/6)")
        runAfterRefresh(function() installFont(operationMode, "MiSans-Medium", 9, nil) end)
        return
    end

    if patchStage ~= 1 then
        return
    end

    appendLog("\n" .. actionName .. " 확인중입니다.")
    runAfterRefresh(checkPatchAvailability)
end

local getInfoButton = createActionButton(0, "정보확인", "#71b7ff")
local patchButton = createActionButton(1, "패치", "#78d99b")
local restoreButton = createActionButton(2, "복원", "#ff9a91")

getInfoButton:onevent(lvgl.EVENT.CLICKED, function(obj, code)
    getInfo()
end)

patchButton:onevent(lvgl.EVENT.CLICKED, function(obj, code)
    runOperation("patch")
end)

restoreButton:onevent(lvgl.EVENT.CLICKED, function(obj, code)
    runOperation("restore")
end)
