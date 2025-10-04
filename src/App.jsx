import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Clock, Repeat, Footprints, Volume2, VolumeX, ChevronDown, ChevronUp } from 'lucide-react';

export default function App() {
    const [isRunning, setIsRunning] = useState(false);
    const [isWalking, setIsWalking] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [currentCycle, setCurrentCycle] = useState(0);
    const [isMuted, setIsMuted] = useState(false); // 控制步频声音
    const [showSettings, setShowSettings] = useState(false);
    const [isAudioInitialized, setIsAudioInitialized] = useState(false);

    const [settings, setSettings] = useState({
        runTime: 60, // seconds
        walkTime: 30, // seconds
        cycles: 5,
        cadence: 180 // steps per minute
    });

    const [tempSettings, setTempSettings] = useState(settings);
    const intervalRef = useRef(null);
    const cadenceTimeoutRef = useRef(null); // 使用 setTimeout 而不是 setInterval
    const audioContextRef = useRef(null);
    const gainNodeRef = useRef(null);

    // Initialize audio context on first user interaction
    const initAudio = () => {
        if (!audioContextRef.current) {
            try {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
                gainNodeRef.current = audioContextRef.current.createGain();
                gainNodeRef.current.connect(audioContextRef.current.destination);
                gainNodeRef.current.gain.value = 0.3;
                setIsAudioInitialized(true);
            } catch (error) {
                console.error('Audio initialization failed:', error);
            }
        }
    };

    // Play beep sound with specified frequency (ignores isMuted for phase transitions)
    const playBeep = (frequency = 880, duration = 0.1, ignoreMute = false) => {
        // Only respect mute for cadence sounds, not phase transition sounds
        if (!ignoreMute && isMuted && frequency === 660) return;
        if (!audioContextRef.current || !gainNodeRef.current) return;

        try {
            const oscillator = audioContextRef.current.createOscillator();
            oscillator.connect(gainNodeRef.current);
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            oscillator.start();

            setTimeout(() => {
                oscillator.stop();
                oscillator.disconnect();
            }, duration * 1000);
        } catch (error) {
            console.error('Beep sound failed:', error);
        }
    };

    // Schedule next cadence beat
    const scheduleNextCadenceBeat = () => {
        if (!isRunning || isWalking || cadenceTimeoutRef.current) return;

        const cadenceInterval = (60 / settings.cadence) * 1000;
        cadenceTimeoutRef.current = setTimeout(() => {
            playCadenceBeat();
            cadenceTimeoutRef.current = null;
            // Schedule the next beat only if we're still running and in running phase
            if (isRunning && !isWalking) {
                scheduleNextCadenceBeat();
            }
        }, cadenceInterval);
    };

    // Play cadence beat (only during running phase)
    const playCadenceBeat = () => {
        if (isWalking || !isRunning) return;
        playBeep(660, 0.05, false); // Respect mute setting for cadence
    };

    // Start cadence timer
    const startCadenceTimer = () => {
        stopCadenceTimer();
        if (isRunning && !isWalking) {
            scheduleNextCadenceBeat();
        }
    };

    // Stop cadence timer immediately
    const stopCadenceTimer = () => {
        if (cadenceTimeoutRef.current) {
            clearTimeout(cadenceTimeoutRef.current);
            cadenceTimeoutRef.current = null;
        }
    };

    // Calculate total duration
    const totalDuration = (settings.runTime + settings.walkTime) * settings.cycles;

    // Format time for display
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Calculate progress percentage
    const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

    // Calculate current phase time remaining
    const currentPhaseTime = (() => {
        const cycleDuration = settings.runTime + settings.walkTime;
        const timeInCycle = currentTime % cycleDuration;

        if (isWalking) {
            return Math.max(0, settings.walkTime - (timeInCycle - settings.runTime));
        } else {
            return Math.max(0, settings.runTime - timeInCycle);
        }
    })();

    // Timer logic
    useEffect(() => {
        if (isRunning) {
            intervalRef.current = setInterval(() => {
                setCurrentTime(prev => {
                    const newTime = prev + 1;

                    // Check if workout is complete
                    if (newTime >= totalDuration) {
                        setIsRunning(false);
                        setIsWalking(false);
                        playBeep(440, 0.3, true); // Final completion beep - ignore mute
                        stopCadenceTimer();
                        return totalDuration;
                    }

                    // Check phase transitions
                    const cycleDuration = settings.runTime + settings.walkTime;
                    const timeInCycle = newTime % cycleDuration;
                    const newCycle = Math.floor(newTime / cycleDuration) + 1;

                    // Transition from run to walk
                    if (timeInCycle === settings.runTime && !isWalking) {
                        setIsWalking(true);
                        setCurrentCycle(newCycle);
                        playBeep(440, 0.2, true); // Walk transition beep - ignore mute
                        stopCadenceTimer();
                    }
                    // Transition from walk to run
                    else if (timeInCycle === 0 && isWalking && newTime > 0) {
                        setIsWalking(false);
                        setCurrentCycle(newCycle);
                        playBeep(880, 0.2, true); // Run transition beep - ignore mute
                        // Start cadence after a small delay to ensure audio context is ready
                        setTimeout(() => {
                            if (isRunning && !isWalking) {
                                startCadenceTimer();
                            }
                        }, 100);
                    }

                    return newTime;
                });
            }, 1000);
        } else {
            clearInterval(intervalRef.current);
            stopCadenceTimer();
        }

        return () => {
            clearInterval(intervalRef.current);
            stopCadenceTimer();
        };
    }, [isRunning, settings, isWalking, totalDuration]);

    // Handle mute toggle - immediately stop cadence if muted
    useEffect(() => {
        if (isMuted) {
            // When muting, immediately stop any pending cadence beats
            stopCadenceTimer();
        } else {
            // When unmuting, restart cadence if we're in running phase
            if (isRunning && !isWalking) {
                startCadenceTimer();
            }
        }
    }, [isMuted, isRunning, isWalking]);

    // Handle settings changes that affect cadence
    useEffect(() => {
        if (isRunning && !isWalking) {
            startCadenceTimer();
        }
    }, [settings.cadence, isRunning, isWalking]);

    const handleStart = () => {
        // Initialize audio on start (this ensures audio works on first start)
        initAudio();
        setIsRunning(true);

        if (currentTime === 0) {
            setIsWalking(false);
            setCurrentCycle(1);
            // Start cadence immediately if we're in running phase
            setTimeout(() => {
                if (isRunning && !isWalking) {
                    startCadenceTimer();
                }
            }, 100);
        } else if (!isWalking) {
            // If resuming in running phase, start cadence
            setTimeout(() => {
                if (isRunning && !isWalking) {
                    startCadenceTimer();
                }
            }, 100);
        }
    };

    const handlePause = () => {
        setIsRunning(false);
        stopCadenceTimer();
    };

    const handleReset = () => {
        setIsRunning(false);
        setIsWalking(false);
        setCurrentTime(0);
        setCurrentCycle(0);
        stopCadenceTimer();
    };

    const handleSaveSettings = () => {
        setSettings(tempSettings);
        handleReset();
        setShowSettings(false);
    };

    const handleInputChange = (field, value) => {
        setTempSettings(prev => ({
            ...prev,
            [field]: Math.max(1, parseInt(value) || 1)
        }));
    };

    const toggleSettings = () => {
        if (!isRunning) {
            setShowSettings(!showSettings);
        }
    };

    // Test audio function
    const testAudio = () => {
        initAudio();
        playBeep(880, 0.2, true);
        setTimeout(() => playBeep(440, 0.2, true), 300);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 text-white">
            {/* Header */}
            <div className="container mx-auto px-4 py-6">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                        法特莱克跑训练器
                    </h1>
                    <p className="text-blue-200 text-sm">间歇式跑步训练，提升耐力与速度</p>
                    {!isAudioInitialized && (
                        <button
                            onClick={testAudio}
                            className="mt-2 text-xs text-cyan-300 hover:text-cyan-200 underline"
                        >
                            点击测试音频
                        </button>
                    )}
                </div>

                <div className="max-w-2xl mx-auto">
                    {/* Main Timer Display */}
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-4 border border-white/20">
                        <div className="text-center mb-4">
                            <div className="text-5xl font-mono font-bold mb-3 text-cyan-300 tracking-tight">
                                {formatTime(currentPhaseTime)}
                            </div>
                            <div className={`text-lg font-semibold mb-2 ${isWalking ? 'text-red-300' : 'text-cyan-300'}`}>
                                {isWalking ? '步行阶段' : '跑步阶段'}
                            </div>
                            <div className="text-blue-200 text-sm">
                                第 {currentCycle || 1} / {settings.cycles} 轮
                            </div>
                            {isRunning && !isWalking && (
                                <div className="text-xs text-green-300 mt-1">
                                    步频节拍: {settings.cadence} 步/分钟 {isMuted && '(已静音)'}
                                </div>
                            )}
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-4">
                            <div className="w-full bg-white/20 rounded-full h-2 mb-2 overflow-hidden">
                                <div
                                    className="bg-gradient-to-r from-cyan-400 to-purple-400 h-full rounded-full transition-all duration-1000 ease-linear"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between text-xs text-blue-200">
                                <span>0:00</span>
                                <span>{formatTime(totalDuration)}</span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex justify-center gap-2 mb-4 flex-wrap">
                            {!isRunning ? (
                                <button
                                    onClick={handleStart}
                                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 px-5 py-2.5 rounded-full flex items-center gap-2 font-semibold text-sm md:text-base transition-all duration-200 transform hover:scale-105 min-w-[100px]"
                                >
                                    <Play size={18} />
                                    开始
                                </button>
                            ) : (
                                <button
                                    onClick={handlePause}
                                    className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 px-5 py-2.5 rounded-full flex items-center gap-2 font-semibold text-sm md:text-base transition-all duration-200 transform hover:scale-105 min-w-[100px]"
                                >
                                    <Pause size={18} />
                                    暂停
                                </button>
                            )}

                            <button
                                onClick={handleReset}
                                className="bg-white/20 hover:bg-white/30 px-4 py-2.5 rounded-full flex items-center gap-2 font-semibold transition-all duration-200 min-w-[80px]"
                            >
                                <RotateCcw size={18} />
                            </button>

                            <button
                                onClick={() => setIsMuted(!isMuted)}
                                className="bg-white/20 hover:bg-white/30 px-4 py-2.5 rounded-full flex items-center gap-2 font-semibold transition-all duration-200 min-w-[80px]"
                            >
                                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                            </button>
                        </div>

                        {/* Settings Toggle Button */}
                        <button
                            onClick={toggleSettings}
                            disabled={isRunning}
                            className="w-full bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:cursor-not-allowed px-4 py-3 rounded-xl flex items-center justify-between font-semibold text-sm transition-all duration-200"
                        >
                            <span>训练设置</span>
                            {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>

                        {/* Settings Panel - Integrated */}
                        {showSettings && (
                            <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10">
                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-blue-200 mb-2 text-sm">
                                            <Clock size={14} />
                                            跑步时间 (秒)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={tempSettings.runTime}
                                            onChange={(e) => handleInputChange('runTime', e.target.value)}
                                            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-2 text-blue-200 mb-2 text-sm">
                                            <Clock size={14} />
                                            步行时间 (秒)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={tempSettings.walkTime}
                                            onChange={(e) => handleInputChange('walkTime', e.target.value)}
                                            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-2 text-blue-200 mb-2 text-sm">
                                            <Repeat size={14} />
                                            循环次数
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={tempSettings.cycles}
                                            onChange={(e) => handleInputChange('cycles', e.target.value)}
                                            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-2 text-blue-200 mb-2 text-sm">
                                            <Footprints size={14} />
                                            跑步步频 (步/分钟)
                                        </label>
                                        <input
                                            type="number"
                                            min="60"
                                            max="240"
                                            value={tempSettings.cadence}
                                            onChange={(e) => handleInputChange('cadence', e.target.value)}
                                            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <button
                                        onClick={handleSaveSettings}
                                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 transform hover:scale-102"
                                    >
                                        保存设置并重置
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Current Settings Summary - Always Visible */}
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-white/5 rounded-lg p-2">
                                <div className="text-blue-300 mb-1 text-xs">跑步时间</div>
                                <div className="text-sm font-bold">{settings.runTime}s</div>
                            </div>
                            <div className="bg-white/5 rounded-lg p-2">
                                <div className="text-blue-300 mb-1 text-xs">步行时间</div>
                                <div className="text-sm font-bold">{settings.walkTime}s</div>
                            </div>
                            <div className="bg-white/5 rounded-lg p-2">
                                <div className="text-blue-300 mb-1 text-xs">循环次数</div>
                                <div className="text-sm font-bold">{settings.cycles}</div>
                            </div>
                            <div className="bg-white/5 rounded-lg p-2">
                                <div className="text-blue-300 mb-1 text-xs">步频</div>
                                <div className="text-sm font-bold">{settings.cadence}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}