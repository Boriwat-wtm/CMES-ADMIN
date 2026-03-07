import React, { useState, useEffect, useRef } from 'react';
import OBSWebSocket from 'obs-websocket-js';
import './OBSControl.css';

const OBSControl = ({ API_BASE_URL, adminId, shopId }) => {
    const [url, setUrl] = useState('ws://localhost:4455');
    const [password, setPassword] = useState('');
    const [isConnected, setIsConnected] = useState(false);

    const [scenes, setScenes] = useState([]);
    const [currentScene, setCurrentScene] = useState('');
    const [marqueeText, setMarqueeText] = useState('');
    const [bgmMuted, setBgmMuted] = useState(false);
    const [logs, setLogs] = useState([]);

    const obsRef = useRef(new OBSWebSocket());
    const logsEndRef = useRef(null);
    const canvasRef = useRef(null);
    const draggingRef = useRef(null); // always-fresh drag state (avoids stale closure)

    const [overlayItems, setOverlayItems] = useState({});
    const [dragging, setDragging] = useState(null); // for cursor CSS only

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const addLog = (msg, type = 'info') => {
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
    };

    useEffect(() => {
        const obs = obsRef.current;

        // Event Listeners
        const onConnect = () => {
            setIsConnected(true);
            addLog('🟢 Connected to OBS Studio successfully', 'success');
            // Give OBS WebSocket a tiny moment to initialize its internal socket state before calling APIs
            setTimeout(() => {
                fetchInitialData();
            }, 500);
        };

        const onDisconnect = () => {
            setIsConnected(false);
            addLog('🔴 Disconnected from OBS Studio', 'error');
        };

        const onSceneChanged = (data) => {
            setCurrentScene(data.sceneName);
            addLog(`📺 Scene switched to: ${data.sceneName}`, 'info');
            fetchSceneItems(obsRef.current, data.sceneName);
        };

        const onInputMuteStateChanged = (data) => {
            if (data.inputName === 'BGM') {
                setBgmMuted(data.inputMuted);
            }
        };

        // Sync position changes made directly in OBS → canvas
        const onSceneItemTransformChanged = (data) => {
            // Skip if we're currently dragging this item (avoid echo loop)
            if (draggingRef.current && draggingRef.current.sceneItemId === data.sceneItemId) return;
            setOverlayItems(prev => {
                const updated = { ...prev };
                for (const [name, item] of Object.entries(updated)) {
                    if (item.sceneItemId === data.sceneItemId) {
                        updated[name] = {
                            ...item,
                            x: data.sceneItemTransform.positionX ?? item.x,
                            y: data.sceneItemTransform.positionY ?? item.y,
                        };
                        break;
                    }
                }
                return updated;
            });
        };

        // Sync visibility changes made directly in OBS → canvas
        const onSceneItemEnableStateChanged = (data) => {
            setOverlayItems(prev => {
                const updated = { ...prev };
                for (const [name, item] of Object.entries(updated)) {
                    if (item.sceneItemId === data.sceneItemId) {
                        updated[name] = { ...item, enabled: data.sceneItemEnabled };
                        break;
                    }
                }
                return updated;
            });
        };

        obs.on('ConnectionOpened', onConnect);
        obs.on('ConnectionClosed', onDisconnect);
        obs.on('CurrentProgramSceneChanged', onSceneChanged);
        obs.on('InputMuteStateChanged', onInputMuteStateChanged);
        obs.on('SceneItemTransformChanged', onSceneItemTransformChanged);
        obs.on('SceneItemEnableStateChanged', onSceneItemEnableStateChanged);

        return () => {
            obs.removeAllListeners();
            obs.disconnect().catch(() => { });
        };
    }, []);

    const fetchInitialData = async () => {
        const obs = obsRef.current;
        try {
            // 1. Get Scenes
            const sceneList = await obs.call('GetSceneList');
            const currentProgramScene = sceneList.currentProgramSceneName;
            setScenes(sceneList.scenes.map(s => s.sceneName).reverse()); // Reverse for top-to-bottom
            setCurrentScene(currentProgramScene);

            // --- AUTO CREATE SOURCES IF MISSING ---
            if (currentProgramScene) {
                await autoCreateRequiredSources(obs, currentProgramScene);
                await fetchSceneItems(obs, currentProgramScene);
            }

            // 2. Get BGM Mute State
            try {
                const { inputMuted } = await obs.call('GetInputMute', { inputName: 'BGM' });
                setBgmMuted(inputMuted);
            } catch (err) {
                // เงียบไว้ เพราะถ้าเพิ่งสร้างมันอาจจะยังไม่ทันอัปเดตสถานะ
            }

        } catch (err) {
            addLog(`Fetch error: ${err.message}`, 'error');
        }
    };

    // ดึงรายการ Scene Items พร้อมตำแหน่งจาก OBS
    const fetchSceneItems = async (obs, sceneName) => {
        try {
            const { sceneItems } = await obs.call('GetSceneItemList', { sceneName });
            const items = {};
            for (const item of sceneItems) {
                try {
                    const { sceneItemTransform } = await obs.call('GetSceneItemTransform', {
                        sceneName,
                        sceneItemId: item.sceneItemId,
                    });
                    items[item.sourceName] = {
                        sceneItemId: item.sceneItemId,
                        x: sceneItemTransform.positionX || 0,
                        y: sceneItemTransform.positionY || 0,
                        enabled: item.sceneItemEnabled,
                    };
                } catch (e) { }
            }
            setOverlayItems(items);
        } catch (err) {
            addLog(`Failed to fetch scene items: ${err.message}`, 'error');
        }
    };

    // ฟังก์ชันเช็คและสร้าง Source อัตโนมัติ (Feature ใหม่ตามคำขอ)
    const autoCreateRequiredSources = async (obs, sceneName) => {
        try {
            addLog(`🔍 ตรวจสอบโครงสร้างพื้นฐานใน Scene: ${sceneName}...`, 'info');

            // ดึงรายชื่อไอเทมทั้งหมดใน Scene ปัจจุบัน
            const { sceneItems } = await obs.call('GetSceneItemList', { sceneName });
            const existingSourceNames = sceneItems.map(item => item.sourceName);

            // 1. สร้าง Overlays ทั้ง 3 ตัว (ชี้ไปหน้าเว็บจริงๆ อัตโนมัติ)
            if (!existingSourceNames.includes('Overlay_ImageText')) {
                addLog(`⏳ กำลังสร้าง 'Overlay_ImageText'...`, 'warning');
                await obs.call('CreateInput', {
                    sceneName: sceneName,
                    inputName: 'Overlay_ImageText',
                    inputKind: 'browser_source',
                    inputSettings: { url: `${API_BASE_URL}/obs-image-overlay.html?shopId=${shopId || adminId}`, width: 1920, height: 1080 }
                });
                addLog(`✅ สร้าง 'Overlay_ImageText' สำเร็จ!`, 'success');
            }

            if (!existingSourceNames.includes('Overlay_Ranking')) {
                addLog(`⏳ กำลังสร้าง 'Overlay_Ranking'...`, 'warning');
                await obs.call('CreateInput', {
                    sceneName: sceneName,
                    inputName: 'Overlay_Ranking',
                    inputKind: 'browser_source',
                    inputSettings: { url: `${API_BASE_URL}/obs-ranking-overlay.html?shopId=${shopId || adminId}`, width: 1920, height: 1080 }
                });
                addLog(`✅ สร้าง 'Overlay_Ranking' สำเร็จ!`, 'success');
            }

            if (!existingSourceNames.includes('Overlay_LuckyWheel')) {
                addLog(`⏳ กำลังสร้าง 'Overlay_LuckyWheel'...`, 'warning');
                await obs.call('CreateInput', {
                    sceneName: sceneName,
                    inputName: 'Overlay_LuckyWheel',
                    inputKind: 'browser_source',
                    inputSettings: { url: `${API_BASE_URL}/obs-lucky-wheel.html?shopId=${shopId || adminId}`, width: 1920, height: 1080 }
                });
                addLog(`✅ สร้าง 'Overlay_LuckyWheel' สำเร็จ!`, 'success');
            }

            // 2. สร้าง MarqueeText (ใช้ Text GDI+ สำหรับ Windows หรือ FreeType สำหรับ Mac/Linux)
            if (!existingSourceNames.includes('MarqueeText')) {
                addLog(`⏳ กำลังสร้าง 'MarqueeText'...`, 'warning');
                try {
                    await obs.call('CreateInput', {
                        sceneName: sceneName,
                        inputName: 'MarqueeText',
                        inputKind: 'text_gdiplus_v2', // สำหรับ Windows ส่วนใหญ่
                        inputSettings: {
                            text: 'ยินดีต้อนรับเข้าสู่ระบบจัดการ',
                            font: { face: 'Arial', size: 72, style: 'Bold' }
                        }
                    });
                    addLog(`✅ สร้าง 'MarqueeText' สำเร็จ! (Windows)`, 'success');
                } catch (e) {
                    // ถ้าเป็น macOS/Linux มักจะใช้ text_ft2_source_v2 แทน
                    await obs.call('CreateInput', {
                        sceneName: sceneName,
                        inputName: 'MarqueeText',
                        inputKind: 'text_ft2_source_v2',
                        inputSettings: {
                            text: 'ยินดีต้อนรับเข้าสู่ระบบจัดการ',
                            font: { face: 'Arial', size: 72, style: 'Bold' }
                        }
                    });
                    addLog(`✅ สร้าง 'MarqueeText' สำเร็จ! (Mac/Linux)`, 'success');
                }
            }

            // 3. สร้าง BGM (ใช้ Media Source)
            if (!existingSourceNames.includes('BGM')) {
                addLog(`⏳ กำลังสร้าง 'BGM' (Audio)...`, 'warning');
                await obs.call('CreateInput', {
                    sceneName: sceneName,
                    inputName: 'BGM',
                    inputKind: 'ffmpeg_source', // Media Source
                    inputSettings: {
                        is_local_file: false,
                        looping: true
                    }
                });
                addLog(`✅ สร้าง 'BGM' สำเร็จ!`, 'success');
            }

            addLog(`🎉 สภาพแวดล้อมพร้อมใช้งานแล้ว!`, 'success');

        } catch (err) {
            addLog(`❌ Auto-Create failed: ${err.message}`, 'error');
            console.error(err);
        }
    };

    const handleConnect = async () => {
        if (isConnected) {
            try {
                await obsRef.current.disconnect();
            } catch (err) {
                console.error(err);
            }
            return;
        }
        try {
            addLog(`Connecting to ${url}...`, 'info');
            // OBS WebSocket v5 connection
            const { obsWebSocketVersion } = await obsRef.current.connect(url, password, { rpcVersion: 1 });
            addLog(`OBS Studio Version: ${obsWebSocketVersion}`, 'info');
            // Note: onConnect listener handles fetchInitialData
        } catch (err) {
            addLog(`Connection failed: ${err.message}`, 'error');
        }
    };

    // Feature 1: Scene Switching
    const handleSceneSwitch = async (sceneName) => {
        try {
            await obsRef.current.call('SetCurrentProgramScene', { sceneName });
        } catch (err) {
            addLog(`Failed to switch scene: ${err.message}`, 'error');
        }
    };

    // Feature 2: Emergency Hide/Show
    const handleEmergencyHide = async (sourceName, show) => {
        try {
            if (!currentScene) throw new Error("No active scene");

            const { sceneItemId } = await obsRef.current.call('GetSceneItemId', {
                sceneName: currentScene,
                sourceName: sourceName
            });

            await obsRef.current.call('SetSceneItemEnabled', {
                sceneName: currentScene,
                sceneItemId: sceneItemId,
                sceneItemEnabled: show // true = show, false = hide
            });

            addLog(show ? `👁️ ${sourceName} shown` : `🚫 ${sourceName} HIDDEN`, show ? 'success' : 'warning');
        } catch (err) {
            addLog(`Hide/Show failed: ${err.message} (Is '${sourceName}' in this scene?)`, 'error');
        }
    };

    // Feature 3: Dynamic Text Marquee
    const handleMarqueeUpdate = async (textToSet) => {
        try {
            await obsRef.current.call('SetInputSettings', {
                inputName: 'MarqueeText',
                inputSettings: { text: textToSet }
            });
            setMarqueeText(textToSet);
            addLog(textToSet ? `📝 Marquee updated to: "${textToSet}"` : '🗑️ Marquee text cleared', 'success');
        } catch (err) {
            addLog(`Marquee update failed: ${err.message}`, 'error');
        }
    };

    // Feature 4: Audio Control
    const handleToggleMute = async () => {
        try {
            await obsRef.current.call('ToggleInputMute', { inputName: 'BGM' });
            // We rely on the event listener to catch the change, but can also optimistically update
        } catch (err) {
            addLog(`Audio control failed: ${err.message}`, 'error');
        }
    };

    // Feature 5: Canvas drag — ย้าย source บน canvas แล้วส่งไป OBS จริง
    const handleCanvasMouseDown = (e, sourceName) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const item = overlayItems[sourceName];
        const dragData = {
            sourceName,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startItemX: item?.x || 0,
            startItemY: item?.y || 0,
            scaleX: 1920 / rect.width,
            scaleY: 1080 / rect.height,
            sceneItemId: item?.sceneItemId,
            currentX: item?.x || 0,
            currentY: item?.y || 0,
        };
        draggingRef.current = dragData;
        setDragging(sourceName);
    };

    const handleCanvasMouseMove = (e) => {
        const drag = draggingRef.current;
        if (!drag) return;
        const dx = (e.clientX - drag.startMouseX) * drag.scaleX;
        const dy = (e.clientY - drag.startMouseY) * drag.scaleY;
        drag.currentX = drag.startItemX + dx;
        drag.currentY = drag.startItemY + dy;
        setOverlayItems(prev => ({
            ...prev,
            [drag.sourceName]: {
                ...prev[drag.sourceName],
                x: drag.currentX,
                y: drag.currentY,
            },
        }));
    };

    const handleCanvasMouseUp = async () => {
        const drag = draggingRef.current;
        if (!drag) return;
        draggingRef.current = null;
        setDragging(null);
        const finalX = Math.round(drag.currentX);
        const finalY = Math.round(drag.currentY);
        try {
            await obsRef.current.call('SetSceneItemTransform', {
                sceneName: currentScene,
                sceneItemId: drag.sceneItemId,
                sceneItemTransform: {
                    positionX: finalX,
                    positionY: finalY,
                },
            });
            addLog(`📐 ${drag.sourceName} → (${finalX}, ${finalY})`, 'success');
        } catch (err) {
            addLog(`Move failed: ${err.message}`, 'error');
        }
    };

    return (
        <div className="obs-dashboard">
            <div className="obs-header-bar">
                <div className="obs-title">
                    <span className="obs-icon">🎛️</span>
                    <h2>OBS Web Controller</h2>
                    <span className={`obs-status-badge ${isConnected ? 'online' : 'offline'}`}>
                        {isConnected ? 'ONLINE' : 'OFFLINE'}
                    </span>
                </div>

                <div className="obs-connection-compact">
                    <input
                        type="text"
                        placeholder="ws://localhost:4455"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        disabled={isConnected}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        disabled={isConnected}
                    />
                    <button
                        className={`obs-connect-btn ${isConnected ? 'disconnect' : 'connect'}`}
                        onClick={handleConnect}
                    >
                        {isConnected ? 'Disconnect' : 'Connect'}
                    </button>
                </div>
            </div>

            {isConnected ? (
                <div className="obs-studio-layout">
                    {/* ====== Interactive Scene Canvas ====== */}
                    <div className="obs-canvas-wrapper">
                        <div className="obs-canvas-header">
                            <div className="obs-canvas-header-left">
                                <span className="obs-canvas-live-dot" />
                                <span>Scene: <strong>{currentScene}</strong></span>
                                <span className="obs-canvas-item-count">{Object.keys(overlayItems).length} sources</span>
                            </div>
                            <span className="obs-canvas-hint">🖱️ ลากเพื่อย้ายตำแหน่ง — ปล่อยเพื่ออัปเดต OBS</span>
                        </div>
                        <div
                            className="obs-canvas"
                            ref={canvasRef}
                            onMouseMove={handleCanvasMouseMove}
                            onMouseUp={handleCanvasMouseUp}
                            onMouseLeave={handleCanvasMouseUp}
                        >
                            {Object.entries(overlayItems).map(([sourceName, item]) => {
                                const leftPct = (item.x / 1920) * 100;
                                const topPct = (item.y / 1080) * 100;
                                return (
                                    <div
                                        key={sourceName}
                                        className={`obs-overlay-pin${dragging === sourceName ? ' dragging' : ''}${!item.enabled ? ' hidden' : ''}`}
                                        style={{
                                            left: `clamp(0%, ${leftPct}%, 88%)`,
                                            top: `clamp(0%, ${topPct}%, 85%)`,
                                        }}
                                        onMouseDown={(e) => handleCanvasMouseDown(e, sourceName)}
                                    >
                                        <span className="obs-pin-label">{sourceName}</span>
                                        <span className="obs-pin-coords">{Math.round(item.x)}, {Math.round(item.y)}</span>
                                    </div>
                                );
                            })}
                            {Object.keys(overlayItems).length === 0 && (
                                <div className="obs-canvas-empty">ไม่พบ Source ใน Scene นี้</div>
                            )}
                        </div>
                    </div>

                    {/* ====== ส่วนล่าง: 4 Docks Panel เหมือน OBS Studio ====== */}
                    <div className="obs-docks-container">

                        {/* Dock 1: Scenes */}
                        <div className="obs-dock">
                            <div className="obs-dock-header">Scenes</div>
                            <div className="obs-dock-content obs-scene-list">
                                {scenes.length > 0 ? scenes.map(scene => (
                                    <button
                                        key={scene}
                                        className={`obs-scene-list-item ${currentScene === scene ? 'active' : ''}`}
                                        onClick={() => handleSceneSwitch(scene)}
                                    >
                                        <span className="scene-icon">📺</span> {scene}
                                    </button>
                                )) : <p className="obs-empty">No scenes found</p>}
                            </div>
                        </div>

                        {/* Dock 2: Sources & Overlays (รวม Emergency Hide + Marquee) */}
                        <div className="obs-dock">
                            <div className="obs-dock-header">Sources & Overlays</div>
                            <div className="obs-dock-content obs-sources-dock">

                                {/* Base Sources List */}
                                <div className="obs-source-item">
                                    <div className="obs-source-info">
                                        <span className="source-icon">🖼️</span>
                                        <span className="source-name">Overlay_ImageText</span>
                                    </div>
                                    <div className="obs-source-actions">
                                        <button className="obs-eye-btn" title="แสดง" onClick={() => handleEmergencyHide('Overlay_ImageText', true)}>👁️</button>
                                        <button className="obs-eye-btn hide" title="ซ่อน" onClick={() => handleEmergencyHide('Overlay_ImageText', false)}>🚫</button>
                                    </div>
                                </div>

                                <div className="obs-source-item">
                                    <div className="obs-source-info">
                                        <span className="source-icon">🏆</span>
                                        <span className="source-name">Overlay_Ranking</span>
                                    </div>
                                    <div className="obs-source-actions">
                                        <button className="obs-eye-btn" title="แสดง" onClick={() => handleEmergencyHide('Overlay_Ranking', true)}>👁️</button>
                                        <button className="obs-eye-btn hide" title="ซ่อน" onClick={() => handleEmergencyHide('Overlay_Ranking', false)}>🚫</button>
                                    </div>
                                </div>

                                <div className="obs-source-item">
                                    <div className="obs-source-info">
                                        <span className="source-icon">�</span>
                                        <span className="source-name">Overlay_LuckyWheel</span>
                                    </div>
                                    <div className="obs-source-actions">
                                        <button className="obs-eye-btn" title="แสดง" onClick={() => handleEmergencyHide('Overlay_LuckyWheel', true)}>👁️</button>
                                        <button className="obs-eye-btn hide" title="ซ่อน" onClick={() => handleEmergencyHide('Overlay_LuckyWheel', false)}>🚫</button>
                                    </div>
                                </div>

                                {/* MarqueeText Control */}
                                <div className="obs-source-marquee">
                                    <label>📝 MarqueeText (ข้อความต้อนรับ)</label>
                                    <div className="obs-marquee-input-group">
                                        <input
                                            type="text"
                                            placeholder="พิมพ์ข้อความวิ่ง..."
                                            value={marqueeText}
                                            onChange={e => setMarqueeText(e.target.value)}
                                        />
                                        <div className="obs-marquee-btns">
                                            <button className="btn-send" onClick={() => handleMarqueeUpdate(marqueeText)}>ส่งจอ</button>
                                            <button className="btn-clear" onClick={() => handleMarqueeUpdate('')}>ลบ</button>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Dock 3: Audio Mixer */}
                        <div className="obs-dock obs-audio-dock">
                            <div className="obs-dock-header">Audio Mixer</div>
                            <div className="obs-dock-content obs-audio-mixer">
                                <div className="obs-audio-channel">
                                    <div className="audio-label">BGM</div>
                                    <div className="audio-slider-container">
                                        {/* Mock Volume Bar */}
                                        <div className={`audio-vu-meter ${bgmMuted ? 'muted' : ''}`}>
                                            <div className="vu-segment green"></div>
                                            <div className="vu-segment green"></div>
                                            <div className="vu-segment green"></div>
                                            <div className="vu-segment yellow"></div>
                                            <div className="vu-segment red"></div>
                                        </div>
                                    </div>
                                    <button
                                        className={`obs-btn-mute ${bgmMuted ? 'muted' : 'unmuted'}`}
                                        onClick={handleToggleMute}
                                        title={bgmMuted ? 'Unmute' : 'Mute'}
                                    >
                                        {bgmMuted ? '🔇 Muted' : '🔊 Active'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Dock 4: Controls & Terminal */}
                        <div className="obs-dock">
                            <div className="obs-dock-header">Controls & Logs</div>
                            <div className="obs-dock-content obs-controls-dock">
                                <button className="obs-main-action disconnect" onClick={handleConnect}>
                                    Stop Connection
                                </button>

                                <div className="obs-terminal-mini">
                                    <div className="obs-terminal-body-mini">
                                        {logs.slice(-15).map((log, i) => (
                                            <div key={i} className={`obs-log-line-mini ${log.type}`}>
                                                <span className="log-time">[{log.time}]</span> {log.msg}
                                            </div>
                                        ))}
                                        <div ref={logsEndRef} />
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            ) : (
                <div className="obs-not-connected">
                    <p style={{ fontSize: "18px", marginBottom: "16px" }}>กรุณาเชื่อมต่อ OBS Studio เพื่อใช้งานแผงควบคุม</p>
                    <div className="obs-instructions">
                        <h4>📌 วิธีตั้งค่าใน OBS Studio (v28+)</h4>
                        <ol>
                            <li>เปิดโปรแกรม OBS Studio ไปที่เมนู <strong>Tools ➔ WebSocket Server Settings</strong></li>
                            <li>ติ๊กถูกที่ <strong>"Enable WebSocket server"</strong></li>
                            <li>ตั้งค่า Server Port (ค่าเริ่มต้น <strong>4455</strong>)</li>
                            <li>ตั้งค่า <strong>Server Password</strong> ให้ตรงกับที่กรอกในเว็บ (หรือเอาติ๊กถูก Authentication ออกถ้าไม่ต้องการรหัสผ่าน)</li>
                            <li>ระบบจะพยายาม <strong>สร้าง Source ให้คุณอัตโนมัติ</strong> (รวม 3 ลิงก์ Overlay, MarqueeText และ BGM) เมื่อกด Connect ทันที</li>
                            <li>กด Apply และคลิก Connect ได้เลย!</li>
                        </ol>
                    </div>
                </div>
            )}

        </div>
    );
};

export default OBSControl;
