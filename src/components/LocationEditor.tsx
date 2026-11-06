import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Download, Upload, Play, Copy, Check, Trash2, 
  RotateCcw, Maximize2, ZoomIn, ZoomOut, Grid, Move, 
  Shield, Home, Sparkles, Layers, Box, HelpCircle, FileText
} from 'lucide-react';
import { 
  CustomLocationData, EditorPlatform, EditorPole, EditorTransitPipe, 
  EditorSpawnItem, PlatformType, DEFAULT_OUTSKIRTS_LOCATION 
} from '../types';
import { soundEngine } from './RainWorldSynth';

interface LocationEditorProps {
  initialLocation?: CustomLocationData;
  onPlayLocation: (location: CustomLocationData) => void;
  onBack: () => void;
  isSoundMuted: boolean;
}

type ToolMode = 
  | 'select'
  | 'concrete'
  | 'metal'
  | 'pipe'
  | 'wall'
  | 'shelter'
  | 'vertical_pole'
  | 'transit_pipe'
  | 'spear'
  | 'rock'
  | 'berry'
  | 'player_spawn'
  | 'npc_spawn'
  | 'eraser';

export default function LocationEditor({ 
  initialLocation, 
  onPlayLocation, 
  onBack,
  isSoundMuted 
}: LocationEditorProps) {
  const [location, setLocation] = useState<CustomLocationData>(() => {
    if (initialLocation) {
      return JSON.parse(JSON.stringify(initialLocation));
    }
    // Check localStorage for saved draft
    try {
      const saved = localStorage.getItem('rain_world_custom_location_draft');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return JSON.parse(JSON.stringify(DEFAULT_OUTSKIRTS_LOCATION));
  });

  const [activeTool, setActiveTool] = useState<ToolMode>('concrete');
  const [gridSnap, setGridSnap] = useState<number>(20); // 20px, 10px, or 0 (free)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [showResizeModal, setShowResizeModal] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonInputText, setJsonInputText] = useState('');
  const [editorToast, setEditorToast] = useState<string | null>('Редактор локацій Rain World активний');
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  // Dimension edit state
  const [newWidth, setNewWidth] = useState<number>(location.width);
  const [newHeight, setNewHeight] = useState<number>(location.height);

  // Canvas viewport navigation (Pan & Zoom)
  const [zoom, setZoom] = useState<number>(0.75);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 30 });
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Creation drag state for drawing boxes/poles/pipes
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Transit pipe 2-point creation state
  const [transitStartPoint, setTransitStartPoint] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Save draft to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('rain_world_custom_location_draft', JSON.stringify(location));
    } catch {
      // ignore storage error
    }
  }, [location]);

  const showToast = (msg: string) => {
    setEditorToast(msg);
    setTimeout(() => {
      setEditorToast(null);
    }, 2800);
  };

  // Coordinate snapping helper
  const snapCoord = useCallback((val: number) => {
    if (gridSnap <= 0) return Math.round(val);
    return Math.round(val / gridSnap) * gridSnap;
  }, [gridSnap]);

  // Screen to Canvas World coordinates conversion
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = (clientX - rect.left) / zoom;
    const rawY = (clientY - rect.top) / zoom;
    return {
      x: snapCoord(rawX),
      y: snapCoord(rawY)
    };
  }, [zoom, snapCoord]);

  // Handle Export to .json file download
  const handleExportJsonFile = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(location, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      const safeName = (location.name || 'custom_location').toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
      downloadAnchor.setAttribute("download", `${safeName}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast(`Файл "${safeName}.json" збережено на пристрій!`);
      if (!isSoundMuted) soundEngine.playPickup();
    } catch {
      showToast('Помилка при експорті файлу');
    }
  };

  // Handle Copy JSON string to Clipboard
  const handleCopyJson = async () => {
    try {
      const jsonStr = JSON.stringify(location, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      setCopiedSuccess(true);
      showToast('JSON скопійовано в буфер обміну!');
      if (!isSoundMuted) soundEngine.playPickup();
      setTimeout(() => setCopiedSuccess(false), 2500);
    } catch {
      // Fallback
      showJsonModal(true);
      setJsonInputText(JSON.stringify(location, null, 2));
    }
  };

  // Handle Import JSON from file input
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.platforms && Array.isArray(parsed.platforms)) {
          setLocation(parsed);
          setNewWidth(parsed.width || 1000);
          setNewHeight(parsed.height || 580);
          showToast(`Локацію "${parsed.name || 'Імпортована'}" успішно завантажено!`);
          if (!isSoundMuted) soundEngine.playThunder();
        } else {
          showToast('Невірний формат файлу JSON локації');
        }
      } catch {
        showToast('Помилка парсингу JSON файлу');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Handle Import JSON from text area
  const handleApplyJsonText = () => {
    try {
      const parsed = JSON.parse(jsonInputText);
      if (parsed.platforms && Array.isArray(parsed.platforms)) {
        setLocation(parsed);
        setNewWidth(parsed.width || 1000);
        setNewHeight(parsed.height || 580);
        setShowJsonModal(false);
        setJsonInputText('');
        showToast('JSON успішно застосовано!');
        if (!isSoundMuted) soundEngine.playThunder();
      } else {
        showToast('Формат JSON не містить потрібних полів');
      }
    } catch {
      showToast('Синтаксична помилка в тексті JSON');
    }
  };

  // Resize map bounds
  const handleApplyResize = (w: number, h: number) => {
    const clampedW = Math.max(1000, Math.min(3600, w));
    const clampedH = Math.max(580, Math.min(2200, h));
    setLocation(prev => ({
      ...prev,
      width: clampedW,
      height: clampedH,
      platforms: prev.platforms.map(p => {
        // Automatically extend ground floor if it was full width
        if (p.id === 'p-ground' || p.y >= clampedH - 80) {
          return { ...p, y: clampedH - 60, w: Math.max(p.w, clampedW) };
        }
        return p;
      })
    }));
    setShowResizeModal(false);
    showToast(`Розмір локації оновлено: ${clampedW} × ${clampedH} px`);
    if (!isSoundMuted) soundEngine.playPickup();
  };

  // Reset to default preset
  const handleResetToDefault = () => {
    if (window.confirm('Скинути локацію до стандартної кімнати Окраїн?')) {
      setLocation(JSON.parse(JSON.stringify(DEFAULT_OUTSKIRTS_LOCATION)));
      setNewWidth(DEFAULT_OUTSKIRTS_LOCATION.width);
      setNewHeight(DEFAULT_OUTSKIRTS_LOCATION.height);
      showToast('Скинуто до стандартної кімнати Окраїн');
      if (!isSoundMuted) soundEngine.playPickup();
    }
  };

  // Clear all elements
  const handleClearAll = () => {
    if (window.confirm('Очистити всі платформи, труби та предмети на карті?')) {
      setLocation(prev => ({
        ...prev,
        platforms: [{ id: 'p-ground', x: 0, y: prev.height - 60, w: prev.width, h: 60, type: 'concrete', label: 'Земля' }],
        poles: [],
        transitPipes: [],
        items: []
      }));
      showToast('Карту очищено (залишено тільки землю)');
    }
  };

  // Canvas Mouse / Touch interactions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Space or Middle mouse button for panning
    if (e.button === 1 || e.shiftKey || activeTool === 'select') {
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (e.button !== 0) return;
    const worldPos = screenToWorld(e.clientX, e.clientY);

    // Eraser Tool
    if (activeTool === 'eraser') {
      eraseAt(worldPos.x, worldPos.y);
      return;
    }

    // Direct Placement Items
    if (activeTool === 'spear' || activeTool === 'rock' || activeTool === 'berry') {
      const newItem: EditorSpawnItem = {
        id: `item-${activeTool}-${Date.now()}`,
        type: activeTool,
        x: worldPos.x,
        y: worldPos.y
      };
      setLocation(prev => ({ ...prev, items: [...prev.items, newItem] }));
      showToast(`Додано: ${activeTool === 'spear' ? 'Спис' : activeTool === 'rock' ? 'Камінь' : 'Ягоду'}`);
      if (!isSoundMuted) soundEngine.playPickup();
      return;
    }

    if (activeTool === 'player_spawn') {
      setLocation(prev => ({ ...prev, playerSpawn: { x: worldPos.x, y: worldPos.y } }));
      showToast(`Точку появи гравця встановлено: (${worldPos.x}, ${worldPos.y})`);
      if (!isSoundMuted) soundEngine.playPickup();
      return;
    }

    if (activeTool === 'npc_spawn') {
      setLocation(prev => ({ ...prev, npcSpawn: { x: worldPos.x, y: worldPos.y } }));
      showToast(`Точку появи NPC встановлено: (${worldPos.x}, ${worldPos.y})`);
      if (!isSoundMuted) soundEngine.playPickup();
      return;
    }

    // Transit pipe 2-point creation
    if (activeTool === 'transit_pipe') {
      if (!transitStartPoint) {
        setTransitStartPoint(worldPos);
        showToast('Вхід труби встановлено. Тепер клікніть для виходу!');
      } else {
        const newPipe: EditorTransitPipe = {
          id: `transit-pipe-${Date.now()}`,
          startX: transitStartPoint.x,
          startY: transitStartPoint.y,
          endX: worldPos.x,
          endY: worldPos.y,
          label: 'Труба-перехід'
        };
        setLocation(prev => ({ ...prev, transitPipes: [...prev.transitPipes, newPipe] }));
        setTransitStartPoint(null);
        showToast('Трубу-перехід Rain World створено!');
        if (!isSoundMuted) soundEngine.playPickup();
      }
      return;
    }

    // Box & Pole Drag-to-Create Tools
    setDragStart(worldPos);
    setDragCurrent(worldPos);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }

    if (dragStart) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      setDragCurrent(worldPos);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (dragStart && dragCurrent) {
      const x1 = Math.min(dragStart.x, dragCurrent.x);
      const y1 = Math.min(dragStart.y, dragCurrent.y);
      const x2 = Math.max(dragStart.x, dragCurrent.x);
      const y2 = Math.max(dragStart.y, dragCurrent.y);
      const w = Math.max(16, x2 - x1);
      const h = Math.max(12, y2 - y1);

      if (activeTool === 'concrete' || activeTool === 'metal' || activeTool === 'pipe' || activeTool === 'wall' || activeTool === 'shelter') {
        const newPlat: EditorPlatform = {
          id: `plat-${activeTool}-${Date.now()}`,
          x: x1,
          y: y1,
          w: Math.max(20, w),
          h: Math.max(14, h),
          type: activeTool,
          label: activeTool === 'wall' ? 'Стіна' : activeTool === 'shelter' ? 'Укриття' : undefined
        };
        setLocation(prev => ({ ...prev, platforms: [...prev.platforms, newPlat] }));
        showToast(`Створено: ${
          activeTool === 'wall' ? 'Стіна / Перешкода' : 
          activeTool === 'shelter' ? 'Укриття' : 
          activeTool === 'pipe' ? 'Труба-міст' : 
          activeTool === 'metal' ? 'Метал' : 'Бетонна плита'
        }`);
        if (!isSoundMuted) soundEngine.playPickup();
      } else if (activeTool === 'vertical_pole') {
        const newPole: EditorPole = {
          id: `pole-${Date.now()}`,
          x: dragStart.x,
          yMin: y1,
          yMax: Math.max(y1 + 40, y2)
        };
        setLocation(prev => ({ ...prev, poles: [...prev.poles, newPole] }));
        showToast('Створено вертикальну жердину для лазіння');
        if (!isSoundMuted) soundEngine.playPickup();
      }
    }

    setDragStart(null);
    setDragCurrent(null);
  };

  // Mobile Touch Gestures (1-finger draw/place, 2-finger pinch zoom & pan)
  // "редактор карт не работає на телефоні фікси"
  const touchPinchInitialDist = useRef<number | null>(null);
  const touchPinchInitialZoom = useRef<number>(1);
  const touchLastMidpoint = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (activeTool === 'select') {
        setIsPanning(true);
        lastMousePos.current = { x: touch.clientX, y: touch.clientY };
        return;
      }

      const worldPos = screenToWorld(touch.clientX, touch.clientY);

      // Eraser Tool
      if (activeTool === 'eraser') {
        eraseAt(worldPos.x, worldPos.y);
        return;
      }

      // Direct Placement Items
      if (activeTool === 'spear' || activeTool === 'rock' || activeTool === 'berry') {
        const newItem: EditorSpawnItem = {
          id: `item-${activeTool}-${Date.now()}`,
          type: activeTool,
          x: worldPos.x,
          y: worldPos.y
        };
        setLocation(prev => ({ ...prev, items: [...prev.items, newItem] }));
        showToast(`Додано: ${activeTool === 'spear' ? 'Спис' : activeTool === 'rock' ? 'Камінь' : 'Ягоду'}`);
        if (!isSoundMuted) soundEngine.playPickup();
        return;
      }

      if (activeTool === 'player_spawn') {
        setLocation(prev => ({ ...prev, playerSpawn: { x: worldPos.x, y: worldPos.y } }));
        showToast(`Точку появи гравця встановлено: (${worldPos.x}, ${worldPos.y})`);
        if (!isSoundMuted) soundEngine.playPickup();
        return;
      }

      if (activeTool === 'npc_spawn') {
        setLocation(prev => ({ ...prev, npcSpawn: { x: worldPos.x, y: worldPos.y } }));
        showToast(`Точку появи NPC встановлено: (${worldPos.x}, ${worldPos.y})`);
        if (!isSoundMuted) soundEngine.playPickup();
        return;
      }

      if (activeTool === 'transit_pipe') {
        if (!transitStartPoint) {
          setTransitStartPoint(worldPos);
          showToast('Вхід труби встановлено. Тепер клікніть або тапніть для виходу!');
        } else {
          const newPipe: EditorTransitPipe = {
            id: `transit-pipe-${Date.now()}`,
            startX: transitStartPoint.x,
            startY: transitStartPoint.y,
            endX: worldPos.x,
            endY: worldPos.y,
            label: 'Труба-перехід'
          };
          setLocation(prev => ({ ...prev, transitPipes: [...prev.transitPipes, newPipe] }));
          setTransitStartPoint(null);
          showToast('Трубу-перехід Rain World створено!');
          if (!isSoundMuted) soundEngine.playPickup();
        }
        return;
      }

      // Box & Pole Drag-to-Create Tools
      setDragStart(worldPos);
      setDragCurrent(worldPos);
    } else if (e.touches.length === 2) {
      // 2-finger pinch zoom & canvas pan
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchPinchInitialDist.current = dist;
      touchPinchInitialZoom.current = zoom;
      touchLastMidpoint.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
      setDragStart(null);
      setDragCurrent(null);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.touches.length === 2 && touchPinchInitialDist.current && touchLastMidpoint.current) {
      const curDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = curDist / touchPinchInitialDist.current;
      setZoom(Math.max(0.25, Math.min(2.5, touchPinchInitialZoom.current * factor)));

      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dx = midX - touchLastMidpoint.current.x;
      const dy = midY - touchLastMidpoint.current.y;
      touchLastMidpoint.current = { x: midX, y: midY };
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (isPanning) {
        const dx = touch.clientX - lastMousePos.current.x;
        const dy = touch.clientY - lastMousePos.current.y;
        lastMousePos.current = { x: touch.clientX, y: touch.clientY };
        setPan(p => ({ x: p.x + dx, y: p.y + dy }));
        return;
      }

      if (dragStart) {
        const worldPos = screenToWorld(touch.clientX, touch.clientY);
        setDragCurrent(worldPos);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.touches.length === 0) {
      touchPinchInitialDist.current = null;
      touchLastMidpoint.current = null;
      handleMouseUp();
    }
  };

  // Erase clicked element helper
  const eraseAt = (wx: number, wy: number) => {
    // 1. Check items
    const itemIdx = location.items.findIndex(it => Math.hypot(it.x - wx, it.y - wy) < 25);
    if (itemIdx >= 0) {
      setLocation(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== itemIdx)
      }));
      showToast('Предмет видалено');
      if (!isSoundMuted) soundEngine.playPickup();
      return;
    }

    // 2. Check transit pipes
    const pipeIdx = location.transitPipes.findIndex(p => 
      Math.hypot(p.startX - wx, p.startY - wy) < 25 || Math.hypot(p.endX - wx, p.endY - wy) < 25
    );
    if (pipeIdx >= 0) {
      setLocation(prev => ({
        ...prev,
        transitPipes: prev.transitPipes.filter((_, i) => i !== pipeIdx)
      }));
      showToast('Трубу-перехід видалено');
      if (!isSoundMuted) soundEngine.playPickup();
      return;
    }

    // 3. Check poles
    const poleIdx = location.poles.findIndex(p => Math.abs(p.x - wx) < 18 && wy >= p.yMin - 10 && wy <= p.yMax + 10);
    if (poleIdx >= 0) {
      setLocation(prev => ({
        ...prev,
        poles: prev.poles.filter((_, i) => i !== poleIdx)
      }));
      showToast('Жердину видалено');
      if (!isSoundMuted) soundEngine.playPickup();
      return;
    }

    // 4. Check platforms (reverse to remove top-most first)
    for (let i = location.platforms.length - 1; i >= 0; i--) {
      const plat = location.platforms[i];
      if (wx >= plat.x && wx <= plat.x + plat.w && wy >= plat.y && wy <= plat.y + plat.h) {
        setLocation(prev => ({
          ...prev,
          platforms: prev.platforms.filter((_, idx) => idx !== i)
        }));
        showToast('Платформу / стіну видалено');
        if (!isSoundMuted) soundEngine.playPickup();
        return;
      }
    }
  };

  // Main Canvas Rendering Loop for Editor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas internal size matches location bounds
    canvas.width = location.width;
    canvas.height = location.height;

    // Dark industrial background
    ctx.fillStyle = '#0f0c15';
    ctx.fillRect(0, 0, location.width, location.height);

    // Grid lines
    const gSize = gridSnap > 0 ? gridSnap : 20;
    ctx.strokeStyle = '#1b1626';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= location.width; x += gSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, location.height);
    }
    for (let y = 0; y <= location.height; y += gSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(location.width, y);
    }
    ctx.stroke();

    // Secondary coarser grid (every 100px)
    ctx.strokeStyle = '#282035';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= location.width; x += 100) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, location.height);
    }
    for (let y = 0; y <= location.height; y += 100) {
      ctx.moveTo(0, y);
      ctx.lineTo(location.width, y);
    }
    ctx.stroke();

    // 1. Draw Transit Shortcut Pipes (connectors with stylized conduits & glowing entrance rings)
    location.transitPipes.forEach((pipe, idx) => {
      // Connecting conduit line
      ctx.save();
      ctx.strokeStyle = '#065f46';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pipe.startX, pipe.startY);
      ctx.lineTo(pipe.endX, pipe.endY);
      ctx.stroke();

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Entrance A (Rounded Pipe Collar)
      ctx.fillStyle = '#064e3b';
      ctx.beginPath();
      ctx.arc(pipe.startX, pipe.startY, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#a7f3d0';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Т${idx + 1}-A`, pipe.startX, pipe.startY + 4);

      // Entrance B (Rounded Pipe Collar)
      ctx.fillStyle = '#064e3b';
      ctx.beginPath();
      ctx.arc(pipe.endX, pipe.endY, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#a7f3d0';
      ctx.fillText(`Т${idx + 1}-B`, pipe.endX, pipe.endY + 4);
      ctx.restore();
    });

    // 2. Draw Climbing Poles
    location.poles.forEach((pole) => {
      ctx.save();
      ctx.strokeStyle = '#0e0b12';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(pole.x, pole.yMin);
      ctx.lineTo(pole.x, pole.yMax);
      ctx.stroke();

      ctx.strokeStyle = '#c2410c'; // Vibrant rust orange indicator
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(pole.x, pole.yMin);
      ctx.lineTo(pole.x, pole.yMax);
      ctx.stroke();

      // Rungs
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.5;
      for (let py = pole.yMin + 15; py < pole.yMax; py += 30) {
        ctx.beginPath();
        ctx.moveTo(pole.x - 6, py);
        ctx.lineTo(pole.x + 6, py);
        ctx.stroke();
      }
      ctx.restore();
    });

    // 3. Draw Platforms & Structures
    location.platforms.forEach((plat) => {
      ctx.save();
      if (plat.type === 'concrete') {
        ctx.fillStyle = '#1e1a24';
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
        ctx.strokeStyle = '#4c3f58';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

        if (plat.label) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.font = 'bold 20px font-sans';
          ctx.textAlign = 'center';
          ctx.fillText(plat.label, plat.x + plat.w / 2, plat.y + Math.min(plat.h / 2 + 7, 30));
        }
      } else if (plat.type === 'metal') {
        ctx.fillStyle = '#261713';
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
        ctx.strokeStyle = '#633527';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

        // Girder cross-hatches
        ctx.strokeStyle = '#3d2017';
        ctx.lineWidth = 1.5;
        for (let step = plat.x + 10; step < plat.x + plat.w; step += 18) {
          ctx.beginPath();
          ctx.moveTo(step, plat.y);
          ctx.lineTo(step + 10, plat.y + plat.h);
          ctx.stroke();
        }
      } else if (plat.type === 'pipe') {
        ctx.fillStyle = '#1e1a17';
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
        ctx.strokeStyle = '#5a433a';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

        ctx.fillStyle = '#3d2d27';
        for (let rx = plat.x + 25; rx < plat.x + plat.w; rx += 60) {
          ctx.fillRect(rx, plat.y - 2, 7, plat.h + 4);
        }
      } else if (plat.type === 'wall') {
        // Authentic Rain World dark weathered monolithic concrete & rusted bolted rebar plates
        ctx.fillStyle = '#17141f';
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
        ctx.strokeStyle = '#2e2536';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

        // Rust iron rebar plates
        ctx.fillStyle = '#2d1c17';
        for (let py = plat.y + 10; py < plat.y + plat.h - 8; py += 34) {
          ctx.fillRect(plat.x + 3, py, Math.max(6, plat.w - 6), 16);
        }

        // Heavy dark rivets
        ctx.fillStyle = '#4a2c22';
        for (let ry = plat.y + 8; ry < plat.y + plat.h; ry += 22) {
          ctx.beginPath();
          ctx.arc(plat.x + 4, ry, 2, 0, Math.PI * 2);
          ctx.arc(plat.x + plat.w - 4, ry, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(214, 211, 209, 0.6)';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(plat.label || 'СТІНА', plat.x + plat.w / 2, plat.y + Math.min(plat.h / 2 + 4, 25));

      } else if (plat.type === 'shelter') {
        // Heavy reinforced subterranean blast bunker structure
        ctx.fillStyle = '#14111d';
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
        ctx.strokeStyle = '#382a3c';
        ctx.lineWidth = 3;
        ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

        // Inner bevel
        ctx.fillStyle = '#1d1726';
        ctx.fillRect(plat.x + 5, plat.y + 5, plat.w - 10, plat.h - 10);

        // Hydraulic piston housing trims on sides
        ctx.fillStyle = '#2e1c24';
        ctx.fillRect(plat.x + 6, plat.y + 6, 12, plat.h - 12);
        ctx.fillRect(plat.x + plat.w - 18, plat.y + 6, 12, plat.h - 12);

        // Authentic Rain World shelter emblem
        ctx.fillStyle = 'rgba(240, 240, 255, 0.8)';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⛊', plat.x + plat.w / 2, plat.y + plat.h / 2 + 6);
      }
      ctx.restore();
    });

    // 4. Draw World Spawn Items
    location.items.forEach((item) => {
      ctx.save();
      if (item.type === 'spear') {
        // Rebar spear icon
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(item.x - 18, item.y);
        ctx.lineTo(item.x + 18, item.y);
        ctx.stroke();

        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(item.x, item.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fca5a5';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('СПИС', item.x, item.y - 7);
      } else if (item.type === 'rock') {
        // Stone icon
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(item.x, item.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('КАМІНЬ', item.x, item.y - 8);
      } else if (item.type === 'berry') {
        // Blue berry icon
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(item.x, item.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.fillStyle = '#7dd3fc';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ЯГОДА', item.x, item.y - 8);
      }
      ctx.restore();
    });

    // 5. Draw Player Spawn Point (White Slugcat Marker)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(location.playerSpawn.x, location.playerSpawn.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('СПАВН ГРАВЦЯ', location.playerSpawn.x, location.playerSpawn.y - 14);
    ctx.restore();

    // 6. Draw NPC Spawn Point (Green Scout Marker)
    ctx.save();
    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.arc(location.npcSpawn.x, location.npcSpawn.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('СПАВН NPC', location.npcSpawn.x, location.npcSpawn.y - 14);
    ctx.restore();

    // 7. Active Drawing Previews (Drag Box / Pipe Line)
    if (dragStart && dragCurrent) {
      ctx.save();
      const x1 = Math.min(dragStart.x, dragCurrent.x);
      const y1 = Math.min(dragStart.y, dragCurrent.y);
      const w = Math.max(16, Math.abs(dragCurrent.x - dragStart.x));
      const h = Math.max(12, Math.abs(dragCurrent.y - dragStart.y));

      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      if (activeTool === 'vertical_pole') {
        ctx.beginPath();
        ctx.moveTo(dragStart.x, y1);
        ctx.lineTo(dragStart.x, y1 + h);
        ctx.stroke();
      } else {
        ctx.fillRect(x1, y1, w, h);
        ctx.strokeRect(x1, y1, w, h);
      }
      ctx.restore();
    }

    // Transit pipe placement preview line
    if (transitStartPoint && activeTool === 'transit_pipe') {
      ctx.save();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(transitStartPoint.x, transitStartPoint.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

  }, [location, gridSnap, dragStart, dragCurrent, transitStartPoint, activeTool]);

  return (
    <div 
      ref={containerRef}
      className="relative w-screen h-screen overflow-hidden bg-[#07050a] flex flex-col font-sans select-none text-slate-200"
    >
      {/* 1. TOP HEADER & ACTION CONTROLS */}
      <header className="h-14 bg-zinc-950/90 border-b border-zinc-800/80 px-4 flex items-center justify-between z-30 shadow-lg backdrop-blur-md">
        
        {/* Left Side: Back & Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-mono font-bold cursor-pointer active:scale-95"
            title="Повернутися в меню"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>МЕНЮ</span>
          </button>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-amber-400 tracking-wider flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                РЕДАКТОР ЛОКАЦІЙ
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                {location.width} × {location.height} px
              </span>
            </div>
            <input
              type="text"
              value={location.name}
              onChange={(e) => setLocation(prev => ({ ...prev, name: e.target.value }))}
              className="bg-transparent border-b border-zinc-700 focus:border-amber-500 text-xs text-white font-medium outline-none px-0 py-0.5 w-44 sm:w-60"
              placeholder="Назва локації"
            />
          </div>
        </div>

        {/* Center: Quick Notice / Toast */}
        <div className="hidden md:flex items-center">
          <AnimatePresence mode="wait">
            {editorToast && (
              <motion.div
                key="editor-toast"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="px-3 py-1 rounded-full bg-amber-950/40 border border-amber-600/40 text-amber-300 font-mono text-[10px] flex items-center gap-1.5 shadow-sm"
              >
                <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
                <span>{editorToast}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Side: File JSON & Play Actions */}
        <div className="flex items-center gap-2">
          
          {/* Change Map Size Button */}
          <button
            onClick={() => setShowResizeModal(true)}
            className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all text-xs font-mono font-bold flex items-center gap-1 cursor-pointer active:scale-95"
            title="Змінити розмір локації (ширину та висоту карти)"
          >
            <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">РОЗМІР</span>
          </button>

          {/* Copy JSON Button */}
          <button
            onClick={handleCopyJson}
            className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all text-xs font-mono font-bold flex items-center gap-1 cursor-pointer active:scale-95"
            title="Скопіювати JSON локації в буфер обміну, щоб надіслати в чат"
          >
            {copiedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
            <span className="hidden sm:inline">{copiedSuccess ? 'СКОПІЙОВАНО!' : 'КОПІЯ JSON'}</span>
          </button>

          {/* Download .json file */}
          <button
            onClick={handleExportJsonFile}
            className="px-2.5 py-1.5 rounded-lg border border-amber-800/80 bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 hover:text-amber-200 transition-all text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
            title="Завантажити файл .json на пристрій для збереження"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">СКАЧАТИ .JSON</span>
          </button>

          {/* Import file hidden input trigger */}
          <label 
            className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Завантажити раніше збережений файл .json локації"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">ІМПОРТ</span>
            <input 
              type="file" 
              accept=".json" 
              onChange={handleFileUpload} 
              className="hidden" 
            />
          </label>

          {/* TEST / PLAY LOCATION TRIGGER */}
          <button
            onClick={() => onPlayLocation(location)}
            className="px-3.5 py-1.5 rounded-lg border border-emerald-500 bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-all text-xs font-mono font-black flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
            title="Розпочати гру в цій створеній локації"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>ТЕСТУВАТИ</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN TOOLBAR & VIEWPORT CONTAINER */}
      <div className="flex-1 relative flex overflow-hidden">
        
        {/* Left Side Floating Toolbox (Collapsible on mobile via toggle, permanent on tablet/desktop) */}
        <div className={`absolute left-2 top-2 sm:left-3 sm:top-3 z-30 flex-col gap-2 p-2 bg-zinc-950/90 border border-zinc-800/80 rounded-2xl backdrop-blur-md shadow-2xl max-w-[215px] max-h-[82vh] overflow-y-auto ${mobileToolsOpen ? 'flex' : 'hidden md:flex'}`}>
          
          <div className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 font-bold px-1">
            Платформи та стіни
          </div>
          
          <div className="grid grid-cols-2 gap-1.5">
            {/* Solid Wall / Barrier (Requested by user) */}
            <button
              onClick={() => setActiveTool('wall')}
              className={`p-1.5 rounded-lg border text-left flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'wall'
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Стіна або висока перешкода (блокує рух зліва/справа)"
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Стіна ★</span>
            </button>

            {/* Shelter (Safe Bunker) */}
            <button
              onClick={() => setActiveTool('shelter')}
              className={`p-1.5 rounded-lg border text-left flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'shelter'
                  ? 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-md'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Укриття з герметичним шлюзом"
            >
              <Home className="w-3.5 h-3.5 text-sky-400" />
              <span>Укриття</span>
            </button>

            {/* Concrete slab */}
            <button
              onClick={() => setActiveTool('concrete')}
              className={`p-1.5 rounded-lg border text-left flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'concrete'
                  ? 'bg-purple-500/20 border-purple-400 text-purple-300 shadow-md'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Бетонний моноліт або підлога"
            >
              <Box className="w-3.5 h-3.5 text-purple-400" />
              <span>Бетон</span>
            </button>

            {/* Metal girder */}
            <button
              onClick={() => setActiveTool('metal')}
              className={`p-1.5 rounded-lg border text-left flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'metal'
                  ? 'bg-orange-500/20 border-orange-400 text-orange-300 shadow-md'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Іржава металева балка / полиця"
            >
              <Box className="w-3.5 h-3.5 text-orange-400" />
              <span>Метал</span>
            </button>

            {/* Pipe platform */}
            <button
              onClick={() => setActiveTool('pipe')}
              className={`col-span-2 p-1.5 rounded-lg border text-left flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'pipe'
                  ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300 shadow-md'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Горизонтальна труба / міст"
            >
              <span className="text-yellow-400 font-bold">═</span>
              <span>Труба-міст</span>
            </button>
          </div>

          <div className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 font-bold px-1 pt-1 border-t border-zinc-800">
            Труби Rain World
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {/* Vertical Climbing Pole */}
            <button
              onClick={() => setActiveTool('vertical_pole')}
              className={`p-1.5 rounded-lg border text-left flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'vertical_pole'
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Вертикальна жердина для карабкання (протягніть мишкою зверху вниз)"
            >
              <span className="text-amber-400 font-black">║</span>
              <span>Жердина</span>
            </button>

            {/* Transit Shortcut Pipe (Point A to Point B) */}
            <button
              onClick={() => {
                setActiveTool('transit_pipe');
                setTransitStartPoint(null);
              }}
              className={`p-1.5 rounded-lg border text-left flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'transit_pipe'
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-md'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Труба-перехід: клікніть для входу A, потім для виходу B"
            >
              <span className="text-emerald-400 font-black">◎-◎</span>
              <span>Перехід</span>
            </button>
          </div>

          <div className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 font-bold px-1 pt-1 border-t border-zinc-800">
            Предмети та Спавн
          </div>

          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => setActiveTool('spear')}
              className={`p-1.5 rounded-lg border flex flex-col items-center justify-center text-[10px] font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'spear'
                  ? 'bg-red-500/20 border-red-400 text-red-300'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Поставити Спис на карту"
            >
              <span className="text-red-400 font-black">🗡️</span>
              <span>Спис</span>
            </button>

            <button
              onClick={() => setActiveTool('rock')}
              className={`p-1.5 rounded-lg border flex flex-col items-center justify-center text-[10px] font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'rock'
                  ? 'bg-slate-500/20 border-slate-400 text-slate-200'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Поставити Камінь на карту"
            >
              <span className="text-slate-300 font-black">🪨</span>
              <span>Камінь</span>
            </button>

            <button
              onClick={() => setActiveTool('berry')}
              className={`p-1.5 rounded-lg border flex flex-col items-center justify-center text-[10px] font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'berry'
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Поставити Ягоду на карту"
            >
              <span className="text-sky-300 font-black">🫐</span>
              <span>Ягода</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              onClick={() => setActiveTool('player_spawn')}
              className={`p-1.5 rounded-lg border text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                activeTool === 'player_spawn'
                  ? 'bg-white/20 border-white text-white'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Клікніть щоб перемістити точку спавну кота"
            >
              <span>🐱</span>
              <span>Спавн Кота</span>
            </button>

            <button
              onClick={() => setActiveTool('npc_spawn')}
              className={`p-1.5 rounded-lg border text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                activeTool === 'npc_spawn'
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Клікніть щоб перемістити точку спавну NPC"
            >
              <span>🐾</span>
              <span>Спавн NPC</span>
            </button>
          </div>

          <div className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 font-bold px-1 pt-1 border-t border-zinc-800">
            Дії та редагування
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setActiveTool('eraser')}
              className={`p-1.5 rounded-lg border text-left flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'eraser'
                  ? 'bg-red-500/30 border-red-400 text-red-200'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Гумка: клікайте на будь-які платформи, жердини чи предмети щоб видалити"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Гумка</span>
            </button>

            <button
              onClick={() => setActiveTool('select')}
              className={`p-1.5 rounded-lg border text-left flex items-center gap-1.5 text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTool === 'select'
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                  : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
              title="Перетягування камери та вибір"
            >
              <Move className="w-3.5 h-3.5 text-cyan-400" />
              <span>Огляд</span>
            </button>
          </div>

          {/* Preset Reset & Clear */}
          <div className="grid grid-cols-2 gap-1 pt-1 border-t border-zinc-800">
            <button
              onClick={handleResetToDefault}
              className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[9px] font-mono text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-1 cursor-pointer"
              title="Скинути до стандартної кімнати Окраїн"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Окраїни</span>
            </button>
            <button
              onClick={handleClearAll}
              className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[9px] font-mono text-red-400 hover:text-red-300 flex items-center justify-center gap-1 cursor-pointer"
              title="Повністю очистити карту"
            >
              <Trash2 className="w-2.5 h-2.5" />
              <span>Очистити</span>
            </button>
          </div>

        </div>

        {/* Floating Viewport & Grid Controls on the Top Right of canvas */}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2 p-1.5 bg-zinc-950/80 border border-zinc-800/80 rounded-xl backdrop-blur-md shadow-xl text-xs font-mono">
          
          {/* Grid Snap selector */}
          <div className="flex items-center gap-1 px-1.5">
            <Grid className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[10px] text-zinc-400">Сітка:</span>
            {[20, 10, 0].map(s => (
              <button
                key={s}
                onClick={() => setGridSnap(s)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                  gridSnap === s 
                    ? 'bg-amber-500 text-black' 
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                {s === 0 ? 'Вільна' : `${s}px`}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-zinc-800" />

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              title="Зменшити масштаб"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] w-8 text-center text-zinc-300 font-bold">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2.0, z + 0.15))}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              title="Збільшити масштаб"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Interactive Infinite Canvas Space */}
        <div 
          className="flex-1 w-full h-full overflow-hidden relative cursor-crosshair"
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey || true) {
              e.preventDefault();
              const zoomDelta = e.deltaY > 0 ? -0.08 : 0.08;
              setZoom(z => Math.max(0.25, Math.min(2.2, z + zoomDelta)));
            }
          }}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: isPanning ? 'none' : 'transform 0.05s ease-out'
            }}
            className="absolute left-0 top-0 shadow-2xl rounded border-2 border-zinc-700/60"
          >
            <canvas
              ref={canvasRef}
              style={{ touchAction: 'none' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              className="block bg-[#0f0c15] touch-none select-none"
            />
          </div>
        </div>

        {/* Mobile Phone Floating Quick Tool Dock & Palette Drawer Toggle */}
        {/* "редактор карт не работає на телефоні фікси" */}
        <div className="md:hidden absolute bottom-2 inset-x-2 z-30 flex flex-col gap-1.5 pointer-events-none">
          <div className="flex items-center justify-between pointer-events-auto bg-zinc-950/95 border border-zinc-800/90 p-1.5 rounded-2xl backdrop-blur-md shadow-2xl">
            <button
              onClick={() => setMobileToolsOpen(p => !p)}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 shrink-0"
              title="Відкрити повну панель інструментів"
            >
              <Box className="w-3.5 h-3.5" />
              <span>{mobileToolsOpen ? 'ЗАКРИТИ' : 'ІНСТРУМЕНТИ'}</span>
            </button>

            {/* Quick tool selector buttons for phone touch */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 px-1 no-scrollbar">
              {[
                { id: 'wall', label: 'Стіна', icon: '🧱' },
                { id: 'concrete', label: 'Бетон', icon: '⬛' },
                { id: 'vertical_pole', label: 'Жердина', icon: '║' },
                { id: 'transit_pipe', label: 'Труба', icon: '◎-◎' },
                { id: 'spear', label: 'Спис', icon: '🗡️' },
                { id: 'berry', label: 'Ягода', icon: '🫐' },
                { id: 'select', label: 'Огляд', icon: '✋' },
                { id: 'eraser', label: 'Гумка', icon: '❌' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTool(t.id as ToolMode);
                    if (t.id === 'transit_pipe') setTransitStartPoint(null);
                  }}
                  className={`px-2 py-1.5 rounded-lg font-mono text-[10px] font-bold shrink-0 transition-all active:scale-95 flex items-center gap-1 ${
                    activeTool === t.id
                      ? 'bg-amber-400 text-black shadow-md'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                  }`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* 3. RESIZE LOCATION MODAL ("робить більшими тогошо щас воно слижком мало") */}
      <AnimatePresence>
        {showResizeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl max-w-md w-full shadow-2xl text-left font-sans space-y-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-mono font-bold text-white flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-cyan-400" />
                  РОЗМІР ЛОКАЦІЇ (КІМНАТИ)
                </h3>
                <button
                  onClick={() => setShowResizeModal(false)}
                  className="text-zinc-500 hover:text-white p-1 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                За замовчуванням карта Rain World 1000×580 px. Ви можете зробити її в рази більшою: динамічна камера автоматично плавно стежитиме за слимакокотом по всій території!
              </p>

              {/* Ready Size Presets */}
              <div className="space-y-2">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-bold">
                  Готові шаблони розмірів:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Стандарт (1000×580)', w: 1000, h: 580, desc: 'Класична кімната' },
                    { label: 'Середня (1600×800)', w: 1600, h: 800, desc: 'У 2 рази просторіше' },
                    { label: 'Велика (2400×1200) ★', w: 2400, h: 1200, desc: 'Для величних руїн' },
                    { label: 'Величезна (3000×1600)', w: 3000, h: 1600, desc: 'Масштабний регіон' }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setNewWidth(preset.w);
                        setNewHeight(preset.h);
                      }}
                      className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                        newWidth === preset.w && newHeight === preset.h
                          ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200 shadow-md'
                          : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      <div className="text-xs font-mono font-bold">{preset.label}</div>
                      <div className="text-[10px] text-zinc-400">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Sliders */}
              <div className="space-y-3 pt-2 border-t border-zinc-800">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-zinc-400">Ширина карти (Width):</span>
                    <span className="text-cyan-400 font-bold">{newWidth} px</span>
                  </div>
                  <input
                    type="range"
                    min="1000"
                    max="3500"
                    step="50"
                    value={newWidth}
                    onChange={(e) => setNewWidth(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-zinc-400">Висота карти (Height):</span>
                    <span className="text-cyan-400 font-bold">{newHeight} px</span>
                  </div>
                  <input
                    type="range"
                    min="580"
                    max="2200"
                    step="50"
                    value={newHeight}
                    onChange={(e) => setNewHeight(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowResizeModal(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-800 text-xs font-mono text-zinc-400 hover:text-white cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  onClick={() => handleApplyResize(newWidth, newHeight)}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-mono font-bold cursor-pointer transition-all shadow-md active:scale-95"
                >
                  Застосувати розмір
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. JSON TEXT FALLBACK / VIEW MODAL */}
      <AnimatePresence>
        {showJsonModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl max-w-xl w-full shadow-2xl text-left font-sans space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-mono font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  JSON СТРУКТУРА ЛОКАЦІЇ
                </h3>
                <button
                  onClick={() => setShowJsonModal(false)}
                  className="text-zinc-500 hover:text-white p-1 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                Ви можете скопіювати цей текст та надіслати в чат, або вставити сюди JSON іншої карти та натиснути &quot;Завантажити JSON&quot;:
              </p>

              <textarea
                value={jsonInputText}
                onChange={(e) => setJsonInputText(e.target.value)}
                rows={12}
                className="w-full bg-black/80 border border-zinc-800 rounded-xl p-3 font-mono text-[11px] text-zinc-300 outline-none focus:border-amber-500 select-all"
                placeholder="Вставте сюди JSON код локації..."
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowJsonModal(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-800 text-xs font-mono text-zinc-400 hover:text-white cursor-pointer"
                >
                  Закрити
                </button>
                <button
                  onClick={handleApplyJsonText}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-black text-xs font-mono font-bold cursor-pointer transition-all shadow-md active:scale-95"
                >
                  Завантажити цей JSON в гру
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
