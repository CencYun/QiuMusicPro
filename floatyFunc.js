function loadMusic(scoreInfo) {
    //显示加载进度条
    let progressDialog = dialogs.build({
        title: "加载中...",
        content: "正在解析文件...",
        negative: "取消",
        progress: {
            max: 100,
            showMinMax: false
        },
        cancelable: true,
        canceledOnTouchOutside: false
    }).on("negative", () => {
        return;
    }).show();

    //加载配置
    if (!gameProfile.checkKeyPosition()) {
        dialogs.alert("错误", "坐标未设置，请先设置坐标");
        progressDialog.dismiss();
        runClickPosSetup();
        return null;
    };

    // 是否伪装手势
    let humanifyNoteAbsTimeStdDev = stor.get("gameConfig", "humanifyNoteAbsTimeStdDev", 0);
    let majorPitchOffset = stor.get("gameConfig", "majorPitchOffset", 0);
    let minorPitchOffset = stor.get("gameConfig", "minorPitchOffset", 0);
    // 将超出最高音n个八度内的音符移动到范围内
    let wrapHigherOctave = stor.get("gameConfig", "wrapHigherOctave", 1);
    // 将超出最低音n个八度内的音符移动到范围内
    let wrapLowerOctave = stor.get("gameConfig", "wrapLowerOctave", 0);
    // 半音处理模式 //不做处理none: -1, //取较低的音符floor: 0, //取较高的音符ceil: 1, //删除音符drop: 2, //同时取较低和较高的音符both: 3, //交替取较低和较高的音符 alternating: 4
    let semiToneRoundingMode = stor.get("gameConfig", "semiToneRoundingMode", 0);
    // 按键频率
    let limitClickSpeedHz = stor.get("gameConfig", "limitClickSpeedHz", 0);
    // 默认倍速
    let speedMultiplier = parseFloat(stor.get("gameConfig", "speedMultiplier", "1.0"));
    // 按键时长模式 none extraLongKey native
    let noteDurationOutputMode = stor.get("gameConfig", "noteDurationOutputMode", "none");
    // 最大手势持续时间(毫秒)
    let maxGestureDuration = stor.get("gameConfig", "maxGestureDuration", 8000);
    // 手势间隔时间(毫秒)
    let marginDuration = stor.get("gameConfig", "marginDuration", 100);
    // 默认的按键持续时间(毫秒), 仅在noteDurationOutputMode为"none"时有效
    let defaultClickDuration = stor.get("gameConfig", "defaultClickDuration", 5);
    // 限制同时按键个数
    let chordLimitEnabled = stor.get("gameConfig", "chordLimitEnabled", false);
    // 最大音符个数
    let maxSimultaneousNoteCount = stor.get("gameConfig", "maxSimultaneousNoteCount", 2);
    // 限制模式, 可选值为"delete"(删除多余的音符)或"split"(拆分成多组)
    let noteCountLimitMode = stor.get("gameConfig", "noteCountLimitMode", "split");
    // 拆分后音符的延迟(毫秒), 仅在noteCountLimitMode为"split"时有效
    let noteCountLimitSplitDelay = stor.get("gameConfig", "noteCountLimitSplitDelay", 75);
    // 选择保留哪些音符, 可选值为"high"(音高最高的) / "low"(音高最低的) / "random"(随机选择)
    let chordSelectMode = stor.get("gameConfig", "chordSelectMode", "high");
    // 合并按键最大间隔(毫秒)
    let mergeThreshold = stor.get("gameConfig", "mergeNearbyNotesInterval", 50);
    // 合并音轨 要合并的音轨序号数组, 为空则合并所有音轨
    let lastSelectedTracksNonEmpty = stor.get("gameConfig", "lastSelectedTracksNonEmpty", null);

    // 从云端获取乐谱数据
    let musicData = new GetScoreDataPass().run(scoreInfo);
    if (musicData == null) {
        progressDialog.dismiss();
        return null;
    }
    musicData = new ParseSourceDataPass().run(musicData, scoreInfo.music_type);

    /**
     * @type {Array<passes.Pass>}
     */
    let pipeline = [];

    //解析乐谱
    progressDialog.setContent("解析乐谱...");
    //选择音轨
    pipeline.push(new RemoveEmptyTracksPass({}));
    pipeline.push(new MergeTracksPass({
        selectedTracks: lastSelectedTracksNonEmpty,
        skipPercussion: true,
    }));
    pipeline.push(new StoreCurrentNoteTimePass());
    //变速
    if (speedMultiplier != 1) {
        pipeline.push(new SpeedChangePass({
            speed: speedMultiplier
        }));
    }
    //合并按键
    pipeline.push(new MergeKeyPass({
        maxInterval: mergeThreshold,
    }));
    //伪装手弹
    if (humanifyNoteAbsTimeStdDev > 0) {
        pipeline.push(new HumanifyPass({
            noteAbsTimeStdDev: humanifyNoteAbsTimeStdDev
        }));
    }
    //转换成目标游戏的音域
    pipeline.push(new PitchOffsetPass({
        offset: majorPitchOffset * 12 + minorPitchOffset
    }));
    pipeline.push(new LegalizeTargetNoteRangePass({
        semiToneRoundingMode: semiToneRoundingMode,
        currentGameProfile: gameProfile,
        wrapHigherOctave: wrapHigherOctave,
        wrapLowerOctave: wrapLowerOctave
    }));
    //单个按键频率限制
    pipeline.push(new SingleKeyFrequencyLimitPass({
        minInterval: gameProfile.getSameKeyMinInterval()
    }));
    //跳过前奏 
    if (stor.get("gameConfig", "skipInit", true)) {
        pipeline.push(new SkipIntroPass({}));
    }
    //跳过中间的空白 
    if (stor.get("gameConfig", "skipBlank5s", true)) {
        pipeline.push(new LimitBlankDurationPass({})); //默认5秒
    }
    //限制按键频率
    if (limitClickSpeedHz != 0) {
        pipeline.push(new NoteFrequencySoftLimitPass({
            minInterval: 1000 / limitClickSpeedHz
        }));
    }
    //限制同时按键个数
    if (chordLimitEnabled) {
        pipeline.push(new ChordNoteCountLimitPass({
            maxNoteCount: maxSimultaneousNoteCount,
            limitMode: noteCountLimitMode,
            splitDelay: noteCountLimitSplitDelay,
            selectMode: chordSelectMode,
        }));
    }

    //转换为按键
    pipeline.push(new NoteToKeyPass({
        currentGameProfile: gameProfile
    }));

    // 按顺序执行一系列pass
    const sequential = new SequentialPass({
        passes: pipeline
    });
    const data = sequential.run(musicData, (progress, desc) => {
        progressDialog.setProgress(progress);
        progressDialog.setContent(desc + "...");
    });

    const packedKeyList = noteUtils.packNotes(data)

    //生成手势
    progressDialog.setContent("生成手势...");
    const gestureTimeList = new KeyToGesturePass({
        currentGameProfile: gameProfile,
        durationMode: noteDurationOutputMode,
        maxGestureDuration: maxGestureDuration,
        marginDuration: marginDuration,
        pressDuration: defaultClickDuration,
    }).run(data);
    progressDialog.dismiss();

    return {
        packedKeyList: packedKeyList,
        gestureList: gestureTimeList,
    }
}

function runClickPosSetup() {
    let normalizedPos = gameProfile.getNormalizedKeyPositions();
    if (stor.get("gameConfig", "getPosMethod", "new") == "old") {
        // 1. 获取两个按键的中心点实际坐标
        let realPos1 = getPosInteractive("最上面那行按键中最左侧的按键中心");
        let realPos2 = getPosInteractive("最下面那行按键中最右侧的按键中心");

        // 2. 定义这两个点对应的归一化坐标
        let normPos1 = normalizedPos[0];
        let normPos2 = normalizedPos[normalizedPos.length - 1];

        // 3. 根据两个实际点和两个归一化点，反向推算整个区域的边界
        // Y 坐标比较简单，因为归一化Y是0和1
        let BBoxTopLeft_y = realPos1.y;
        let BBoxBottomRight_y = realPos2.y;

        // X 坐标需要解方程
        // 计算归一化坐标之间的差值
        let norm_dx = normPos2[0] - normPos1[0];
        // 计算实际坐标之间的差值
        let real_dx = realPos2.x - realPos1.x;

        // 计算总宽度
        let BBox_Width = real_dx / norm_dx;

        // 计算边界框的左上角X和右下角X
        let BBoxTopLeft_x = realPos1.x - BBox_Width * normPos1[0];
        let BBoxBottomRight_x = BBoxTopLeft_x + BBox_Width;

        // 4. 使用计算出的边界框坐标来设置KeyPosition
        let pos1 = [parseInt(BBoxTopLeft_x), BBoxTopLeft_y];
        let pos2 = [parseInt(BBoxBottomRight_x), BBoxBottomRight_y];

        console.log("计算出的边界框:左上[" + pos1[0] + "," + pos1[1] + "],右下[" + pos2[0] + "," + pos2[1] + "]");
        gameProfile.setKeyPosition([pos1[0], pos1[1]], [pos2[0], pos2[1]]);
    } else {
        let pos = calibrateLayout("请拖动定位点调整按键位置",
            normalizedPos
        );
        if (pos == null) {
            toast("校准取消");
            return;
        }
        console.log("自定义坐标:左上[" + pos[0][0] + "," + pos[0][1] + "],右下[" + pos[1][0] + "," + pos[1][1] + "]");
        gameProfile.setKeyPosition([pos[0][0], pos[0][1]], [pos[1][0], pos[1][1]]);
    }
    saveUserGameProfile();
}
function saveUserGameProfile() {
    let keyLocators = gameProfile.getKeyLocators();
    stor.put("gameConfig", "keyLocators2", keyLocators);
    // console.log("keyLocators2: " + JSON.stringify(keyLocators));
    toastLog("配置游戏键位成功");
}
/**
 * 校准布局
 * @param {string} promptText 提示文本
 * @param {import("../gameProfile").pos2d[]} normalizedPos 归一化后的参考坐标
 * @param {import("../gameProfile").KeyLocatorType} [type] 按键定位类型, 目前只实现了左上右下, 默认左上右下
 * @returns {import("../gameProfile").pos2dPair[] | null} 得到的定位点坐标, 如果终止操作则返回null
 */
function calibrateLayout(promptText, normalizedPos, type) {
    if (type == null) {
        type = "LOCATOR_LEFT_TOP";
    }
    if (type != "LOCATOR_LEFT_TOP") {
        throw new Error("不支持的定位类型: " + type);
    }
    let deviceWidth = context.getResources().getDisplayMetrics().widthPixels;
    let deviceHeight = context.getResources().getDisplayMetrics().heightPixels;

    // 初始位置在屏幕1/4和3/4处
    let pos1 = [deviceWidth / 4, deviceHeight / 4];  // 左上
    let pos2 = [deviceWidth * 3/4, deviceHeight * 3/4];  // 右下
    
    let dragging1 = false;
    let dragging2 = false;
    let confirmed = false;
    let aborted = false;  // 添加终止标志

    // 全屏绘图窗口
    let fullScreenWindow = floaty.rawWindow(<canvas id="canv" w="*" h="*" />);
    fullScreenWindow.setTouchable(true);
    fullScreenWindow.setSize(-1, -1);

    // 触摸事件处理
    fullScreenWindow.canv.setOnTouchListener(function (v, evt) {
        let x = parseInt(evt.getRawX());
        let y = parseInt(evt.getRawY());

        if (evt.getAction() == evt.ACTION_DOWN) {
            // 检查是否点击了定位点
            if (distance([x,y], pos1) < 50) {
                dragging1 = true;
            } else if (distance([x,y], pos2) < 50) {
                dragging2 = true;
            }
        } else if (evt.getAction() == evt.ACTION_MOVE) {
            // 更新被拖动的点的位置,同时确保pos2在pos1的右下方
            if (dragging1) {
                // pos1不能移到pos2的右下方
                x = Math.min(x, pos2[0]);
                y = Math.min(y, pos2[1]);
                pos1 = [x, y];
            } else if (dragging2) {
                // pos2不能移到pos1的左上方
                x = Math.max(x, pos1[0]);
                y = Math.max(y, pos1[1]);
                pos2 = [x, y];
            }
        } else if (evt.getAction() == evt.ACTION_UP) {
            dragging1 = false;
            dragging2 = false;
        }
        return true;
    });

    // 绘制函数
    fullScreenWindow.canv.on("draw", function (canvas) {
        const Paint = android.graphics.Paint;
        const Color = android.graphics.Color;
        const PorterDuff = android.graphics.PorterDuff;
        
        let paint = new Paint();
        canvas.drawColor(Color.parseColor("#3f000000"), PorterDuff.Mode.SRC);

        // 如果已终止则不绘制
        if (aborted) {
            return;
        }

        // 画矩形框
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2);
        paint.setARGB(255, 255, 255, 255);
        canvas.drawRect(
            Math.min(pos1[0], pos2[0]),
            Math.min(pos1[1], pos2[1]),
            Math.max(pos1[0], pos2[0]),
            Math.max(pos1[1], pos2[1]),
            paint
        );

        // 画两个定位点
        let drawLocatorPoint = function(x, y, text) {
            // 黑色外圈
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(5);
            paint.setARGB(255, 0, 0, 0);
            canvas.drawCircle(x, y, 32, paint);
            
            // 黄色中圈
            paint.setStrokeWidth(3);
            paint.setARGB(255, 255, 255, 0);
            canvas.drawCircle(x, y, 30, paint);
            
            // 黑色内圈
            paint.setStyle(Paint.Style.FILL);
            paint.setARGB(255, 0, 0, 0);
            canvas.drawCircle(x, y, 22, paint);
            
            // 黄色填充
            paint.setARGB(180, 255, 255, 0);
            canvas.drawCircle(x, y, 20, paint);

            // 文字黑色描边
            paint.setTextSize(30);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(4);
            paint.setARGB(255, 0, 0, 0);
            canvas.drawText(text, x - 40, y - 40, paint);
            
            // 文字白色填充
            paint.setStyle(Paint.Style.FILL);
            paint.setARGB(255, 255, 255, 255);
            canvas.drawText(text, x - 40, y - 40, paint);
        };

        drawLocatorPoint(pos1[0], pos1[1], "左上");
        drawLocatorPoint(pos2[0], pos2[1], "右下");

        // 画参考点
        let drawReferencePoint = function(x, y, index) {
            // 白色外圈十字
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(5);
            paint.setARGB(255, 255, 255, 255);
            let size = 15;
            canvas.drawLine(x - size - 2, y, x + size + 2, y, paint);
            canvas.drawLine(x, y - size - 2, x, y + size + 2, paint);
            
            // 蓝色内圈十字
            paint.setStrokeWidth(3);
            paint.setARGB(255, 50, 50, 255);
            canvas.drawLine(x - size, y, x + size, y, paint);
            canvas.drawLine(x, y - size, x, y + size, paint);
            
            // 白色外圈
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(3);
            paint.setARGB(255, 255, 255, 255);
            canvas.drawCircle(x, y, 7, paint);
            
            // 蓝色填充
            paint.setStyle(Paint.Style.FILL);
            paint.setARGB(255, 50, 50, 255);
            canvas.drawCircle(x, y, 5, paint);
            
            // 序号黑色描边
            paint.setTextSize(25);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(4);
            paint.setARGB(255, 0, 0, 0);
            canvas.drawText((index + 1).toString(), x + 15, y + 15, paint);
            
            // 序号白色填充
            paint.setStyle(Paint.Style.FILL);
            paint.setARGB(255, 255, 255, 255);
            canvas.drawText((index + 1).toString(), x + 15, y + 15, paint);
        };

        for (let i = 0; i < normalizedPos.length; i++) {
            let realPos = normalizedToReal(normalizedPos[i], pos1, pos2);
            drawReferencePoint(realPos[0], realPos[1], i);
        }
    });

    // 提示和确认按钮窗口
    let confirmWindow = floaty.rawWindow(
        <frame gravity="left|top">
            <vertical bg="#7fffff7f">
                <text id="promptText" text="" textSize="14sp" />
                <button id="confirmBtn" style="Widget.AppCompat.Button.Colored" text="确定" />
                <button id="resetBtn" style="Widget.AppCompat.Button.Colored" text="复原" />
                <button id="abortBtn" style="Widget.AppCompat.Button.Colored" text="终止" />
            </vertical>
        </frame>
    );
    confirmWindow.setPosition(deviceWidth / 3, 0);
    confirmWindow.setTouchable(true);

    // 按钮事件
    ui.run(() => {
        confirmWindow.promptText.setText(promptText);
        confirmWindow.confirmBtn.click(() => {
            confirmed = true;
        });
        confirmWindow.resetBtn.click(() => {
            // 重置位置
            pos1 = [deviceWidth / 4, deviceHeight / 4];
            pos2 = [deviceWidth * 3/4, deviceHeight * 3/4];
        });
        confirmWindow.abortBtn.click(() => {
            // 终止校准
            aborted = true;  // 先设置终止标志
            confirmed = true;
        });
    });

    // 等待确认
    while (!confirmed) {
        sleep(100);
    }

    fullScreenWindow.close();
    confirmWindow.close();

    // 如果是终止操作,返回null
    if (aborted) {
        return null;
    }

    return [pos1, pos2];
}
// 计算两点距离
function distance(p1, p2) {
    return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
}
// 将归一化坐标转换为实际坐标
function normalizedToReal(nPos, pos1, pos2) {
    let x = pos1[0] + (pos2[0] - pos1[0]) * nPos[0];
    let y = pos1[1] + (pos2[1] - pos1[1]) * nPos[1];
    return [x, y];
}

function getPosInteractive(promptText) {
    let gotPos = false;
    //pos[0] 长边, pos[1] 短边
    let pos = [];
    let fingerReleased = false;
    let confirmed = false;
    let fullScreenWindowRequestClose = false;
    let canvasDebugCounter = 0;
    // console.log("getPosInteractive(): " + promptText);
    //提示和确认按钮的框
    let confirmWindow = floaty.rawWindow(
        <frame gravity="left|top" alpha="0.5">
            <vertical bg="#FAFAFA">
                <text id="promptText" text="" textSize="14sp" />
                <button id="confirmBtn" text="确定" />
                <button id="cancelBtn" text="取消" />
                <text text="©坐标获取由clxTools提供" gravity="center" textSize="8sp" />
            </vertical>
        </frame>
    );
    confirmWindow.setPosition(device.height / 3, 0);
    confirmWindow.setTouchable(true);

    let fullScreenWindow = floaty.rawWindow(<canvas id="canv" w="*" h="*" />);
    fullScreenWindow.setTouchable(true);
    fullScreenWindow.setSize(-1, -1);

    fullScreenWindow.canv.setOnTouchListener(function (v, evt) {
        if (evt.getAction() == evt.ACTION_DOWN || evt.getAction() == evt.ACTION_MOVE) {
            gotPos = true;
            pos = [
                parseInt(evt.getRawX().toFixed(0)),
                parseInt(evt.getRawY().toFixed(0)),
            ];
        }
        if (evt.getAction() == evt.ACTION_UP) {
            fingerReleased = true;
        }
        return true;
    });
    fullScreenWindow.canv.on("draw", function (canvas) {
        const Color = android.graphics.Color;
        const Paint = android.graphics.Paint;
        const PorterDuff = android.graphics.PorterDuff;
        const w = canvas.getWidth(); //在横屏时, 这是长边
        const h = canvas.getHeight(); //在横屏时, 这是短边
        const woffset = device.height - w; //长边的偏移量
        const hoffset = device.width - h; //短边的偏移量
        const centerCircleRadius = 10;
        let paint = new Paint();
        if (canvasDebugCounter != -1 && canvasDebugCounter < 60) {
            canvasDebugCounter++;
        } else if (canvasDebugCounter == 60) {
            // console.log("canvas [长,短] = [" + w + "," + h + "]");
            // console.log("device [长,短] = [" + device.height + "," + device.width + "]");
            // console.log("offset [长,短] = [" + woffset + "," + hoffset + "]");
            canvasDebugCounter = -1;
        }

        //灰色背景
        canvas.drawColor(Color.parseColor("#3f000000"), PorterDuff.Mode.SRC);
        if (gotPos) {
            //画十字定位线
            paint.setStrokeWidth(2);
            paint.setARGB(255, 255, 255, 255);
            paint.setStyle(Paint.Style.STROKE);
            canvas.drawLine(0, pos[1] - hoffset, w, pos[1] - hoffset, paint);
            canvas.drawLine(pos[0] - woffset, 0, pos[0] - woffset, h, paint);

            //中心画一个空心圆
            paint.setStyle(Paint.Style.STROKE);
            canvas.drawCircle(
                pos[0] - woffset,
                pos[1] - hoffset,
                centerCircleRadius,
                paint
            );
        }
        if (fullScreenWindowRequestClose) sleep(1000);
    });

    ui.run(() => {
        confirmWindow.promptText.setText("请点击" + promptText);
        confirmWindow.confirmBtn.click(() => {
            confirmed = true;
        });
        confirmWindow.cancelBtn.click(() => {
            fingerReleased = false;
            gotPos = false;
            fullScreenWindow.setTouchable(true);
        });
    });

    while (!confirmed) {
        sleep(100);
        if (fingerReleased) {
            fullScreenWindow.setTouchable(false);
        }

        ui.run(function () {
            if (!gotPos) {
                confirmWindow.promptText.setText("请点击" + promptText);
            } else if (!fingerReleased) {
                confirmWindow.promptText.setText("当前坐标:" + pos.toString());
            } else {
                confirmWindow.promptText.setText(
                    "当前坐标:" + pos.toString() + ", 点击'确定'结束, 点击'取消'重新获取"
                );
            }
        });
    }

    fullScreenWindowRequestClose = true;
    sleep(100);
    fullScreenWindow.close();
    confirmWindow.close();

    // console.log("End getPosInteractive(): " + pos.toString());
    return {
        x: pos[0],
        y: pos[1],
    };
}

/**
 * @brief 校准全屏画布的偏移量
 * @param {string} [prompt] 提示文本, 默认: "点击任意位置继续..."
 * @returns {[number, number]} 返回偏移量
 */
function calibrateFullScreenCanvasOffset(prompt) {
    let promptText = "点击任意位置继续...";
    if (prompt != null) {
        promptText = prompt;
    }
    let finish = false;
    let offset = [0, 0];
    const fullScreenWindow = floaty.rawWindow(<canvas id="canv" w="*" h="*" />);
    fullScreenWindow.setTouchable(true);
    fullScreenWindow.setSize(-1, -1);
    fullScreenWindow.canv.setOnTouchListener(function (v, evt) {
        if (evt.getAction() == evt.ACTION_DOWN) {
            finish = true;
            const screenPos = [parseInt(evt.getRawX().toFixed(0)), parseInt(evt.getRawY().toFixed(0))];
            const windowPos = [parseInt(evt.getX().toFixed(0)), parseInt(evt.getY().toFixed(0))];
            offset = [screenPos[0] - windowPos[0], screenPos[1] - windowPos[1]];
        }
        return true;
    });
    fullScreenWindow.canv.on("draw", function (canvas) {
        while (finish) sleep(50);
        const Color = android.graphics.Color;
        const PorterDuff = android.graphics.PorterDuff;
        canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);
        //绘制灰色背景
        canvas.drawARGB(80, 0, 0, 0);
        //在正中央绘制提示
        const paint = new Paint();
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setARGB(255, 255, 255, 255);
        paint.setTextSize(50);
        canvas.drawText(promptText, canvas.getWidth() / 2, canvas.getHeight() / 2, paint);
    });
    while (!finish) {
        sleep(100);
    }
    sleep(100);
    fullScreenWindow.close();
    stor.put("gameConfig", "calibrateFullScreenCanvasOffset2", offset);
    //@ts-ignore
    return offset;
}

function MusicFormats() {
    /**
     * 解析音乐文件
     * @param {string} filePath 
     * @returns {TracksData} 音乐数据
     */
    this.parseFile = function (filePath) {
        let fileFormat = this.getFileFormat(filePath);
        switch (fileFormat.name) {
            case "tjs":
                return new ToneJsJSONParser().parseFile(filePath);
            case "mid":
                return new MidiParser().parseFile(filePath);
            case "dms":
                return new DoMiSoTextParser().parseFile(filePath, undefined);
            case "txt":
                return new SkyStudioJSONParser().parseFile(filePath);
            default:
                throw new Error("不支持的文件格式");
        }
    }

    /**
     * @brief 从字符串中解析音乐数据
     * @param {string} musicData 音乐数据
     * @param {string} formatName 音乐格式名称
     * @returns {TracksData} 音乐数据
     */
    this.parseFromString = function (musicData, formatName) {
        switch (formatName) {
            case "tjs":
                return new ToneJsJSONParser().parseFromString(musicData);
            case "mid":
                return musicData;
            case "dms":
                return new DoMiSoTextParser().parseFromString(musicData);
            case "txt":
                return new SkyStudioJSONParser().parseFromString(musicData);
            default:
                throw new Error("不支持的文件格式!");
        }
    }
}

//humanify.js --- 为乐曲加入扰动, 让它听起来更像人弹的

function NormalDistributionRandomizer(mean, stddev) {
    this.mean = mean;
    this.stddev = stddev;

    this.next = function () {
        var u = 0, v = 0;
        while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
        while (v === 0) v = Math.random();
        var num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        num = num * this.stddev + this.mean;
        return num;
    }
}

function Humanify() {
    this.stddev = 200;
    /**
     * @param {number} stddev 标准差
     * @brief 设置标准差
     */
    this.setNoteAbsTimeStdDev = function (stddev) {
        this.stddev = stddev;
    }

    /**
     * @param {import("./noteUtils.js").NoteLike[]} notes 乐曲数组
     * @brief 为乐曲加入扰动, 让它听起来更像是人弹的. 处理速度应该很快
     * @return {import("./noteUtils.js").NoteLike[]} 扰动后的乐曲数组
     */
    this.humanify = function (notes) {
        var randomizer = new NormalDistributionRandomizer(0, this.stddev);
        for (var i = 0; i < notes.length; i++) {
            notes[i][1] += randomizer.next();
            if (notes[i][1] < 0) notes[i][1] = 0;
        }
        //重新排序
        notes.sort(function (a, b) {
            return a[1] - b[1];
        });
        return notes;
    }
}

/**
 * @param {number} timeSec
 */
function sec2timeStr(timeSec) {
    let minuteStr = Math.floor(timeSec / 60).toString();
    let secondStr = Math.floor(timeSec % 60).toString();
    if (minuteStr.length == 1) minuteStr = "0" + minuteStr;
    if (secondStr.length == 1) secondStr = "0" + secondStr;

    return minuteStr + ":" + secondStr;
}

function setupDia() {
    let dia = dialogs.select("设置列表", [
        "选择游戏/乐器",
        "实现方式",
        "伪手弹模式",
        "长音模式 (仅支持部分MID谱)",
        "跳过空白部分",
        "乐谱可视化",
        "关闭悬浮球"
    ]);
    switch (dia) {
        case 0:
            //目标游戏
            let configList = gameProfile.getConfigNameList();
            let sel = /** @type {Number} */ (dialogs.select("选择游戏-当前【" + stor.get("gameConfig", "activeConfigName", "未选择") + "】", configList));
            if (sel == -1) {
                console.log("设置没有改变");
                break;
            }
            let configName = configList[sel];
            stor.put("gameConfig", "activeConfigName", configName);
            stor.put("gameConfig", "lastConfigName", configName);
            gameProfile.setConfigByName(configName);
            console.log("目标游戏已设置为: " + configName);
            //目标乐器
            let instrumentList = gameProfile.getCurrentAvailableVariants();
            if (instrumentList == null || instrumentList.length == 0) {
                throw new Error("当前游戏没有可用的乐器!");
            } else if (instrumentList.length == 1) {
                gameProfile.setCurrentVariantDefault();
                stor.put("gameConfig", "lastVariantName", gameProfile.getCurrentVariantTypeName());
            } else {
                let nameList = instrumentList.map((variant) => variant.variantName);
                let sel = /** @type {Number} */ (dialogs.select("选择目标乐器...", nameList));
                if (sel == -1) {
                    console.log("设置没有改变");
                    break;
                }
                let typeName = instrumentList[sel].variantType;
                gameProfile.setCurrentVariantByTypeName(typeName);
                stor.put("gameConfig", "lastVariantName", configName);
                console.log("目标乐器已设置为: " + typeName);
            }
            //目标键位
            let keyLayoutList = gameProfile.getCurrentAvailableKeyLayouts();
            if (keyLayoutList == null || keyLayoutList.length == 0) {
                throw new Error("当前游戏没有可用的键位!");
            } else if (keyLayoutList.length == 1) {
                gameProfile.setCurrentKeyLayoutDefault();
                stor.put("gameConfig", "lastKeyTypeName", gameProfile.getCurrentKeyLayoutTypeName());
            } else {
                let nameList = keyLayoutList.map((keyLayout) => keyLayout.displayName);
                let sel = /** @type {Number} */ (dialogs.select("选择目标键位...", nameList));
                if (sel == -1) {
                    console.log("设置没有改变");
                    break;
                }
                let typeName = keyLayoutList[sel].name;
                gameProfile.setCurrentKeyLayoutByTypeName(typeName);
                stor.put("gameConfig", "lastKeyTypeName", configName);
                console.log("目标键位已设置为: " + typeName);
            }
            toastLog("设置已保存");
            break;
        case 1:
            let playerType = /** @type {Number} */ (dialogs.select("实现方式", ["自动弹奏", "演示模式"]));
            if (playerType == -1) {
                console.log("设置没有改变");
                break;
            }
            if (playerType == 0) {
                stor.put("gameConfig", "selectedPlayerTypes", "[PlayerType.AutoJsGesturePlayer]");
            } else {
                stor.put("gameConfig", "selectedPlayerTypes", "[PlayerType.SkyCotlLikeInstructPlayer]");
            }
            toastLog("已设置为" + ["自动弹奏", "演示模式"][playerType]);
            break;
        case 2:
            let currentHumanify = stor.get("gameConfig", "humanifyNoteAbsTimeStdDev", 0) > 0 ? "已开启" : "已关闭";
            let humanifyNoteAbsTimeStdDev = /** @type {Number} */ (dialogs.select("开启伪装手弹?-当前【" + currentHumanify + "】", ["关闭", "开启"]));
            if (humanifyNoteAbsTimeStdDev == -1) {
                console.log("设置没有改变");
                break;
            }
            stor.put("gameConfig", "humanifyNoteAbsTimeStdDev", humanifyNoteAbsTimeStdDev);
            toastLog("伪手弹已" + ["关闭", "开启"][humanifyNoteAbsTimeStdDev]);
            break;
        case 3:
            let currentOutputMode = stor.get("gameConfig", "noteDurationOutputMode", "none") == "none" ? "已关闭" : "已开启";
            let noteDurationOutputMode = /** @type {Number} */ (dialogs.select("开启长音模式?-当前【" + currentOutputMode + "】", ["开启", "关闭"]));
            if (noteDurationOutputMode == -1) {
                console.log("设置没有改变");
                break;
            }
            if (noteDurationOutputMode == 0) {
                stor.put("gameConfig", "noteDurationOutputMode", "native");
            } else {
                stor.put("gameConfig", "noteDurationOutputMode", "none");
            }
            toastLog("长音模式已" + ["开启", "关闭"][noteDurationOutputMode]);
            break;
        case 4:
            let selectedArr;
            stor.get("gameConfig", "skipInit", true) ? selectedArr = [0] : selectedArr = [];
            stor.get("gameConfig", "skipBlank5s", true) ? selectedArr.push(1) : selectedArr;
            let skip = dialogs.multiChoice("跳过空白", ["跳过乐曲开始前的空白", "跳过乐曲中间超过5秒的空白"], selectedArr);
            if (skip.length == 0) {
                if (!dialogs.confirm("你未勾选任何项，请确认是否不勾选?")) {
                    return;
                }
            }
            stor.put("gameConfig", "skipInit", skip.includes(0));
            stor.put("gameConfig", "skipBlank5s", skip.includes(1));
            toastLog("设置已保存");
            break;
        case 5:
            let currentVisualization = stor.get("gameConfig", "visualizationEnabled", false) ? "已开启" : "已关闭";
            let visualizationEnabled = /** @type {Number} */ (dialogs.select("开启可视化窗口?-当前【" + currentVisualization + "】", ["开启", "关闭"]));
            if (visualizationEnabled == -1) {
                console.log("设置没有改变");
                break;
            }
            if (visualizationEnabled == 0) {
                stor.put("gameConfig", "visualizationEnabled", true);
            } else {
                stor.put("gameConfig", "visualizationEnabled", false);
            }
            toastLog("可视化已" + ["开启", "关闭"][visualizationEnabled]);
            break;
        case 6:
            if (confirm("关闭悬浮窗", "你确定关闭悬浮窗吗？你不玩了吗？你不爱我了吗？")) {
                toastLog("被你丢弃");
                engines.stopAll();
            }
            break;
    }
}

const ListScrollState = {
    cloud: 0,   // 云端列表位置
    collect: 0,  // 收藏列表位置
    lastSearch: 0 // 上次搜索的位置
};

// [修改] 增加 listType 参数，允许外部指定列表类型
function cloudScore(list, listType) {
    // 确定当前是哪个模式
    let modeKey = null;

    // 优先使用传入的类型
    if (listType) {
        modeKey = listType;
    } else {
        // 自动推断 (兼容旧逻辑)
        if (typeof allMusic !== 'undefined' && list === allMusic) modeKey = "cloud";
        else if (typeof userColl !== 'undefined' && list === userColl) modeKey = "collect";
    }

    let sponsorView = ui.inflate(
        <vertical>
            <list id="list" w="*" marginBottom="20">
                <card w="*" h="50dp" margin="5 1" id="listcard" cardCornerRadius="10dp" cardElevation="3dp" foreground="?selectableItemBackground">
                    <horizontal gravity="center_vertical">
                        <img src="{{music_type=='txt'?'file://./res/img/music.png':'file://./res/img/midi.png'}}" w="40dp" h="40dp" margin="15 0" layout_gravity="right|center" circle="true" />
                        <vertical h="auto" w="0" layout_weight="1">
                            <text id="age" textSize="16sp" text="{{name}}" textStyle="bold" ellipsize="end" maxLines="1" layout_gravity="center" />
                            <text w="*" textSize="10sp" maxLines="1" ellipsize="start" text="上传时间：{{uptime}}" />
                        </vertical>
                        <card w="45dp" margin="3dp 1dp 0dp 0dp" cardBackgroundColor="{{music_type=='txt'?'#B2DFEE':'#FF8C00'}}" cardCornerRadius="5dp" layout_gravity="right|bottom"
                        >
                            <text w="*" textColor="#FFFFFF" textStyle="bold" gravity="center" textSize="15sp" maxLines="1" ellipsize="start" text="{{music_type.toUpperCase()}}" />
                        </card>
                    </horizontal>
                </card>
            </list>
        </vertical>
    );

    playList = list;
    setDialogList(sponsorView.list, playList);

    // [新增] 恢复上次的滚动位置
    if (modeKey) {
        ui.post(() => {
            try {
                if (playList.length > 0 && ListScrollState[modeKey] > 0) {
                    sponsorView.list.scrollToPosition(ListScrollState[modeKey]);
                }
            } catch (e) {
                console.error("恢复位置失败: " + e);
            }
        });
    }

    // 辅助函数：保存当前位置
    const saveScrollPos = () => {
        if (!modeKey) return;
        try {
            let layoutManager = sponsorView.list.getLayoutManager();
            if (layoutManager) {
                let pos = layoutManager.findFirstVisibleItemPosition();
                ListScrollState[modeKey] = pos;
            }
        } catch (e) { }
    };

    let downloadDialog = dialogs.build({
        title: modeKey === 'lastSearch' ? "搜索结果" : "选择乐谱",
        canceledOnTouchOutside: false,
        customView: sponsorView,
        negative: "取消",
        negativeColor: "#999999",
        neutral: modeKey === 'lastCloud' ? "刷新列表" : null,
        neutralColor: "#99CCFF"
    }).on("negative", () => {
        saveScrollPos();
        return;
    }).on("neutral", () => {
        allMusic = shuffle(allMusic);
        playList = allMusic;
        setDialogList(sponsorView.list, playList);

        // 刷新后重置位置
        if (modeKey) ListScrollState[modeKey] = 0;
        sponsorView.list.scrollToPosition(0);
    }).show();

    sponsorView.list.on("item_click", function (item, itemView, list) {
        saveScrollPos();
        threads.start(function () {
            let options = ["开始弹奏", isCollect ? "取消收藏" : "收藏乐谱"];
            let i = dialogs.select(item.name, options);
            switch (i) {
                case 0:
                    downloadDialog.dismiss();
                    listIndex = itemView;
                    main(item);
                    break;
                case 1:
                    handleCollectionLogic(item, modeKey, sponsorView);
                    break;
            }
        });
    });
}

// [新增] 独立的收藏逻辑处理函数，避免嵌套过深
function handleCollectionLogic(item, modeKey, sponsorView) {
    let apiUrl = isCollect ? "DeleteCollect" : "UpDataCollect";
    let userInfo = stor.get("userData", "userinfo");

    let collect = module.http_post("api/" + apiUrl, {
        appid: module.getConfig("appid"),
        userid: userInfo.id,
        name: item.name,
        type: item.music_type
    });

    if (collect == null || collect.code != 200) {
        if (collect && collect.code == 400) {
            toastLog(collect.msg);
        } else {
            alert("网络错误", "服务器未响应。");
        }
        return;
    }

    let coll = JSON.parse(collect.data);

    // 更新内存数据
    if (!isCollect) {
        // 添加收藏
        if (coll.length == undefined) coll = Object.values(coll);
        userColl = mergeArrays(userColl, coll);
    } else {
        // 取消收藏
        userColl = removeItems(userColl, item);
        // [优化] 如果是在收藏列表，实时移除该项，不关闭窗口
        ui.post(() => {
            setDialogList(sponsorView.list, userColl);
            // 数据源变动后，尝试保持原位（如果还在范围内）
            if (modeKey && ListScrollState[modeKey] > 0) {
                // 稍微延时等待列表刷新
                sponsorView.list.post(() => {
                    sponsorView.list.scrollToPosition(ListScrollState[modeKey]);
                });
            }
        });
    }

    // 更新本地存储
    stor.put("userData", "userCollect", isCollect ? userColl : collect.data); // 保持原有逻辑逻辑
    // 为了保险，建议统一存最新的完整数组：stor.put("userData", "userCollect", userColl);

    toastLog(collect.msg);
}

function setDialogList(view, list) {
    let listData = [];
    view.setDataSource(listData, false);
    Array.prototype.push.apply(listData, list);
    // 使用 notifyDataSetChanged 确保增删改都能正确刷新
    view.adapter.notifyDataSetChanged();
}
// 随机打乱数组
function shuffle(arr) {
    let _arr = arr.slice(); // 调用数组副本，不改变原数组
    for (let i = 0; i < _arr.length; i++) {
        let j = getRandomInt(0, i);
        let t = _arr[i];
        _arr[i] = _arr[j];
        _arr[j] = t;
    }
    return _arr;
}
// 获取min到max的一个随机数，包含min和max本身
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
/**
 * 合并两个数组，覆盖重复数据，追加新数据
 * @param {Array} originalArray - 数组1
 * @param {Array} newArray - 数组2
 * @returns {Array} 合并后的新数组
 */
function mergeArrays(originalArray, newArray) {
    // 创建原始数组的深拷贝，避免修改原数组
    let mergedArray = JSON.parse(JSON.stringify(originalArray));
    // 遍历新数组中的每个对象
    for (let i = 0; i < newArray.length; i++) {
        let newItem = newArray[i];
        let found = false;
        // 在原始数组中查找具有相同ID的对象
        for (let j = 0; j < mergedArray.length; j++) {
            if (mergedArray[j].id === newItem.id) {
                // 如果找到匹配项，用新对象覆盖原始对象
                mergedArray[j] = Object.assign({}, newItem);
                found = true;
                break;
            }
        }
        if (!found) {
            // 如果没有找到匹配项，将新对象追加到数组
            mergedArray.push(Object.assign({}, newItem));
        }
    }
    return mergedArray;
}
/**
 * 从数组中删除指定的数据
 * @param {Array} array - 原始数组
 * @param {Object} item - 要删除的对象
 * @returns {Array} 删除指定ID后的新数组
 */
function removeItems(array, item) {
    // 创建数组的深拷贝，避免修改原数组
    let resultArray = JSON.parse(JSON.stringify(array));
    for (let j = 0; j < resultArray.length; j++) {
        if (resultArray[j].name === item.name && resultArray[j].music_type === item.music_type) {
            resultArray.splice(j, 1); // 删除该元素
            j--; // 调整索引，因为数组长度减少了
            break; // 找到并删除后跳出内层循环
        }
    }
    return resultArray;
}

function checkEnableAccessbility() {
    //启动无障碍服务
    if (auto.service == null) {
        toastLog(`请打开应用 "${appName}" 的无障碍权限!`);
        auto.waitFor();
        toastLog(`无障碍权限已开启!, 请回到游戏重新点击播放`);
        return false;
    }
    return true;
}

events.on("exit", function () {
    // console.log("程序结束，回收图片")
    // appLogo.recycle();
});