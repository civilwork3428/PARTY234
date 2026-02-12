
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Timer, Star, RotateCcw, Download, Smile, Award, Zap, Ghost, HelpCircle, X, User, Sun, Moon } from 'lucide-react';

// 專業難度配置 - 僅保留圖騰標識
const LEVELS = {
  BASIC: { key: 'BASIC' as const, icon: '🌱', grid: 'grid-cols-3', total: 6, dupCount: 2, targetTypes: 1, score: 1, order: 0 },
  ADVANCED: { key: 'ADVANCED' as const, icon: '🌳', grid: 'grid-cols-3', total: 9, dupCount: 2, targetTypes: 1, score: 2, order: 1 },
  LUXURY: { key: 'LUXURY' as const, icon: '🌲', grid: 'grid-cols-4', total: 12, dupCount: 4, targetTypes: 2, score: 5, order: 2 },
  CHAOS: { key: 'CHAOS' as const, icon: '🌈', grid: 'grid-cols-4', total: 12, dupCount: 0, targetTypes: 0, score: 10, order: 3 },
};

const TOTEMS = ['🐕', '🐈', '🐸', '🐇', '🐂', '🔥', '🌀', '🍃', '⭐', '🎵'];

type LevelKey = keyof typeof LEVELS;

interface Card {
  id: number;
  value: string;
}

class SoundSystem {
  ctx: AudioContext | null = null;
  init() { if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 0.1) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
  click() { this.playTone(1000, 'sine', 0.1, 0.05); } 
  correct() {
    this.playTone(800, 'sine', 0.1, 0.05);
    setTimeout(() => this.playTone(1200, 'sine', 0.15, 0.05), 50);
  }
  wrong() { this.playTone(150, 'sawtooth', 0.4, 0.1); }
  victory() {
    [523, 659, 783, 1046].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'sine', 0.5, 0.05), i * 150);
    });
  }
}

const sounds = new SoundSystem();

const App: React.FC = () => {
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameOver' | 'error'>('menu');
  const [currentLevel, setCurrentLevel] = useState<LevelKey>('BASIC');
  const [highestLevelIndex, setHighestLevelIndex] = useState(0); 
  const [scoreBreakdown, setScoreBreakdown] = useState({ BASIC: 0, ADVANCED: 0, LUXURY: 0, CHAOS: 0 });
  const [totalClicks, setTotalClicks] = useState(0);
  const [correctClicks, setCorrectClicks] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [targetValues, setTargetValues] = useState<string[]>([]);
  const [chaosLogic, setChaosLogic] = useState<'FIND_UNIQUE' | 'FIND_TRIPLET' | null>(null);
  const [chaosTargetCount, setChaosTargetCount] = useState(0);
  const [flashKey, setFlashKey] = useState(0); 
  const [maskedValues, setMaskedValues] = useState<string[]>([]); 
  const [showHelp, setShowHelp] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [visualMode, setVisualMode] = useState<'normal' | 'night'>('normal');
  const timerRef = useRef<number | null>(null);

  const generateLevel = useCallback((levelKey: LevelKey) => {
    const config = LEVELS[levelKey];
    const shuffledTotems = [...TOTEMS].sort(() => Math.random() - 0.5);
    let levelCards: string[] = [];
    let targets: string[] = [];
    let requiredCount = 0;
    setMaskedValues([]); 

    if (levelKey === 'CHAOS') {
      const isUniqueLogic = Math.random() > 0.5;
      if (isUniqueLogic) {
        setChaosLogic('FIND_UNIQUE');
        const dups = shuffledTotems.slice(0, 5);
        const unique = shuffledTotems.slice(5, 7);
        dups.forEach(v => { levelCards.push(v); levelCards.push(v); });
        unique.forEach(v => { levelCards.push(v); });
        targets = unique;
        requiredCount = 2;
      } else {
        setChaosLogic('FIND_TRIPLET');
        const triplet = shuffledTotems.slice(0, 1);
        const pairs = shuffledTotems.slice(1, 5);
        const unique = shuffledTotems.slice(5, 6);
        triplet.forEach(v => { levelCards.push(v); levelCards.push(v); levelCards.push(v); });
        pairs.forEach(v => { levelCards.push(v); levelCards.push(v); });
        unique.forEach(v => { levelCards.push(v); });
        targets = triplet;
        requiredCount = 3;
      }
      setChaosTargetCount(requiredCount);
      setFlashKey(prev => prev + 1); 
    } else {
      setChaosLogic(null);
      targets = shuffledTotems.slice(0, config.targetTypes);
      const othersNeeded = config.total - (config.targetTypes * 2);
      const otherValues = shuffledTotems.slice(config.targetTypes, config.targetTypes + othersNeeded);
      targets.forEach(val => { levelCards.push(val); levelCards.push(val); });
      levelCards = [...levelCards, ...otherValues];
      requiredCount = config.dupCount;
    }
    setTargetValues(targets);
    setCards(levelCards.sort(() => Math.random() - 0.5).map((val) => ({ id: Math.random(), value: val })));
    setSelectedIndices([]);
  }, []);

  const changeLevel = (newLevelKey: LevelKey) => {
    const newConfig = LEVELS[newLevelKey];
    if (newConfig.order < highestLevelIndex) return; 
    sounds.click();
    setCurrentLevel(newLevelKey);
    setHighestLevelIndex(newConfig.order);
    generateLevel(newLevelKey);
  };

  const startGame = () => {
    sounds.init(); sounds.click();
    setScoreBreakdown({ BASIC: 0, ADVANCED: 0, LUXURY: 0, CHAOS: 0 });
    setTotalClicks(0); setCorrectClicks(0); setTimeLeft(60);
    setCurrentLevel('BASIC'); setHighestLevelIndex(0);
    setGameState('playing'); generateLevel('BASIC');
  };

  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      timerRef.current = window.setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && gameState === 'playing') {
      sounds.victory(); setGameState('gameOver');
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [gameState, timeLeft]);

  const handleCardClick = (index: number) => {
    const clickedCard = cards[index];
    if (gameState !== 'playing' || selectedIndices.includes(index) || maskedValues.includes(clickedCard.value)) return;
    
    setTotalClicks(prev => prev + 1);
    const isCorrectTarget = targetValues.includes(clickedCard.value);
    const config = LEVELS[currentLevel];
    const required = currentLevel === 'CHAOS' ? chaosTargetCount : config.dupCount;

    if (!isCorrectTarget) {
      sounds.wrong();
      const currentBoardValues = Array.from(new Set(cards.map(c => c.value)));
      const wrongTypesOnBoard = currentBoardValues.filter(v => !targetValues.includes(v) && !maskedValues.includes(v));
      if (wrongTypesOnBoard.length > 0) {
        const randomWrongType = wrongTypesOnBoard[Math.floor(Math.random() * wrongTypesOnBoard.length)];
        setMaskedValues(prev => [...prev, randomWrongType]);
      }
      setGameState('error');
      setTimeout(() => { setGameState('playing'); setSelectedIndices([]); }, 1200);
      return;
    }

    sounds.click();
    setCorrectClicks(prev => prev + 1);
    const newSelected = [...selectedIndices, index];
    setSelectedIndices(newSelected);
    if (newSelected.length === required) {
      sounds.correct();
      setScoreBreakdown(prev => ({ ...prev, [currentLevel]: prev[currentLevel] + config.score }));
      setTimeout(() => generateLevel(currentLevel), 100); 
    }
  };

  const totalScore = scoreBreakdown.BASIC + scoreBreakdown.ADVANCED + scoreBreakdown.LUXURY + scoreBreakdown.CHAOS;
  const accuracy = totalClicks === 0 ? 0 : Math.round((correctClicks / totalClicks) * 100);

  const exportResultAsJPG = () => {
    sounds.click();
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 1400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayName = playerName.trim() || '尊貴的玩家';

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1000, 1400);
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 30; ctx.strokeRect(50, 50, 900, 1300);
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 10; ctx.strokeRect(30, 30, 940, 1340);
    ctx.fillStyle = '#1e3a8a'; ctx.font = '900 80px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🏆 挑戰成就獎狀', 500, 220);
    
    ctx.fillStyle = '#64748b'; ctx.font = 'bold 36px sans-serif';
    ctx.fillText('恭喜完成動物捉迷藏測試', 500, 310);

    ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 44px sans-serif';
    ctx.fillText(`頒發給：${displayName}`, 500, 400);

    ctx.fillStyle = '#ef4444'; ctx.font = '900 280px tabular-nums';
    ctx.fillText(totalScore.toString(), 500, 720);
    ctx.fillStyle = '#1e3a8a'; ctx.font = 'bold 60px sans-serif';
    ctx.fillText('POINTS', 500, 820);

    const drawStats = (x: number, y: number, label: string, val: string, color: string) => {
      ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.roundRect(x, y, 400, 180, 40); ctx.fill();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 30px sans-serif'; ctx.fillText(label, x + 200, y + 60);
      ctx.fillStyle = color; ctx.font = '900 65px sans-serif'; ctx.fillText(val, x + 200, y + 140);
    };
    drawStats(80, 950, '操作精確度', accuracy + '%', '#f59e0b');
    drawStats(520, 950, '反應點擊次數', totalClicks.toString(), '#3b82f6');
    
    ctx.fillStyle = '#64748b'; ctx.font = 'italic 28px sans-serif';
    ctx.fillText('這是一份有效觀察力的證明', 500, 1220);

    const link = document.createElement('a');
    link.download = `成就獎狀_${displayName}_${totalScore}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.9); link.click();
  };

  // 背景顏色計算邏輯
  const getBgClass = () => {
    if (visualMode === 'night') return 'bg-slate-950 text-slate-100';
    if (currentLevel === 'CHAOS' && gameState === 'playing') return 'bg-indigo-950 text-white';
    return 'bg-slate-50 text-slate-800';
  };

  const isDark = visualMode === 'night' || (currentLevel === 'CHAOS' && gameState === 'playing');

  return (
    <div className={`min-h-screen font-sans selection:bg-blue-100 flex flex-col items-center justify-start p-4 transition-all duration-700 ${getBgClass()}`}>
      
      {/* 頂部資訊看板 */}
      {gameState === 'playing' && (
        <div className="w-full p-2 md:p-8 flex flex-col gap-4 z-20 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex justify-between items-center max-w-4xl mx-auto w-full gap-3 md:gap-4">
            <div className={`flex items-center gap-2 md:gap-4 px-4 py-2 md:px-8 md:py-4 rounded-2xl border-2 shadow-sm flex-1 justify-center transition-colors ${isDark ? 'bg-slate-800/80 border-slate-700 text-blue-300' : 'bg-white/95 border-blue-100 text-blue-600'}`}>
              <Star className="text-yellow-400 w-5 h-5 md:w-10 md:h-10 fill-yellow-400 animate-pulse" />
              <span className="text-2xl md:text-6xl font-black tabular-nums">{totalScore}</span>
            </div>
            
            <div className={`flex items-center gap-2 md:gap-4 px-4 py-2 md:px-8 md:py-4 rounded-2xl border-2 transition-all duration-300 shadow-sm flex-1 justify-center ${timeLeft < 10 ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' : isDark ? 'bg-slate-800/80 border-slate-700 text-slate-200' : 'bg-white/95 border-blue-50 text-slate-600'}`}>
              <Timer className={`w-5 h-5 md:w-10 md:h-10 ${timeLeft < 10 ? 'animate-bounce' : ''}`} />
              <span className="text-2xl md:text-6xl font-black tabular-nums">{timeLeft}</span>
            </div>

            <button 
              onClick={() => { sounds.click(); setShowHelp(true); }}
              className={`border-2 p-2 md:p-4 rounded-2xl shadow-sm transition-all active:scale-90 ${isDark ? 'bg-slate-800/80 border-slate-700 text-blue-300 hover:bg-slate-700' : 'bg-white/95 border-blue-100 text-blue-400 hover:text-blue-600 hover:bg-blue-50'}`}
              aria-label="遊戲說明"
            >
              <HelpCircle className="w-6 h-6 md:w-10 md:h-10" />
            </button>
          </div>
          
          <div className={`flex overflow-x-auto no-scrollbar gap-2 p-1.5 rounded-full self-center shadow-inner max-w-full backdrop-blur-sm ${isDark ? 'bg-white/10' : 'bg-white/30'}`}>
            {(Object.keys(LEVELS) as LevelKey[]).map((k) => {
              const config = LEVELS[k];
              const isDisabled = config.order < highestLevelIndex;
              const isActive = currentLevel === k;
              return (
                <button
                  key={k} disabled={isDisabled} onClick={() => changeLevel(k)}
                  className={`flex items-center justify-center w-12 h-12 md:w-20 md:h-20 rounded-full text-xl md:text-4xl transition-all duration-300 active:scale-90
                    ${isActive ? 'bg-blue-500 text-white shadow-md scale-110' : isDark ? 'bg-slate-800 text-blue-300 border border-slate-700' : 'bg-white text-blue-400 border border-blue-50'}
                    ${isDisabled ? 'opacity-30 cursor-not-allowed grayscale' : isDark ? 'hover:bg-slate-700' : 'hover:bg-blue-50'}
                  `}
                >
                  {config.icon}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 核心內容區 */}
      <main className="w-full max-w-4xl flex-grow flex flex-col items-center justify-center py-4">
        {gameState === 'menu' && (
          <div className="text-center space-y-8 animate-in fade-in zoom-in duration-700 px-4">
            <div className="space-y-4">
              <div className="w-24 h-24 md:w-44 md:h-44 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl mx-auto flex items-center justify-center rotate-3 shadow-xl animate-bounce border-4 border-white">
                <Ghost className="w-12 h-12 md:w-20 md:h-20 text-white" />
              </div>
              <h1 className={`text-5xl md:text-8xl font-black tracking-tight leading-none transition-colors ${isDark ? 'text-white' : 'text-slate-800'}`}>動物捉迷藏</h1>
              <p className={`text-lg md:text-3xl font-bold tracking-widest uppercase inline-block px-8 py-2 rounded-full border transition-all ${isDark ? 'bg-blue-900/40 text-blue-300 border-blue-800' : 'bg-blue-50/80 text-blue-400 border-blue-100'}`}>正常版</p>
            </div>

            {/* 主題選擇區 */}
            <div className="space-y-4">
              <p className={`text-sm md:text-xl font-black tracking-widest opacity-60 uppercase transition-colors ${isDark ? 'text-blue-200' : 'text-slate-500'}`}>視覺風格呈現</p>
              <div className={`flex gap-3 p-2 rounded-2.5xl backdrop-blur-md mx-auto inline-flex transition-colors ${isDark ? 'bg-white/10' : 'bg-slate-200/50'}`}>
                <button
                  onClick={() => { sounds.click(); setVisualMode('normal'); }}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-lg transition-all ${visualMode === 'normal' ? 'bg-white text-blue-600 shadow-lg scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Sun className={`w-5 h-5 ${visualMode === 'normal' ? 'fill-yellow-400 text-yellow-500' : ''}`} /> ☀️ 正常
                </button>
                <button
                  onClick={() => { sounds.click(); setVisualMode('night'); }}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-lg transition-all ${visualMode === 'night' ? 'bg-slate-800 text-blue-400 shadow-lg scale-105' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <Moon className={`w-5 h-5 ${visualMode === 'night' ? 'fill-blue-400 text-blue-400' : ''}`} /> 🌙 夜暮
                </button>
              </div>
            </div>

            <button
              onClick={startGame}
              className="group relative px-12 py-6 md:px-24 md:py-10 bg-blue-600 text-white rounded-3xl font-black text-3xl md:text-5xl hover:scale-105 active:scale-95 transition-all shadow-[0_10px_0_#1e3a8a] flex items-center gap-4 mx-auto"
            >
              即刻開始 <Zap className="w-8 h-8 md:w-14 md:h-14 fill-white" />
            </button>
          </div>
        )}

        {(gameState === 'playing' || gameState === 'error') && (
          <div key={flashKey} className={`w-full animate-in fade-in slide-in-from-bottom-6 duration-500 px-4 flex flex-col items-center ${currentLevel === 'CHAOS' ? 'animate-rainbow-flash' : ''}`}>
            <div className="mb-6 md:mb-10 text-center space-y-2">
              <div className={`inline-block px-4 py-0.5 rounded-full border shadow-sm transition-colors ${isDark ? 'bg-blue-900/30 border-blue-800 text-blue-300' : 'bg-blue-50 border-blue-100 text-blue-500'}`}>
                <p className="uppercase tracking-widest text-[10px] md:text-xl font-black">LEVEL {LEVELS[currentLevel].icon}</p>
              </div>
              <h2 className={`text-2xl md:text-6xl font-black tracking-tight transition-colors ${isDark ? 'text-white' : 'text-slate-800'}`}>
                {currentLevel === 'CHAOS' ? (
                  chaosLogic === 'FIND_UNIQUE' ? (
                    <span>鎖定 <span className="text-blue-400 underline decoration-indigo-200/30 underline-offset-4">2組獨特</span> 圖標</span>
                  ) : (
                    <span>尋找 <span className="text-orange-400 underline decoration-amber-200/30 underline-offset-4">3圖1組</span> 圖標</span>
                  )
                ) : (
                  <div className="flex flex-col items-center">
                    <div>定位 <span className="bg-blue-600 px-6 py-1 rounded-xl text-white inline-block shadow-md">{LEVELS[currentLevel].dupCount}</span> 個相同圖示</div>
                    {currentLevel === 'LUXURY' && <div className={`text-sm md:text-2xl mt-2 font-bold tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>( 雙重目標啟動 )</div>}
                  </div>
                )}
              </h2>
            </div>

            <div className="w-full flex justify-center items-center min-h-[320px] md:min-h-[500px]">
              <div className={`grid gap-3 md:gap-6 w-full ${LEVELS[currentLevel].grid}`}>
                {cards.map((card, idx) => {
                  const isMasked = maskedValues.includes(card.value);
                  const isSelected = selectedIndices.includes(idx);
                  return (
                    <button
                      key={card.id} onClick={() => handleCardClick(idx)} disabled={isMasked}
                      className={`aspect-square flex items-center justify-center rounded-2xl md:rounded-3xl font-black transition-all duration-300 border-2 md:border-4 relative overflow-hidden
                        ${isSelected 
                          ? 'bg-amber-400 border-amber-500 text-white scale-110 z-10 rotate-2 shadow-xl' 
                          : isMasked 
                            ? 'bg-slate-200 border-slate-300 opacity-20 scale-90 grayscale blur-[1px] pointer-events-none'
                            : isDark 
                              ? 'bg-white border-slate-200 text-slate-800 active:scale-95 shadow-[0_4px_0_#1e293b] hover:bg-slate-50'
                              : 'bg-white border-blue-50 text-slate-700 active:scale-95 shadow-[0_4px_0_#f1f5f9] hover:bg-blue-50/30'}
                        ${currentLevel === 'CHAOS' || currentLevel === 'LUXURY' ? 'text-4xl md:text-8xl' : 'text-6xl md:text-9xl'}
                      `}
                    >
                      <span className="block transform-gpu">{isMasked ? '🙈' : card.value}</span>
                      {isMasked && <div className="absolute inset-0 bg-slate-100/10 backdrop-blur-[1px]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {gameState === 'gameOver' && (
          <div className="space-y-8 animate-in zoom-in fade-in duration-700 max-w-2xl mx-auto px-4 w-full text-center">
            <div className={`border-8 rounded-[3rem] p-8 md:p-16 space-y-8 shadow-xl relative overflow-hidden transition-colors ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-blue-50 text-slate-800'}`}>
              <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-blue-400 to-indigo-500" />
              
              <div className="space-y-2">
                <p className={`font-black tracking-widest uppercase text-base md:text-2xl transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Final Score Achieved</p>
                <div className="text-8xl md:text-[10rem] leading-none font-black text-blue-600 tracking-tighter drop-shadow-lg">{totalScore}</div>
              </div>

              {/* 署名欄位 */}
              <div className="space-y-3 text-left">
                <label className={`flex items-center gap-2 text-sm md:text-xl font-black ml-2 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <User className="w-4 h-4 md:w-6 md:h-6" /> 成就署名
                </label>
                <input 
                  type="text"
                  maxLength={12}
                  placeholder="尊貴的玩家 (空白以此顯示)"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className={`w-full border-4 rounded-2xl py-3 px-6 text-xl md:text-3xl font-bold transition-all focus:ring-0 focus:outline-none shadow-inner ${isDark ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500 placeholder:text-slate-600' : 'bg-slate-50 border-blue-100 text-slate-700 focus:border-blue-400 placeholder:text-slate-300'}`}
                />
              </div>

              <div className={`grid grid-cols-2 gap-4 border-y-2 py-6 transition-colors ${isDark ? 'border-slate-800' : 'border-slate-50'}`}>
                <div className="flex flex-col items-center gap-1">
                  <Zap className="w-8 h-8 md:w-10 md:h-10 text-blue-500" />
                  <div className={`text-xs md:text-lg font-black uppercase transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>操作頻率</div>
                  <div className={`text-3xl md:text-5xl font-black transition-colors ${isDark ? 'text-white' : 'text-slate-800'}`}>{totalClicks}</div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Star className="w-8 h-8 md:w-10 md:h-10 text-amber-500 fill-amber-500" />
                  <div className={`text-xs md:text-lg font-black uppercase transition-colors ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>精準係數</div>
                  <div className="text-3xl md:text-5xl font-black text-blue-600">{accuracy}%</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setGameState('menu')}
                  className={`flex items-center justify-center gap-3 font-black py-4 rounded-2xl transition-all active:scale-95 text-xl md:text-2xl shadow-lg ${isDark ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-800 text-white hover:bg-black'}`}
                >
                  <RotateCcw className="w-6 h-6 md:w-8 md:h-8" /> RETRY
                </button>
                <button
                  onClick={exportResultAsJPG}
                  className="flex items-center justify-center gap-3 bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-700 transition-all active:scale-95 text-xl md:text-2xl shadow-lg border-b-4 border-blue-800"
                >
                  <Download className="w-6 h-6 md:w-8 md:h-8" /> SAVE JPG
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 錯誤演出 */}
      {gameState === 'error' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="text-center space-y-6 animate-in zoom-in duration-300 px-6">
            <div className="text-[120px] md:text-[240px] leading-none animate-bounce drop-shadow-2xl">🙈</div>
            <h2 className="text-4xl md:text-8xl font-black text-white italic uppercase bg-blue-600 px-12 py-6 rounded-3xl shadow-2xl">Shift Detected</h2>
            <p className="text-blue-100 font-black text-lg md:text-3xl tracking-widest uppercase bg-slate-800/80 px-8 py-3 rounded-full border border-blue-500/30">系統已排除一項干擾座標</p>
          </div>
        </div>
      )}

      {/* 說明彈窗 */}
      {showHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-xl animate-in fade-in duration-300 p-6">
          <div className={`w-full max-w-lg border-4 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] transition-colors ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-blue-100'}`}>
             <div className="bg-blue-500 p-6 flex justify-between items-center text-white">
                <h3 className="text-2xl md:text-4xl font-black italic">遊戲規則說明</h3>
                <button onClick={() => setShowHelp(false)} className="bg-white/20 p-2 rounded-full hover:bg-white/40 transition-colors">
                  <X className="w-6 h-6 md:w-10 md:h-10" />
                </button>
             </div>
             <div className={`p-8 md:p-12 overflow-y-auto space-y-8 transition-colors ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <section className="space-y-4">
                  <h4 className="text-xl md:text-2xl font-black text-blue-600 flex items-center gap-2">
                    <Star className="w-6 h-6 fill-blue-600" /> 基本規則
                  </h4>
                  <p className="text-lg md:text-xl font-bold leading-relaxed">
                    在限時 60 秒內，根據畫面上方的指示點擊圖標。累積積分越多，反應評分越高！
                  </p>
                </section>

                <section className="space-y-4">
                  <h4 className={`text-xl md:text-2xl font-black flex items-center gap-2 transition-colors ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                    <Ghost className="w-6 h-6" /> 排除機制 (🙈)
                  </h4>
                  <p className="text-lg md:text-xl font-bold leading-relaxed">
                    若點擊錯誤，系統將自動掃描並移除一種「干擾圖標」，以 🙈 遮眼圖示標記，幫助你鎖定正確座標。
                  </p>
                </section>

                <section className="space-y-4">
                  <h4 className="text-xl md:text-2xl font-black text-amber-600 flex items-center gap-2">
                    <Zap className="w-6 h-6 fill-amber-600" /> 等級說明
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`p-4 rounded-2xl border transition-colors ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'} text-center`}>
                      <div className="text-2xl mb-1">🌱 / 🌳</div>
                      <div className="font-bold text-sm">單一目標定位</div>
                    </div>
                    <div className={`p-4 rounded-2xl border transition-colors ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'} text-center`}>
                      <div className="text-2xl mb-1">🌲</div>
                      <div className="font-bold text-sm">雙重對稱目標</div>
                    </div>
                    <div className={`p-4 rounded-2xl border transition-colors ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'} text-center`}>
                      <div className="text-2xl mb-1">🌈</div>
                      <div className="font-bold text-sm text-pink-500">混亂邏輯 (找出唯一)</div>
                    </div>
                  </div>
                </section>
             </div>
             <div className={`p-6 border-t flex justify-center transition-colors ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                <button 
                  onClick={() => setShowHelp(false)}
                  className="bg-blue-600 text-white font-black px-12 py-4 rounded-full text-xl md:text-2xl shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                  理解了！
                </button>
             </div>
          </div>
        </div>
      )}

      {/* 背景裝飾 */}
      <div className={`fixed top-[-10%] left-[-10%] w-[50%] h-[50%] blur-[150px] rounded-full pointer-events-none -z-10 transition-colors ${isDark ? 'bg-blue-900/10' : 'bg-blue-100/30'}`} />
      <div className={`fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] blur-[150px] rounded-full pointer-events-none -z-10 transition-colors ${isDark ? 'bg-indigo-900/10' : 'bg-indigo-100/30'}`} />
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
