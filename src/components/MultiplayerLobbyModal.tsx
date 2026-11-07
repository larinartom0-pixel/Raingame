import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Plus, Globe, RefreshCw, X, Shield, 
  AlertCircle, Wifi, Play, ChevronRight,
  Cpu, Clock, User
} from 'lucide-react';
import { RoomInfo } from '../network/types';
import { signalingClient } from '../network/SignalingClient';
import { webRTCManager } from '../network/WebRTCManager';
import { distributedSimulation } from '../network/DistributedSimulation';

interface MultiplayerLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectedToRoom?: (roomId: string, isHost: boolean) => void;
}

export default function MultiplayerLobbyModal({
  isOpen,
  onClose,
  onConnectedToRoom
}: MultiplayerLobbyModalProps) {
  const [activeTab, setActiveTab] = useState<'rooms' | 'create'>('rooms');
  
  // Player Profile
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('rw_player_name') || `Слимакокіт-${Math.floor(Math.random() * 899 + 100)}`;
  });
  const [isDummyMode, setIsDummyMode] = useState<boolean>(distributedSimulation.isClientDummyMode);

  // Server state
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Room Creation form
  const [newRoomName, setNewRoomName] = useState<string>('Зона Окраїн // SU_A01');
  const [newRoomCycle, setNewRoomCycle] = useState<number>(300);
  const [newRoomMaxPlayers, setNewRoomMaxPlayers] = useState<number>(12);
  const [isCreatingRoom, setIsCreatingRoom] = useState<boolean>(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    checkServerHealth();
    fetchRooms();
  }, [isOpen]);

  const checkServerHealth = async () => {
    setServerStatus('checking');
    const res = await signalingClient.checkHealth();
    setServerStatus(res.online ? 'online' : 'offline');
  };

  const fetchRooms = async () => {
    setIsLoadingRooms(true);
    setErrorMessage(null);
    try {
      const list = await signalingClient.listRooms();
      setRooms(list);
    } catch {
      setErrorMessage('Не вдалося отримати список кімнат');
    } finally {
      setIsLoadingRooms(false);
    }
  };

  const [isAutoJoining, setIsAutoJoining] = useState<boolean>(false);

  const handleAutoMatchmake = async () => {
    handleSaveProfile();
    setIsAutoJoining(true);
    setErrorMessage(null);

    const success = await webRTCManager.autoMatchmakeAndJoin();
    setIsAutoJoining(false);

    if (success && webRTCManager.currentRoomId) {
      onConnectedToRoom?.(webRTCManager.currentRoomId, webRTCManager.isRoomHost);
      onClose();
    } else {
      setErrorMessage(webRTCManager.lastError || 'Не вдалося підключитися до гри');
    }
  };

  const handleSaveProfile = () => {
    localStorage.setItem('rw_player_name', playerName);
    webRTCManager.setLocalIdentity(playerName);
  };

  const handleJoinRoom = async (roomId: string) => {
    handleSaveProfile();
    setJoiningRoomId(roomId);
    setErrorMessage(null);

    const success = await webRTCManager.joinRoom(roomId);
    setJoiningRoomId(null);

    if (success) {
      onConnectedToRoom?.(roomId, false);
      onClose();
    } else {
      setErrorMessage(webRTCManager.lastError || 'Помилка підключення до кімнати');
    }
  };

  const toggleDummyMode = () => {
    const next = !isDummyMode;
    setIsDummyMode(next);
    distributedSimulation.setClientDummyMode(next);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 bg-black/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold font-mono tracking-wider text-white">
                  МЕРЕЖЕВА ГРА // WEBRTC P2P
                </h2>
                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <span>Шлюз P2P:</span>
                  <span className="font-mono text-cyan-300">
                    {serverStatus === 'online' ? 'Підключено' : serverStatus === 'checking' ? "З'єднання..." : 'Офлайн'}
                  </span>
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    serverStatus === 'online' ? 'bg-emerald-500 animate-pulse' :
                    serverStatus === 'checking' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                  }`} />
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Profile Strip */}
          <div className="px-4 py-2.5 bg-zinc-900/40 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-zinc-400 font-mono text-[11px]">Нікнейм:</span>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                className="px-2.5 py-1 rounded bg-black/80 border border-zinc-700 font-mono text-xs text-white focus:border-amber-400 focus:outline-none w-36 sm:w-44"
                placeholder="Слимакокіт"
              />
            </div>

            {/* Client Dummy Toggle for weak phones */}
            <button
              onClick={toggleDummyMode}
              className={`px-2.5 py-1 rounded border text-[10px] font-mono flex items-center gap-1.5 cursor-pointer transition-colors ${
                isDummyMode 
                  ? 'bg-amber-950/60 border-amber-600 text-amber-300' 
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Для слабких телефонів: передає прорахунок фізики мобів на пристрій друга"
            >
              <Cpu className="w-3 h-3" />
              <span>Dummy Mode: {isDummyMode ? 'УВІМКНЕНО' : 'ВИМК'}</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 p-4 overflow-y-auto min-h-[260px]">
            {errorMessage && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-950/60 border border-red-700/60 text-red-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white">✕</button>
              </div>
            )}

            <div className="space-y-4">
              {/* 1. AUTO-MATCHMAKING BANNER: "гра сама создає комнату єслі їх нету або всі заповнені з рандомним таймером циклов та 12 слотами гравців" */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/90 via-zinc-900 to-emerald-950/90 border-2 border-cyan-500/60 shadow-[0_0_25px_rgba(6,182,212,0.25)] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 text-left">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400 flex items-center justify-center shrink-0 text-cyan-300 shadow-md">
                    <Globe className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 text-[9px] font-mono font-bold">
                        АВТО-ПІДБІР
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono">● 12 слотів • Випадковий цикл</span>
                    </div>
                    <h3 className="text-base font-bold text-white font-mono mt-0.5">
                      ШВИДКИЙ ВХІД У СВІТ
                    </h3>
                    <p className="text-xs text-zinc-400 max-w-sm">
                      Гра автоматично знайде вільну кімнату або сама створить новий світ, якщо всі зайняті!
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleAutoMatchmake}
                  disabled={isAutoJoining}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-sm flex items-center justify-center gap-2.5 cursor-pointer shadow-lg shadow-cyan-500/30 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                >
                  {isAutoJoining ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-black" />
                      <span>ПІДКЛЮЧЕННЯ...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-black" />
                      <span>ГРАТИ В МЕРЕЖІ</span>
                    </>
                  )}
                </button>
              </div>

              {/* 2. OPEN ROOMS LIST */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-zinc-400 pb-1 font-mono">
                  <span className="flex items-center gap-1.5 font-bold text-zinc-300">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <span>ВІДКРИТІ КІМНАТИ ОНЛАЙН ({rooms.length}):</span>
                  </span>
                  <button
                    onClick={fetchRooms}
                    disabled={isLoadingRooms}
                    className="flex items-center gap-1 text-cyan-400 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingRooms ? 'animate-spin' : ''}`} />
                    <span>Оновити</span>
                  </button>
                </div>

                {isLoadingRooms ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-500 font-mono text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin text-cyan-500" />
                    <span>Пошук доступних кімнат...</span>
                  </div>
                ) : rooms.length === 0 ? (
                  <div className="py-8 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center text-center p-5 text-zinc-500 space-y-2">
                    <Users className="w-8 h-8 text-zinc-600" />
                    <p className="text-xs font-bold text-zinc-300">Наразі немає відкритих кімнат</p>
                    <p className="text-[11px] text-zinc-500 max-w-sm">
                      Натисніть кнопку <strong>«ГРАТИ В МЕРЕЖІ»</strong> вище — і гра сама створить для вас новий світ на 12 гравців!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {rooms.map((room) => {
                      const isFull = room.playerCount >= room.maxPlayers;
                      const isJoining = joiningRoomId === room.id;

                      return (
                        <div
                          key={room.id}
                          className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white font-mono">{room.name}</span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400">
                                {room.id}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-400 font-mono">
                              <span>Хост: <strong className="text-zinc-200">{room.hostName}</strong></span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-cyan-400" />
                                Цикл: {Math.floor(room.cycleRemainingSeconds / 60)}:{String(room.cycleRemainingSeconds % 60).padStart(2, '0')}
                              </span>
                              <span>•</span>
                              <span className="text-emerald-400 font-bold">
                                {room.playerCount} / {room.maxPlayers} гравців
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleJoinRoom(room.id)}
                            disabled={isFull || isJoining}
                            className={`w-full sm:w-auto px-4 py-2 rounded-lg font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md ${
                              isFull
                                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                : isJoining
                                ? 'bg-cyan-500 text-black animate-pulse'
                                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white active:scale-95'
                            }`}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>{isJoining ? 'ПІДКЛЮЧЕННЯ...' : isFull ? 'ЗАПОВНЕНО' : 'УВІЙТИ'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="px-4 py-2 border-t border-zinc-800 bg-black/40 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
            <span>Децентралізований WebRTC P2P mesh • До 12 гравців</span>
            <span className="text-emerald-500/80">Favor the Shooter Hit-Reg Active</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
