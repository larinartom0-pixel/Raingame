import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Plus, Globe, RefreshCw, X, Shield, 
  AlertCircle, Wifi, Play, ChevronRight,
  Cpu, Clock, User
} from 'lucide-react';
import { RoomInfo } from '../network/types';
import { SlugcatCharacterId, SLUGCAT_CHARACTERS } from '../types';
import { signalingClient } from '../network/SignalingClient';
import { webRTCManager } from '../network/WebRTCManager';
import { distributedSimulation } from '../network/DistributedSimulation';
import { APP_VERSION, compareVersions } from '../version';
import { getPersistentNickname, updateNicknameSetting, useGameSettings } from '../settings';
import { CHARACTER_I18N, t } from '../i18n';

interface MultiplayerLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCharacter?: SlugcatCharacterId;
  onSelectCharacter?: (charId: SlugcatCharacterId) => void;
  onConnectedToRoom?: (roomId: string, isHost: boolean) => void;
}

export default function MultiplayerLobbyModal({
  isOpen,
  onClose,
  selectedCharacter = 'survivor',
  onSelectCharacter,
  onConnectedToRoom
}: MultiplayerLobbyModalProps) {
  const { language: lang } = useGameSettings();
  const [activeTab, setActiveTab] = useState<'rooms' | 'create'>('rooms');
  
  // Player Profile (persistent across reloads)
  const [playerName, setPlayerName] = useState<string>(() => getPersistentNickname());
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
    setPlayerName(getPersistentNickname());
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
    if (isAutoJoining || joiningRoomId) return;
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
    const saved = updateNicknameSetting(playerName);
    setPlayerName(saved);
    webRTCManager.setLocalIdentity(saved);
  };

  const handleJoinRoom = async (roomId: string, roomVersion?: string) => {
    if (joiningRoomId || isAutoJoining) return;
    handleSaveProfile();
    setJoiningRoomId(roomId);
    setErrorMessage(null);

    const success = await webRTCManager.joinRoom(roomId, roomVersion);
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
                  {t(lang, 'lobbyTitle')}
                </h2>
                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <span>{t(lang, 'lobbyGateway')}</span>
                  <span className="font-mono text-cyan-300">
                    {serverStatus === 'online' ? t(lang, 'lobbyOnline') : serverStatus === 'checking' ? t(lang, 'lobbyChecking') : t(lang, 'lobbyOffline')}
                  </span>
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    serverStatus === 'online' ? 'bg-emerald-500 animate-pulse' :
                    serverStatus === 'checking' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                  }`} />
                  <span className="text-zinc-600">•</span>
                  <span className="font-mono text-amber-300">{t(lang, 'lobbyClientVer')}: v{APP_VERSION}</span>
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
              <span className="text-zinc-400 font-mono text-[11px]">{t(lang, 'lobbyNickname')}</span>
              <input
                type="text"
                value={playerName}
                onChange={(e) => {
                  const val = e.target.value;
                  setPlayerName(val);
                  if (val.trim()) {
                    const saved = updateNicknameSetting(val);
                    webRTCManager.setLocalIdentity(saved);
                  }
                }}
                onBlur={handleSaveProfile}
                maxLength={20}
                className="px-2.5 py-1 rounded bg-black/80 border border-zinc-700 font-mono text-xs text-white focus:border-amber-400 focus:outline-none w-36 sm:w-44"
                placeholder="Slugcat"
              />
            </div>

            {/* Character Switcher in Lobby */}
            {onSelectCharacter && (
              <div className="flex items-center gap-1.5">
                {(['survivor', 'monk'] as SlugcatCharacterId[]).map((cid) => {
                  const cfg = SLUGCAT_CHARACTERS[cid];
                  const active = selectedCharacter === cid;
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => onSelectCharacter(cid)}
                      className={`px-2 py-1 rounded border text-[10px] font-mono flex items-center gap-1.5 cursor-pointer transition-colors ${
                        active
                          ? cid === 'monk'
                            ? 'bg-yellow-950/70 border-yellow-400 text-yellow-200'
                            : 'bg-zinc-800 border-white text-white'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-black/40"
                        style={{ backgroundColor: cfg.bodyColorMid }}
                      />
                      <span>{CHARACTER_I18N[lang][cid].name}</span>
                    </button>
                  );
                })}
              </div>
            )}

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
                        {t(lang, 'lobbyAutoBadge')}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono">{t(lang, 'lobbySlotsDesc')}</span>
                    </div>
                    <h3 className="text-base font-bold text-white font-mono mt-0.5">
                      {t(lang, 'lobbyQuickJoinTitle')}
                    </h3>
                    <p className="text-xs text-zinc-400 max-w-sm">
                      {t(lang, 'lobbyQuickJoinDesc')}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleAutoMatchmake}
                  disabled={isAutoJoining || Boolean(joiningRoomId)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-sm flex items-center justify-center gap-2.5 cursor-pointer shadow-lg shadow-cyan-500/30 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                >
                  {isAutoJoining ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-black" />
                      <span>{t(lang, 'lobbyConnecting')}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-black" />
                      <span>{t(lang, 'lobbyPlayOnline')}</span>
                    </>
                  )}
                </button>
              </div>

              {/* 2. OPEN ROOMS LIST */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-zinc-400 pb-1 font-mono">
                  <span className="flex items-center gap-1.5 font-bold text-zinc-300">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{t(lang, 'lobbyOpenRooms')} ({rooms.length}):</span>
                  </span>
                  <button
                    onClick={fetchRooms}
                    disabled={isLoadingRooms}
                    className="flex items-center gap-1 text-cyan-400 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingRooms ? 'animate-spin' : ''}`} />
                    <span>{t(lang, 'lobbyRefresh')}</span>
                  </button>
                </div>

                {isLoadingRooms ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-500 font-mono text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin text-cyan-500" />
                    <span>{t(lang, 'lobbySearching')}</span>
                  </div>
                ) : rooms.length === 0 ? (
                  <div className="py-8 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center text-center p-5 text-zinc-500 space-y-2">
                    <Users className="w-8 h-8 text-zinc-600" />
                    <p className="text-xs font-bold text-zinc-300">{t(lang, 'lobbyNoRooms')}</p>
                    <p className="text-[11px] text-zinc-500 max-w-sm">
                      {t(lang, 'lobbyNoRoomsHint')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {rooms.map((room) => {
                      const isFull = room.playerCount >= room.maxPlayers;
                      const isJoining = joiningRoomId === room.id;
                      const roomVer = room.version || '1.0.0';
                      const isOutdatedClient = compareVersions(APP_VERSION, roomVer) < 0;

                      return (
                        <div
                          key={room.id}
                          onClick={() => {
                            if (!isFull && !isOutdatedClient && !joiningRoomId && !isAutoJoining) {
                              handleJoinRoom(room.id, roomVer);
                            }
                          }}
                          className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                            isOutdatedClient
                              ? 'border-red-900/60 bg-red-950/20 opacity-85'
                              : isFull || isAutoJoining || Boolean(joiningRoomId)
                              ? 'border-zinc-800/80 bg-zinc-900/50'
                              : 'border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-900 hover:border-cyan-600/60 cursor-pointer'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-sm text-white font-mono">{room.name}</span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400">
                                {room.id}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                                isOutdatedClient
                                  ? 'bg-red-950/80 border-red-600/70 text-red-300'
                                  : 'bg-cyan-950/60 border-cyan-700/60 text-cyan-300'
                              }`}>
                                v{roomVer}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-400 font-mono">
                              <span>{t(lang, 'lobbyHost')} <strong className="text-zinc-200">{room.hostName}</strong></span>
                              <span>•</span>
                              <span className={isOutdatedClient ? 'text-red-300 font-bold' : 'text-cyan-300'}>
                                {t(lang, 'lobbyRoomVer')} v{roomVer}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-cyan-400" />
                                {t(lang, 'lobbyCycle')} {Math.floor(room.cycleRemainingSeconds / 60)}:{String(room.cycleRemainingSeconds % 60).padStart(2, '0')}
                              </span>
                              <span>•</span>
                              <span className="text-emerald-400 font-bold">
                                {room.playerCount} / {room.maxPlayers} {t(lang, 'lobbyPlayers')}
                              </span>
                            </div>
                            {isOutdatedClient && (
                              <p className="text-[10px] font-mono text-red-400">
                                {t(lang, 'lobbyIncompatible')} v{roomVer}.
                              </p>
                            )}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJoinRoom(room.id, roomVer);
                            }}
                            disabled={isFull || Boolean(joiningRoomId) || isAutoJoining || isOutdatedClient}
                            className={`w-full sm:w-auto px-4 py-2 rounded-lg font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md ${
                              isOutdatedClient
                                ? 'bg-red-950/80 border border-red-700/70 text-red-300 cursor-not-allowed'
                                : isFull
                                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                : isJoining
                                ? 'bg-cyan-500 text-black animate-pulse cursor-pointer'
                                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white active:scale-95 cursor-pointer'
                            }`}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>
                              {isOutdatedClient
                                ? t(lang, 'lobbyOutdatedBtn')
                                : isJoining
                                ? t(lang, 'lobbyConnecting')
                                : isFull
                                ? t(lang, 'lobbyFullBtn')
                                : t(lang, 'lobbyJoinBtn')}
                            </span>
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
