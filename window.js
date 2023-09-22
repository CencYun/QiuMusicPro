alert("提示", "进入游戏才能看到悬浮窗！")
const QiuMusic = function () {
    this.circle = require("./Module/module");
    this.DataUrl = this.circle.config.Qiu_url;
    this.inspect = storages.create("message"); //创建本地存储
    this.userid = this.inspect.get("userData");
    this.tu = files.read("./tu.txt");
    eval(this.tu);
};
const debugDumpPass = "";
//用于自动演奏的合并阈值
const autoPlayMergeThreshold = 0.01;
//用于乐谱导出的合并阈值
const scoreExportMergeThreshold = 0.2;
/**
 * @brief 导出数据的格式类型
 * @enum {string}
 */
const ScoreExportType = {
    none: "none",
    keyboardScore: "keyboardScore",
    keySequenceJSON: "keySequenceJSON",
};
const globalConfig = storages.create("hallo1_clxmidiplayer_config");
const musicInit = storages.create("musicInit");
var GameProfile = require("./Module/gameProfile.js");
var gameProfile = new GameProfile();
var visualizer = new Visualizer();
var noteUtils = new NoteUtils();
var Qiu = new QiuMusic();

//防抓包开始
threads.start(() => {
    setInterval(() => {
        try {
            let r = Qiu.circle.isWifiProxy(context);
            if (r) {
                engines.stopAll();
            }
        } catch (error) {
            log("需要更新");
        }
    }, 500);
})
//防抓包结束

/**
 * 时间转时间戳
 * @param {*} time 
 * @returns 
 */
function changeTimes(time) {
    let temp = time.split(' ');
    let arr = temp[0].split('-');
    let brr = temp[1].split(':');
    if (brr.length == 3) {
        var timestamp = new Date(Date.UTC(arr[0], arr[1] - 1, arr[2], +brr[0] - 8, brr[1], brr[2]));

    } else if (brr.length == 2) {
        var timestamp = new Date(Date.UTC(arr[0], arr[1] - 1, arr[2], +brr[0] - 8, brr[1]));

    }
    let timestamp = timestamp.getTime() / 1000;
    return timestamp;

};

/**
 * 获取当前日期时间
 * @param {*} time 
 * @param {*} rule 
 * @returns 
 */
function getTimes(time, rule) {
    rule = rule || "yyyy-MM-dd HH:mm:ss";
    if (time) {
        return new java.text.SimpleDateFormat(rule).format(new Date(time));
    } else {
        return new java.text.SimpleDateFormat(rule).format(new Date());
    }
}

/**
 * 读取全局配置项
 * @param {string} key - 配置项的键名
 * @param {*} defaultValue - 配置项的默认值
 * @returns {*} - 返回配置项的值，如果不存在则返回默认值
 */
function readGlobalConfig(key, defaultValue) {
    let res = globalConfig.get(key, defaultValue);
    if (res == null) {
        return defaultValue;
    } else {
        return res;
    }
}

/**
 * 设置全局配置项
 * @param {string} key - 配置项的键名
 * @param {*} val - 配置项的值
 * @returns {number} - 返回0表示设置成功(总是成功?)
 */
function setGlobalConfig(key, val) {
    globalConfig.put(key, val);
    return 0;
}

/**
 * 初始化指定乐谱的配置
 * @param {string} name - 配置名
 */
function initFileConfig(name) {
    console.info("初始化乐谱:" + name);
    let cfg = {};
    cfg.majorPitchOffset = 0;
    cfg.minorPitchOffset = 0;
    cfg.treatHalfAsCeiling = false;
    musicInit.put(name + "init", JSON.stringify(cfg));
}

/**
 * 读取指定乐谱的配置项
 * @param {string} key - 配置项的键名
 * @param {string} musicName - 乐谱名
 * @param {*} [defaultValue] - 配置项的默认值
 * @returns {*} - 返回配置项的值，如果不存在则返回默认值
 */
function readFileConfig(key, musicName, defaultValue) {
    // musicName += "init";
    let MusicInitData = musicInit.get(musicName + "init");
    if (!MusicInitData || MusicInitData == undefined) {
        initFileConfig(musicName);
    }
    MusicInitData = musicInit.get(musicName + "init");
    let tmp = MusicInitData;
    // tmp = JSON.parse(tmp);
    console.verbose("读取配置信息: " + JSON.stringify(tmp));
    if (tmp[key] == null) {
        return defaultValue;
    } else {
        return tmp[key];
    }
}

/**
     * 读取指定文件在指定目标(游戏-键位-乐器)的配置项, 如果不存在则返回公共配置, 如果公共配置也不存在则返回默认值
     * @param {string} key - 配置项的键名
     * @param {string} filename - 曲谱名
     * @param {import("./gameProfile")} gameProfile - 游戏配置
     * @param {*} [defaultValue] - 配置项的默认值
     * @returns {*} - 返回配置项的值，如果不存在则返回默认值
     */
function readFileConfigForTarget(key, filename, gameProfile, defaultValue) {
    const newKey = `${gameProfile.getProfileIdentifierTriple()}.${key}`;
    const res1 = readFileConfig(newKey, filename, undefined);
    if (res1 != undefined) {
        return res1;
    }
    const res2 = readFileConfig(key, filename, undefined);
    if (res2 != undefined) {
        return res2;
    }
    return defaultValue;
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

//humanify.js --- 为乐曲加入扰动, 让它听起来更像人弹的
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

function parseFile(filePath, musicdata) {
    switch (filePath.music_type) {
        case "tonejsjson":
            return new ToneJsJSONParser().parseFile(filePath);
        case "mid":
            return new MidiParser().parseFile(filePath);
        case "domiso":
            return new DoMiSoTextParser().parseFile(filePath, undefined);
        case "txt":
            return SkyStudioJSONParser(musicdata);
        default:
            throw new Error("不支持的文件格式");
    }
}

/**
 * @brief 什么都不做的pass, 把输入原样输出, 也不会产生任何统计数据
 * @param {Object} config
 */
function NopPass(config) {
    this.name = "NopPass";
    this.description = "空操作";
    /**
     * 运行此pass
     * @template T
     * @param {T} input - 输入数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {T} - 返回原样的输入数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (input, progressCallback) {
        return input;
    }
    this.getStatistics = function () {
        return {};
    };
}

/**
 * @brief 解析音乐文件, 输出音乐数据
 * @param {Object} config
 */
function ParseSourceFilePass(config) {
    this.name = "ParseSourceFilePass";
    this.description = "解析源文件";
    /**
     * 运行此pass
     * @param {string} sourceFilePath - 源文件路径
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {MusicFormats.TracksData} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (sourceFilePath, progressCallback, musicdata) {
        let tracksData = parseFile(sourceFilePath, musicdata);
        return tracksData;
    };

    this.getStatistics = function () {
        return {};
    };
}

/**
 * @brief 合并指定的音轨中所有音符到一个音符数组中
 * @typedef {Object} MergeTracksPassConfig
 * @property {number[]} selectedTracks - 要合并的音轨序号数组
 * @param {MergeTracksPassConfig} config
 */
function MergeTracksPass(config) {
    this.name = "MergeTracksPass";
    this.description = "合并音轨";

    let selectedTracks = [];

    if (config.selectedTracks == null) {
        throw new Error("selectedTracks is null");
    }
    selectedTracks = config.selectedTracks;

    /**
     * 运行此pass
     * @param {MusicFormats.TracksData} tracksData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {MusicFormats.Note[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (tracksData, progressCallback) {
        let noteData = [];
        for (let i = 0; i < selectedTracks.length; i++) {
            let sel = selectedTracks[i];
            let track = tracksData[sel];
            noteData = noteData.concat(track.notes);
        }
        noteData.sort(function (a, b) {
            return a[1] - b[1];
        });
        return noteData;
    };
    this.getStatistics = function () {
        return {};
    };
}

/**
 * @brief 将输入的音符数据的时间添加一个随机偏移, 以模拟手工输入
 * @typedef {Object} HumanifyPassConfig
 * @property {number} noteAbsTimeStdDev - 音符时间的标准差(毫秒)
 * @param {HumanifyPassConfig} config
 */
function HumanifyPass(config) {
    this.name = "HumanifyPass";
    this.description = "伪装手工输入";

    let noteAbsTimeStdDev = 0;

    if (config.noteAbsTimeStdDev == null) {
        throw new Error("noteAbsTimeStdDev is null");
    }
    noteAbsTimeStdDev = config.noteAbsTimeStdDev;
    /**
     * 运行此pass
     * @param {MusicFormats.Note[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {MusicFormats.Note[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteData, progressCallback) {
        let humanifyer = new Humanify();
        humanifyer.setNoteAbsTimeStdDev(noteAbsTimeStdDev);
        noteData = humanifyer.humanify(noteData);
        return noteData;
    };
    this.getStatistics = function () {
        return {};
    };
}

/**
 * @brief 将音符数组转换为对应游戏的按键数组
 * @typedef {Object} NoteToKeyPassConfig
 * @property {number} majorPitchOffset - 音符的八度偏移量
 * @property {number} minorPitchOffset - 音符的半音偏移量
 * @property {boolean} treatHalfAsCeiling - 是否将半音视为最接近的全音中更高的那个, 如果为false则视为更低的那个
 * @property {GameProfile} currentGameProfile - 当前游戏配置
 * @param {NoteToKeyPassConfig} config
 */
function NoteToKeyPass(config) {
    this.name = "NoteToKeyPass";
    this.description = "将音符转换为按键";

    let majorPitchOffset = 0;
    let minorPitchOffset = 0;
    let treatHalfAsCeiling = false;
    let currentGameProfile = null;

    let underFlowedNoteCnt = 0;
    let overFlowedNoteCnt = 0;
    let roundedNoteCnt = 0;
    let middleFailedNoteCnt = 0;

    if (config.majorPitchOffset == null) {
        throw new Error("majorPitchOffset is null");
    }
    if (config.minorPitchOffset == null) {
        throw new Error("minorPitchOffset is null");
    }
    if (config.treatHalfAsCeiling == null) {
        throw new Error("treatHalfAsCeiling is null");
    }
    if (config.currentGameProfile == null) {
        throw new Error("currentGameProfile is null");
    }
    majorPitchOffset = config.majorPitchOffset;
    minorPitchOffset = config.minorPitchOffset;
    treatHalfAsCeiling = config.treatHalfAsCeiling;
    currentGameProfile = config.currentGameProfile;

    /**
     * @param {Number} midiPitch
     * @abstract 将midi音高转换为按键编号(从1开始)
     * @return {Number} 按键序号(从1开始)或-1
     */
    function midiPitch2key(midiPitch) {
        midiPitch += majorPitchOffset * 12;
        midiPitch += minorPitchOffset;
        let key = currentGameProfile.getKeyByPitch(midiPitch);
        if (key == -1) {
            let noteRange = currentGameProfile.getNoteRange();
            if (midiPitch < noteRange[0]) {
                underFlowedNoteCnt++;
                return -1;
            }
            if (midiPitch > noteRange[1]) {
                overFlowedNoteCnt++;
                return -1;
            }
            if (treatHalfAsCeiling) {
                key = currentGameProfile.getKeyByPitch(midiPitch + 1);
            } else {
                key = currentGameProfile.getKeyByPitch(midiPitch - 1);
            }
            if (key == -1) {
                return -1;
            }
            roundedNoteCnt++;
        }
        return key;
    }

    /**
     * 运行此pass
     * @param {MusicFormats.Note[]} noteList - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {Array<[key: number, time: number]>} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteList, progressCallback) {
        let keyList = [];
        for (let i = 0; i < noteList.length; i++) {
            let key = midiPitch2key(noteList[i][0]);
            if (key == -1) {
                continue;
            }
            keyList.push([key, noteList[i][1], noteList[i][2]]);
            if (progressCallback != null && i % 10 == 0) {
                progressCallback(100 * i / noteList.length);
            }
        }
        // @ts-ignore
        return keyList;
    };
    this.getStatistics = function () {
        return {
            underFlowedNoteCnt: underFlowedNoteCnt,
            overFlowedNoteCnt: overFlowedNoteCnt,
            roundedNoteCnt: roundedNoteCnt,
            middleFailedNoteCnt: middleFailedNoteCnt,
        };
    };
}

/**
 * @brief 限制同一按键的最高频率
 * @typedef {Object} SingleKeyFrequencyLimitPassConfig
 * @property {number} minInterval - 最小间隔(毫秒)
 * @param {SingleKeyFrequencyLimitPassConfig} config
 */
function SingleKeyFrequencyLimitPass(config) {
    this.name = "SingleKeyFrequencyLimitPass";
    this.description = "限制单个按键频率";

    let minInterval = 0; // 毫秒

    let droppedNoteCnt = 0;

    if (config.minInterval == null) {
        throw new Error("minInterval is null");
    }
    minInterval = config.minInterval;
    /**
     * 运行此pass
     * @param {Array<[key: number, time: number]>} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {Array<[key: number, time: number]>} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteData, progressCallback) {
        const sameNoteGapMin = minInterval;
        for (let i = 0; i < noteData.length; i++) {
            let note = noteData[i];
            let j = i + 1;
            while (j < noteData.length) {
                let nextNote = noteData[j];
                if (note[0] === -1) {
                    j++;
                    continue;
                }
                if (note[0] === nextNote[0]) {
                    if (nextNote[1] - note[1] < sameNoteGapMin) {
                        noteData.splice(j, 1);
                        droppedNoteCnt++;
                    }
                }
                if (nextNote[1] - note[1] > sameNoteGapMin) {
                    break;
                }
                j++;
            }
            if (progressCallback != null && i % 10 == 0) {
                progressCallback((100 * i) / noteData.length);
            }
        }
        return noteData;
    };
    this.getStatistics = function () {
        return {
            droppedNoteCnt: droppedNoteCnt,
        };
    };
}

/**
 * @brief 合并相同时间按下的按键
 * @typedef {Object} MergeKeyPassConfig
 * @property {number} maxInterval - 最大间隔(毫秒)
 * @property {number} [maxBatchSize] - 最大合并数量, 默认为10
 * @param {MergeKeyPassConfig} config
 */
function MergeKeyPass(config) {
    this.name = "MergeKeyPass";
    this.description = "合并相邻的按键";

    let maxInterval = 0; // 毫秒
    let maxBatchSize = 10; // 最大合并数量

    if (config.maxInterval == null) {
        throw new Error("maxInterval is null");
    }
    maxInterval = config.maxInterval;
    if (config.maxBatchSize != null) {
        maxBatchSize = config.maxBatchSize;
    }

    /**
     * 运行此pass
     * @param {noteUtils.NoteLike[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.NoteLike[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteData, progressCallback) {
        let lastTime = noteData[0][1];
        let lastSize = 0;
        let lastNotes = new Array(maxBatchSize);
        for (let i = 1; i < noteData.length; i++) {
            let note = noteData[i];
            if (note[1] - lastTime < maxInterval && lastSize < maxBatchSize) {
                note[1] = lastTime;
                //检查重复
                if (lastNotes.indexOf(note[0]) != -1) {
                    noteUtils.softDeleteNoteAt(noteData, i);
                    continue;
                }
                lastNotes.push(note[0]);
                lastSize++;
            } else {
                lastNotes = new Array(maxBatchSize);
                lastSize = 0;
                lastTime = note[1];
            }
        }
        noteUtils.applyChanges(noteData);
        return noteData;
    }

    this.getStatistics = function () {
        return {};
    }
}

/**
 * @brief 将按键列表转换为手势列表
 * @typedef {Object} KeyToGesturePassConfig
 * @property {GameProfile.NoteDurationImplementionType} [durationMode] - 按键时长模式, 默认为"none"
 * @property {number} [pressDuration] - 默认的按键持续时间(毫秒), 仅在durationMode为"none"时有效, 默认为5
 * @property {number} [maxGestureDuration] - 最大手势持续时间(毫秒)
 * @property {number} [maxGestureSize] - 最大手势长度
 * @property {number} [marginDuration] - 手势间隔时间(毫秒), 仅在durationMode为"native"时有效, 默认为100
 * @property {GameProfile} currentGameProfile - 当前游戏配置
 * @param {KeyToGesturePassConfig} config
 */
function KeyToGesturePass(config) {
    this.name = "KeyToGesturePass";
    this.description = "将按键列表转换为手势列表";

    let pressDuration = 5; // 毫秒
    let durationMode = "none";
    let maxGestureDuration = 10000; // 毫秒
    let maxGestureSize = 19;
    let marginDuration = 100; // 毫秒
    let currentGameProfile = null;


    if (config.currentGameProfile == null) {
        throw new Error("currentGameProfile is null");
    }

    currentGameProfile = config.currentGameProfile;
    if (config.pressDuration != null)
        pressDuration = config.pressDuration;
    if (config.durationMode != null)
        durationMode = config.durationMode;
    if (config.maxGestureDuration != null)
        maxGestureDuration = config.maxGestureDuration;
    if (config.maxGestureSize != null)
        maxGestureSize = config.maxGestureSize;
    if (config.marginDuration != null)
        marginDuration = config.marginDuration;

    //统计数据
    let directlyTruncatedNoteCnt = 0;
    let groupTruncatedNoteCnt = 0;
    let sameKeyTruncatedNoteCnt = 0;
    let removedShortNoteCnt = 0;


    /**
     * 运行此pass
     * @param {noteUtils.Key[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {import("./players.js").Gestures} - 返回解析后的数据
     */
    this.run = function (noteData, progressCallback) {
        let haveDurationProperty = noteData[0][2] != null && noteData[0][2]["duration"] != null;
        let gestureTimeList = new Array();
        console.log(`durationMode: ${durationMode}`);
        if (durationMode == "none" || !haveDurationProperty) {
            let it = noteUtils.chordIterator(noteData);
            for (let keys of it) {
                let time = keys[0][1];
                let gestureArray = new Array();
                keys.forEach((key) => {
                    const keyIndex = key[0]
                    const clickPos = currentGameProfile.getKeyPosition(keyIndex);
                    if (clickPos == null) {
                        console.log(`按键 ${keyIndex} 超出范围，被丢弃`);
                        return;
                    }
                    gestureArray.push([0, pressDuration, clickPos.slice()]);
                });
                if (gestureArray.length > 0)
                    gestureTimeList.push([gestureArray, time / 1000]);
            };
        } else if (durationMode == "native") {
            // 这组按键的结束时间
            let currentGroupEndTime = 0;
            // 这组按键的开始时间
            let currentGroupStartTime = 0;

            // 这组按键的按键列表
            /** @type {Array<[keyIndex:number, startTime:number, endTime:number]>} */
            let currentGroupKeys = new Array();
            // 组列表
            let groupList = new Array();
            for (let key of noteData) {
                // console.log(`key: ${JSON.stringify(key)}`);
                let thisStartTime = key[1];
                //@ts-ignore
                let thisDuration = key[2]["duration"];
                let thisEndTime = thisStartTime + thisDuration;
                //截断超过最大手势长度的部分
                if (thisEndTime - currentGroupStartTime > maxGestureDuration) {
                    thisEndTime = currentGroupStartTime + maxGestureDuration;
                    directlyTruncatedNoteCnt++;
                }
                //这是这组按键的第一个按键
                if (currentGroupKeys.length == 0) {
                    currentGroupStartTime = thisStartTime;
                    currentGroupEndTime = thisEndTime;
                    currentGroupKeys.push([key[0], thisStartTime, thisEndTime]);
                    continue;
                }
                //检查是否要开始新的一组
                //这个按键的开始时间大于这组按键的结束时间, 或当前组按键数量已经达到最大值
                //则开始新的一组
                if (thisStartTime > currentGroupEndTime ||
                    currentGroupKeys.length >= maxGestureSize) {
                    // console.log(`start: ${currentGroupStartTime}ms, end: ${currentGroupEndTime}ms, current: ${thisStartTime}ms, duration: ${currentGroupEndTime - currentGroupStartTime}ms`);
                    //截断所有的音符结束时间到当前音符开始时间 TODO: 这不是最优解
                    for (let i = 0; i < currentGroupKeys.length; i++) {
                        let key = currentGroupKeys[i];
                        if (key[2] > thisStartTime) {
                            groupTruncatedNoteCnt++;
                            key[2] = thisStartTime;
                        }
                    }
                    //避免首尾相连
                    for (let i = 0; i < currentGroupKeys.length; i++) {
                        let key = currentGroupKeys[i];
                        if (Math.abs(key[2] - thisStartTime) < marginDuration) {
                            key[2] = thisStartTime - marginDuration;
                        }
                    }
                    groupList.push(currentGroupKeys);
                    currentGroupKeys = new Array();
                }
                //这是这组按键的第一个按键
                if (currentGroupKeys.length == 0) {
                    currentGroupStartTime = thisStartTime;
                    currentGroupEndTime = thisEndTime;
                    currentGroupKeys.push([key[0], thisStartTime, thisEndTime]);
                    continue;
                }
                //检查是否与相同的按键重叠
                let overlappedSamekeyIndex = currentGroupKeys.findIndex((e) => {
                    return e[0] == key[0] && e[2] > thisStartTime;
                });
                if (overlappedSamekeyIndex != -1) {
                    //把重叠的按键截断
                    let overlappedSamekey = currentGroupKeys[overlappedSamekeyIndex];
                    overlappedSamekey[2] = thisStartTime - marginDuration;
                    sameKeyTruncatedNoteCnt++;
                }
                //检测是否存在头尾相连的问题(一个按键的尾部正好与另一个按键的头部相连, 会导致systemUi崩溃!)
                for (let i = 0; i < currentGroupKeys.length; i++) {
                    let key = currentGroupKeys[i];
                    if (Math.abs(key[2] - thisStartTime) < marginDuration) {
                        key[2] = thisStartTime - marginDuration;
                    }
                }
                //添加这个按键
                currentGroupKeys.push([key[0], thisStartTime, thisEndTime]);
            }
            if (currentGroupKeys.length > 0) groupList.push(currentGroupKeys);
            //转换为手势
            for (let group of groupList) {
                /** @type {Array <[delay: number, duration: number, pos: [x: number,y: number]]>} */
                let gestureArray = new Array();
                let groupStartTime = group[0][1];
                for (let key of group) {
                    let delay = key[1] - groupStartTime;
                    let duration = key[2] - key[1];
                    if (duration < pressDuration) {
                        removedShortNoteCnt++;
                        continue; //忽略持续时间过短的按键
                    }
                    let clickPos = currentGameProfile.getKeyPosition(key[0]);
                    if (clickPos == null) {
                        console.log(`按键 ${key[0]} 超出范围，被丢弃`);
                        continue;
                    }
                    gestureArray.push([delay, duration, clickPos.slice()]);
                }
                if (gestureArray.length > 0)
                    gestureTimeList.push([gestureArray, groupStartTime / 1000]);
            }
        }
        return gestureTimeList;
    }

    this.getStatistics = function () {
        return {
            "directlyTruncatedNoteCnt": directlyTruncatedNoteCnt,
            "groupTruncatedNoteCnt": groupTruncatedNoteCnt,
            "sameKeyTruncatedNoteCnt": sameKeyTruncatedNoteCnt,
            "removedShortNoteCnt": removedShortNoteCnt
        };
    }
}

/**
 * @brief 限制过长的空白部分的长度，删除过长的空白部分
 * @typedef {Object} LimitBlankDurationPassConfig
 * @property {number} [maxBlankDuration] - 最大空白时间(毫秒), 默认为5000
 * @param {LimitBlankDurationPassConfig} config
 */
function LimitBlankDurationPass(config) {
    this.name = "LimitBlankDurationPass";
    this.description = "限制过长的空白部分的长度";

    let maxBlankDuration = 5000; // 毫秒

    if (config.maxBlankDuration != null) {
        maxBlankDuration = config.maxBlankDuration;
    }
    /**
     * 运行此pass
     * @param {noteUtils.NoteLike[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.NoteLike[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteData, progressCallback) {
        noteData = noteUtils.toRelativeTime(noteData);
        for (let i = 0; i < noteData.length; i++) {
            if (noteData[i][1] > maxBlankDuration)
                noteData[i][1] = maxBlankDuration;
        }
        noteData = noteUtils.toAbsoluteTime(noteData);
        return noteData;
    }

    this.getStatistics = function () {
        return {};
    }
}

/**
 * @brief 跳过前奏的空白部分
 * @typedef {Object} SkipIntroPassConfig
 * @param {SkipIntroPassConfig} config
 */
function SkipIntroPass(config) {
    this.name = "SkipIntroPass";
    this.description = "跳过前奏的空白部分";

    const maxIntroTime = 2000; // 毫秒

    /**
     * 运行此pass
     * @template T
     * @param {noteUtils.NoteLike[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.NoteLike[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteData, progressCallback) {
        let introTime = noteData[0][1];
        if (introTime < maxIntroTime) return noteData;
        let deltaTime = introTime - maxIntroTime;
        for (let i = 0; i < noteData.length; i++) {
            noteData[i][1] -= deltaTime;
        }
        return noteData;
    }

    this.getStatistics = function () {
        return {};
    }
}

/**
 * @brief 限制音符频率，延迟过快的音符
 * @typedef {Object} NoteFrequencySoftLimitPassConfig
 * @property {number} [minInterval] - 最小间隔(毫秒), 默认为150
 * @param {NoteFrequencySoftLimitPassConfig} config
 */
function NoteFrequencySoftLimitPass(config) {
    this.name = "NoteFrequencySoftLimitPass";
    this.description = "限制音符频率";

    let minInterval = 150; // 毫秒

    if (config.minInterval != null) {
        minInterval = config.minInterval;
    }

    function saturationMap(freq) {
        return (1000 / minInterval) * Math.tanh(freq / (1000 / minInterval));
    }

    /**
     * 运行此pass
     * @param {noteUtils.NoteLike[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.NoteLike[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteData, progressCallback) {
        let freqs = new Array();
        for (let i = 0; i < noteData.length - 1; i++) {
            let deltaTime = noteData[i + 1][1] - noteData[i][1];
            freqs.push(1000 / deltaTime);
        }
        for (let i = 0; i < freqs.length; i++) {
            freqs[i] = saturationMap(freqs[i]);
        }
        for (let i = 0; i < noteData.length - 1; i++) {
            let deltaTime = 1000 / freqs[i];
            noteData[i + 1][1] = noteData[i][1] + deltaTime;
        }
        return noteData;
    }

    this.getStatistics = function () {
        return {};
    }
}

/**
 * @brief 变速
 * @typedef {Object} SpeedChangePassConfig
 * @property {number} speed - 变速倍率
 * @param {SpeedChangePassConfig} config
 */
function SpeedChangePass(config) {
    this.name = "SpeedChangePass";
    this.description = "变速";

    let speed = 1;

    if (config.speed == null) {
        throw new Error("speed is null");
    }
    speed = config.speed;

    /**
     * 运行此pass
     * @param {noteUtils.NoteLike[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.NoteLike[]} - 返回处理后的数据
     */
    this.run = function (noteData, progressCallback) {
        for (let i = 0; i < noteData.length; i++) {
            noteData[i][1] /= speed;
        }
        return noteData;
    }

    this.getStatistics = function () {
        return {};
    }
}

/**
 * @brief 限制同一时刻按下的按键数量
 * @typedef {Object} ChordNoteCountLimitPassConfig
 * @property {number} [maxNoteCount] - 最大音符个数, 默认为9
 * @property {string} [limitMode] - 限制模式, 可选值为"delete"(删除多余的音符)或"split"(拆分成多组), 默认为"delete"
 * @property {number} [splitDelay] - 拆分后音符的延迟(毫秒), 仅在limitMode为"split"时有效, 默认为5
 * @property {string} [selectMode] - 选择保留哪些音符, 可选值为"high"(音高最高的)/"low"(音高最低的)/"random"(随机选择), 默认为“high"
 * @property {number} [randomSeed] - 随机种子, 默认为74751
 * @param {ChordNoteCountLimitPassConfig} config
 */
function ChordNoteCountLimitPass(config) {
    this.name = "ChordNoteCountLimitPass";
    this.description = "限制同一时刻按下的按键数量";

    let maxNoteCount = 9;
    let limitMode = "delete";
    let splitDelay = 5;
    let selectMode = "high";
    let randomSeed = 74751;

    if (config.maxNoteCount != null) {
        maxNoteCount = config.maxNoteCount;
    }
    if (config.limitMode != null) {
        limitMode = config.limitMode;
    }
    if (config.splitDelay != null) {
        splitDelay = config.splitDelay;
    }
    if (config.selectMode != null) {
        selectMode = config.selectMode;
    }
    if (config.randomSeed != null) {
        randomSeed = config.randomSeed;
    }

    /**
     * 运行此pass
     * @param {noteUtils.NoteLike[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.NoteLike[]} - 返回处理后的数据
     */
    this.run = function (noteData, progressCallback) {
        const algorithms = new Algorithms();
        const prng = algorithms.PRNG(randomSeed);
        const totalLength = noteData.length;
        let i = 0;
        while (true) {
            let ni = noteUtils.nextChordStart(noteData, i);
            if (ni == noteData.length) break;
            let chord = noteData.subarray(i, ni - 1);
            if (chord.length > maxNoteCount) {
                switch (selectMode) {
                    case "high": //从高到低排序
                        chord.sort((a, b) => b[0] - a[0]);
                        break;
                    case "low": //
                        chord.sort((a, b) => a[0] - b[0]);
                        break;
                    case "random":
                        chord = algorithms.shuffle(chord, prng);
                        break;
                }

                for (let j = maxNoteCount; j < chord.length; j++) {
                    if (limitMode == "delete") {
                        noteUtils.softDeleteNoteAt(noteData, i + j);
                    } else if (limitMode == "split") {
                        noteUtils.softChangeNoteTime(chord[j], chord[j][1] + splitDelay * (j - maxNoteCount + 1));
                    }
                }
            }
            i = ni;
        }
        noteUtils.applyChanges(noteData);
        noteData.sort((a, b) => a[1] - b[1]);
        return noteData;
    }
    this.getStatistics = function () {
        return {};
    }
}

function Passes() {
    this.passes = new Array();
    this.passes.push(NopPass);
    this.passes.push(ParseSourceFilePass);
    this.passes.push(MergeTracksPass);
    this.passes.push(HumanifyPass);
    this.passes.push(NoteToKeyPass);
    this.passes.push(SingleKeyFrequencyLimitPass);
    this.passes.push(MergeKeyPass);
    this.passes.push(KeyToGesturePass);
    this.passes.push(LimitBlankDurationPass);
    this.passes.push(SkipIntroPass);
    this.passes.push(NoteFrequencySoftLimitPass);
    this.passes.push(SpeedChangePass);
    this.passes.push(ChordNoteCountLimitPass);

    this.getPassByName = function (name) {
        for (let i = 0; i < this.passes.length; i++) {
            if (this.passes[i].name === name) {
                return this.passes[i];
            }
        }
        return null;
    };
}

function PassManager() {
    this.passConfigs = [];
    const passes = new Passes();

    this.addPass = function (name, config, progressCallback, finishCallback) {
        let pass = passes.getPassByName(name);
        log(pass)
        if (pass == null) {
            throw new Error("不存在的pass: " + name);
        }
        if (config == null) {
            config = {};
        }
        if (progressCallback == null) {
            progressCallback = function (progress) { };
        }
        if (finishCallback == null) {
            finishCallback = function (result, statistics, timeElapsed) { };
        }
        this.passConfigs.push({
            class: pass,
            config: config,
            progressCallback: progressCallback,
            finishCallback: finishCallback,
        });
        return this;
    };

    this.run = function (input) {
        let output = input;
        for (let passConfig of this.passConfigs) {
            let pass = new passConfig.class(passConfig.config);
            let startTime = new Date().getTime();
            output = pass.run(output, passConfig.progressCallback);
            let endTime = new Date().getTime();
            passConfig.finishCallback(output, pass.getStatistics(), endTime - startTime);
        }
        return output;
    }

    this.reset = function () {
        this.passConfigs = [];
    };

    this.hashCode = function () {
        let hashCode = 0;
        for (let passConfig of this.passConfigs) {
            hashCode += stringHashCode(passConfig.class.name);
            hashCode += stringHashCode(JSON.stringify(passConfig.config));
            hashCode = hashCode % 2147483647;
        }
        return hashCode;
    }

    function stringHashCode(str) {
        let hash = 0;
        if (str.length == 0) return hash;
        for (let i = 0; i < str.length; i++) {
            let char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }
}

/**
 * @brief 获取数组的子数组(引用)
 */
Object.defineProperty(Array.prototype, 'subarray', {
    value: function (/** @type {number} */ i, /** @type {number} */ j) {
        var self = this, arr = [];
        for (var n = 0; i <= j; i++, n++) {
            (function (i) {
                Object.defineProperty(arr, n, {       //Array is an Object
                    get: function () {
                        return self[i];
                    },
                    set: function (value) {
                        self[i] = value;
                        return value;
                    }
                });
            })(i);
        }
        return arr;
    },
    writable: true,
    configurable: true
});

function NoteUtils() {
    /**
     * @brief 将绝对时间的音符数据转换为相对时间的音符数据(每个音符的时间代表与上一个音符的时间差)
     * @param {Array<NoteLike>} noteData - 音乐数据(会被修改)
     * @returns {Array<NoteLike>} - 返回相对时间的音符数据
     */
    this.toRelativeTime = function (noteData) {
        let lastTime = 0;
        for (let i = 0; i < noteData.length; i++) {
            let newTime = noteData[i][1] - lastTime;
            lastTime = noteData[i][1];
            noteData[i][1] = newTime;
        }
        return noteData;
    }

    /**
     * @brief 将相对时间的音符数据转换为绝对时间的音符数据
     * @param {Array<NoteLike>} noteData - 音乐数据(会被修改)
     * @returns {Array<NoteLike>} - 返回绝对时间的音符数据
     */
    this.toAbsoluteTime = function (noteData) {
        let curTime = 0;
        for (let i = 0; i < noteData.length; i++) {
            let newTime = noteData[i][1] + curTime;
            curTime = newTime;
            noteData[i][1] = newTime;
        }
        return noteData;
    }

    /**
     * @brief 删除指定位置的音符
     * @param {Array<NoteLike>} noteData - 音乐数据(会被修改)
     * @param {number} index - 要删除的音符的位置
     * @returns {Array<NoteLike>} - 返回删除后的音符数据
     */
    this.deleteNoteAt = function (noteData, index) {
        noteData.splice(index, 1);
        return noteData;
    }

    /**
     * @brief "软"删除指定位置的音符, 不改变数组长度
     * @param {Array<NoteLike>} noteData - 音乐数据(会被修改)
     * @param {number} index - 要删除的音符的位置
     * @returns {Array<NoteLike>} - 返回删除后的音符数据
     */
    this.softDeleteNoteAt = function (noteData, index) {
        if (noteData[index][2] == undefined) {
            noteData[index][2] = {};
        }
        //@ts-ignore
        noteData[index][2]["deleted"] = true;
        return noteData;
    }

    /**
     * @brief "软"删除指定音符
     * @param {NoteLike} note - 要删除的音符
     */
    this.softDeleteNote = function (note) {
        if (note[2] == undefined) {
            note[2] = {};
        }
        //@ts-ignore
        note[2]["deleted"] = true;
    }

    /**
     * @brief "软"更改指定位置的音符的时间
     * @param {Array<NoteLike>} noteData - 音乐数据(会被修改)
     * @param {number} index - 要更改的音符的位置
     * @param {number} time - 新的时间
     * @returns {Array<NoteLike>} - 返回更改后的音符数据
     */
    this.softChangeNoteTimeAt = function (noteData, index, time) {
        if (noteData[index][2] == undefined) {
            noteData[index][2] = {};
        }
        //@ts-ignore
        noteData[index][2]["newTime"] = time;
        return noteData;
    }

    /**
     * @brief "软"更改指定音符的时间
     * @param {NoteLike} note - 要更改的音符
     * @param {number} time - 新的时间
     */
    this.softChangeNoteTime = function (note, time) {
        if (note[2] == undefined) {
            note[2] = {};
        }
        //@ts-ignore
        note[2]["newTime"] = time;
    }

    /**
     * @brief 使更改生效
     * @param {Array<NoteLike>} noteData - 音乐数据(会被修改)
     * @returns {Array<NoteLike>} - 返回删除后的音符数据
     */
    this.applyChanges = function (noteData) {
        for (let i = 0; i < noteData.length; i++) {
            //@ts-ignore
            if (noteData[i][2]["deleted"] == true) {
                noteData.splice(i, 1);
                i--;
            }
            //@ts-ignore
            else if (noteData[i][2]["newTime"] != undefined) {
                //@ts-ignore
                noteData[i][1] = noteData[i][2]["newTime"];
                //@ts-ignore
                delete noteData[i][2]["newTime"];
            }
        }
        noteData.sort((a, b) => {
            return a[1] - b[1];
        });
        return noteData;
    }

    /**
     * @brief 获取下一组音符的开始位置
     * @param {Array<NoteLike>} noteData - 音乐数据
     * @param {number} index - 当前音符的位置
     * @returns {number} - 返回下一组音符的开始位置
     */
    this.nextChordStart = function (noteData, index) {
        const eps = 1; // 1ms
        let curTime = noteData[index][1];
        let nextTime = curTime + eps;
        while (index < noteData.length && noteData[index][1] < nextTime) {
            index++;
        }
        return index;
    }

    /**
     * @brief 音符组迭代器
     * @param {Array<NoteLike>} noteData - 音乐数据
     * @returns {IterableIterator<Array<NoteLike>>} - 返回音符组迭代器
     */
    this.chordIterator = function* (noteData) {
        let index = 0;
        while (index < noteData.length) {
            let nextIndex = this.nextChordStart(noteData, index);
            yield noteData.subarray(index, nextIndex - 1);
            index = nextIndex;
        }
    }

    /**
     * @brief 将分散的音符组合并为连续的音符
     * @param {Array<NoteLike>} noteData - 音乐数据
     * @returns {Array<PackedNoteLike>} - 返回合并后的音符数据
     */
    this.packNotes = function (noteData) {
        let packedNoteData = [];
        let it = this.chordIterator(noteData);
        for (let keys of it) {
            let time = keys[0][1];
            let keyArray = new Array();
            let attributes = new Array();
            keys.forEach((key) => {
                keyArray.push(key[0]);
                attributes.push(key[2]);
            });
            packedNoteData.push([keyArray, time, attributes]);
        }
        //@ts-ignore
        return packedNoteData;
    }
}

/**
 * @brief 解析SkyStudio乐谱
 * @param {string} musicdata 乐谱内容
 * @returns {import("./musicFormats").TracksData} 音乐数据
 */
function SkyStudioJSONParser(musicdata) {
    //左上角为key0,右下角为key15,音高从C4到C6
    this.skyKey2Midi = [
        48, 50, 52, 53, 55,
        57, 59, 60, 62, 64,
        65, 67, 69, 71, 72,
    ];
    jsonData = JSON.parse(musicdata);
    jsonData = jsonData[0];
    if (jsonData.isEncrypted) {
        throw new Error("文件已加密，无法解析！");
    }

    let name = jsonData.name;
    let author = jsonData.author;
    let transcribedBy = jsonData.transcribedBy;
    let isComposed = jsonData.isComposed;
    let bpm = jsonData.bpm;
    let metaDataText = "乐曲名称: " + name + "\n" + "作者: " + author + "\n" + "转谱人: " + transcribedBy + "\n" + "isComposed: " + isComposed + "\n" + "BPM: " + bpm;
    let notes = jsonData.songNotes;
    /** @type {import("./musicFormats").Note[]} */
    let ret = [];
    for (let i = 0; i < notes.length; i++) {
        let n = notes[i];
        let key = parseInt(n.key.split("y")[1]); //"key"
        let pitch = this.skyKey2Midi[key];
        ret.push([pitch, n.time, {}]);
    }
    return {
        "haveMultipleTrack": false,
        "trackCount": 1,
        "durationType": "none",
        "tracks": [
            {
                "name": name,
                "channel": 0,
                "instrumentId": 0,
                "trackIndex": 0,
                "noteCount": ret.length,
                "notes": ret
            }
        ],
        "metadata": [
            {
                "name": "SkyStudio乐曲信息",
                "value": metaDataText
            }
        ]
    }
}

(function initialize() {
    //globalConfig.put("inited", 0);
    if (readGlobalConfig("lastVersion", 0) != 25) {
        //第一次启动，初始化设置
        // console.log("初始化设置..");
        if (readGlobalConfig("skipInit", -1) == -1)
            setGlobalConfig("skipInit", true);
        if (readGlobalConfig("skipBlank5s", -1) == -1)
            setGlobalConfig("skipBlank5s", false);
        if (readGlobalConfig("waitForGame", -1) == -1)
            setGlobalConfig("waitForGame", true);
        if (readGlobalConfig("FeedbackFloatingWindow", -1) == -1)
            setGlobalConfig("FeedbackFloatingWindow", false);
        // setGlobalConfig("userGameProfile", null);
    }
})();

//加载配置文件
(function loadConfiguration() {
    try {
        //启动无障碍服务
        console.verbose("等待无障碍服务..");
        //toast("请允许本应用的无障碍权限");
        auto.waitFor();
        console.verbose("无障碍服务已启动");
        //TODO: 自定义配置
        let userGameProfile = readGlobalConfig("userGameProfile", null);
        if (userGameProfile != null) {
            gameProfile.loadGameConfigs(userGameProfile);
        } else {
            gameProfile.loadDefaultGameConfigs();
        }
        let lastConfigName = readGlobalConfig("lastConfigName", "");
        //尝试加载用户设置的游戏配置
        let activeConfigName = readGlobalConfig("activeConfigName", null);
        let res = gameProfile.setConfigByName(activeConfigName);
        if (res == false) {
            console.log("尝试加载用户设置的游戏配置...失败!");
        } else {
            console.log(
                "尝试加载用户设置的游戏配置...成功, 当前配置: " +
                gameProfile.getCurrentConfigTypeName()
            );
        }

        if (gameProfile.getCurrentConfig() == null) {
            console.error("未找到合适配置, 已加载默认配置!");
            gameProfile.setConfigByName("楚留香");
        }

        if (lastConfigName != gameProfile.getCurrentConfigTypeName()) {
            //如果配置发生了变化, 则清空上次的变体与键位配置
            setGlobalConfig("lastConfigName", gameProfile.getCurrentConfigTypeName());
            setGlobalConfig("lastVariantName", "");
            setGlobalConfig("lastKeyTypeName", "");
        }

        //加载变体配置和键位配置
        let lastVariantName = readGlobalConfig("lastVariantName", "");
        if (lastVariantName != "") {
            let res = gameProfile.setCurrentVariantByTypeName(lastVariantName);
            if (res == false) {
                // console.log("尝试加载用户设置的变体配置...失败!");
                gameProfile.setCurrentVariantDefault();
            } else {
                // console.log("尝试加载用户设置的变体配置...成功");
            }
        } else {
            gameProfile.setCurrentVariantDefault();
            // console.log("游戏配置发生变化, 已加载默认变体配置");
        }
        setGlobalConfig("lastVariantName", gameProfile.getCurrentVariantTypeName());

        let lastKeyTypeName = readGlobalConfig("lastKeyTypeName", "");
        if (lastKeyTypeName != "") {
            let res = gameProfile.setCurrentKeyLayoutByTypeName(lastKeyTypeName);
            if (res == false) {
                // console.log("尝试加载用户设置的键位配置...失败!");
                gameProfile.setCurrentKeyLayoutDefault();
            } else {
                // console.log("尝试加载用户设置的键位配置...成功");
            }
        } else {
            gameProfile.setCurrentKeyLayoutDefault();
            // console.log("游戏配置发生变化, 已加载默认键位配置");
        }
        setGlobalConfig(
            "lastKeyTypeName",
            gameProfile.getCurrentKeyLayoutTypeName()
        );
    } catch (error) {
        toastLog("加载配置文件失败! 已自动加载默认配置!");
        toastLog(error);
        gameProfile.loadDefaultGameConfigs();
        setGlobalConfig("userGameProfile", null);
    }
})();

function Visualizer() {

    const mergeThreshold = 0.01; //秒, 和main.js中的值保持一致

    var mergedNoteData = [];
    var row = 0;
    var col = 0;
    var boardRow = 3;
    var boardCol = 5;
    var step = 0;
    var lastStep = -1;
    var lastFirstKeyIndex = -2;

    var keysBitmap = null;
    var backgroundBitmap = null;

    /**
     * 加载乐曲数据
     * @param {Array<import("./noteUtils.js").PackedKey>} data 乐曲数据[[按键编号(从0开始),...], 所在时间[s]]
     */
    this.loadNoteData = function (data) {
        mergedNoteData = data.slice();
    }


    /**
     * 设置按键排布
     * @param {number} row_ 行数
     * @param {number} col_ 列数
     */
    this.setKeyLayout = function (row_, col_) {
        row = row_;
        col = col_;
    }

    /**
     * 下一个按键
     */
    this.next = function () {
        lastStep = step;
        step++;
    }

    /**
     * 切换到指定按键
     * @param {number} step_ 序号
     */
    this.goto = function (step_) {
        if (lastStep == step_ - 1) {
            //如果是下一个按键, 直接next
            this.next();
            return;
        }
        step = step_;
        lastStep = Math.max(step - 1, 0);
        lastFirstKeyIndex = -2;
    }


    /**
     * 绘制按键
     * @param {android.graphics.Canvas} canvas 画布
     */
    this.drawKeys = function (canvas) {
        let paint = new Paint(); //android.graphics.Paint
        paint.setStyle(Paint.Style.FILL);
        //计算board的大小 //长方形
        let boardWidth = canvas.getWidth() / boardCol;
        let boardHeight = canvas.getHeight() / boardRow;
        // console.log("board size: " + boardWidth + "x" + boardHeight +" row: "+boardRow+" col: "+boardCol);
        //计算按键的大小 //圆, 间距为按键直径1.4 倍
        let keyDiameter = Math.min(boardWidth / ((col + 1) * 1.4), boardHeight / ((row + 1) * 1.4));
        let keyRadius = keyDiameter / 2;
        let keySpacingX = boardWidth / (col + 1);
        let keySpacingY = boardHeight / (row + 1);
        let drawStep = Math.max(0, step);

        //第一个board对应那一个按键
        let firstKeyIndex = Math.floor(drawStep / (boardRow * boardCol)) * boardRow * boardCol;
        //逐一绘制画面
        for (let i = 0; i < boardRow; i++) {
            for (let j = 0; j < boardCol; j++) {
                //计算当前画面的位置
                let x = j * boardWidth;
                let y = i * boardHeight;

                //计算当前画面的按键
                let currentKeyIndex = firstKeyIndex + i * boardCol + j;
                if (currentKeyIndex >= mergedNoteData.length) {
                    break;
                }
                let currentKeys = mergedNoteData[currentKeyIndex][0];

                //绘制按键
                for (let k = 0; k < row; k++) {
                    for (let l = 0; l < col; l++) {
                        let keyX = x + keySpacingX * (l + 1);
                        let keyY = y + keySpacingY * (row - k);
                        if (currentKeys.includes(k * col + l)) {
                            //按下的按键
                            paint.setARGB(192, 127, 255, 0);
                        } else {
                            //未按下的按键, 灰色
                            paint.setARGB(192, 128, 128, 128);
                        }
                        //圆角矩形
                        canvas.drawRoundRect(keyX - keyRadius, keyY - keyRadius, keyX + keyRadius, keyY + keyRadius, 3, 3, paint);
                    }
                }
                //绘制编号
                paint.setARGB(128, 255, 255, 255);
                paint.setTextSize(20);
                canvas.drawText(i * boardCol + j + firstKeyIndex, x + 10, y + 30, paint);
            }
        }
    }

    /**
     * 绘制背景
     * @param {android.graphics.Canvas} canvas 画布
     */
    this.drawBackground = function (canvas) {
        let paint = new Paint(); //android.graphics.Paint
        paint.setStyle(Paint.Style.FILL);
        //计算board的大小 //长方形
        let boardWidth = canvas.getWidth() / boardCol;
        let boardHeight = canvas.getHeight() / boardRow;
        let drawStep = Math.max(0, step);

        //第一个board对应那一个按键
        let firstKeyIndex = Math.floor(drawStep / (boardRow * boardCol)) * boardRow * boardCol;
        //逐一绘制画面
        for (let i = 0; i < boardRow; i++) {
            for (let j = 0; j < boardCol; j++) {
                //计算当前画面的位置
                let x = j * boardWidth;
                let y = i * boardHeight;

                //确定颜色
                if (i * boardCol + j + firstKeyIndex == drawStep) {
                    //"当前"画面, 白色
                    paint.setARGB(80, 255, 255, 255);
                } else {
                    //"非当前"画面, 灰色
                    paint.setARGB(80, 128, 128, 128);
                }

                //绘制画面
                canvas.drawRect(x, y, x + boardWidth, y + boardHeight, paint);
            }
        }
    }

    /**
     * 绘画!
     * @param {android.graphics.Canvas} canvas 画布
     */
    this.draw = function (canvas) {
        let Color = android.graphics.Color;
        let PorterDuff = android.graphics.PorterDuff;
        //创建bitmap
        if (keysBitmap == null || keysBitmap.getWidth() != canvas.getWidth() || keysBitmap.getHeight() != canvas.getHeight()) {
            keysBitmap = android.graphics.Bitmap.createBitmap(canvas.getWidth(), canvas.getHeight(), android.graphics.Bitmap.Config.ARGB_8888);
            //强制重绘
            lastStep = -2;
            console.log("create keysBitmap: " + keysBitmap.getWidth() + "x" + keysBitmap.getHeight());
        }
        if (backgroundBitmap == null || backgroundBitmap.getWidth() != canvas.getWidth() || backgroundBitmap.getHeight() != canvas.getHeight()) {
            backgroundBitmap = android.graphics.Bitmap.createBitmap(canvas.getWidth(), canvas.getHeight(), android.graphics.Bitmap.Config.ARGB_8888);
            //强制重绘
            lastFirstKeyIndex = -2;
            console.log("create backgroundBitmap: " + backgroundBitmap.getWidth() + "x" + backgroundBitmap.getHeight());
        }

        if (lastStep != step) {
            //如果step变化了, 则重绘背景
            let backgroundCanvas = new Canvas(backgroundBitmap);
            //清空画布
            backgroundCanvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);
            this.drawBackground(backgroundCanvas);
            lastStep = step;

            let firstKeyIndex = Math.floor(step / (boardRow * boardCol)) * boardRow * boardCol;
            if (firstKeyIndex != lastFirstKeyIndex) {
                //如果第一个按键变化了, 则重绘按键
                let keysCanvas = new Canvas(keysBitmap);
                //清空画布
                keysCanvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);
                this.drawKeys(keysCanvas);
                lastFirstKeyIndex = firstKeyIndex;
            }
        }
        canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);
        canvas.drawBitmap(backgroundBitmap, 0, 0, null);
        canvas.drawBitmap(keysBitmap, 0, 0, null);
    }
}

//players.js -- 实现播放/演奏功能
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
/**
 * @typedef {[delay: number,duration: number, points: ...import("./gameProfile").pos2d[]]} Gesture
 * @typedef {Array<Gesture>} Gestures
 */
function AutoJsGesturePlayer() {
    /**
     * @enum {number}
     */
    const PlayerStates = {
        PLAYING: 0,
        PAUSED: 1,
        SEEKING: 2,
        SEEK_END: 3,
        UNINITIALIZED: 4,
        FINISHED: 5,
    }

    this.PlayerStates = PlayerStates;

    /**
     * @type {PlayerStates}
     * @description 播放器状态
     * @private
     */
    let playerState = PlayerStates.UNINITIALIZED;

    /**
     * @type {Array<[Gestures, number]>?}
     * @description 手势和时间数据
     */
    let gestureTimeList = null;

    /**
     * @type {function(number):void}
     * @description 每播放一个音符的回调函数
     */
    let onPlayNote = function (/** @type {number} */ position) { };

    /**
 * @type {function(number):void}
 * @description 状态切换回调函数
 */
    let onStateChange = function (/** @type {number} */ newState) { };

    /**
     * @type Thread
     * @description 播放线程
     * @private
     */
    let playerThread = null;

    /**
     * @type number
     * @description 播放位置(音符序号)
     * @private
     */
    let position = 0;

    /**
     * @type number
     * @description 播放速度(倍数, <1减速, >1加速)
     * @private
     * @default 1
     */
    let playSpeed = 1;

    /**
     * @type number
     * @description 点击位置的平均偏差(像素)
     * @private
     * @default 0
     */
    let clickPositionDeviationPx = 0;

    /**
     * @type {NormalDistributionRandomizer|null}
     */
    let clickPositionDeviationRandomizer = null;

    /**
     * @brief 设置手势和时间数据
     * @param {Array<[Gestures, number]>} gestureTimeList_ 手势和时间数据
     */
    this.setGestureTimeList = function (gestureTimeList_) {
        gestureTimeList = gestureTimeList_;
    }

    /**
     * @brief 设置点击位置的平均偏差(像素)
     * @param {number} clickPositionDeviationPx_ 点击位置的平均偏差(像素)
     */
    this.setClickPositionDeviationPx = function (clickPositionDeviationPx_) {
        clickPositionDeviationPx = clickPositionDeviationPx_;
        clickPositionDeviationRandomizer = new NormalDistributionRandomizer(0, clickPositionDeviationPx);
    }

    /**
     * @brief 启动播放
     * 
     */
    this.start = function () {
        playerState = PlayerStates.UNINITIALIZED;
        position = 0;
        let func = playerThreadFunc.bind(this);
        playerThread = threads.start(func);
    }

    /**
     * @brief 暂停播放
     */
    this.pause = function () {
        playerState = PlayerStates.PAUSED;
    }

    /**
     * @brief 继续播放
     */
    this.resume = function () {
        playerState = PlayerStates.SEEK_END;
    }

    /**
     * @brief 设置播放位置
     * @param {number} position_ 播放位置(音符序号)
     * @note TODO: 线程安全?
     */
    this.seekTo = function (position_) {
        if (playerState == PlayerStates.PLAYING || playerState == PlayerStates.SEEK_END)
            playerState = PlayerStates.SEEKING;
        position = position_;
    }

    /**
     * @brief 获取播放位置
     * @returns {number} 播放位置(音符序号)
     */
    this.getCurrentPosition = function () {
        return position;
    }

    /**
     * @brief 获取播放状态
     * @returns {number} 播放状态
     */
    this.getState = function () {
        return playerState;
    }

    /**
     * @brief 获取播放速度
     * @returns {number} 播放速度(倍数, <1减速, >1加速)
     */
    this.getPlaySpeed = function () {
        return playSpeed;
    }

    /**
     * @brief 设置播放速度
     * @param {number} playSpeed_ 播放速度(倍数, <1减速, >1加速)
     */
    this.setPlaySpeed = function (playSpeed_) {
        playSpeed = playSpeed_;
    }
    /**
     * @brief 设置回调函数
     * @param {function(number):void} onPlayNote_ 每播放一个音符的回调函数
     */
    this.setOnPlayNote = function (onPlayNote_) {
        onPlayNote = onPlayNote_;
    }

    /**
     * @brief 状态切换回调函数
     * @param {function(number):void} onStateChange_ 每次状态切换时的回调函数
     */
    this.setOnStateChange = function (onStateChange_) {
        onStateChange = onStateChange_;
    }

    /**
     * @brief 停止播放并释放资源
     * @returns {boolean} 是否成功停止
     */
    this.stop = function () {
        if (playerThread != null) {
            playerThread.interrupt();
            playerThread.join();
            playerThread = null;
            playerState = PlayerStates.FINISHED;
            onStateChange(playerState);
            position = 0;
            return true;
        }
        return false;
    }

    /**
     * @brief 执行一组操作
     * @param {Gestures} _gestures 手势
     */
    this.exec = function (_gestures) {
        _gestures = transformGesture(_gestures);
        gestures.apply(null, _gestures);
    }

    /**
     * @brief 对这组手势做处理
     * @param {Gestures} gestures 手势
     * @returns {Gestures} 处理后的手势
     */
    function transformGesture(gestures) {
        //随机偏移
        if (clickPositionDeviationPx > 0) {
            gestures.forEach(gesture => {
                let deviation, angle;
                do {
                    deviation = clickPositionDeviationRandomizer.next();
                } while (Math.abs(deviation) > 2 * clickPositionDeviationPx);
                angle = Math.random() * 2 * Math.PI;
                gesture[2][0] += deviation * Math.cos(angle);
                gesture[2][1] += deviation * Math.sin(angle);
            });
        }
        return gestures;
    }

    /**
     * @brief 播放线程函数
     * @private
     */
    function playerThreadFunc() {
        if (gestureTimeList == null) {
            console.error("gestureTimeList is null");
            return;
        }
        let oldState = playerState;
        let startTimeAbs = new Date().getTime() + 100;
        console.info("PlayerThread started");
        while (1) {
            if (oldState != playerState) {
                console.info("PlayerState: %s -> %s", oldState, playerState);
                oldState = playerState;
                onStateChange(playerState);
            }
            switch (playerState) {
                case PlayerStates.FINISHED:
                case PlayerStates.UNINITIALIZED:
                case PlayerStates.PAUSED: //(->SEEK_END)
                    sleep(500); //循环等待状态变更 
                    break;
                case PlayerStates.SEEKING: //(->SEEK_END)
                    playerState = PlayerStates.SEEK_END;
                    sleep(500); //在这500ms内, 状态可能会变回SEEKING. 继续循环
                    break;
                case PlayerStates.SEEK_END: { //(->PLAYING)
                    playerState = PlayerStates.PLAYING;
                    if (position == 0) {
                        startTimeAbs = new Date().getTime() + 100; //第一次播放, 从100ms前开始
                        break;
                    }
                    //设置播放起始时间
                    let currentNoteTimeAbs = gestureTimeList[position][1] * 1000 * (1 / playSpeed);
                    startTimeAbs = new Date().getTime() - currentNoteTimeAbs;
                    onPlayNote(position);
                    break;
                }
                case PlayerStates.PLAYING: { //(->PAUSED/FINISHED/SEEKING)
                    if (position >= gestureTimeList.length) {
                        playerState = PlayerStates.FINISHED;
                        break;
                    }
                    let currentNote = gestureTimeList[position][0];
                    let currentNoteTimeAbs = gestureTimeList[position][1] * 1000 * (1 / playSpeed);
                    let elapsedTimeAbs = new Date().getTime() - startTimeAbs;
                    let delayTime = currentNoteTimeAbs - elapsedTimeAbs - 7; //7ms是手势执行时间
                    if (delayTime > 0) {
                        while (delayTime > 0) {
                            sleep(Math.min(delayTime, 467));
                            delayTime -= 467;
                            if (playerState != PlayerStates.PLAYING) {
                                break;
                            }
                        }
                    } else {
                        //直接跳过
                        position++;
                        break;
                    }
                    this.exec(currentNote);
                    position++;
                    onPlayNote(position);
                    break;
                }
                default:
                    break;
            }
        }
    }
}

function Players() {
    this.AutoJsGesturePlayer = AutoJsGesturePlayer;
}
const player = new Players();
player = player.AutoJsGesturePlayer();

const FloatMenu = require("./Module/@se7en/float_menu-rhino");
let fm = new FloatMenu();

function shuffle(arr) {
    // 随机打乱数组
    let _arr = arr.slice(); // 调用数组副本，不改变原数组
    for (let i = 0; i < _arr.length; i++) {
        let j = getRandomInt(0, i);
        let t = _arr[i];
        _arr[i] = _arr[j];
        _arr[j] = t;
    }
    return _arr;
}
function getRandomInt(min, max) {
    // 获取min到max的一个随机数，包含min和max本身
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function getMusicData(fileName, type) {
    let progressDialog = dialogs
        .build({
            title: "加载中（长时间无反应请使用流量）",
            content: "正在加载谱子数据...",
            negative: "取消",
            progress: {
                max: 100,
                showMinMax: false,
            },
            cancelable: true,
            canceledOnTouchOutside: false,
        })
        .on("negative", () => {
            return null;
        })
        .show();
    let data = threads.disposable();
    threads.start(function () {
        //获取乐谱内容
        let musicUrl = Qiu.DataUrl + "api/GetMusicInfo";
        let musicHead = {
            appid: Qiu.circle.config.appid,
            name: fileName,
            type: type
        };
        let music = Qiu.circle.http_post(musicUrl, musicHead);
        if (music == null) {
            return null;
        }
        data.setAndNotify(music.data.content);
        progressDialog.dismiss();
    })
    return data.blockedGet();
}

var MusicArr = [];
threads.start(function () {
    let MusicDataList = Qiu.inspect.get("MusicData");
    let str = JSON.stringify(MusicDataList);
    let jsons = JSON.parse(str);
    domArr = shuffle(jsons); //打乱数组
    for (i = 0; i < domArr.length; i++) {
        if (domArr[i].name != -1) {
            MusicArr.push(domArr[i].name);
        }
    }
})

fm.addItem("搜索")
    .setColors("#7a0066ff")
    .setTints("#ffffff")
    .setIcons("ic_search_black_48dp")
    .setRadius(10)
    .setStroke(2, "#000000")
    .onClick(function (view) {
        threads.start(function () {
            if (MusicArr == "") {
                let MusicDataList = Qiu.inspect.get("MusicData");
                let str = JSON.stringify(MusicDataList);
                let jsons = JSON.parse(str);
                domArr = shuffle(jsons); //打乱数组
                for (i = 0; i < domArr.length; i++) {
                    if (domArr[i].name != -1) {
                        MusicArr.push(domArr[i].name);
                    }
                }
            }
            //输入框
            var NameList = rawInput("输入乐谱关键词");
            if (NameList !== "" || NameList !== null) {
                //加载中悬浮窗显示
                let loadwin = Qiu.circle.loadWin();
                //结果选择对话框
                var obj = findall(MusicArr, NameList);
                //加载中悬浮窗隐藏
                loadwin.cancel();
                if (obj.length > 0) {
                    let choose = dialogs.singleChoice("请选择乐谱", obj);
                    if (choose != -1) {
                        let spiltData = obj[choose].split("@MID");
                        ofArr = MusicArr.indexOf(spiltData[0]);
                        datajson = domArr[ofArr];
                        let Musicdata = getMusicData(datajson.name, datajson.music_type);
                        let data = loadMusicFile(datajson, Musicdata, ScoreExportType.none);
                        if (data == null || Musicdata == null) {
                            return;
                        }
                        totalTimeSec = data[data.length - 1][1];
                        player.setGestureTimeList(data);
                        isCollect = false;
                        main(data, totalTimeSec);
                    }
                } else {
                    toastLog("没有搜到乐谱，请检查是否输入正确");
                }
            } else {
                toastLog("没有输入任何内容");
            }
        })
        return false;
    });

fm.addItem("收藏")
    .setColors("#3aff2851")
    .setIcons("ic_favorite_black_48dp")
    .setRadius(10)
    .setTints("#3aff2851")
    .setStroke(2, "#000000")
    .onClick(function (view) {
        let loadwin = Qiu.circle.loadWin();
        threads.start(function () {
            if (MusicArr == "") {
                let MusicDataList = Qiu.inspect.get("MusicData");
                let str = JSON.stringify(MusicDataList);
                let jsons = JSON.parse(str);
                domArr = shuffle(jsons); //打乱数组
                for (i = 0; i < domArr.length; i++) {
                    if (domArr[i].name != -1) {
                        MusicArr.push(domArr[i].name);
                    }
                }
            }
            Collect = Qiu.inspect.get("Collection");
            loadwin.cancel();
            //乐谱选择对话框
            CollectChoose = dialogs.singleChoice("请选择乐谱", Collect);
            if (CollectChoose != -1) {
                let spiltData = Collect[CollectChoose].split("@MID");
                ofArr = MusicArr.indexOf(spiltData[0]);
                datajson = domArr[ofArr];
                let Musicdata = getMusicData(datajson.name, datajson.music_type);
                let data = loadMusicFile(datajson, Musicdata, ScoreExportType.none);
                if (data == null || Musicdata == null) {
                    return;
                }
                totalTimeSec = data[data.length - 1][1];
                player.setGestureTimeList(data);
                isCollect = true;
                main(data, totalTimeSec);
            }
        });
        return false;
    });

fm.addItem("云端")
    .setIcons("ic_cloud_black_48dp")
    .setRadius(10)
    .setColors("#fa99fa")
    .setTints("#ffffff")
    .setStroke(2, "#000000")
    .onClick(function (view) {
        let loadwin = Qiu.circle.loadWin();
        threads.start(function () {
            if (MusicArr == "") {
                let MusicDataList = Qiu.inspect.get("MusicData");
                let str = JSON.stringify(MusicDataList);
                let jsons = JSON.parse(str);
                domArr = shuffle(jsons); //打乱数组
                for (i = 0; i < domArr.length; i++) {
                    if (domArr[i].name != -1) {
                        MusicArr.push(domArr[i].name);
                    }
                }
            }
            loadwin.cancel();
            let choose = dialogs.singleChoice("请选择乐谱", MusicArr);
            if (choose != -1) {
                let spiltData = MusicArr[choose].split("@MID");
                ofArr = MusicArr.indexOf(spiltData[0]);
                datajson = domArr[ofArr];
                let Musicdata = getMusicData(datajson.name, datajson.music_type);
                let data = loadMusicFile(datajson, Musicdata, ScoreExportType.none);
                if (data == null || Musicdata == null) {
                    return;
                }
                totalTimeSec = data[data.length - 1][1];
                player.setGestureTimeList(data);
                isCollect = false;
                main(data, totalTimeSec);
            }
        });
        return false;
    });
fm.addItem("坐标")
    .setIcons("ic_my_location_black_48dp")
    .setRadius(10)
    .setColors("#00fafa")
    .setTints("#ffffff")
    .setStroke(2, "#000000")
    .onClick(function (view) {
        threads.start(function () {
            runClickPosSetup();
        });
        return false;
    });
fm.addItem("设置")
    .setIcons("ic_settings_black_48dp")
    .setColors("#669999")
    .setRadius(10)
    .onClick((view) => {
        threads.start(function () {
            runGlobalSetup();
        });
        return false;
    });

function findall(a, x) {
    let results = [],
        len = a.length;
    for (let i = 0; i < len; i++) {
        if (a[i].search(x) != -1) {
            results.push(a[i]);
            //log(results)
        }
    }
    return results;
}

function runGlobalSetup() {
    let dia = dialogs.select("设置列表", [
        "选择游戏/乐器",
        "跳过空白部分 (不想等那么久)",
        "伪装手弹模式 (我不是自动弹琴)",
        "乐谱可视化 (可以看到弹奏的键位)",
        "长音模式 (适配笛子、小提琴等)",
        "关闭悬浮球 (结束不玩了)"
    ]);
    switch (dia) {
        case -1:
            break;
        case 0:
            //目标游戏
            let configList = gameProfile.getConfigNameList();
            let sel = dialogs.select("选择目标游戏...", configList);
            if (sel == -1) {
                console.log("设置没有改变");
                break;
            }
            let configName = configList[sel];
            setGlobalConfig("activeConfigName", configName);
            setGlobalConfig("lastConfigName", configName);
            gameProfile.setConfigByName(configName);
            console.log("目标游戏已设置为: " + configName);
            //目标乐器
            let instrumentList = gameProfile.getCurrentAvailableVariants();
            if (instrumentList.length == 1) {
                gameProfile.setCurrentVariantDefault();
                setGlobalConfig(
                    "lastVariantName",
                    gameProfile.getCurrentVariantTypeName()
                );
            } else {
                let nameList = instrumentList.map((variant) => variant.variantName);
                let sel = dialogs.select("选择目标乐器...", nameList);
                if (sel == -1) {
                    // toastLog("设置没有改变");
                    break;
                }
                let typeName = instrumentList[sel].variantType;
                gameProfile.setCurrentVariantByTypeName(typeName);
                setGlobalConfig("lastVariantName", typeName);
                console.log("目标乐器已设置为: " + typeName);
            }
            //目标键位
            let keyLayoutList = gameProfile.getCurrentAvailableKeyLayouts();
            if (keyLayoutList.length == 1) {
                gameProfile.setCurrentKeyLayoutDefault();
                setGlobalConfig(
                    "lastKeyTypeName",
                    gameProfile.getCurrentKeyLayoutTypeName()
                );
            } else {
                let allKeyLayoutList = gameProfile.getAllKeyLayouts();
                let nameList = keyLayoutList.map(
                    (keyLayout) => allKeyLayoutList[keyLayout].displayName
                );
                let sel = dialogs.select("选择目标键位...", nameList);
                if (sel == -1) {
                    // toastLog("设置没有改变");
                    break;
                }
                let typeName = keyLayoutList[sel];
                gameProfile.setCurrentKeyLayoutByTypeName(typeName);
                setGlobalConfig("lastKeyTypeName", typeName);
                console.log("目标键位已设置为: " + typeName);
            }
            toastLog("设置已保存");
            break;
        case 1:
            setGlobalConfig(
                "skipInit",
                dialogs.select("是否跳过乐曲开始前的空白?", ["否", "是"])
            );
            setGlobalConfig(
                "skipBlank5s",
                dialogs.select("是否跳过乐曲中间超过5秒的空白?", ["否", "是"])
            );
            toastLog("设置已保存");
            break;
        case 2: //设置自定义坐标
            let humanifyEnabled = readGlobalConfig("humanifyEnabled", false);
            let setupFinished = false;
            let enterDetailedSetup = false;
            let dial = dialogs
                .build({
                    title: "伪装手弹模式",
                    content: "要开启假装手弹模式吗？",
                    positive: "开启",
                    negative: "关闭",
                    neutral: "更改设置...",
                    cancelable: true,
                    canceledOnTouchOutside: false,
                })
                .on("positive", () => {
                    setGlobalConfig("humanifyEnabled", true);
                    setupFinished = true;
                    dial.dismiss();
                    toastLog("伪装手弹模式已开启");
                })
                .on("negative", () => {
                    setGlobalConfig("humanifyEnabled", false);
                    setupFinished = true;
                    dial.dismiss();
                    toastLog("伪装手弹模式已关闭");
                })
                .on("neutral", () => {
                    enterDetailedSetup = true;
                    setupFinished = true;
                })
                .show();
            while (!setupFinished) {
                sleep(100);
            }
            if (enterDetailedSetup) {
                let humanifyNoteAbsTimeStdDev = readGlobalConfig(
                    "humanifyNoteAbsTimeStdDev",
                    50
                );

                let res = dialogs.rawInput(
                    "设置平均偏差时间(毫秒), 越高->偏差越大",
                    humanifyNoteAbsTimeStdDev.toString()
                );
                if (res === null) {
                    toastLog("设置没有改变");
                } else {
                    try {
                        setGlobalConfig("humanifyNoteAbsTimeStdDev", parseInt(res));
                    } catch (error) {
                        toastLog("输入无效, 设置没有改变");
                        console.error(error);
                    }
                }
            }
            break;
        case 3: //伪装手弹模式
            let visualizerEnabled = dialogs.confirm(
                "乐谱可视化",
                "是否要开启乐谱可视化?"
            );
            setGlobalConfig("visualizerEnabled", visualizerEnabled);
            if (visualizerEnabled) {
                toastLog("乐谱可视化已开启");
            } else {
                toastLog("乐谱可视化已关闭");
            }
            break;
        case 4: //长音模式
            let setupFinisheds = false;
            let notedia = dialogs.build({
                title: "长音模式",
                content: "要开启长音模式吗？此功能仅支持MID谱，TXT谱无效果",
                positive: "开启",
                negative: "关闭",
                cancelable: true,
                canceledOnTouchOutside: false,
            }).on("positive", () => {
                setGlobalConfig("noteDurationOutputMode", "native");
                setupFinisheds = true;
                notedia.dismiss();
                toastLog("长音模式已开启");
            }).on("negative", () => {
                setGlobalConfig("noteDurationOutputMode", "none");
                setupFinisheds = true;
                notedia.dismiss();
                toastLog("长音模式已关闭");
            }).show();
            while (!setupFinisheds) {
                sleep(100);
            }
            break;
        case 5: //结束悬浮窗
            confirm("关闭悬浮窗", "你确定关闭悬浮窗吗？你不玩了吗？你不爱我了吗？", (clear) => {
                if (clear) {
                    toastLog("被你丢弃");
                    engines.stopAll();
                }
            });
            break;
    }
}

/**
 * @brief 移除空的音轨
 * @param {MusicFormats.TracksData} tracksData 
 * @return {MusicFormats.TracksData} 移除空的音轨后的音轨数据
 */
function removeEmptyTracks(tracksData) {
    if (!tracksData.haveMultipleTrack) return tracksData;
    for (let i = tracksData.tracks.length - 1; i >= 0; i--) {
        if (tracksData.tracks[i].noteCount == 0) {
            tracksData.tracks.splice(i, 1);
        }
    }
    tracksData.trackCount = tracksData.tracks.length;
    if (tracksData.trackCount == 1) tracksData.haveMultipleTrack = false;
    return tracksData;
}

function loadMusicFile(MusicName, musicdata, exportScore) {
    //////////////显示加载进度条
    let progressDialog = dialogs
        .build({
            title: "加载中",
            content: "正在解析曲谱...",
            negative: "取消",
            progress: {
                max: 100,
                showMinMax: false,
            },
            cancelable: true,
            canceledOnTouchOutside: false,
        })
        .on("negative", () => {
            return null;
        })
        .show();

    //加载配置
    if (!gameProfile.checkKeyPosition()) {
        dialogs.alert("错误", "坐标未设置，请先设置坐标");
        progressDialog.dismiss();
        runClickPosSetup();
        return null;
    }

    let humanifyNoteAbsTimeStdDev = readGlobalConfig("humanifyNoteAbsTimeStdDev", 0);
    let majorPitchOffset = readFileConfigForTarget("majorPitchOffset", MusicName, gameProfile, 0);
    let minorPitchOffset = readFileConfigForTarget("minorPitchOffset", MusicName, gameProfile, 0);
    let treatHalfAsCeiling = readFileConfig("halfCeiling", MusicName, false);
    let limitClickSpeedHz = readFileConfig("limitClickSpeedHz", MusicName, 0);
    let noteDurationOutputMode = readGlobalConfig("noteDurationOutputMode", "none");
    let maxGestureDuration = readGlobalConfig("maxGestureDuration", 8000);
    let marginDuration = readGlobalConfig("marginDuration", 100);
    let defaultClickDuration = readGlobalConfig("defaultClickDuration", 5);
    let chordLimitEnabled = readFileConfig("chordLimitEnabled", MusicName, false);
    let maxSimultaneousNoteCount = readFileConfig("maxSimultaneousNoteCount", MusicName, 2);
    let noteCountLimitMode = readFileConfig("noteCountLimitMode", MusicName, "split");
    let noteCountLimitSplitDelay = readFileConfig("noteCountLimitSplitDelay", MusicName, 75);
    let chordSelectMode = readFileConfig("chordSelectMode", MusicName, "high");
    let mergeThreshold = (exportScore == ScoreExportType.keyboardScore ? scoreExportMergeThreshold : autoPlayMergeThreshold);
    let keyRange = gameProfile.getKeyRange();
    const passManager = new PassManager();
    /////////////解析文件
    progressDialog.setContent("正在解析曲谱...");
    if (MusicName.music_type == "mid") {
        tracksData = JSON.parse(musicdata);
    } else {
        tracksData = SkyStudioJSONParser(musicdata);
    }
    passManager.reset();

    //选择音轨
    progressDialog.setContent("正在解析音轨...");
    let noteData = [];
    if (tracksData.haveMultipleTrack) {
        //删除没有音符的音轨
        tracksData = removeEmptyTracks(tracksData);
        let nonEmptyTrackCount = tracksData.tracks.length;
        let lastSelectedTracksNonEmpty = [];
        for (let i = 0; i < nonEmptyTrackCount; i++) {
            lastSelectedTracksNonEmpty.push(i); //默认选择所有音轨
        }
        let selectedTracksNonEmpty = lastSelectedTracksNonEmpty;
        //合并
        for (let i = 0; i < selectedTracksNonEmpty.length; i++) {
            if (selectedTracksNonEmpty[i] >= nonEmptyTrackCount) continue;
            let track = tracksData.tracks[selectedTracksNonEmpty[i]];
            //通道10(打击乐) 永远不会被合并
            if (track.channel === 9) continue;
            noteData = noteData.concat(track.notes);
        }
        //按时间排序
        noteData.sort(function (a, b) {
            return a[1] - b[1];
        });
    } else {
        noteData = tracksData.tracks[0].notes;
    }

    inputNoteCnt = noteData.length;

    progressDialog.setContent("正在伪装手弹...");
    //伪装手弹
    if (humanifyNoteAbsTimeStdDev > 0) {
        passManager.addPass("HumanifyPass", {
            noteAbsTimeStdDev: humanifyNoteAbsTimeStdDev
        }, null, () => {
            progressDialog.setContent("正在生成按键...");
        });
    }
    //生成按键
    passManager.addPass(
        "NoteToKeyPass",
        {
            majorPitchOffset: majorPitchOffset,
            minorPitchOffset: minorPitchOffset,
            treatHalfAsCeiling: treatHalfAsCeiling,
            currentGameProfile: gameProfile,
        },
        (progress) => {
            progressDialog.setProgress(progress);
        },
        (data, statistics, elapsedTime) => {
            // console.log("生成按键耗时" + elapsedTime / 1000 + "秒");
            overFlowedNoteCnt = statistics.overFlowedNoteCnt;
            underFlowedNoteCnt = statistics.underFlowedNoteCnt;
            roundedNoteCnt = statistics.roundedNoteCnt;
            progressDialog.setContent("正在优化按键...");
        }
    );
    //单个按键频率限制
    passManager.addPass(
        "SingleKeyFrequencyLimitPass",
        {
            minInterval: gameProfile.getSameKeyMinInterval(),
        },
        null,
        (data, statistics, elapsedTime) => {
            // console.log("单键频率限制耗时" + elapsedTime / 1000 + "秒");
            finalNoteCnt = data.length;
            droppedNoteCnt = statistics.droppedNoteCnt;
            progressDialog.setContent("正在合并按键...");
        }
    );
    //跳过前奏
    if (readGlobalConfig("skipInit", true)) {
        passManager.addPass("SkipIntroPass");
    }
    //跳过中间的空白
    if (readGlobalConfig("skipBlank5s", true)) {
        passManager.addPass("LimitBlankDurationPass"); //默认5秒
    }
    //合并按键
    passManager.addPass("MergeKeyPass", {
        maxInterval: mergeThreshold * 1000,
    }, null, (data, statistics, elapsedTime) => {
        // console.log("合并按键耗时" + elapsedTime / 1000 + "秒");
        progressDialog.setContent("正在生成手势...");
    });
    //限制按键频率
    if (limitClickSpeedHz != 0) {
        passManager.addPass("NoteFrequencySoftLimitPass", {
            minInterval: 1000 / limitClickSpeedHz,
        });
    }
    //限制同时按键个数
    if (chordLimitEnabled) {
        passManager.addPass("ChordNoteCountLimitPass", {
            maxNoteCount: maxSimultaneousNoteCount,
            limitMode: noteCountLimitMode,
            splitDelay: noteCountLimitSplitDelay,
            selectMode: chordSelectMode,
        }, null, (data, statistics, elapsedTime) => {
            progressDialog.setContent("正在生成手势...");
        });
    }

    if (exportScore != ScoreExportType.none) {
        //如果是导出乐谱,则不需要生成手势
        let data = passManager.run(noteData);
        progressDialog.dismiss();
        return noteUtils.packNotes(data);
    }
    //加载可视化窗口
    passManager.addPass("NopPass", null, null, (data, statistics, elapsedTime) => {
        visualizer.setKeyLayout(gameProfile.getKeyLayout().row, gameProfile.getKeyLayout().column);
        visualizer.loadNoteData(noteUtils.packNotes(data));
        visualizer.goto(-1);
    });
    //生成手势
    passManager.addPass(
        "KeyToGesturePass",
        {
            currentGameProfile: gameProfile,
            durationMode: noteDurationOutputMode,
            maxGestureDuration: maxGestureDuration,
            marginDuration: marginDuration,
            pressDuration: defaultClickDuration,
        },
        null,
        (data, statistics, elapsedTime) => {
            // console.log("生成手势耗时" + elapsedTime / 1000 + "秒");
            progressDialog.dismiss();
        }
    );

    let gestureTimeList = passManager.run(noteData);
    return gestureTimeList;
}

function main(musicFileDatas, totalTimeSecr) {
    let evt = events.emitter(threads.currentThread());
    let musicFileData = musicFileDatas;
    let MusicDataList = Qiu.inspect.get("MusicData");
    MusicDataList = shuffle(MusicDataList); //打乱数组
    let isSc = false;
    let progress = 0;
    let progressChanged = false;
    let totalTimeSec = totalTimeSecr;
    let totalTimeStr = sec2timeStr(totalTimeSec);
    let currentGestureIndex = 0;
    let visualizerWindow = null;
    let ishide = false;
    let controlWindow = floaty.window(
        <frame w="auto" h="auto" visibility="visible" id="w">
            <card
                cardBackgroundColor="#ffffff"
                radius="10dp"
                w="auto"
                h="auto"
                alpha="1"
                gravity="center"
            >
                <vertical>
                    <horizontal gravity="center" marginTop="1dp">
                        <img
                            id="yc"
                            h="23dp"
                            marginRight="40dp"
                            src="@drawable/ic_visibility_off_black_48dp"
                            w="23dp"
                            tint="#696969"
                        />
                        <img
                            id="stop"
                            background="#00000000"
                            marginLeft="40dp"
                            h="23dp"
                            src="@drawable/ic_highlight_off_black_48dp"
                            w="23dp"
                            tint="#000000"
                        />
                    </horizontal>
                    <View bg="#D3D3D3" w="145dp" h="2dp" />
                    <card
                        w="*"
                        radius="30dp"
                        cardBackgroundColor="#00BFFF"
                        marginLeft="13dp"
                        marginRight="13dp"
                        marginTop="2dp"
                    >
                        <text
                            id="pauseResumeBtn"
                            text="▶"
                            textStyle="bold"
                            textSize="20sp"
                            textColor="#000000"
                            gravity="center"
                        />
                    </card>

                    <horizontal gravity="center" marginTop="2dp">
                        <img
                            id="lastSong"
                            src="@drawable/ic_skip_previous_black_48dp"
                            tint="#000000"
                            w="30dp"
                            h="30dp"
                            gravity="center"
                            borderWidth="3dp"
                            borderColor="#00BFFF"
                            radius="50dp"
                            marginRight="9dp"
                        />

                        <card
                            w="45dp"
                            h="auto"
                            radius="20dp"
                            cardBackgroundColor="#00BFFF"
                            layout_gravity="center"
                        >
                            <text
                                text="{{tu[4]}}"
                                textSize="15sp"
                                textStyle="bold"
                                textColor="#000000"
                                gravity="center"
                                id="jrsc"
                            />
                        </card>
                        <img
                            id="nextSong"
                            src="@drawable/ic_skip_next_black_48dp"
                            tint="#000000"
                            w="30dp"
                            h="30dp"
                            gravity="center"
                            borderWidth="3dp"
                            borderColor="#00BFFF"
                            radius="50dp"
                            marginLeft="9dp"
                        />
                    </horizontal>

                    <card
                        w="*"
                        h="auto"
                        radius="20dp"
                        cardBackgroundColor="#00BFFF"
                        gravity="center"
                        marginLeft="13dp"
                        marginRight="13dp"
                        marginTop="2dp"
                    >
                        <TextView
                            text=""
                            marginLeft="13dp"
                            marginRight="13dp"
                            gravity="center"
                            w="100dp"
                            h="auto"
                            textSize="10sp"
                            id="songName"
                            singleLine="true"
                            ellipsize="marquee"
                            focusable="true"
                            textStyle="bold"
                            textColor="#000000"
                        />
                    </card>
                    <horizontal gravity="center" marginTop="2dp">
                        <card
                            radius="35dp"
                            h="25dp"
                            w="25dp"
                            cardBackgroundColor="#00BFFF"
                            marginRight="13dp"
                        >
                            <img
                                id="speedLow"
                                background="#00000000"
                                textStyle="bold"
                                textSize="12sp"
                                src="@drawable/ic_fast_rewind_black_48dp"
                                tint="#000000"
                                h="25dp"
                                w="25dp"
                            />
                        </card>
                        <text
                            id="speed"
                            text="速度x1"
                            background="#00000000"
                            textStyle="bold"
                            textSize="12sp"
                            w="auto"
                            textColor="#000000"
                        />
                        <card
                            radius="35dp"
                            h="25dp"
                            w="25dp"
                            cardBackgroundColor="#00BFFF"
                            marginLeft="13dp"
                        >
                            <img
                                id="speedHigh"
                                background="#00000000"
                                textStyle="bold"
                                textSize="12sp"
                                src="@drawable/ic_fast_forward_black_48dp"
                                tint="#000000"
                                h="25dp"
                                w="25dp"
                            />
                        </card>
                    </horizontal>
                    <card
                        radius="30dp"
                        cardBackgroundColor="#00BFFF"
                        marginRight="13dp"
                        marginLeft="13dp"
                        marginTop="2dp"
                    >
                        <seekbar id="progressBar" gravity="center" />
                    </card>
                    <text
                        text="00:00/00:00"
                        background="#00000000"
                        textColor="#000000"
                        gravity="center"
                        id="timerText"
                        textStyle="bold"
                    />
                    <text
                        text="©解析/弹奏由clxTools提供"
                        textSize="8sp"
                        gravity="center"
                    />
                </vertical>
            </card>
        </frame>
    );
    ui.run(() => {
        //更新文字，toFixed只保留一位小数
        controlWindow.speed.setText("速度x" + player.getPlaySpeed().toFixed(1));
        controlWindow.songName.setText(datajson.name);
        controlWindow.songName.setSelected(true);
    });
    //切换上一首
    controlWindow.lastSong.on("click", () => {
        if (isCollect == true) {
            if (CollectChoose == 0) return toastLog("已到第一首");
            CollectChoose--;
        } else {
            if (ofArr == 0) return toastLog("已到第一首");
            ofArr--;
        }
        isSc = true;
        evt.emit("fileSelect");
    });

    //切换下一首
    controlWindow.nextSong.on("click", () => {
        if (isCollect == true) {
            if (CollectChoose >= Collect.length - 1) return toastLog("已到最后一首");
            CollectChoose++;
        } else {
            if (ofArr >= domArr.length - 1) return toastLog("已到最后一首");
            ofArr++;
        }
        isSc = true;
        evt.emit("fileSelect");
    });
    //加入收藏
    controlWindow.jrsc.on("click", () => {
        threads.start(function () {
            if (isSc == false) {
                if (controlWindow.jrsc.getText() != tu[3]) {
                    let userdata = Qiu.inspect.get("userData"); //获取本地存储
                    let upCollectUrl = Qiu.DataUrl + "api/UpDataCollect";
                    let upCollectHead = {
                        userid: userdata.id,
                        name: datajson.name,
                        type: datajson.music_type,
                        appid: Qiu.circle.config.appid,
                    };
                    let upCollect = Qiu.circle.http_post(upCollectUrl, upCollectHead);
                    let getinspect = upCollect.data.split(","); //分割 ”，“
                    toast(upCollect.msg);
                    ui.run(function () {
                        controlWindow.jrsc.setText(tu[3]);
                    });
                    Qiu.inspect.put("Collection", getinspect); //保存本地存储
                    return;
                } else {
                    let userdata = Qiu.inspect.get("userData"); //获取本地存储
                    let upCollectUrl = Qiu.DataUrl + "api/DeleteCollect";
                    let upCollectHead = {
                        userid: userdata.id,
                        name: datajson.name,
                        type: datajson.music_type,
                        appid: Qiu.circle.config.appid,
                    };
                    let upCollect = Qiu.circle.http_post(upCollectUrl, upCollectHead);
                    let getinspect = upCollect.data.split(","); //分割 ”，“
                    toast(upCollect.msg);
                    ui.run(function () {
                        controlWindow.jrsc.setText(tu[4]);
                    });
                    Qiu.inspect.put("Collection", getinspect); //保存本地存储
                    return;
                }
            }
            evt.emit("jrsc");
        });
    });

    //检查是否收藏
    function jcax() {
        let collectDataList = Qiu.inspect.get("Collection");
        threads.start(function () {
            let j = true;
            if (collectDataList !== null) {
                for (let i = 0; i < collectDataList.length; i++) {
                    let nameSp = collectDataList[i].split("@MID");
                    if (nameSp[0] == datajson.name) {
                        ui.run(function () {
                            controlWindow.jrsc.setText(tu[3]);
                        });
                        j = false;
                    }
                }
                if (j) {
                    ui.run(function () {
                        controlWindow.jrsc.setText(tu[4]);
                    });
                }
            } else {
                ui.run(function () {
                    controlWindow.jrsc.setText(tu[4]);
                });
            }
        });
    }
    jcax();


    //播放开关按钮
    controlWindow.pauseResumeBtn.click(() => {
        //获取播放状态 如果是暂停状态 继续播放
        if (player.getState() == player.PlayerStates.PAUSED) {
            player.resume();
        } else if (player.getState() == player.PlayerStates.PLAYING) {
            //如果是播放状态 暂停播放
            player.pause();
        } else if (player.getState() == player.PlayerStates.FINISHED) {
            player.seekTo(0);
            player.resume();
        }
    });
    controlWindow.progressBar.setOnSeekBarChangeListener({
        onProgressChanged: function (seekBar, progress0, fromUser) {
            if (fromUser) {
                progress = progress0;
                progressChanged = true;
            }
        },
    });
    player.setOnStateChange(function (newState) {
        if (
            newState == player.PlayerStates.PAUSED ||
            newState == player.PlayerStates.FINISHED
        ) {
            controlWindow.pauseResumeBtn.setText("▶");
        } else if (newState == player.PlayerStates.PLAYING) {
            controlWindow.pauseResumeBtn.setText("■");
        }
    });

    //实时切换速度 -
    controlWindow.speedLow.on("click", () => {
        evt.emit("speedLow");
    });
    //实时切换速度 +
    controlWindow.speedHigh.on("click", () => {
        evt.emit("speedHigh");
    });
    //关闭悬浮窗按钮
    controlWindow.stop.on("click", () => {
        if (player.getState() == player.PlayerStates.PLAYING) {
            //如果是播放状态 停止播放
            player.stop();
        }
        if (visualizerWindow !== null) {
            //如果可视化窗口是显示状态 关闭
            visualizerWindow.close();
        }
        currentGestureIndex = 0;
        gameProfile.clearCurrentConfigCache();
        threads.shutDownAll();
        //关闭悬浮窗
        controlWindow.close();
    });

    //悬浮窗位置/大小调节
    let controlWindowPosition = readGlobalConfig("controlWindowPosition", [
        device.height / 3,
        0,
    ]);
    //避免悬浮窗被屏幕边框挡住
    controlWindow.setPosition(controlWindowPosition[0], controlWindowPosition[1]);
    let controlWindowSize = readGlobalConfig("controlWindowSize", [
        device.height / 4,
        -2,
    ]);
    controlWindow.setSize(controlWindowSize[0], controlWindowSize[1]);

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
                setGlobalConfig("controlWindowPosition", [
                    controlWindow.getX(),
                    controlWindow.getY(),
                ]);
                setGlobalConfig("controlWindowSize", [controlWindow.getWidth(), -2]);
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

    let visualizerWindowRequestClose = false;
    //可视化悬浮窗口
    const createVisualizerWindow = function () {
        let visualizerWindow = floaty.window(<canvas id="canv" w="*" h="*" />);
        let visualizerWindowPosition = readGlobalConfig(
            "visualizerWindowPosition",
            [100, 100]
        );
        visualizerWindow.setPosition(
            visualizerWindowPosition[0],
            visualizerWindowPosition[1]
        );
        let visualizerWindowSize = readGlobalConfig("visualizerWindowSize", [
            (device.width * 2) / 3,
            (device.height * 2) / 3,
        ]);
        visualizerWindow.setSize(visualizerWindowSize[0], visualizerWindowSize[1]);
        visualizerWindow.canv.on("draw", function (canvas) {
            visualizer.draw(canvas);
            //如果在绘制时窗口被关闭, app会直接崩溃, 所以这里要等待一下
            if (visualizerWindowRequestClose) {
                sleep(1000);
            }
        });
        //上一次点击的时间
        let visualizerLastClickTime = 0;

        //触摸事件(这里on("click",...) 又失灵了, AutoXjs的文档真是够烂的)
        visualizerWindow.canv.click(function () {
            let now = new Date().getTime();
            if (now - visualizerLastClickTime < 500) {
                // toast("重置悬浮窗大小与位置");
                visualizerWindow.setSize(
                    (device.height * 2) / 3,
                    (device.width * 2) / 3
                );
                visualizerWindow.setPosition(100, 100);
            }
            visualizerLastClickTime = now;
            let adjEnabled = visualizerWindow.isAdjustEnabled();
            visualizerWindow.setAdjustEnabled(!adjEnabled);
            if (adjEnabled) {
                //更新大小 (使用窗口上的拖动手柄缩放时, 窗口的大小实际上是不会变的, 所以这里要手动更新)
                visualizerWindow.setSize(
                    visualizerWindow.getWidth(),
                    visualizerWindow.getHeight()
                );
                //保存当前位置与大小
                setGlobalConfig("visualizerWindowPosition", [
                    visualizerWindow.getX(),
                    visualizerWindow.getY(),
                ]);
                setGlobalConfig("visualizerWindowSize", [
                    visualizerWindow.getWidth(),
                    visualizerWindow.getHeight(),
                ]);
            }
        });
        return visualizerWindow;
    };

    //是否显示可视化窗口
    let visualizerEnabled = readGlobalConfig("visualizerEnabled", false);
    if (visualizerEnabled && gameProfile.getKeyLayout().type === "grid") {
        //TODO: 其它类型的键位布局也可以显示可视化窗口
        visualizerWindow = createVisualizerWindow();
        toast("单击可视化窗口调整大小与位置, 双击重置");
    }

    function visualizerWindowClose() {
        if (visualizerWindow == null) return;
        visualizerWindowRequestClose = true;
        sleep(200);
        visualizerWindow.close();
        visualizerWindowRequestClose = false;
    }
    player.start();
    player.pause();

    player.setOnPlayNote(function (note) {
        currentGestureIndex = note;
        visualizer.goto(Math.max(0, note - 1));
    });

    //隐藏悬浮窗
    controlWindow.yc.on("click", () => {
        controlWindow.w.visibility = 8;
        //如果可视化窗口是显示状态 隐藏
        if (visualizerWindow !== null) {
            visualizerWindow.canv.visibility = 8;
        }
        //关闭悬浮球
        fm.hide();
        ishide = true;
        toast("音量上键显示悬浮窗");
        //启动监听
        events.observeKey();
        //监听音量上键按下
        events.onKeyDown("volume_up", function (event) {
            if (ishide == true) {
                ui.run(function () {
                    //显示所有悬浮窗
                    controlWindow.w.visibility = 0;
                    if (visualizerWindow !== null) {
                        visualizerWindow.canv.visibility = 0;
                    }
                    fm.show();
                    ishide == false;
                });
            }
        });
    });

    evt.on("fileSelect", () => {
        player.stop();
        gameProfile.clearCurrentConfigCache();
        if (visualizerWindow != null) {
            visualizerWindowClose();
            visualizerWindow = null;
        }
        if (isCollect == true) {
            let spiltData = Collect[CollectChoose].split("@MID");
            let index = MusicArr.indexOf(spiltData[0])
            datajson = domArr[index];
            Musicdata = getMusicData(MusicArr[index], datajson.music_type);
        } else {
            datajson = domArr[ofArr];
            Musicdata = getMusicData(MusicArr[ofArr], datajson.music_type);
        }
        jcax();
        let data = loadMusicFile(datajson, Musicdata, ScoreExportType.none);
        if (data == null) {
            return;
        }
        totalTimeSec = data[data.length - 1][1];
        totalTimeStr = sec2timeStr(totalTimeSec);
        musicFileData = data;
        progress = 0;
        progressChanged = true;
        currentGestureIndex = 0;
        evt.emit("fileLoaded");
    });
    evt.on("fileLoaded", () => {
        ui.run(() => {
            controlWindow.songName.setText(datajson.name);
        });
        player.setGestureTimeList(musicFileData);
        //是否显示可视化窗口
        let visualizerEnabled = readGlobalConfig("visualizerEnabled", false);
        if (visualizerEnabled && gameProfile.getKeyLayout().type === "grid") {
            //TODO: 其它类型的键位布局也可以显示可视化窗口
            visualizerWindow = createVisualizerWindow();
            toast("单击可视化窗口调整大小与位置, 双击重置");
        }
        player.start();
        player.pause();
    });
    evt.on("speedLow", () => {
        //获取现在的速度
        let getPlaySpeed = player.getPlaySpeed();
        //设置速度
        player.setPlaySpeed(getPlaySpeed - 0.1);
        ui.run(function () {
            //更新文字，toFixed只保留一位小数
            controlWindow.speed.setText("速度x" + player.getPlaySpeed().toFixed(1));
        });
        //继续播放
        if (player.getState() !== player.PlayerStates.PAUSED) {
            player.resume();
        }
    });
    evt.on("speedHigh", () => {
        //获取现在的速度
        let getPlaySpeed = player.getPlaySpeed();
        //设置速度
        player.setPlaySpeed(getPlaySpeed + 0.1);
        ui.run(function () {
            //更新文字，toFixed只保留一位小数
            controlWindow.speed.setText("速度x" + player.getPlaySpeed().toFixed(1));
        });
        //继续播放
        if (player.getState() !== player.PlayerStates.PAUSED) {
            player.resume();
        }
    });
    evt.on("jrsc", () => {
        if (controlWindow.jrsc.getText() != tu[3]) {
            let userdata = Qiu.inspect.get("userData"); //获取本地存储
            let upCollectUrl = Qiu.DataUrl + "api/UpDataCollect";
            let upCollectHead = {
                userid: userdata.id,
                name: datajson.name,
                type: datajson.music_type,
                appid: Qiu.circle.config.appid,
            };
            let upCollect = Qiu.circle.http_post(upCollectUrl, upCollectHead);
            let getinspect = upCollect.data.split(","); //分割 ”，“
            toast(upCollect.msg);
            ui.run(function () {
                controlWindow.jrsc.setText(tu[3]);
            });
            Qiu.inspect.put("Collection", getinspect); //保存本地存储
        } else {
            let userdata = Qiu.inspect.get("userData"); //获取本地存储
            let upCollectUrl = Qiu.DataUrl + "api/DeleteCollect";
            let upCollectHead = {
                userid: userdata.id,
                name: datajson.name,
                type: datajson.music_type,
                appid: Qiu.circle.config.appid,
            };
            let upCollect = Qiu.circle.http_post(upCollectUrl, upCollectHead);
            let getinspect = upCollect.data.split(","); //分割 ”，“
            toast(upCollect.msg);
            ui.run(function () {
                controlWindow.jrsc.setText(tu[4]);
            });
            Qiu.inspect.put("Collection", getinspect); //保存本地存储
        }
    });

    function controlWindowUpdateLoop() {
        if (
            musicFileData == null ||
            totalTimeSec == null ||
            currentGestureIndex == null ||
            controlWindow == null
        ) {
            return;
        }
        //如果进度条被拖动，更新播放进度
        if (progressChanged) {
            progressChanged = false;
            let targetTimeSec = (totalTimeSec * progress) / 100;
            for (let j = 0; j < musicFileData.length; j++) {
                if (musicFileData[j][1] > targetTimeSec) {
                    currentGestureIndex = j - 1;
                    break;
                }
            }
            currentGestureIndex = Math.max(0, currentGestureIndex);
            player.seekTo(currentGestureIndex);
            console.log("seekTo:" + currentGestureIndex);
            setImmediate(controlWindowUpdateLoop);
        }
        currentGestureIndex = Math.min(
            currentGestureIndex,
            musicFileData.length - 1
        );
        //计算时间
        let curTimeSec = musicFileData[currentGestureIndex][1];
        let curTimeStr = sec2timeStr(curTimeSec);
        let timeStr = curTimeStr + "/" + totalTimeStr;
        //更新窗口
        ui.run(() => {
            controlWindow.progressBar.setProgress((curTimeSec / totalTimeSec) * 100);
            controlWindow.timerText.setText(timeStr);
        });
    }
    setInterval(controlWindowUpdateLoop, 100);
}

function debugDump(obj, name) {
    // console.log("====================" + name + "====================");
    // console.log("Type of " + name + ": " + Object.prototype.toString.call(obj));
    let tmp = JSON.stringify(obj);
    console.log(tmp);
    console.log("====================" + name + "====================");
}

function saveUserGameProfile() {
    let profile = gameProfile.getGameConfigs();
    setGlobalConfig("userGameProfile", profile);
    console.log("保存用户游戏配置成功");
    toast("坐标已保存");
}

//获取坐标
function runClickPosSetup() {
    let pos1 = getPosInteractive("最上面那行按键中最左侧的按键中心");
    let pos2 = getPosInteractive("最下面那行按键中最右侧的按键中心");
    // console.log("自定义坐标:左上[" + pos1.x + "," + pos1.y + "],右下[" + pos2.x + "," + pos2.y + "]");
    gameProfile.setKeyPosition([pos1.x, pos1.y], [pos2.x, pos2.y]);
    saveUserGameProfile();
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
        <frame gravity="left|top">
            <vertical bg="#7fffff7f">
                <text id="promptText" text="" textSize="14sp" />
                <button
                    id="confirmBtn"
                    style="Widget.AppCompat.Button.Colored"
                    text="确定"
                />
                <button
                    id="cancelBtn"
                    style="Widget.AppCompat.Button.Colored"
                    text="取消"
                />
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
        if (
            evt.getAction() == evt.ACTION_DOWN ||
            evt.getAction() == evt.ACTION_MOVE
        ) {
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
