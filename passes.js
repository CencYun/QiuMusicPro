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

//algorithms.js 
function Algorithms() {
    /**
     * 伪随机数生成器
     * @param {number} seed_
     * @returns {function():number} 
     */
    this.PRNG = function (seed_) {
        var seed = 0x2F6E2B1;
        if (seed_ != undefined) {
            seed = seed_;
        }
        return function () {
            // Robert Jenkins’ 32 bit integer hash function
            seed = ((seed + 0x7ED55D16) + (seed << 12)) & 0xFFFFFFFF;
            seed = ((seed ^ 0xC761C23C) ^ (seed >>> 19)) & 0xFFFFFFFF;
            seed = ((seed + 0x165667B1) + (seed << 5)) & 0xFFFFFFFF;
            seed = ((seed + 0xD3A2646C) ^ (seed << 9)) & 0xFFFFFFFF;
            seed = ((seed + 0xFD7046C5) + (seed << 3)) & 0xFFFFFFFF;
            seed = ((seed ^ 0xB55A4F09) ^ (seed >>> 16)) & 0xFFFFFFFF;
            return (seed & 0xFFFFFFF) / 0x10000000;
        };
    };

    /**
     * @brief 洗牌算法, 随机打乱数组
     * @param {Array} array 要打乱的数组
     * @param {function():number} randomFunc 随机数生成器
     * @returns {Array} 打乱后的数组
     */
    this.shuffle = function (array, randomFunc) {
        var i = array.length, j, temp;
        if (i == 0) return array;
        while (--i) {
            j = Math.floor(randomFunc() * (i + 1));
            temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
        return array;
    }
}

/**
 * @brief 从云端获取乐普数据
 * @param {Object} config
 */
function GetScoreDataPass(config) {
    this.name = "GetScoreDataPass";
    this.description = "获取乐谱数据";

    /**
     * 运行此pass
     * @param {string} scoreInfo - 乐谱信息（乐谱名、乐谱类型）
     * @param {function(number):void} [progressCallback] - 进度回调函数, 参数为进度(0-100)
     * @returns- 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (scoreInfo, progressCallback) {
        let musicinfo = module.http_post("api/GetMusicInfo", {
            appid: module.getConfig("appid"),
            name: scoreInfo.name,
            type: scoreInfo.music_type,
        });
        if (musicinfo == null || musicinfo.code != 200) {
            ui.run(() => {
                dialogs.alert("网络错误", "服务器未响应，请检查网络连接或稍后再试。");
            })
            return null;
        }
        return JSON.parse(musicinfo.data.content);
    }

    this.getStatistics = function () {
        return {};
    }
}

/**
 * @brief 解析乐谱数据, 输出音乐数据
 * @param {Object} config
 */
function ParseSourceDataPass(config) {
    this.name = "ParseSourceDataPass";
    this.description = "解析乐谱数据";

    let totalNoteCnt = 0;
    /**
     * 运行此pass
     * @param {string} tracksData - 乐谱数据
     * @param {function(number):void} [progressCallback] - 进度回调函数, 参数为进度(0-100)
     * @returns {MusicFormats.TracksData} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (tracksData, scoreType) {
        if (tracksData.haveMultipleTrack) return tracksData;
        let musicFormats = new MusicFormats();
        let tracksData = musicFormats.parseFromString(tracksData, scoreType);
        totalNoteCnt = tracksData.tracks.reduce((acc, track) => acc + track.noteCount, 0);
        return tracksData;
    }

    this.getStatistics = function () {
        return {
            totalNoteCnt: totalNoteCnt
        };
    }
}

/**
 * @brief 删除空的音轨
 * @typedef {Object} RemoveEmptyTracksPassConfig
 * @param {RemoveEmptyTracksPassConfig} config
 */
function RemoveEmptyTracksPass(config) {
    this.name = "RemoveEmptyTracksPass";
    this.description = "删除空的音轨";
    /**
     * 运行此pass
     * @param {MusicFormats.TracksData} tracksData - 音乐数据
     * @param {function(number):void} [progressCallback] - 进度回调函数, 参数为进度(0-100)
     * @returns {MusicFormats.TracksData} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (tracksData, progressCallback) {
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
    this.getStatistics = function () {
        return {};
    }
}

/**
 * @brief 合并指定的音轨中所有音符到一个音符数组中
 * @typedef {Object} MergeTracksPassConfig
 * @property {number[]} [selectedTracks] - 要合并的音轨序号数组, 为空则合并所有音轨
 * @property {boolean} [skipPercussion] - 是否跳过打击乐器通道(通道10), 默认为true
 * @param {MergeTracksPassConfig} config
 */
function MergeTracksPass(config) {
    this.name = "MergeTracksPass";
    this.description = "合并音轨";

    let selectedTracks = config.selectedTracks;

    let skipPercussion = true;
    if (config.skipPercussion != null) {
        skipPercussion = config.skipPercussion;
    }

    /**
     * 运行此pass
     * @param {MusicFormats.TracksData} tracksData - 音乐数据
     * @param {function(number):void} [progressCallback] - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.Note[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (tracksData, progressCallback) {
        if (!tracksData.haveMultipleTrack) return tracksData.tracks[0].notes;
        if (selectedTracks == null || selectedTracks.length == 0) {
            selectedTracks = [];
            for (let i = 0; i < tracksData.tracks.length; i++) {
                selectedTracks.push(i); //默认选择所有音轨
            }
        }
        let noteData = [];
        for (let i = 0; i < selectedTracks.length; i++) {
            if (selectedTracks[i] >= tracksData.tracks.length) continue;
            let track = tracksData.tracks[selectedTracks[i]];
            if (track.channel === 9 && skipPercussion) continue;
            noteData = noteData.concat(track.notes);
        }
        noteData.sort(function (a, b) {
            return a[1] - b[1];
        });
        return noteData;
    }
    this.getStatistics = function () {
        return {};
    }
}

/**
 * @brief 将每个音符的当前时间(ms)存储在属性中
 * @typedef {Object} StoreCurrentNoteTimePassConfig
 * @param {StoreCurrentNoteTimePassConfig} [config]
 */
function StoreCurrentNoteTimePass(config) {
    this.name = "StoreCurrentNoteTimePass";
    this.description = "将音符当前时间存储在属性中";

    const attributeName = "originalTime";

    /**
     * 运行此pass
     * @param {noteUtils.NoteLike[]} noteData - 音乐数据
     * @param {function(number):void} [progressCallback] - 进度回调函数，参数为进度(0-100)
     * @returns {noteUtils.NoteLike[]} - 返回处理后的数据
     */
    this.run = function (noteData, progressCallback) {
        noteData.forEach((note, index) => {
            note[2][attributeName] = note[1];
        });

        return noteData;
    };

    this.getStatistics = function () {
    };
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
            if (noteData[i][2]["duration"] != null)
                noteData[i][2]["duration"] /= speed;
        }
        return noteData;
    }

    this.getStatistics = function () {
        return {};
    }
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
    let maxBatchSize = 19; // 最大合并数量

    if (config.maxInterval == null) {
        throw new Error("maxInterval is null");
    }
    maxInterval = config.maxInterval;
    if (config.maxBatchSize != null) {
        maxBatchSize = config.maxBatchSize;
    }
    let droppedSameNoteCount = 0;

    /**
     * 运行此pass
     * @param {noteUtils.NoteLike[]} noteData - 音乐数据
     * @param {function(number):void} [progressCallback] - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.NoteLike[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteData, progressCallback) {
        // log(noteData)
        let lastTime = noteData[0][1];
        let lastSize = 0;
        let lastNotes = new Set();
        lastNotes.add(noteData[0][0]);
        for (let i = 1; i < noteData.length; i++) {
            let note = noteData[i];
            if (note[1] - lastTime < maxInterval && lastSize < maxBatchSize) {
                note[1] = lastTime;
                //检查重复
                if (lastNotes.has(note[0])) {
                    noteUtils.softDeleteNoteAt(noteData, i);
                    droppedSameNoteCount++;
                    continue;
                }
                lastNotes.add(note[0]);
                lastSize++;
            } else {
                lastNotes = new Set();
                lastNotes.add(note[0]);
                lastSize = 0;
                lastTime = note[1];
            }
        }
        noteUtils.applyChanges(noteData);
        return noteData;
    }

    this.getStatistics = function () {
        return {
            "droppedSameNoteCount": droppedSameNoteCount
        };
    }
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
     * @param {noteUtils.Note[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.Note[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteData, progressCallback) {
        let humanifyer = new Humanify();
        humanifyer.setNoteAbsTimeStdDev(noteAbsTimeStdDev);
        noteData = humanifyer.humanify(noteData);
        return noteData;
    }
    this.getStatistics = function () {
        return {};
    }
}

/**
 * @brief 给每个音符的音高加一个偏移
 * @typedef {Object} PitchOffsetPassConfig
 * @property {number} offset - 音高偏移量(半音为单位)
 * @param {PitchOffsetPassConfig} config
 */
function PitchOffsetPass(config) {
    this.name = "PitchOffsetPass";
    this.description = "给每个音符的音高加一个偏移";

    let offset = 0;

    if (config.offset == null) {
        throw new Error("offset is null");
    }
    offset = config.offset;

    /**
     * 运行此pass
     * @param {noteUtils.NoteLike[]} noteData - 音乐数据
     * @param {function(number):void} [progressCallback] - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.NoteLike[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteData, progressCallback) {
        for (let i = 0; i < noteData.length; i++) {
            noteData[i][0] += offset;
        }
        return noteData;
    }
    this.getStatistics = function () {
        return {};
    }
}

/**
 * @enum {number}
 * @constant
 */
var SemiToneRoundingMode = {
    //不做处理
    none: -1,
    //取较低的音符
    floor: 0,
    //取较高的音符
    ceil: 1,
    //删除音符
    drop: 2,
    //同时取较低和较高的音符
    both: 3,
    //交替取较低和较高的音符
    alternating: 4
}
/**
 * @brief 处理目标游戏中无法演奏的音符
 * @typedef {Object} LegalizeTargetNoteRangePassConfig
 * @property {SemiToneRoundingMode} semiToneRoundingMode - 半音处理方式
 * @property {number} [wrapHigherOctave] - 将超出最高音n个八度内的音符移动到范围内, 默认为0
 * @property {number} [wrapLowerOctave] - 将超出最低音n个八度内的音符移动到范围内, 默认为0
 * @property {GameProfile} currentGameProfile - 当前游戏配置
 * @param {LegalizeTargetNoteRangePassConfig} config
 */
function LegalizeTargetNoteRangePass(config) {
    this.name = "LegalizeTargetNoteRangePass";
    this.description = "处理目标游戏中无法演奏的音符";

    let semiToneRoundingMode = SemiToneRoundingMode.floor;
    let wrapHigherOctave = 0;
    let wrapLowerOctave = 0;
    let currentGameProfile = null;

    let underFlowedNoteCnt = 0;
    let overFlowedNoteCnt = 0;
    let roundedNoteCnt = 0;
    let middleFailedNoteCnt = 0;
    let wrappedHigherNoteCnt = 0;
    let wrappedLowerNoteCnt = 0;
    let lastIsFloor = false;


    if (config.semiToneRoundingMode == null) {
        throw new Error("semiToneRoundingMode is null");
    }
    if (config.currentGameProfile == null) {
        throw new Error("currentGameProfile is null");
    }
    semiToneRoundingMode = config.semiToneRoundingMode;
    currentGameProfile = config.currentGameProfile;

    if (config.wrapHigherOctave != null) {
        wrapHigherOctave = config.wrapHigherOctave;
    }
    if (config.wrapLowerOctave != null) {
        wrapLowerOctave = config.wrapLowerOctave;
    }

    /**
     * 运行此pass
     * @param {noteUtils.Note[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.Note[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteData, progressCallback) {
        let processedNoteData = [];
        let noteRange = currentGameProfile.getNoteRange();

        for (let i = 0; i < noteData.length; i++) {
            let note = noteData[i];
            let midiPitch = note[0];
            //超出范围的音符
            if (midiPitch < noteRange[0]) {
                if (midiPitch >= noteRange[0] - wrapLowerOctave * 12) {
                    midiPitch += 12 * Math.ceil((noteRange[0] - midiPitch) / 12);
                    note[0] = midiPitch;
                    wrappedLowerNoteCnt++;
                } else {
                    underFlowedNoteCnt++;
                    continue;
                }
            }
            if (midiPitch > noteRange[1]) {
                if (midiPitch <= noteRange[1] + wrapHigherOctave * 12) {
                    midiPitch -= 12 * Math.ceil((midiPitch - noteRange[1]) / 12);
                    note[0] = midiPitch;
                    wrappedHigherNoteCnt++;
                } else {
                    overFlowedNoteCnt++;
                    continue;
                }
            }
            let key = currentGameProfile.getKeyByPitch(midiPitch);
            if (key != -1) { //有对应的按键, 不需要处理
                processedNoteData.push(note);
                continue;
            }
            //半音, 需要处理
            switch (semiToneRoundingMode) {
                case SemiToneRoundingMode.none:
                    processedNoteData.push(note);
                    break;
                case SemiToneRoundingMode.floor:
                    if (currentGameProfile.getKeyByPitch(midiPitch - 1) != -1) {
                        processedNoteData.push([midiPitch - 1, note[1], note[2]]);
                        roundedNoteCnt++;
                    }
                    break;
                case SemiToneRoundingMode.ceil:
                    if (currentGameProfile.getKeyByPitch(midiPitch + 1) != -1) {
                        processedNoteData.push([midiPitch + 1, note[1], note[2]]);
                        roundedNoteCnt++;
                    }
                    break;
                case SemiToneRoundingMode.drop:
                    break;
                case SemiToneRoundingMode.both:
                    if (currentGameProfile.getKeyByPitch(midiPitch - 1) != -1) {
                        processedNoteData.push([midiPitch - 1, note[1], note[2]]);
                        roundedNoteCnt++;
                    }
                    if (currentGameProfile.getKeyByPitch(midiPitch + 1) != -1) {
                        processedNoteData.push([midiPitch + 1, note[1], note[2]]);
                    }
                    break;
                case SemiToneRoundingMode.alternating:
                    if (lastIsFloor) {
                        if (currentGameProfile.getKeyByPitch(midiPitch + 1) != -1) {
                            processedNoteData.push([midiPitch + 1, note[1], note[2]]);
                            lastIsFloor = false;
                            roundedNoteCnt++;
                        }
                    } else {
                        if (currentGameProfile.getKeyByPitch(midiPitch - 1) != -1) {
                            processedNoteData.push([midiPitch - 1, note[1], note[2]]);
                            lastIsFloor = true;
                            roundedNoteCnt++;
                        }
                    }
                    break;
                default:
                    throw new Error("未知的半音处理方式: " + semiToneRoundingMode);
            }
        }
        //@ts-ignore
        return processedNoteData;
    }

    this.getStatistics = function () {
        return {
            "underFlowedNoteCnt": underFlowedNoteCnt,
            "overFlowedNoteCnt": overFlowedNoteCnt,
            "roundedNoteCnt": roundedNoteCnt,
            "middleFailedNoteCnt": middleFailedNoteCnt
        };
    }
}

/**
 * @brief 限制同一按键的最高频率, 删除超过频率的音符
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
     * @param {noteUtils.NoteLike[]} noteData - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.NoteLike} - 返回解析后的数据
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
                        //console.log("删除过于密集的音符:" + nextNote[0] + "(diff:" + (nextNote[1] - note[1]) + ")");
                        droppedNoteCnt++;
                    }
                }
                if (nextNote[1] - note[1] > sameNoteGapMin) {
                    break;
                }
                j++;
            }
            if (progressCallback != null && i % 10 == 0) {
                progressCallback(100 * i / noteData.length);
            }
        }
        return noteData;
    }
    this.getStatistics = function () {
        return {
            "droppedNoteCnt": droppedNoteCnt
        };
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
     * @param {function(number):void} [progressCallback] - 进度回调函数, 参数为进度(0-100)
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

/**
 * @brief 将音符数组转换为对应游戏的按键数组
 * @typedef {Object} NoteToKeyPassConfig
 * @property {GameProfile} currentGameProfile - 当前游戏配置
 * @param {NoteToKeyPassConfig} config
 */
function NoteToKeyPass(config) {
    this.name = "NoteToKeyPass";
    this.description = "将音符转换为按键";

    let currentGameProfile = null;

    if (config.currentGameProfile == null) {
        throw new Error("currentGameProfile is null");
    }
    currentGameProfile = config.currentGameProfile;

    /**
     * 运行此pass
     * @param {noteUtils.Note[]} noteList - 音乐数据
     * @param {function(number):void} progressCallback - 进度回调函数, 参数为进度(0-100)
     * @returns {noteUtils.Key[]} - 返回解析后的数据
     * @throws {Error} - 如果解析失败则抛出异常
     */
    this.run = function (noteList, progressCallback) {
        let keyList = [];
        for (let i = 0; i < noteList.length; i++) {
            let key = currentGameProfile.getKeyByPitch(noteList[i][0]);
            if (key == -1) {
                throw new Error("无法将音符转换为按键: " + noteList[i][0]);
            }
            keyList.push([key, noteList[i][1], noteList[i][2]]);
        }
        // @ts-ignore
        return keyList;
    }
    this.getStatistics = function () {
        return {
        };
    }
}

/**
 * @brief 按顺序执行一系列pass
 * @typedef {Object} SequentialPassConfig
 * @property {Array<Pass>} passes - pass列表
 * @param {SequentialPassConfig} config
 */
function SequentialPass(config) {
    this.name = "SequentialPass";
    this.description = "按顺序执行一系列pass";

    let passes = new Array();

    /**
     * @type {Object.<string, any>}
     */
    let statistics = {};

    if (config.passes == null) {
        throw new Error("passes is null");
    }
    passes = config.passes;

    /**
     * 运行此pass
     * @param {any} data
     * @param {function(number, string):void} [progressCallback] - 进度回调函数, 参数为进度(0-100)和当前pass描述
     * @returns {any} - 返回处理后的数据
     */
    this.run = function (data, progressCallback) {
        let currentData = data;
        for (let i = 0; i < passes.length; i++) {
            if (progressCallback != null)
                progressCallback(i / passes.length * 100, passes[i].description);
            currentData = passes[i].run(currentData, (progress) => { });
            statistics[passes[i].name] = passes[i].getStatistics();
        }
        return currentData;
    }

    this.getStatistics = function () {
        return statistics;
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

    let maxGestureSize_mid = Math.ceil(maxGestureSize * 2 / 3);
    let maxGestureSize_low = Math.ceil(maxGestureSize * 1 / 3);
    const eps_mid = 1;

    //统计数据
    let directlyTruncatedNoteCnt = 0;
    let groupTruncatedNoteCnt = 0;
    let sameKeyTruncatedNoteCnt = 0;
    let removedShortNoteCnt = 0;


    /**
     * 运行此pass
     * @param {noteUtils.Key[]} noteData - 音乐数据
     * @param {function(number):void} [progressCallback] - 进度回调函数, 参数为进度(0-100)
     * @returns {import("./players.js").Gestures} - 返回解析后的数据
     */
    this.run = function (noteData, progressCallback) {
        let haveDurationProperty = noteData[0][2] != null && noteData[0][2]["duration"] != null;
        let gestureTimeList = new Array();
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
                    gestureTimeList.push([gestureArray, time]);
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
            for (let currentKey of noteData) {
                // console.log(`key: ${JSON.stringify(key)}`);
                let thisStartTime = currentKey[1];
                //@ts-ignore
                let thisDuration = currentKey[2]["duration"];
                let thisEndTime = thisStartTime + thisDuration;
                //截断超过最大手势长度的部分
                if (thisEndTime - thisStartTime > maxGestureDuration) {
                    thisEndTime = thisStartTime + maxGestureDuration;
                    directlyTruncatedNoteCnt++;
                }
                //这是这组按键的第一个按键
                if (currentGroupKeys.length == 0) {
                    currentGroupStartTime = thisStartTime;
                    currentGroupEndTime = thisEndTime;
                    currentGroupKeys.push([currentKey[0], thisStartTime, thisEndTime]);
                    continue;
                }
                //检查是否要开始新的一组
                //这个按键的开始时间大于这组按键的结束时间, 或当前组按键数量已经达到最大值
                //则开始新的一组
                if (currentGroupKeys.length >= maxGestureSize ||
                    // 按键较少时, 让连续的按键分到同一组
                    (currentGroupKeys.length < maxGestureSize_low && thisStartTime - currentGroupEndTime > marginDuration) ||
                    // 按键较多时, 则划分到不同组
                    (currentGroupKeys.length > maxGestureSize_mid && thisStartTime - currentGroupEndTime > - marginDuration) ||
                    // 其它时候
                    (currentGroupKeys.length >= maxGestureSize_low && currentGroupKeys.length <= maxGestureSize_mid && thisStartTime - currentGroupEndTime > eps_mid)) {
                    //console.log(`start: ${currentGroupStartTime}ms, end: ${currentGroupEndTime}ms, current: ${thisStartTime}ms, groupduration: ${currentGroupEndTime - currentGroupStartTime}ms, size: ${currentGroupKeys.length}`);
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
                    currentGroupKeys.push([currentKey[0], thisStartTime, thisEndTime]);
                    continue;
                }
                //检查是否与相同的按键重叠
                let overlappedSamekeyIndex = currentGroupKeys.findIndex((e) => {
                    return e[0] == currentKey[0] && e[2] > thisStartTime;
                });
                if (overlappedSamekeyIndex != -1) {
                    // //把重叠的按键连接起来
                    // let overlappedSamekey = currentGroupKeys[overlappedSamekeyIndex];
                    // thisStartTime = overlappedSamekey[1];
                    // if (thisEndTime < overlappedSamekey[2]) {
                    //     thisEndTime = overlappedSamekey[2];
                    // }
                    // currentGroupKeys.splice(overlappedSamekeyIndex, 1);
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
                currentGroupKeys.push([currentKey[0], thisStartTime, thisEndTime]);
                if (thisEndTime > currentGroupEndTime)
                    currentGroupEndTime = thisEndTime;
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
                    gestureTimeList.push([gestureArray, groupStartTime]);
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