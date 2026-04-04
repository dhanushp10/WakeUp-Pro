/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Bell, 
  Wifi, 
  Activity, 
  ChevronLeft, 
  ChevronRight, 
  Clock,
  Check,
  Signal,
  Smartphone,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Alarm, AlarmType } from './types';

// --- Constants ---
const ALARM_MELODY_URL = "https://assets.mixkit.co/active_storage/sfx/123/123-preview.mp3"; // A more musical, pleasant alarm tone

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' }) => {
  const variants = {
    primary: 'bg-[#0A0A14] text-white hover:bg-opacity-90',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
    outline: 'border border-gray-200 text-gray-900 hover:bg-gray-50',
    danger: 'bg-red-500 text-white hover:bg-red-600'
  };

  return (
    <button 
      className={cn(
        'w-full py-4 px-6 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 active:scale-95',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('bg-white rounded-3xl p-6 shadow-sm border border-gray-100', className)} {...props}>
    {children}
  </div>
);

const Switch = ({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!enabled)}
    className={cn(
      'w-12 h-6 rounded-full transition-colors relative',
      enabled ? 'bg-[#0A0A14]' : 'bg-gray-200'
    )}
  >
    <div className={cn(
      'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
      enabled ? 'left-7' : 'left-1'
    )} />
  </button>
);

// --- App Logic ---

type Screen = 'home' | 'add-type' | 'settings' | 'wifi-config' | 'motion-config' | 'triggered';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [alarms, setAlarms] = useState<Alarm[]>([
    { id: '1', time: '06:00', period: 'AM', label: 'Morning Workout', type: 'wifi', enabled: true, repeat: ['M', 'T', 'W', 'T', 'F'] },
    { id: '2', time: '07:30', period: 'AM', label: 'Morning Gym', type: 'motion', enabled: true, repeat: ['M', 'T', 'W', 'T', 'F'], config: { motion: { steps: 20, sensitivity: 'Medium', mode: 'Walk' } } },
  ]);

  const [currentEdit, setCurrentEdit] = useState<Partial<Alarm>>({});
  const [triggeredAlarm, setTriggeredAlarm] = useState<Alarm | null>(null);
  const [stepsTaken, setStepsTaken] = useState(0);
  const [wifiSignal, setWifiSignal] = useState(-85); // dBm (lower is weaker)
  const [lastTriggeredMinute, setLastTriggeredMinute] = useState<string | null>(null);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const unlockAudio = () => {
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
        setIsAudioUnlocked(true);
      }).catch(e => console.log("Unlock failed", e));
    }
  };

  const lastAccel = useRef({ x: 0, y: 0, z: 0 });
  const stepThreshold = 12; // Threshold for step detection

  // Helper to get minutes from midnight for an alarm
  const getMinutes = (time: string, period: 'AM' | 'PM') => {
    let [h, m] = time.split(':').map(Number);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  };

  // Find the chronologically next alarm
  const getNextAlarm = () => {
    const enabledAlarms = alarms.filter(a => a.enabled);
    if (enabledAlarms.length === 0) return null;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentDay = now.getDay(); // 0-6
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const dayMap: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

    let soonestAlarm: Alarm | null = null;
    let minDiff = Infinity;

    enabledAlarms.forEach(alarm => {
      const alarmMinutes = getMinutes(alarm.time, alarm.period);
      
      // Check each day starting from today
      for (let i = 0; i < 7; i++) {
        const checkDayIndex = (dayMap[currentDay] + i) % 7;
        const checkDayLabel = dayLabels[checkDayIndex];
        
        if (alarm.repeat.includes(checkDayLabel)) {
          let diff = (i * 1440) + (alarmMinutes - currentMinutes);
          if (diff <= 0 && i === 0) diff += 7 * 1440; // If it's today but time passed, move to next week
          
          if (diff < minDiff) {
            minDiff = diff;
            soonestAlarm = alarm;
          }
          break; // Found the next occurrence for this specific alarm
        }
      }
    });

    return soonestAlarm;
  };

  const nextAlarm = getNextAlarm();

  // Sort alarms by time
  const sortedAlarms = [...alarms].sort((a, b) => {
    return getMinutes(a.time, a.period) - getMinutes(b.time, b.period);
  });

  // --- WiFi Signal Simulation ---
  useEffect(() => {
    if (screen === 'triggered' && triggeredAlarm?.type === 'wifi') {
      const interval = setInterval(() => {
        setWifiSignal(prev => {
          // Slowly increase signal to simulate moving closer
          const next = prev + (Math.random() * 3);
          return next > -30 ? -30 : next;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setWifiSignal(-85);
    }
  }, [screen, triggeredAlarm]);

  // --- Step Counter Logic ---
  useEffect(() => {
    if (screen === 'triggered' && triggeredAlarm?.type === 'motion') {
      const handleMotion = (event: DeviceMotionEvent) => {
        const accel = event.accelerationIncludingGravity;
        if (!accel) return;

        const { x, y, z } = accel;
        const totalAccel = Math.sqrt((x || 0)**2 + (y || 0)**2 + (z || 0)**2);
        
        // Simple peak detection for steps
        if (totalAccel > stepThreshold && Math.abs(totalAccel - Math.sqrt(lastAccel.current.x**2 + lastAccel.current.y**2 + lastAccel.current.z**2)) > 2) {
          setStepsTaken(prev => prev + 1);
        }
        
        lastAccel.current = { x: x || 0, y: y || 0, z: z || 0 };
      };

      window.addEventListener('devicemotion', handleMotion);
      return () => window.removeEventListener('devicemotion', handleMotion);
    }
  }, [screen, triggeredAlarm]);

  // --- Alarm Check Logic ---
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentH = now.getHours();
      const currentM = now.getMinutes();
      const currentDay = now.getDay(); // 0 (Sun) to 6 (Sat)
      
      const isPM = currentH >= 12;
      const displayH = (currentH % 12 || 12).toString().padStart(2, '0');
      const displayM = currentM.toString().padStart(2, '0');
      const displayPeriod = isPM ? 'PM' : 'AM';
      const currentTimeStr = `${displayH}:${displayM} ${displayPeriod}`;

      // Map JS day to our repeat array: Mon(1)=0, Tue(2)=1, Wed(3)=2, Thu(4)=3, Fri(5)=4, Sat(6)=5, Sun(0)=6
      const dayMap: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
      const dayIndex = dayMap[currentDay];
      const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      const currentDayLabel = dayLabels[dayIndex];

      if (currentTimeStr === lastTriggeredMinute) return;

      const matchingAlarm = alarms.find(a => {
        if (!a.enabled) return false;
        if (a.time !== `${displayH}:${displayM}`) return false;
        if (a.period !== displayPeriod) return false;
        
        // Check if today is a repeat day
        // Note: This is a simple check. In a real app, we'd handle duplicate labels (like 'T' for Tue/Thu)
        // by using unique indices or full day names.
        return a.repeat.includes(currentDayLabel);
      });

      if (matchingAlarm && !triggeredAlarm) {
        setTriggeredAlarm(matchingAlarm);
        setLastTriggeredMinute(currentTimeStr);
        setScreen('triggered');
        setStepsTaken(0);
        if (audioRef.current) {
          audioRef.current.play().catch(e => console.log("Audio play blocked", e));
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [alarms, triggeredAlarm, lastTriggeredMinute]);

  // --- Actions ---

  const handleAddAlarm = () => {
    setCurrentEdit({
      id: Math.random().toString(36).substr(2, 9),
      time: '07:30',
      period: 'AM',
      label: '',
      enabled: true,
      repeat: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], // Default to all days
      config: {
        wifi: { locationSet: false, sensitivity: 'Medium' },
        motion: { steps: 20, sensitivity: 'Medium', mode: 'Walk' }
      }
    });
    setScreen('add-type');
  };

  const handleEditAlarm = (alarm: Alarm) => {
    setCurrentEdit(alarm);
    setScreen('settings');
  };

  const saveAlarm = () => {
    if (currentEdit.id) {
      // Ensure time is correctly formatted before saving
      const [h, m] = (currentEdit.time || '07:30').split(':');
      const cleanH = (parseInt(h) || 7).toString().padStart(2, '0');
      const cleanM = (parseInt(m) || 0).toString().padStart(2, '0');
      const cleanEdit = { ...currentEdit, time: `${cleanH}:${cleanM}` } as Alarm;

      const exists = alarms.find(a => a.id === cleanEdit.id);
      if (exists) {
        setAlarms(alarms.map(a => a.id === cleanEdit.id ? cleanEdit : a));
      } else {
        setAlarms([...alarms, cleanEdit]);
      }
      setScreen('home');
    }
  };

  // Cleanup effect for malformed times
  useEffect(() => {
    const cleaned = alarms.map(a => {
      const parts = a.time.split(':');
      if (parts[0].length > 2 || parts[1].length > 2) {
        const h = (parseInt(parts[0]) || 7).toString().padStart(2, '0');
        const m = (parseInt(parts[1]) || 0).toString().padStart(2, '0');
        return { ...a, time: `${h}:${m}` };
      }
      return a;
    });
    if (JSON.stringify(cleaned) !== JSON.stringify(alarms)) {
      setAlarms(cleaned);
    }
  }, [alarms]);

  const stopAlarm = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setTriggeredAlarm(null);
    setScreen('home');
    setStepsTaken(0);
    setWifiSignal(-85);
  };

  const toggleAlarm = (id: string) => {
    setAlarms(alarms.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const toggleRepeatDay = (day: string) => {
    const currentRepeat = currentEdit.repeat || [];
    if (currentRepeat.includes(day)) {
      setCurrentEdit({ ...currentEdit, repeat: currentRepeat.filter(d => d !== day) });
    } else {
      setCurrentEdit({ ...currentEdit, repeat: [...currentRepeat, day] });
    }
  };

  const updateTime = (part: 'hour' | 'minute', value: string) => {
    const [h, m] = (currentEdit.time || '07:30').split(':');
    const num = parseInt(value);
    
    if (part === 'hour') {
      const newH = isNaN(num) ? '01' : Math.min(12, Math.max(1, num)).toString().padStart(2, '0');
      setCurrentEdit({ ...currentEdit, time: `${newH}:${m}` });
    } else {
      const newM = isNaN(num) ? '00' : Math.min(59, Math.max(0, num)).toString().padStart(2, '0');
      setCurrentEdit({ ...currentEdit, time: `${h}:${newM}` });
    }
  };

  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="mobile-container">
      <audio ref={audioRef} src={ALARM_MELODY_URL} loop />
      
      <AnimatePresence mode="wait">
        {screen === 'home' && (
          <motion.div 
            key="home"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="p-6 flex flex-col gap-6 flex-1"
          >
            {/* Header / Next Alarm */}
            <Card className="bg-[#0A0A14] text-white border-none py-10 flex flex-col items-center justify-center">
              <h1 className="text-5xl font-bold mb-2">{nextAlarm?.time || '--:--'} {nextAlarm?.period || ''}</h1>
              <p className="text-gray-400">Next Alarm ({nextAlarm?.label || 'None'})</p>
            </Card>

            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold">Your Alarms</h1>
              {!isAudioUnlocked && (
                <button 
                  onClick={unlockAudio}
                  className="p-2 px-4 rounded-xl bg-amber-100 text-amber-600 flex items-center gap-2 text-xs font-medium animate-pulse"
                >
                  <Volume2 size={14} />
                  Enable Sound
                </button>
              )}
            </div>

            {/* Alarm List */}
            <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
              {sortedAlarms.map(alarm => (
                <Card 
                  key={alarm.id} 
                  className="flex items-center gap-4 p-4 cursor-pointer active:bg-gray-50 transition-colors"
                  onClick={() => handleEditAlarm(alarm)}
                >
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400">
                    {alarm.type === 'simple' && <Bell size={20} />}
                    {alarm.type === 'wifi' && <Wifi size={20} className="text-blue-500" />}
                    {alarm.type === 'motion' && <Activity size={20} className="text-purple-500" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold">{alarm.time} {alarm.period}</span>
                      <span className="text-xs text-gray-400">({alarm.type.charAt(0).toUpperCase() + alarm.type.slice(1)})</span>
                    </div>
                    <p className="text-sm text-gray-500">{alarm.label}</p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Switch enabled={alarm.enabled} onChange={() => toggleAlarm(alarm.id)} />
                  </div>
                </Card>
              ))}
            </div>

            <Button onClick={handleAddAlarm}>
              <Plus size={20} /> Add Alarm
            </Button>
            
            {/* Debug Trigger Button */}
            <Button variant="ghost" className="text-xs py-2 opacity-50" onClick={() => {
              unlockAudio();
              setTriggeredAlarm(alarms[0]);
              setScreen('triggered');
              if (audioRef.current) audioRef.current.play();
            }}>
              Test Alarm Trigger
            </Button>
          </motion.div>
        )}

        {screen === 'triggered' && (
          <motion.div 
            key="triggered"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="p-6 flex flex-col items-center justify-center gap-8 flex-1 bg-[#0A0A14] text-white relative"
          >
            {!isAudioUnlocked && (
              <div 
                onClick={unlockAudio}
                className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-8 cursor-pointer"
              >
                <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-4 animate-pulse">
                  <Volume2 size={40} />
                </div>
                <h2 className="text-2xl font-bold mb-2">Tap to Unmute</h2>
                <p className="text-gray-400">Browser blocked the alarm sound</p>
              </div>
            )}
            
            <div className="text-center">
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-6"
              >
                {triggeredAlarm?.type === 'simple' && <Bell size={48} className="text-white" />}
                {triggeredAlarm?.type === 'wifi' && <Wifi size={48} className="text-blue-400" />}
                {triggeredAlarm?.type === 'motion' && <Activity size={48} className="text-purple-400" />}
              </motion.div>
              <h1 className="text-6xl font-bold mb-2">{triggeredAlarm?.time}</h1>
              <p className="text-xl text-gray-400">{triggeredAlarm?.label || 'Wake Up!'}</p>
            </div>

            <Card className="bg-white/5 border-white/10 w-full text-center p-8">
              {triggeredAlarm?.type === 'simple' && (
                <p className="text-lg">Tap below to stop the alarm</p>
              )}
              {triggeredAlarm?.type === 'wifi' && (
                <div className="flex flex-col items-center gap-4">
                  <Signal size={32} className={cn("animate-pulse", wifiSignal > -50 ? "text-green-400" : "text-blue-400")} />
                  <p className="text-lg">Move closer to your WiFi router to stop</p>
                  <div className="text-5xl font-bold text-blue-400">
                    {Math.round(wifiSignal)} dBm
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                    <motion.div 
                      className={cn("h-full", wifiSignal > -50 ? "bg-green-400" : "bg-blue-400")}
                      initial={{ width: "0%" }}
                      animate={{ width: `${Math.min(100, Math.max(0, (wifiSignal + 90) / 60 * 100))}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">Target: -45 dBm or stronger</p>
                </div>
              )}
              {triggeredAlarm?.type === 'motion' && (
                <div className="flex flex-col items-center gap-4">
                  <Smartphone size={32} className="text-purple-400 animate-bounce" />
                  <p className="text-lg">Take {triggeredAlarm.config?.motion?.steps || 20} steps to stop</p>
                  <div className="text-5xl font-bold text-purple-400">
                    {stepsTaken} / {triggeredAlarm.config?.motion?.steps || 20}
                  </div>
                  <p className="text-xs text-gray-500">Walk or shake your OnePlus Nord 4</p>
                </div>
              )}
            </Card>

            <div className="w-full flex flex-col gap-4">
              {triggeredAlarm?.type === 'wifi' ? (
                <Button 
                  variant={wifiSignal >= -45 ? 'primary' : 'outline'}
                  className={cn(wifiSignal >= -45 ? "bg-green-500 border-none" : "opacity-50")}
                  disabled={wifiSignal < -45}
                  onClick={stopAlarm}
                >
                  {wifiSignal >= -45 ? "Stop Alarm" : "Move Closer..."}
                </Button>
              ) : triggeredAlarm?.type === 'motion' ? (
                <Button 
                  variant={stepsTaken >= (triggeredAlarm.config?.motion?.steps || 20) ? 'primary' : 'outline'}
                  className={cn(stepsTaken >= (triggeredAlarm.config?.motion?.steps || 20) ? "bg-green-500 border-none" : "opacity-50")}
                  disabled={stepsTaken < (triggeredAlarm.config?.motion?.steps || 20)}
                  onClick={stopAlarm}
                >
                  {stepsTaken >= (triggeredAlarm.config?.motion?.steps || 20) ? "Challenge Complete!" : "Keep Moving..."}
                </Button>
              ) : (
                <Button onClick={stopAlarm}>Stop Alarm</Button>
              )}
              <Button variant="ghost" className="text-gray-400">Snooze (5m)</Button>
            </div>
          </motion.div>
        )}

        {screen === 'add-type' && (
          <motion.div 
            key="add-type"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-6 flex flex-col gap-6 flex-1"
          >
            <div className="flex items-center gap-4 mb-4">
              <Button variant="ghost" className="w-12 h-12 p-0" onClick={() => setScreen('home')}>
                <ChevronLeft />
              </Button>
              <h2 className="text-2xl font-bold">Add Alarm</h2>
            </div>

            <div className="flex flex-col gap-4">
              {[
                { type: 'simple' as AlarmType, title: 'Simple Alarm', sub: 'Standard alarm', icon: <Bell /> },
                { type: 'wifi' as AlarmType, title: 'WiFi Alarm', sub: 'Move close to disable', icon: <Wifi /> },
                { type: 'motion' as AlarmType, title: 'Motion Alarm', sub: 'Walk/shake to disable', icon: <Activity /> },
              ].map(item => (
                <button
                  key={item.type}
                  onClick={() => {
                    setCurrentEdit({ ...currentEdit, type: item.type });
                    setScreen('settings');
                  }}
                  className="w-full p-6 bg-gray-50 rounded-3xl flex items-center gap-4 hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{item.title}</h3>
                    <p className="text-sm text-gray-500">{item.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {screen === 'settings' && (
          <motion.div 
            key="settings"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="p-6 flex flex-col gap-6 flex-1"
          >
            <div className="bg-[#0A0A14] -mx-6 -mt-6 p-8 text-white rounded-b-[40px] text-center">
              <h2 className="text-2xl font-bold">Set Alarm</h2>
              <p className="text-gray-400 text-sm">{currentEdit.type?.charAt(0).toUpperCase()}{currentEdit.type?.slice(1)} Alarm</p>
            </div>

            <div className="flex justify-center items-center gap-2 my-8">
              <div className="flex flex-col items-center gap-1">
                <button 
                  onClick={() => {
                    const h = parseInt((currentEdit.time || '07:30').split(':')[0]);
                    updateTime('hour', (h % 12 + 1).toString());
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="rotate-90" size={20} />
                </button>
                <input 
                  type="number" 
                  min="1" 
                  max="12"
                  className="bg-gray-100 p-4 rounded-2xl text-4xl font-bold w-24 text-center outline-none focus:ring-2 ring-[#0A0A14]/10 appearance-none"
                  style={{ MozAppearance: 'textfield' }}
                  value={(currentEdit.time || '07:30').split(':')[0]}
                  onChange={e => updateTime('hour', e.target.value)}
                />
                <button 
                  onClick={() => {
                    const h = parseInt((currentEdit.time || '07:30').split(':')[0]);
                    updateTime('hour', (h === 1 ? 12 : h - 1).toString());
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="-rotate-90" size={20} />
                </button>
              </div>

              <div className="text-4xl font-bold self-center mb-10">:</div>

              <div className="flex flex-col items-center gap-1">
                <button 
                  onClick={() => {
                    const m = parseInt((currentEdit.time || '07:30').split(':')[1]);
                    updateTime('minute', ((m + 1) % 60).toString());
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="rotate-90" size={20} />
                </button>
                <input 
                  type="number" 
                  min="0" 
                  max="59"
                  className="bg-gray-100 p-4 rounded-2xl text-4xl font-bold w-24 text-center outline-none focus:ring-2 ring-[#0A0A14]/10 appearance-none"
                  style={{ MozAppearance: 'textfield' }}
                  value={(currentEdit.time || '07:30').split(':')[1]}
                  onChange={e => updateTime('minute', e.target.value)}
                />
                <button 
                  onClick={() => {
                    const m = parseInt((currentEdit.time || '07:30').split(':')[1]);
                    updateTime('minute', (m === 0 ? 59 : m - 1).toString());
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="-rotate-90" size={20} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-1 mb-10">
                <button 
                  onClick={() => setCurrentEdit({ ...currentEdit, period: currentEdit.period === 'AM' ? 'PM' : 'AM' })}
                  className="bg-gray-100 p-6 rounded-2xl text-xl font-bold w-20 h-[88px] flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  {currentEdit.period}
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-3">Repeat:</p>
              <div className="flex justify-between">
                {days.map((day, i) => {
                  const isSelected = currentEdit.repeat?.includes(day);
                  return (
                    <button 
                      key={i}
                      onClick={() => toggleRepeatDay(day)}
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors",
                        isSelected ? "bg-[#0A0A14] text-white" : "bg-gray-100 text-gray-400"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-3">Label:</p>
              <input 
                type="text" 
                placeholder="Morning Gym"
                className="w-full p-4 bg-gray-100 rounded-2xl outline-none focus:ring-2 ring-[#0A0A14]/10"
                value={currentEdit.label}
                onChange={e => setCurrentEdit({...currentEdit, label: e.target.value})}
              />
            </div>

            <div className="mt-auto">
              {currentEdit.type === 'simple' ? (
                <Button onClick={saveAlarm}>Save Alarm</Button>
              ) : (
                <Button onClick={() => setScreen(currentEdit.type === 'wifi' ? 'wifi-config' : 'motion-config')}>
                  Continue <ChevronRight size={20} />
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {screen === 'wifi-config' && (
          <motion.div 
            key="wifi-config"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="p-6 flex flex-col gap-6 flex-1"
          >
            <div className="flex items-center gap-4 mb-4">
              <Button variant="ghost" className="w-12 h-12 p-0" onClick={() => setScreen('settings')}>
                <ChevronLeft />
              </Button>
              <h2 className="text-2xl font-bold">WiFi Configuration</h2>
            </div>

            <Card className="flex flex-col gap-6">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-3">Signal Strength:</p>
                <div className="bg-gray-50 p-6 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Signal className="text-gray-400" />
                    <div className="flex gap-1">
                      <div className="w-2 h-3 bg-[#0A0A14] rounded-full self-end" />
                      <div className="w-2 h-5 bg-[#0A0A14] rounded-full self-end" />
                      <div className="w-2 h-7 bg-[#0A0A14] rounded-full self-end" />
                      <div className="w-2 h-9 bg-gray-200 rounded-full self-end" />
                    </div>
                  </div>
                  <span className="font-bold text-gray-400">80%</span>
                </div>
              </div>

              <Button 
                variant={currentEdit.config?.wifi?.locationSet ? 'primary' : 'secondary'} 
                className="py-3"
                onClick={() => setCurrentEdit({
                  ...currentEdit,
                  config: {
                    ...currentEdit.config,
                    wifi: { ...currentEdit.config?.wifi!, locationSet: true }
                  }
                })}
              >
                {currentEdit.config?.wifi?.locationSet ? 'Location Set ✓' : 'Set Current Location'}
              </Button>

              <div>
                <div className="flex justify-between mb-3">
                  <p className="text-sm font-medium text-gray-500">Distance Sensitivity:</p>
                  <p className="text-sm font-bold">{currentEdit.config?.wifi?.sensitivity}</p>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="2" 
                  step="1"
                  className="w-full accent-[#0A0A14]" 
                  value={currentEdit.config?.wifi?.sensitivity === 'Low' ? 0 : currentEdit.config?.wifi?.sensitivity === 'Medium' ? 1 : 2}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    const sensitivity = val === 0 ? 'Low' : val === 1 ? 'Medium' : 'High';
                    setCurrentEdit({
                      ...currentEdit,
                      config: {
                        ...currentEdit.config,
                        wifi: { ...currentEdit.config?.wifi!, sensitivity }
                      }
                    });
                  }}
                />
              </div>

              <p className="text-center text-xs text-gray-400 italic">(Move closer to stop alarm)</p>
            </Card>

            <div className="mt-auto">
              <Button onClick={saveAlarm}>Save Alarm</Button>
            </div>
          </motion.div>
        )}

        {screen === 'motion-config' && (
          <motion.div 
            key="motion-config"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="p-6 flex flex-col gap-6 flex-1"
          >
            <div className="flex items-center gap-4 mb-4">
              <Button variant="ghost" className="w-12 h-12 p-0" onClick={() => setScreen('settings')}>
                <ChevronLeft />
              </Button>
              <h2 className="text-2xl font-bold">Motion Configuration</h2>
            </div>

            <Card className="flex flex-col gap-6">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-3">Steps Required:</p>
                <input 
                  type="number" 
                  className="w-full p-4 bg-gray-100 rounded-2xl outline-none focus:ring-2 ring-[#0A0A14]/10"
                  value={currentEdit.config?.motion?.steps}
                  onChange={e => setCurrentEdit({
                    ...currentEdit, 
                    config: { 
                      ...currentEdit.config, 
                      motion: { ...currentEdit.config?.motion!, steps: parseInt(e.target.value) || 0 } 
                    }
                  })}
                />
              </div>

              <div>
                <div className="flex justify-between mb-3">
                  <p className="text-sm font-medium text-gray-500">Sensitivity:</p>
                  <p className="text-sm font-bold">{currentEdit.config?.motion?.sensitivity}</p>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="2" 
                  step="1"
                  className="w-full accent-[#0A0A14]" 
                  value={currentEdit.config?.motion?.sensitivity === 'Low' ? 0 : currentEdit.config?.motion?.sensitivity === 'Medium' ? 1 : 2}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    const sensitivity = val === 0 ? 'Low' : val === 1 ? 'Medium' : 'High';
                    setCurrentEdit({
                      ...currentEdit,
                      config: {
                        ...currentEdit.config,
                        motion: { ...currentEdit.config?.motion!, sensitivity }
                      }
                    });
                  }}
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 mb-3">Mode:</p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setCurrentEdit({
                      ...currentEdit, 
                      config: { 
                        ...currentEdit.config, 
                        motion: { ...currentEdit.config?.motion!, mode: 'Walk' } 
                      }
                    })}
                    className={cn(
                      "flex-1 py-4 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all",
                      currentEdit.config?.motion?.mode === 'Walk' ? "bg-[#0A0A14] text-white" : "bg-gray-100 text-gray-400"
                    )}
                  >
                    <Activity size={18} /> Walk
                  </button>
                  <button 
                    onClick={() => setCurrentEdit({
                      ...currentEdit, 
                      config: { 
                        ...currentEdit.config, 
                        motion: { ...currentEdit.config?.motion!, mode: 'Shake' } 
                      }
                    })}
                    className={cn(
                      "flex-1 py-4 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all",
                      currentEdit.config?.motion?.mode === 'Shake' ? "bg-[#0A0A14] text-white" : "bg-gray-100 text-gray-400"
                    )}
                  >
                    <Smartphone size={18} /> Shake
                  </button>
                </div>
              </div>
            </Card>

            <div className="mt-auto">
              <Button onClick={saveAlarm}>Save Alarm</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
