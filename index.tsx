
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Timer, Trophy, RotateCcw, ChevronRight, Lock, Target, MousePointer2, Download, Zap } from 'lucide-react';

// 遊戲難度配置
const LEVELS = {
  BASIC: { key: 'BASIC' as const, name: '基礎', grid: 'grid-cols-3', total: 6, dupCount: 2, targetTypes: 1, score: 1, order: 0 },
  ADVANCED: { key: 'ADVANCED' as const, name: '晉級', grid: 'grid-cols-3', total: 9, dupCount: 2, targetTypes: 1, score: 2, order: 1 },
  LUXURY: { key: 'LUXURY' as const, name: '尊爵', grid: 'grid-cols-4', total: 12, dupCount: 4, targetTypes: 2, score: 5, order: 2 },
  CHAOS: { key: 'CHAOS' as const, name: '混沌', grid: 'grid-cols-4', total: 12, dupCount: 0, targetTypes: 0, score: 10, order: 3 },
};

const TOTEMS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

type LevelKey = keyof typeof LEVELS;

interface Card {
  id: number;
  value: string;
}

// 音效系統
class SoundSystem {
  ctx: AudioContext | null = null;

  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

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

  click() { this.playTone(800, 'sine', 0.1, 0.05); }
  correct() {
    this.playTone(600, 'square', 0.15, 0.05);
    setTimeout(() => this.playTone(900, 'square', 0.2, 0.05), 50);
  }
  wrong() {
    this.playTone(150, 'sawtooth', 0.4, 0.08);
    setTimeout(() => this.playTone(100, 'sawtooth', 0.4, 0.08), 100);
  }
  victory() {
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
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
  const [flashKey, setFlashKey] = useState(0); // 用於觸發混沌閃爍效果
  
  const timerRef = useRef<number | null>(null);

  const generateLevel = useCallback((levelKey: LevelKey) => {
    const config = LEVELS[levelKey];
    const shuffledTotems = [...TOTEMS].sort(() => Math.random() - 0.5);
    let levelCards: string[] = [];
    let targets: string[] = [];
    let requiredCount = 0;

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
      setFlashKey(prev => prev + 1); // 立即閃爍提示
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
    const finalCards = levelCards
      .sort(() => Math.random() - 0.5)
      .map((val) => ({ id: Math.random(), value: val }));
      
    setCards(finalCards);
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
    sounds.init();
    sounds.click();
    setScoreBreakdown({ BASIC: 0, ADVANCED: 0, LUXURY: 0, CHAOS: 0 });
    setTotalClicks(0);
    setCorrectClicks(0);
    setTimeLeft(60);
    setCurrentLevel('BASIC');
    setHighestLevelIndex(0);
    setGameState('playing');
    generateLevel('BASIC');
  };

  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && gameState === 'playing') {
      sounds.victory();
      setGameState('gameOver');
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [gameState, timeLeft]);

  const handleCardClick = (index: number) => {
    if (gameState !== 'playing' || selectedIndices.includes(index)) return;

    setTotalClicks(prev => prev + 1);
    const clickedCard = cards[index];
    const config = LEVELS[currentLevel];
    const required = currentLevel === 'CHAOS' ? chaosTargetCount : config.dupCount;

    if (!targetValues.includes(clickedCard.value)) {
      sounds.wrong();
      setGameState('error');
      setTimeout(() => {
        setGameState('playing');
        setSelectedIndices([]);
      }, 1000);
      return;
    }

    sounds.click();
    setCorrectClicks(prev => prev + 1);
    const newSelected = [...selectedIndices, index];
    setSelectedIndices(newSelected);

    if (newSelected.length === required) {
      sounds.correct();
      setScoreBreakdown(prev => ({
        ...prev,
        [currentLevel]: prev[currentLevel] + config.score
      }));
      setTimeout(() => {
        generateLevel(currentLevel);
      }, 100); // 縮短更新延遲
    }
  };

  const totalScore = scoreBreakdown.BASIC + scoreBreakdown.ADVANCED + scoreBreakdown.LUXURY + scoreBreakdown.CHAOS;
  const accuracy = totalClicks === 0 ? 0 : Math.round((correctClicks / totalClicks) * 100);

  const exportResultAsJPG = () => {
    sounds.click();
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 1000, 1400);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(0.5, '#0a0a0a');
    grad.addColorStop(1, '#450a0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 20;
    ctx.strokeRect(40, 40, 920, 1320);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('圖騰尋蹤：混沌結算', 500, 160);

    let rank = 'C';
    let rankColor = '#737373';
    if (totalScore >= 150) { rank = 'GOD'; rankColor = '#ef4444'; }
    else if (totalScore >= 100) { rank = 'SSS'; rankColor = '#fbbf24'; }
    else if (totalScore >= 70) { rank = 'S'; rankColor = '#f59e0b'; }
    else if (totalScore >= 40) { rank = 'A'; rankColor = '#6366f1'; }

    ctx.fillStyle = rankColor;
    ctx.font = 'italic 900 130px sans-serif';
    ctx.fillText(rank, 500, 300);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 300px tabular-nums';
    ctx.fillText(totalScore.toString(), 500, 620);
    
    const drawDataCard = (x: number, y: number, w: number, h: number, label: string, val: string) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 20); ctx.fill();
      ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 24px sans-serif';
      ctx.fillText(label, x + w/2, y + 50);
      ctx.fillStyle = '#ffffff'; ctx.font = '900 50px sans-serif';
      ctx.fillText(val, x + w/2, y + 130);
    };

    drawDataCard(80, 750, 200, 180, '基礎', scoreBreakdown.BASIC.toString());
    drawDataCard(300, 750, 200, 180, '晉級', scoreBreakdown.ADVANCED.toString());
    drawDataCard(520, 750, 200, 180, '尊爵', scoreBreakdown.LUXURY.toString());
    drawDataCard(740, 750, 200, 180, '混沌', scoreBreakdown.CHAOS.toString());

    drawDataCard(80, 960, 410, 180, '總點擊', totalClicks.toString());
    drawDataCard(510, 960, 430, 180, '正確率', accuracy + '%');

    const link = document.createElement('a');
    link.download = `圖騰尋蹤_結算_${totalScore}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
  };

  return (
    <div className={`min-h-screen text-white font-sans selection:bg-indigo-500/30 flex flex-col items-center justify-center p-2 md:p-4 transition-colors duration-1000 ${currentLevel === 'CHAOS' && gameState === 'playing' ? 'bg-neutral-950 bg-[radial-gradient(circle_at_50%_50%,#450a0a44,transparent)]' : 'bg-neutral-950'}`}>
      
      {/* 頂部資訊欄 */}
      {gameState === 'playing' && (
        <div className="fixed top-0 left-0 w-full p-2 md:p-8 flex flex-col gap-2 md:gap-6 z-20 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex justify-between items-center max-w-5xl mx-auto w-full gap-2 px-2">
            <div className="flex items-center gap-2 md:gap-4 bg-white/5 backdrop-blur-xl px-4 py-2 md:px-6 md:py-3 rounded-2xl md:rounded-3xl border border-white/10 shadow-2xl flex-1 justify-center">
              <Trophy className="text-yellow-400 w-5 h-5 md:w-10 md:h-10" />
              <span className="text-2xl md:text-6xl font-black tabular-nums tracking-tighter">{totalScore}</span>
            </div>
            
            <div className={`flex items-center gap-2 md:gap-4 px-4 py-2 md:px-6 md:py-3 rounded-2xl md:rounded-3xl border transition-all duration-300 backdrop-blur-xl shadow-2xl flex-1 justify-center ${timeLeft < 10 ? 'bg-red-500/30 border-red-500/50 text-red-100 animate-pulse' : 'bg-white/5 border-white/10'}`}>
              <Timer className={`w-5 h-5 md:w-10 md:h-10 ${timeLeft < 10 ? 'animate-spin' : ''}`} />
              <span className="text-2xl md:text-6xl font-black tabular-nums tracking-tighter">{timeLeft}s</span>
            </div>
          </div>
          
          <div className="flex overflow-x-auto no-scrollbar gap-1 bg-neutral-900/60 p-1 rounded-2xl md:rounded-[2.5rem] border border-white/10 backdrop-blur-md self-center shadow-2xl max-w-full">
            {(Object.keys(LEVELS) as LevelKey[]).map((k) => {
              const config = LEVELS[k];
              const isDisabled = config.order < highestLevelIndex;
              const isActive = currentLevel === k;
              
              return (
                <button
                  key={k}
                  disabled={isDisabled}
                  onClick={() => changeLevel(k)}
                  className={`flex items-center gap-1 md:gap-2 px-3 py-1.5 md:px-6 md:py-3 rounded-xl md:rounded-2xl text-[10px] md:text-xl font-black transition-all duration-300 whitespace-nowrap
                    ${isActive ? (k === 'CHAOS' ? 'bg-red-600 shadow-[0_0_20px_#ef4444]' : 'bg-indigo-600 shadow-[0_0_20px_#6366f1]') : 'text-neutral-500'}
                    ${isDisabled ? 'opacity-20 cursor-not-allowed' : 'hover:bg-white/5 hover:text-white'}
                  `}
                >
                  {isDisabled ? <Lock className="w-2.5 h-2.5 md:w-5 md:h-5" /> : k === 'CHAOS' ? <Zap className="w-2.5 h-2.5 md:w-5 md:h-5" /> : null}
                  {config.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 主遊戲區域 */}
      <main className="w-full max-w-3xl mt-16 md:mt-24">
        {gameState === 'menu' && (
          <div className="text-center space-y-6 md:space-y-12 animate-in fade-in zoom-in duration-700 px-4">
            <div className="space-y-4 md:space-y-6">
              <div className="w-20 h-20 md:w-40 md:h-40 bg-indigo-600 rounded-[1.5rem] md:rounded-[3rem] mx-auto flex items-center justify-center rotate-12 shadow-[0_0_60px_rgba(79,70,229,0.3)] animate-pulse">
                <Target className="w-10 h-10 md:w-20 md:h-20 text-white" />
              </div>
              <h1 className="text-5xl md:text-[10rem] font-black tracking-tighter bg-gradient-to-b from-white to-neutral-600 bg-clip-text text-transparent leading-none">
                圖騰尋蹤
              </h1>
              <p className="text-sm md:text-3xl text-neutral-400 font-medium tracking-[0.2em] md:tracking-[0.5em] uppercase italic">Hyper-Focus Logic Battle</p>
            </div>
            
            <button
              onClick={startGame}
              className="group relative px-10 py-5 md:px-24 md:py-12 bg-white text-black rounded-2xl md:rounded-[3rem] font-black text-2xl md:text-6xl hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center gap-3 md:gap-6 mx-auto"
            >
              啟動挑戰 <ChevronRight className="w-6 h-6 md:w-16 md:h-16 group-hover:translate-x-4 transition-transform" />
            </button>
          </div>
        )}

        {(gameState === 'playing' || gameState === 'error') && (
          <div key={flashKey} className={`animate-in fade-in slide-in-from-bottom-8 duration-300 px-2 ${currentLevel === 'CHAOS' ? 'animate-chaos-flash' : ''}`}>
            <div className="mb-4 md:mb-12 text-center space-y-1 md:space-y-4">
              <div className="flex items-center justify-center gap-2">
                <div className={`h-0.5 md:h-1 w-6 md:w-12 rounded-full ${currentLevel === 'CHAOS' ? 'bg-red-600 animate-pulse' : 'bg-indigo-600'}`} />
                <p className={`uppercase tracking-[0.2em] md:tracking-[0.5em] text-[10px] md:text-2xl font-black ${currentLevel === 'CHAOS' ? 'text-red-500' : 'text-indigo-400'}`}>
                  {LEVELS[currentLevel].name} 模式
                </p>
                <div className={`h-0.5 md:h-1 w-6 md:w-12 rounded-full ${currentLevel === 'CHAOS' ? 'bg-red-600 animate-pulse' : 'bg-indigo-600'}`} />
              </div>
              
              <h2 className={`text-2xl md:text-7xl font-black transition-all ${currentLevel === 'CHAOS' ? 'text-white italic' : ''}`}>
                {currentLevel === 'CHAOS' ? (
                  chaosLogic === 'FIND_UNIQUE' ? (
                    <span className="text-red-500">點出 2 個 孤影圖騰！</span>
                  ) : (
                    <span className="text-yellow-400">找出 3 重複圖騰！</span>
                  )
                ) : (
                  <div className="flex flex-col items-center">
                    <div>找出 <span className="bg-indigo-600 px-3 py-1 md:px-6 md:py-2 rounded-xl md:rounded-2xl text-white inline-block -rotate-2">{LEVELS[currentLevel].dupCount}</span> 個重複項</div>
                    {currentLevel === 'LUXURY' && <div className="text-sm md:text-3xl text-neutral-500 mt-1 md:mt-2 font-black tracking-widest bg-white/5 px-3 py-1 rounded-full">( 共 2 組數字 )</div>}
                  </div>
                )}
              </h2>
            </div>

            <div className={`grid gap-1.5 md:gap-8 ${LEVELS[currentLevel].grid}`}>
              {cards.map((card, idx) => (
                <button
                  key={card.id}
                  onClick={() => handleCardClick(idx)}
                  className={`aspect-square flex items-center justify-center rounded-xl md:rounded-[2.5rem] font-black transition-all duration-200 shadow-2xl border md:border-4
                    ${selectedIndices.includes(idx) 
                      ? (currentLevel === 'CHAOS' ? 'bg-red-600 text-white scale-105 z-10 rotate-3 shadow-[0_0_20px_#ef4444]' : 'bg-indigo-600 text-white scale-105 z-10 rotate-3 shadow-[0_0_20px_#6366f1]') 
                      : 'bg-neutral-900 border-neutral-800 text-neutral-300 active:scale-95'}
                    ${currentLevel === 'CHAOS' || currentLevel === 'LUXURY' ? 'text-4xl md:text-[9rem]' : 'text-5xl md:text-[11rem]'}
                  `}
                >
                  {card.value}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === 'gameOver' && (
          <div className="space-y-4 md:space-y-10 animate-in zoom-in fade-in duration-700 max-w-2xl mx-auto px-4 overflow-y-auto max-h-[90vh] no-scrollbar pb-10">
            <div className="bg-neutral-900/95 border-2 md:border-4 border-indigo-500/20 rounded-[2.5rem] md:rounded-[5rem] p-6 md:p-16 space-y-6 md:space-y-12 shadow-2xl backdrop-blur-3xl text-center">
              <div className="space-y-1">
                <p className="text-indigo-400 font-black tracking-[0.2em] md:tracking-[0.5em] uppercase text-xs md:text-2xl">FINAL SCORE</p>
                <div className="text-6xl md:text-[14rem] leading-none font-black text-white tracking-tighter drop-shadow-2xl">{totalScore}</div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-y border-white/10 py-4 md:py-12">
                <div className="p-1">
                  <div className="text-[8px] md:text-xs text-neutral-500 font-black tracking-widest uppercase">基礎</div>
                  <div className="text-xl md:text-5xl font-black text-indigo-200">{scoreBreakdown.BASIC}</div>
                </div>
                <div className="p-1 border-l border-white/10 md:border-x-2">
                  <div className="text-[8px] md:text-xs text-neutral-500 font-black tracking-widest uppercase">晉級</div>
                  <div className="text-xl md:text-5xl font-black text-indigo-400">{scoreBreakdown.ADVANCED}</div>
                </div>
                <div className="p-1 border-t md:border-t-0 md:border-r-2 border-white/10">
                  <div className="text-[8px] md:text-xs text-neutral-500 font-black tracking-widest uppercase">尊爵</div>
                  <div className="text-xl md:text-5xl font-black text-indigo-600">{scoreBreakdown.LUXURY}</div>
                </div>
                <div className="p-1 border-t md:border-t-0 border-l md:border-l-0 border-white/10">
                  <div className="text-[8px] md:text-xs text-red-500 font-black tracking-widest uppercase">混沌</div>
                  <div className="text-xl md:text-5xl font-black text-red-600">{scoreBreakdown.CHAOS}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:gap-8">
                <div className="flex flex-col items-center gap-1 md:gap-3 p-4 md:p-10 bg-white/5 rounded-2xl md:rounded-[4rem] border border-white/5">
                  <MousePointer2 className="w-4 h-4 md:w-12 md:h-12 text-neutral-500" />
                  <div className="text-[8px] md:text-sm text-neutral-500 font-bold uppercase tracking-widest">總點擊</div>
                  <div className="text-xl md:text-5xl font-black tracking-tighter">{totalClicks}</div>
                </div>
                <div className="flex flex-col items-center gap-1 md:gap-3 p-4 md:p-10 bg-white/5 rounded-2xl md:rounded-[4rem] border border-white/5">
                  <Target className="w-4 h-4 md:w-12 md:h-12 text-neutral-500" />
                  <div className="text-[8px] md:text-sm text-neutral-500 font-bold uppercase tracking-widest">正確率</div>
                  <div className={`text-xl md:text-5xl font-black tracking-tighter ${accuracy > 85 ? 'text-green-400' : accuracy > 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {accuracy}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-8">
                <button
                  onClick={() => setGameState('menu')}
                  className="flex items-center justify-center gap-3 bg-neutral-800 text-white font-black py-4 md:py-10 rounded-xl md:rounded-[3.5rem] hover:bg-neutral-700 transition-all active:scale-95 text-lg md:text-4xl shadow-xl"
                >
                  <RotateCcw className="w-5 h-5 md:w-12 md:h-12" />
                  再次挑戰
                </button>
                <button
                  onClick={exportResultAsJPG}
                  className="flex items-center justify-center gap-3 bg-white text-black font-black py-4 md:py-10 rounded-xl md:rounded-[3.5rem] hover:bg-neutral-100 transition-all active:scale-95 text-lg md:text-4xl shadow-xl"
                >
                  <Download className="w-5 h-5 md:w-12 md:h-12" />
                  保存戰報
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 錯誤演出 */}
      {gameState === 'error' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className="text-center space-y-4 md:space-y-10 animate-in zoom-in duration-300 px-6">
            <div className={`text-[80px] md:text-[300px] leading-none animate-bounce drop-shadow-2xl`}>😵</div>
            <h2 className={`text-2xl md:text-9xl font-black text-white tracking-[0.1em] md:tracking-[0.5em] uppercase italic px-6 py-2 md:px-16 md:py-6 -rotate-3 shadow-2xl ${currentLevel === 'CHAOS' ? 'bg-red-800' : 'bg-red-600'}`}>
              {currentLevel === 'CHAOS' ? '思考斷路！' : '瞄準失敗！'}
            </h2>
            <p className="text-neutral-500 font-black text-sm md:text-4xl tracking-widest uppercase">System Resetting...</p>
          </div>
        </div>
      )}

      {/* 背景裝飾 */}
      <div className="fixed top-[-20%] left-[-20%] w-[80%] h-[80%] bg-indigo-600/5 blur-[250px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-red-600/5 blur-[250px] rounded-full pointer-events-none -z-10" />
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
