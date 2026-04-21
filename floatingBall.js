const FloatMenu = require("./lib/floaty/@se7en/float_menu-rhino");
const module = require("./module/module");
const stor = require("./module/storage");

let fm = new FloatMenu();

let program = module.http_post("api/getFloatyFun", {
    appid: module.getConfig("appid"),
    program: ["gameConfig", "floatyFunc", "passes", "domisoTXT", "skyStudioJSON", "midi", "toneJsJSON", "noteUtils", "instruct", "players", "visualizer"],
});
if (program == null || program.code != 200) {
    alert("网络错误", "服务器未响应，请检查网络连接或稍后再试。");
    exit();
}
var globalData = [];
for (let i = 0; i < program.data.length; i++) {
    globalData.push(program.data[i].content);
}
eval(globalData.join("\n "))

// 读取本地存储的上次搜索结果
let lastSearchList = stor.get("appData", "lastSearchList", []);
// 全部乐谱
let allMusic = shuffle(stor.get("appData", "allMusic", []));
// 用户收藏乐谱
let userColl = stor.get("userData", "userCollect", []);
if (userColl.length == undefined) {
    userColl = Object.values(userColl);
}
let isCollect;
fm.addItem("搜索")
    .setIcons("ic_search_black_48dp")
    .setRadius(10)
    .setColors("#7a0066ff")
    .setTints("#ffffff")
    .setStroke(2, "#000000")
    .onClick(function (view) {
        threads.start(() => {
            isCollect = false;
            let searchDialogView = ui.inflate(
                <vertical padding="20">
                    <input id="input" hint="输入乐谱名或乐谱类型" marginTop="10" />
                </vertical>
            );

            let searchDialog = dialogs.build({
                title: "搜索乐谱",
                customView: searchDialogView,
                positive: "搜索",
                positiveColor: "#4499d1",
                neutral: "上次搜索",
                neutralColor: "#ce5720",
                canceledOnTouchOutside: false
            }).show();

            // [新增] "显示上次搜索结果" 按钮点击事件
            searchDialog.on("neutral", () => {
                if (!lastSearchList || lastSearchList.length === 0) {
                    toast("暂无搜索记录");
                    return;
                }
                // 调用 cloudScore 并传入类型 "lastSearch" 以启用位置记忆
                cloudScore(lastSearchList, "lastSearch");
            })

            // "搜索" 按钮逻辑 (通过监听对话框的 positive 事件或手动处理)
            searchDialog.on("positive", () => {
                let musicName = searchDialogView.input.text();
                if (musicName != "") {
                    let search_list = [];
                    for (let i = 0; i < allMusic.length; i++) {
                        let folder_list_data = allMusic[i];
                        if (folder_list_data.name.indexOf(musicName) >= 0) {
                            search_list.push(folder_list_data);
                        }
                        if (folder_list_data.music_type.indexOf(musicName) >= 0) {
                            search_list.push(folder_list_data);
                        }
                    }
                    if (search_list.length <= 0) {
                        toast("没有搜到乐谱，请尝试输入其他关键字");
                        return; // 保持对话框不关闭或重新打开? 这里直接返回对话框会关闭
                    }

                    // [新增] 更新上次搜索记录并保存到本地
                    lastSearchList = search_list;
                    stor.put("appData", "lastSearchList", lastSearchList);

                    // [新增] 新的搜索开始，重置记忆的位置
                    if (typeof ListScrollState !== 'undefined') {
                        ListScrollState.lastSearch = 0;
                    }

                    cloudScore(search_list, "lastSearch");
                }
            });
        })
        return false;
    });
fm.addItem("收藏")
    .setIcons("ic_favorite_black_48dp")
    .setRadius(10)
    .setColors("#3aff28ff")
    .setTints("#ffffffff")
    .setStroke(2, "#000000")
    .onClick(function (view) {
        threads.start(() => {
            isCollect = true;
            // [优化] 每次打开收藏前，重新从本地存储读取最新数据
            // 这样可以防止在其他地方修改了收藏后（比如弹奏界面），这里数据过时
            let freshColl = stor.get("userData", "userCollect", []);
            if (freshColl.length == undefined) {
                freshColl = Object.values(freshColl);
            }
            userColl = freshColl;

            cloudScore(userColl, "lastColl");
        })
        return false;
    });
fm.addItem("云端")
    .setIcons("ic_cloud_black_48dp")
    .setRadius(10)
    .setColors("#fa99fa")
    .setTints("#ffffff")
    .setStroke(2, "#000000")
    .onClick(function (view) {
        threads.start(() => {
            isCollect = false;
            cloudScore(allMusic, "lastCloud");
        })
        return false;
    });
fm.addItem("坐标")
    .setIcons("ic_my_location_black_48dp")
    .setRadius(10)
    .setColors("#00fafa")
    .setTints("#ffffff")
    .setStroke(2, "#000000")
    .onClick(function (view) {
        threads.start(() => {
            runClickPosSetup();
        })
        return false;
    });
fm.addItem("设置")
    .setIcons("ic_settings_black_48dp")
    .setRadius(10)
    .setColors("#669999ff")
    .setTints("#ffffff")
    .setStroke(2, "#000000")
    .onClick((view) => {
        threads.start(() => {
            setupDia();
        })
        return false;
    });

/**
 * @brief 加载配置文件
 */
(function loadConfiguration() {
    try {
        gameProfile.loadDefaultGameConfigs();
        let keyLocators = stor.get("gameConfig", "keyLocators2", null);
        if (keyLocators == null)
            gameProfile.setKeyLocators(new Map());
        else
            gameProfile.setKeyLocators(keyLocators);

        let lastConfigName = stor.get("gameConfig", "lastConfigName", "");
        //尝试加载用户设置的游戏配置
        let activeConfigName = stor.get("gameConfig", "activeConfigName", null);
        let res = gameProfile.setConfigByName(activeConfigName);
        if (res == false) {
            console.log("尝试加载用户设置的游戏配置...失败!");
        } else {
            console.log("尝试加载用户设置的游戏配置...成功, 当前配置: " + gameProfile.getCurrentConfigTypeName());
        }

        if (gameProfile.getCurrentConfig() == null) {
            console.error("未找到合适配置, 已加载默认配置!");
            gameProfile.setConfigByName("光遇");
        }
        if (lastConfigName != gameProfile.getCurrentConfigTypeName()) {
            //如果配置发生了变化, 则清空上次的变体与键位配置
            stor.put("gameConfig", "lastConfigName", gameProfile.getCurrentConfigTypeName());
            stor.put("gameConfig", "lastVariantName", "");
            stor.put("gameConfig", "lastKeyTypeName", "");
        }

        //加载变体配置和键位配置
        let lastVariantName = stor.get("gameConfig", "lastVariantName", "");
        if (lastVariantName != "") {
            let res = gameProfile.setCurrentVariantByTypeName(lastVariantName);
            if (res == false) {
                console.log("尝试加载用户设置的变体配置...失败!");
                gameProfile.setCurrentVariantDefault();
            } else {
                console.log("尝试加载用户设置的变体配置...成功");
            }
        } else {
            gameProfile.setCurrentVariantDefault();
            console.log("游戏配置发生变化, 已加载默认变体配置");
        }
        stor.put("gameConfig", "lastVariantName", gameProfile.getCurrentVariantTypeName());

        let lastKeyTypeName = stor.get("gameConfig", "lastKeyTypeName", "");
        if (lastKeyTypeName != "") {
            let res = gameProfile.setCurrentKeyLayoutByTypeName(lastKeyTypeName);
            if (res == false) {
                console.log("尝试加载用户设置的键位配置...失败!");
                gameProfile.setCurrentKeyLayoutDefault();
            } else {
                console.log("尝试加载用户设置的键位配置...成功");
            }
        } else {
            gameProfile.setCurrentKeyLayoutDefault();
            console.log("游戏配置发生变化, 已加载默认键位配置");
        }
        stor.put("gameConfig", "lastKeyTypeName", gameProfile.getCurrentKeyLayoutTypeName());

    } catch (error) {
        console.log("加载配置文件失败! 已自动加载默认配置!");
        console.warn(error);
        gameProfile.loadDefaultGameConfigs();
    }
})();

//启动监听
events.observeKey();
function main(musicInfo) {
    let evt = events.emitter(threads.currentThread());
    /**
     * @type {Number?}
     */
    let totalTimeSec = null;
    let totalTimeStr = null;
    let currentGestureIndex = null;
    // 可视化窗口
    let visualizerWindow = null;
    // 演示模式窗口
    let instructWindow = null;
    // 播放方式
    // let selectedPlayerTypes = [PlayerType.AutoJsGesturePlayer];
    let selectedPlayerTypes = eval(stor.get("gameConfig", "selectedPlayerTypes", "[PlayerType.AutoJsGesturePlayer]"));
    // 连续播放是否自动开始
    let playListModeAuto = false;
    // 当前是否切换乐谱
    let switchSheetMusic = false;
    // 默认倍速
    let playSpeed = parseFloat(stor.get("gameConfig", "speedMultiplier", "1.0"));

    let selectedPlayers = [playersModule.AutoJsGesturePlayer()];

    // 输入给播放器的音乐数据。可能是按键列表，也可能是手势列表
    let music = null;
    // 乐谱数据
    let musicData = null;

    let singleEndIcon = "file://./res/img/单曲播放.png";
    let singleCycleIcon = "file://./res/img/单曲循环.png";
    let listLoopIcon = "file://./res/img/顺序播放.png";
    let listRandomIcon = "file://./res/img/随机播放.png";

    let controlWindow = floaty.rawWindow(
        <frame id="w" visibility="gone">
            <linear w="auto" h="auto" orientation="vertical">
                <card w="auto" h="auto" cardBackgroundColor="#F0F8FF" radius="10dp" gravity="center">
                    <linear w="auto" h="auto" orientation="vertical">
                        <relative>
                            <img id="stop" layout_alignParentLeft="true" marginLeft="5dp" src="@drawable/ic_highlight_off_black_48dp" w="20dp" tint="#696969" />
                            <text text="{{ stor.get('appData','appConfig').appname }}" textSize="13sp" textColor="#696969" textStyle="normal" layout_centerInParent="true" singleLine="true" />
                        </relative>
                        <View bg="#B0C4DE" w="150dp" h="2dp" />
                        <card w="*" radius="10dp" cardBackgroundColor="#B0C4DE" margin="10dp 2dp 10dp 1dp">
                            <TextView id="songName" w="100dp" h="auto" marginLeft="13dp" marginRight="13dp" gravity="center" textSize="13sp" singleLine="true" ellipsize="marquee" focusable="true" textStyle="normal" textColor="#000000" />
                        </card>
                        <relative gravity="center" marginTop="2dp">
                            <img id="lastSong" src="@drawable/ic_skip_previous_black_48dp" layout_centerInParent="true" layout_alignTop="@+id/pauseResumeBtn" layout_toLeftOf="@+id/pauseResumeBtn" tint="#000000" w="30dp" h="30dp" gravity="center" borderWidth="3dp" borderColor="#B0C4DE" radius="50dp" marginRight="9dp" />
                            <img id="pauseResumeBtn" src="@drawable/ic_play_arrow_black_48dp" tint="#000000" w="36dp" h="36dp" layout_centerInParent="true" gravity="center" borderWidth="3dp" borderColor="#B0C4DE" radius="50dp" margin="9dp 2dp 9dp 1dp" />
                            <img id="nextSong" src="@drawable/ic_skip_next_black_48dp" layout_centerInParent="true" layout_alignTop="@+id/pauseResumeBtn" layout_toRightOf="@+id/pauseResumeBtn" tint="#000000" w="30dp" h="30dp" gravity="center" borderWidth="3dp" borderColor="#B0C4DE" radius="50dp" marginLeft="9dp" />
                        </relative>
                        <card radius="10dp" cardBackgroundColor="#B0C4DE" marginRight="13dp" marginLeft="13dp" marginTop="2dp" >
                            <seekbar id="progressBar" h="15dp" gravity="center" splitTrack="false" progressTint="#696969" thumb="#B0C4DE" />
                        </card>
                        <text text="00:00/00:00" background="#00000000" textColor="#000000" gravity="center" id="timerText" textStyle="bold" />
                        <relative gravity="center" marginTop="2dp">
                            <card radius="35dp" h="25dp" w="25dp" layout_toLeftOf="@+id/speed" cardBackgroundColor="#B0C4DE" marginRight="13dp">
                                <img id="speedLow" background="#00000000" textStyle="bold" textSize="12sp" src="@drawable/ic_fast_rewind_black_48dp" tint="#000000" h="25dp" w="25dp" />
                            </card>
                            <text id="speed" text="速度x1.0" background="#00000000" textStyle="bold" textSize="12sp" w="auto" layout_centerInParent="true" textColor="#000000" />
                            <card radius="35dp" h="25dp" w="25dp" layout_toRightOf="@+id/speed" cardBackgroundColor="#B0C4DE" marginLeft="13dp" >
                                <img id="speedHigh" background="#00000000" textStyle="bold" textSize="12sp" src="@drawable/ic_fast_forward_black_48dp" tint="#000000" h="25dp" w="25dp" />
                            </card>
                        </relative>
                        <relative gravity="center" marginTop="2dp">
                            <img id="joinCollect" background="#00000000" textStyle="bold" textSize="12sp" tint="#B0C4DE" src="@drawable/ic_favorite_border_black_48dp" h="25dp" w="25dp" />
                            <View id="separate1" bg="#B0C4DE" w="2dp" h="15dp" rotation="180" layout_toRightOf="@+id/joinCollect" layout_centerVertical="true" margin="10dp 0dp 10dp 0dp" />
                            <img id="listPlayMode" layout_toRightOf="@+id/separate1" background="#00000000" textStyle="bold" textSize="12sp" tint="#B0C4DE" h="25dp" w="25dp" />
                            <View id="separate2" bg="#B0C4DE" w="2dp" h="15dp" rotation="180" layout_toRightOf="@+id/listPlayMode" layout_centerVertical="true" margin="10dp 0dp 10dp 0dp" />
                            <img id="hide" layout_toRightOf="@+id/separate2" background="#00000000" textStyle="bold" textSize="12sp" tint="#B0C4DE" src="@drawable/ic_visibility_off_black_48dp" h="25dp" w="25dp" />
                        </relative>
                    </linear>
                </card>
            </linear>
        </frame>
    );
    let controlWindowPosition = stor.get("gameConfig", "controlWindowPosition", [100, 100]);
    controlWindow.setSize(-2, -2);
    controlWindow.setPosition(controlWindowPosition[0], controlWindowPosition[1]);

    let playMode = stor.get("gameConfig", "listPlayMode", "singleEnd");
    switchSheetMusic = playMode == "listRandom" || playMode == "listLoop" || playMode == "singleCycle" ? false : true;

    playMode == "singleEnd" ? controlWindow.listPlayMode.attr("src", singleEndIcon) : playMode == "singleCycle" ? controlWindow.listPlayMode.attr("src", singleCycleIcon) : playMode == "listLoop" ? controlWindow.listPlayMode.attr("src", listLoopIcon) : playMode == "listRandom" ? controlWindow.listPlayMode.attr("src", listRandomIcon) : null;

    ui.post(() => {
        evt.emit("fileSelect");
    })

    // 上一首
    controlWindow.lastSong.on("click", () => {
        if (listIndex <= 0) return toastLog("已是第一首");
        listIndex--;
        musicInfo = playList[listIndex];
        switchSheetMusic = true;
        evt.emit("fileSelect");
    });
    // 播放暂停
    controlWindow.pauseResumeBtn.on("click", () => {
        evt.emit("pauseResumeBtnClick");
    });
    //下一首
    controlWindow.nextSong.on("click", () => {
        if (listIndex >= playList.length - 1) return toastLog("已是最后一首");
        listIndex++;
        musicInfo = playList[listIndex];
        switchSheetMusic = true;
        evt.emit("fileSelect");
    });
    // 关闭
    controlWindow.stop.on("click", () => {
        evt.emit("exitWin");
    })
    //实时切换速度 -
    controlWindow.speedLow.on("click", () => {
        evt.emit("speedLow");
    });
    //实时切换速度 +
    controlWindow.speedHigh.on("click", () => {
        evt.emit("speedHigh");
    });
    //收藏
    controlWindow.joinCollect.on("click", () => {
        evt.emit("joinCollect");
    });
    //切换播放顺序模式
    controlWindow.listPlayMode.on("click", () => {
        evt.emit("switchListMode");
    })
    //隐藏悬浮窗
    controlWindow.hide.on("click", () => {
        evt.emit("hideWindow");
    });

    controlWindow.w.setOnTouchListener(function (view, event) {
        switch (event.getAction()) {
            case event.ACTION_DOWN:
                x1 = event.getRawX();
                y1 = event.getRawY();
                windowX = controlWindow.getX();
                windowY = controlWindow.getY();
                return true;
            case event.ACTION_MOVE:
                controlWindow.setSize(
                    controlWindow.getWidth(),
                    controlWindow.getHeight()
                );
                stor.put("gameConfig", "controlWindowPosition", [
                    controlWindow.getX(),
                    controlWindow.getY(),
                ]);
                controlWindow.setPosition(
                    windowX + (event.getRawX() - x1),
                    windowY + (event.getRawY() - y1)
                );
                return true;
            case event.ACTION_UP:
                if (
                    Math.abs(event.getRawY() - y1) < 5 &&
                    Math.abs(event.getRawX() - x1) < 5
                )
                    return true;
        }
        return true;
    });

    controlWindow.progressBar.setOnSeekBarChangeListener({
        onProgressChanged: function (seekBar, progress, fromUser) {
            if (fromUser) {
                let targetTimeSec = totalTimeSec * progress / 100;
                for (let j = 0; j < music.length; j++) {
                    if (music[j][1] > targetTimeSec * 1000) {
                        currentGestureIndex = j - 1;
                        break;
                    }
                }
                currentGestureIndex = Math.max(0, currentGestureIndex);
                for (let player of selectedPlayers)
                    player.seekTo(currentGestureIndex);
                //计算时间
                let curTimeSec = music[currentGestureIndex][1] / 1000;
                let curTimeStr = sec2timeStr(curTimeSec);
                let timeStr = curTimeStr + "/" + totalTimeStr;
                //更新窗口
                ui.run(() => {
                    controlWindow.progressBar.setProgress(curTimeSec / totalTimeSec * 100);
                    controlWindow.timerText.setText(timeStr);
                });
            };
        }
    });
    let visualizerWindowRequestClose = false;
    //可视化悬浮窗口
    const createVisualizerWindow = function () {
        let visualizerWindow = floaty.window(
            <canvas id="canv" w="*" h="*" />
        );
        let visualizerWindowPosition = stor.get("gameConfig", "visualizerWindowPosition", [100, 100]);
        visualizerWindow.setPosition(visualizerWindowPosition[0], visualizerWindowPosition[1]);
        let visualizerWindowSize = stor.get("gameConfig", "visualizerWindowSize", [device.height / 2, device.width / 2]);
        visualizerWindow.setSize(visualizerWindowSize[0], visualizerWindowSize[1]);
        visualizerWindow.canv.on("draw", function (canvas) {
            try {
                if (visualizer && typeof visualizer.draw === "function") {
                    visualizer.draw(canvas);
                } else {
                    console.error("visualizer.draw不是有效函数");
                    // 绘制默认内容用于调试
                    canvas.drawColor(android.graphics.Color.RED);
                }
                //如果在绘制时窗口被关闭, app会直接崩溃, 所以这里要等待一下 
                if (visualizerWindowRequestClose) {
                    sleep(1000);
                }
            } catch (e) {
                console.log(e)
                console.log(e.stack); // 打印堆栈跟踪信息
            }
        });

        //上一次点击的时间
        let visualizerLastClickTime = 0;
        //触摸事件
        visualizerWindow.canv.click(function () {
            let now = new Date().getTime();
            if (now - visualizerLastClickTime < 500) {
                toast("重置悬浮窗大小与位置");
                visualizerWindow.setSize(device.height / 3, device.width / 3);
                visualizerWindow.setPosition(100, 100);
            }
            visualizerLastClickTime = now;
            let adjEnabled = visualizerWindow.isAdjustEnabled();
            visualizerWindow.setAdjustEnabled(!adjEnabled);
            if (adjEnabled) {
                //更新大小 (使用窗口上的拖动手柄缩放时, 窗口的大小实际上是不会变的, 所以这里要手动更新)
                visualizerWindow.setSize(visualizerWindow.getWidth(), visualizerWindow.getHeight());
                //保存当前位置与大小
                stor.put("gameConfig", "visualizerWindowPosition", [visualizerWindow.getX(), visualizerWindow.getY()]);
                stor.put("gameConfig", "visualizerWindowSize", [visualizerWindow.getWidth(), visualizerWindow.getHeight()]);
            }
        });
        return visualizerWindow;
    }
    evt.on("pauseResumeBtnClick", () => {
        for (let player of selectedPlayers) {
            if (player.getState() == player.PlayerStates.PAUSED) {
                if (player.getType() === PlayerType.AutoJsGesturePlayer && !checkEnableAccessbility()) return;
                player.resume();
            } else if (player.getState() == player.PlayerStates.PLAYING) {
                player.pause();
            } else if (player.getState() == player.PlayerStates.FINISHED) {
                if (player.getType() === PlayerType.AutoJsGesturePlayer && !checkEnableAccessbility()) return;
                player.seekTo(0);
                player.resume();
            }
        }
    });
    evt.on("speedLow", () => {
        for (let player of selectedPlayers) {
            //获取现在的速度
            let getPlaySpeed = player.getPlaySpeed();
            //设置速度
            if (getPlaySpeed <= 0.2) return toast("已是最小倍速");
            playSpeed = parseFloat(getPlaySpeed) - 0.1;
            player.setPlaySpeed(playSpeed);
            ui.run(function () {
                //更新文字，toFixed只保留一位小数
                controlWindow.speed.setText("速度x" + player.getPlaySpeed().toFixed(1));
            });
            //继续播放
            if (player.getState() == player.PlayerStates.PLAYING) player.resume();
        }
    });
    evt.on("speedHigh", () => {
        for (let player of selectedPlayers) {
            //获取现在的速度
            let getPlaySpeed = player.getPlaySpeed();
            //设置速度
            if (getPlaySpeed >= 3.0) return toast("已是最大倍速");
            playSpeed = parseFloat(getPlaySpeed) + 0.1;
            player.setPlaySpeed(playSpeed);
            ui.run(function () {
                //更新文字，toFixed只保留一位小数
                controlWindow.speed.setText("速度x" + player.getPlaySpeed().toFixed(1));
            });
            //继续播放
            if (player.getState() == player.PlayerStates.PLAYING) player.resume();
        }
    });
    evt.on("joinCollect", () => {
        let CollectUrl = controlWindow.joinCollect.attr("src") == "@drawable/ic_favorite_border_black_48dp" ? "UpDataCollect" : "DeleteCollect";
        let userInfo = stor.get("userData", "userinfo");
        let collect = module.http_post("api/" + CollectUrl, {
            appid: module.getConfig("appid"),
            userid: userInfo.id,
            name: musicInfo.name,
            type: musicInfo.music_type
        });
        if (collect == null || collect.code != 200) {
            if (collect.code == 400) {
                toastLog(collect.msg);
                return;
            }
            toastLog("服务器未响应，请检查网络连接或稍后再试。");
            return;
        }
        let coll = JSON.parse(collect.data);
        if (CollectUrl == "UpDataCollect") {
            if (coll.length == undefined) {
                coll = Object.values(coll);
            }
            userColl = mergeArrays(userColl, coll);
        } else {
            userColl = removeItems(userColl, musicInfo);
        }
        stor.put("userData", "userCollect", collect.data);
        isCollects();
    })
    evt.on("switchListMode", () => {
        let nowMode = stor.get("gameConfig", "listPlayMode", "singleEnd");
        switch (nowMode) {
            case "singleEnd":
                controlWindow.listPlayMode.attr("src", singleCycleIcon);
                stor.put("gameConfig", "listPlayMode", "singleCycle");
                toastLog("已切换为单曲循环");
                break;
            case "singleCycle":
                controlWindow.listPlayMode.attr("src", listLoopIcon);
                stor.put("gameConfig", "listPlayMode", "listLoop");
                toastLog("已切换为顺序播放");
                break;
            case "listLoop":
                controlWindow.listPlayMode.attr("src", listRandomIcon);
                stor.put("gameConfig", "listPlayMode", "listRandom");
                toastLog("已切换为随机播放");
                break;
            case "listRandom":
                controlWindow.listPlayMode.attr("src", singleEndIcon);
                stor.put("gameConfig", "listPlayMode", "singleEnd");
                toastLog("已切换为单曲播放");
                break;
        }
    });
    evt.on("listPlayMode", () => {
        let nowMode = stor.get("gameConfig", "listPlayMode", "singleEnd");
        switch (nowMode) {
            case "singleCycle":
                for (let player of selectedPlayers) {
                    player.seekTo(0);
                    player.resume();
                }
                playListModeAuto = true;
                switchSheetMusic = false;
                break;
            case "listLoop":
                if (listIndex >= playList.length - 1) {
                    listIndex = 0;
                } else {
                    listIndex++;
                }
                musicInfo = playList[listIndex];
                playListModeAuto = true;
                switchSheetMusic = false;
                evt.emit("fileSelect");
                break;
            case "listRandom":
                let rom = random(0, playList.length - 1);
                listIndex = rom;
                musicInfo = playList[listIndex];
                playListModeAuto = true;
                switchSheetMusic = false;
                evt.emit("fileSelect");
                break;
            case "singleEnd":
                break;
        }
    })
    let hideVisualizer = false;
    evt.on("hideWindow", () => {
        let timeout;
        let waitSecond = stor.get("gameConfig", "hideAndWait", "0");
        let displayWindowMethod = stor.get("gameConfig", "displayWindowMethod", "volume_down");
        ui.run(() => {
            if (controlWindow !== null) {
                controlWindow.w.setVisibility(android.view.View.GONE);
            }
            if (visualizerWindow !== null) {
                visualizerWindow.canv.setVisibility(android.view.View.GONE);
                hideVisualizer = true;
            }
        })
        if (waitSecond > 0) {
            for (let player of selectedPlayers) {
                player.pause();
                timeout = setTimeout(() => {
                    player.resume();
                }, waitSecond * 1000);
            }
        }
        //监听音量上键按下
        events.onKeyDown(displayWindowMethod, function (event) {
            ui.run(() => {
                //显示所有悬浮窗
                if (controlWindow !== null) {
                    controlWindow.w.setVisibility(android.view.View.VISIBLE);
                }
                if (visualizerWindow !== null) {
                    visualizerWindow.canv.setVisibility(android.view.View.VISIBLE);
                    hideVisualizer = false;
                }
            });
            if (timeout) clearTimeout(timeout);
        });
    });
    evt.on("exitWin", () => {
        // 停止所有播放器
        for (let player of selectedPlayers)
            player.stop(true);
        ui.post(() => {
            fm.show();
        })
        // 关闭所有悬浮窗
        if (visualizerWindow !== null) {
            visualizerWindowClose();
            visualizerWindow = null;
        }
        if (instructWindow !== null) {
            instructWindow.close();
            instructWindow = null;
        }
        if (controlWindow !== null) {
            controlWindow.close();
            controlWindow = null;
        }
        // 重置状态
        currentGestureIndex = 0;
        gameProfile.clearCurrentConfigCache();
        // 移除所有事件监听器以防止内存泄漏
        evt.removeAllListeners();
        // 停止所有子线程
        threads.shutDownAll();
    });
    evt.on("fileSelect", () => {
        for (let player of selectedPlayers)
            player.stop(switchSheetMusic);

        try {
            musicData = loadMusic(musicInfo);
            if (musicData == null) {
                evt.emit("exitWin");
                return;
            }
        } catch (error) {
            log(error);
            alert("解析错误", "解析乐谱时发生错误，请反馈给管理员！");
            evt.emit("exitWin");
            return;
        }

        //加载可视化窗口
        const layout = gameProfile.getCurrentKeyLayout()
        if (layout.keyLayout.row != null && layout.keyLayout.column != null) {
            visualizer.setKeyLayout(layout.keyLayout.row, layout.keyLayout.column);
            visualizer.loadNoteData(musicData.packedKeyList);
            visualizer.goto(-1);
        }

        let playMode = stor.get("gameConfig", "listPlayMode", "singleEnd");
        switchSheetMusic = playMode == "listRandom" || playMode == "listLoop" || playMode == "singleCycle" ? false : true;

        music = musicData.gestureList != null ? musicData.gestureList : musicData.packedKeyList;
        totalTimeSec = music[music.length - 1][1] / 1000;
        totalTimeStr = sec2timeStr(totalTimeSec);
        currentGestureIndex = null;
        evt.emit("fileLoaded");
    });
    evt.on("fileLoaded", () => {
        if (instructWindow != null) {
            instructWindow.close();
            instructWindow = null;
        }
        if (visualizerWindow !== null) {
            visualizerWindowClose();
            visualizerWindow = null;
        }
        selectedPlayers = [];
        let autoStartPlaying = false;
        switch (selectedPlayerTypes[0]) { //FIXME:
            case PlayerType.AutoJsGesturePlayer:
                selectedPlayers.push(playersModule.AutoJsGesturePlayer());
                console.log("new AutoJsGesturePlayer");
                break;
            case PlayerType.SimpleInstructPlayer:
            case PlayerType.SkyCotlLikeInstructPlayer:
                let impl = null;
                if (selectedPlayerTypes[0] == PlayerType.SkyCotlLikeInstructPlayer) {
                    selectedPlayers.push(playersModule.SkyCotlLikeInstructPlayer());
                    //@ts-ignore
                    impl = (selectedPlayers[0].getImplementationInstance());
                    impl.setDrawLineToEachNextKeys(
                        stor.get("gameConfig", "SkyCotlLikeInstructPlayer_DrawLineToEachNextKeys", true)
                    );
                    impl.setDrawLineToNextNextKey(
                        stor.get("gameConfig", "SkyCotlLikeInstructPlayer_DrawLineToNextNextKey", true)
                    );
                    impl.setDrawRingOutside(
                        stor.get("gameConfig", "SkyCotlLikeInstructPlayer_DrawRingOutside", false)
                    );
                    let keyRange = gameProfile.getKeyRange();
                    keyRange = [keyRange[0] - 1, keyRange[1] - 1]; //从0开始
                    let keyOrderMap = new Map();
                    for (let i = keyRange[0]; i <= keyRange[1]; i++) {
                        keyOrderMap.set(i, gameProfile.getPitchByKey(i));
                    }
                    impl.setKeyOrder(keyOrderMap);

                    console.log("new SkyCotlLikeInstructPlayer");
                } else if (selectedPlayerTypes[0] == PlayerType.SimpleInstructPlayer) {
                    selectedPlayers.push(playersModule.SimpleInstructPlayer());
                    impl = (selectedPlayers[0].getImplementationInstance());
                    console.log("new SimpleInstructPlayer");
                } else {
                    throw new Error("未知的播放器类型: " + selectedPlayerTypes);
                }
                autoStartPlaying = true;
                let offset = stor.get("gameConfig", "calibrateFullScreenCanvasOffset", null);
                if (offset == null) offset = calibrateFullScreenCanvasOffset();
                let keyPositions = JSON.parse(JSON.stringify(gameProfile.getAllKeyPositions()));
                for (let keyPos of keyPositions) {
                    keyPos[0] -= offset[0];
                    keyPos[1] -= offset[1];
                }
                impl.setKeyPositions(keyPositions);
                impl.setKeyRadius(gameProfile.getPhysicalMinKeyDistance() * 0.3 * stor.get("gameConfig", "SimpleInstructPlayer_MarkSize", 1));
                //创建全屏悬浮窗. 也许不需要全屏?
                instructWindow = floaty.rawWindow(<canvas id="canv" w="*" h="*" />);
                instructWindow.setTouchable(false);
                instructWindow.setSize(-1, -1);
                // instructWindow.setPosition(0, 0);
                //打开硬件加速
                instructWindow.canv.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);
                let targetFps = context.getSystemService(android.content.Context.WINDOW_SERVICE).getDefaultDisplay().getRefreshRate();
                // instructWindow.canv.setMaxFps(fps);  //坏的
                let canvasClass = instructWindow.canv.getClass();
                let mTimePerDrawField = canvasClass.getDeclaredField("mTimePerDraw");
                mTimePerDrawField.setAccessible(true);
                mTimePerDrawField.set(instructWindow.canv, new java.lang.Long(Math.round(1000 / targetFps)));

                instructWindow.canv.on("draw", function (canvas) {
                    try {
                        if (impl && typeof impl.draw === "function") {
                            impl.draw(canvas);
                        } else {
                            console.error("impl.draw不是有效函数");
                            // 绘制默认内容用于调试
                            canvas.drawColor(android.graphics.Color.RED);
                        }
                    } catch (e) {
                        console.log(e)
                        console.log(e.stack); // 打印堆栈跟踪信息
                    }
                });
                break;
            default:
                throw new Error("未知的播放器类型: " + selectedPlayerTypes);
        }
        selectedPlayers[0].setOnStateChange(function (newState) {
            if (newState == selectedPlayers[0].PlayerStates.PAUSED) {
                controlWindow.pauseResumeBtn.attr("src", "@drawable/ic_play_arrow_black_48dp");
            } else if (newState == selectedPlayers[0].PlayerStates.FINISHED) {
                controlWindow.pauseResumeBtn.attr("src", "@drawable/ic_play_arrow_black_48dp");
                if (!switchSheetMusic) evt.emit("listPlayMode");
            } else if (newState == selectedPlayers[0].PlayerStates.PLAYING) {
                controlWindow.pauseResumeBtn.attr("src", "@drawable/ic_pause_black_48dp");
            }
        });
        selectedPlayers[0].setOnPlayNote(function (note) {
            currentGestureIndex = note;
            note = Math.max(0, note - 1)
            visualizer.goto(note);
        });
        for (let player of selectedPlayers)
            player.setGestureTimeList(music);
        //设置点击位置偏移
        const clickPositionDeviationMm = stor.get("gameConfig", "clickPositionDeviationMm", 1);
        const displayMetrics = context.getResources().getDisplayMetrics();
        const TypedValue = android.util.TypedValue;
        const clickPositionDeviationPx = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_MM, clickPositionDeviationMm, displayMetrics);
        for (let player of selectedPlayers)
            player.setClickPositionDeviationPx(clickPositionDeviationPx);

        //是否显示可视化窗口
        let visualizationEnabled = stor.get("gameConfig", "visualizationEnabled", false);
        if (visualizationEnabled) { //TODO: 其它类型的键位布局也可以显示可视化窗口
            visualizerWindow = createVisualizerWindow();
            // 如果是隐藏悬浮窗状态
            if (hideVisualizer) {
                visualizerWindow.canv.setVisibility(android.view.View.GONE);
            }
        };

        let playMode = stor.get("gameConfig", "listPlayMode", "singleEnd");
        for (let player of selectedPlayers) {
            player.start();
            player.pause();
            player.setPlaySpeed(playSpeed);
            if (autoStartPlaying) player.resume();
            if (playListModeAuto && (playMode == "listLoop" || playMode == "listRandom")) player.resume();
            currentGestureIndex = 0;
            ui.run(() => {
                fm.hide();
                controlWindow.w.setVisibility(android.view.View.VISIBLE);
                controlWindow.songName.setText(musicInfo.name);
                controlWindow.songName.setMarqueeRepeatLimit(-1);
                controlWindow.songName.setSelected(true);
                controlWindow.speed.setText("速度x" + player.getPlaySpeed().toFixed(1));
            })
        }
        isCollects();
    });

    function controlWindowUpdateLoop() {
        if (controlWindow == null) {
            return;
        }
        if (music == null || totalTimeSec == null || currentGestureIndex == null) return;
        currentGestureIndex = Math.min(currentGestureIndex, music.length - 1);
        //计算时间
        let curTimeSec = music[currentGestureIndex][1] / 1000;
        let curTimeStr = sec2timeStr(curTimeSec);
        let timeStr = curTimeStr + "/" + totalTimeStr;
        //更新窗口
        ui.run(() => {
            controlWindow.progressBar.setProgress(curTimeSec / totalTimeSec * 100);
            controlWindow.timerText.setText(timeStr);
        });

    }
    setInterval(controlWindowUpdateLoop, 200);

    //检查是否收藏
    function isCollects() {
        let userCollect = stor.get("userData", "userCollect", []);
        if (userCollect.length == undefined) {
            userCollect = Object.values(userCollect);
        }
        if (userCollect.length > 0) {
            for (let key in userCollect) {
                if (userCollect[key].name == musicInfo.name && userCollect[key].music_type == musicInfo.music_type) {
                    ui.run(function () {
                        controlWindow.joinCollect.attr("src", "@drawable/ic_favorite_black_48dp");
                        controlWindow.joinCollect.attr("tint", "#FF0000");
                    });
                    return;
                }
            }
        }
        ui.run(function () {
            controlWindow.joinCollect.attr("src", "@drawable/ic_favorite_border_black_48dp");
            controlWindow.joinCollect.attr("tint", "#B0C4DE");
        });
    }
    isCollects();

    // 关闭可视化窗口
    function visualizerWindowClose() {
        if (visualizerWindow == null) return;
        visualizerWindowRequestClose = true;
        sleep(200);
        visualizerWindow.close();
        visualizerWindowRequestClose = false;
    }
}

//修改logoView参数
let logo = fm.getLogoView();
logo.setIcons(

    "data:image/png;base64,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"
);

/** 扇形悬浮菜单样式 */
//设置控件与logo间距
fm.config.all_item_gap = 80;
// 设置菜单样式为扇形
fm.setMenuStyle(FloatMenu.TYPE_MENU_CIRCULAR);

//显示悬浮球 自行判断悬浮窗权限
fm.show();