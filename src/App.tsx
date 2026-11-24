/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useState } from 'react';
import { AchievementsScreen } from './components/AchievementsScreen';
import { BattleScreen } from './components/BattleScreen';
import { CodexScreen } from './components/CodexScreen';
import { DailyMissionModal, MissionModalTab } from './components/DailyMissionModal';
import { GuardianCollectionScreen } from './components/GuardianCollectionScreen';
import { HeroCollectionScreen } from './components/HeroCollectionScreen';
import { HowToPlayScreen } from './components/HowToPlayScreen';
import { MainMenu } from './components/MainMenu';
import { MapSelectScreen } from './components/MapSelectScreen';
import { PlayerLeaderboardModal } from './components/PlayerLeaderboardModal';
import { SettingsScreen } from './components/SettingsScreen';
import { ACHIEVEMENTS_DATA } from './game/achievements';
import { assetManager } from './game/asset';
import { soundManager } from './game/audio';
import { ENEMIES_DATA, HEROES_DATA, MAP_BY_ID, MAPS_DATA } from './game/data';
import { GUARDIANS_DATA } from './game/guardiansData';
import { saveManager } from './game/save';
import { AuthStateInfo, initSheetsAuth, isGasEnvironment } from './game/sheetsService';
import { AssetLoadProgress, GameState, SaveData } from './game/types';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('BOOT');
  const [returnState, setReturnState] = useState<GameState>('MAIN_MENU');
  const [selectedMapId, setSelectedMapId] = useState<string>(MAPS_DATA[0].id);
  const [saveData, setSaveData] = useState<SaveData>(() => saveManager.getData());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerModalTab, setPlayerModalTab] = useState<'PLAYER' | 'LEADERBOARD' | null>(null);
  const [missionModalTab, setMissionModalTab] = useState<MissionModalTab | null>(null);
  const [authState, setAuthState] = useState<AuthStateInfo>(() => ({
    isGas: isGasEnvironment(),
    needsAuth: !isGasEnvironment(),
    user: null,
    email: '',
    displayName: '',
  }));
  const [loadProgress, setLoadProgress] = useState<AssetLoadProgress>({
    total: 0,
    loaded: 0,
    failed: 0,
    progress: 0,
    done: false,
  });

  // BOOT -> LOADING -> MAIN_MENU with real AssetManager preloading
  useEffect(() => {
    let cancelled = false;
    setGameState('LOADING');
    const data = saveManager.load();
    setSaveData(data);
    soundManager.applySettings(data.settings);

    const minDelay = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 260);
    });
    const maxWait = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 2500);
    });
    const preloadPromise = assetManager.preloadAll(data.spriteOverrides, (p) => {
      if (!cancelled) setLoadProgress(p);
    });

    Promise.race([Promise.all([preloadPromise, minDelay]), maxWait]).then(() => {
      if (!cancelled) {
        setGameState('MAIN_MENU');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribeAuth = initSheetsAuth((info) => {
      setAuthState(info);
    });
    return () => {
      unsubscribeAuth();
      assetManager.cleanup();
    };
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const docAny = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(document.fullscreenElement || docAny.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    try {
      const docAny = document as Document & {
        webkitFullscreenElement?: Element | null;
        webkitExitFullscreen?: () => Promise<void> | void;
      };
      const elAny = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      const isCurrentlyFs = Boolean(document.fullscreenElement || docAny.webkitFullscreenElement);
      if (!isCurrentlyFs) {
        const req = elAny.requestFullscreen?.() ?? elAny.webkitRequestFullscreen?.();
        if (req && typeof (req as Promise<void>).catch === 'function') {
          (req as Promise<void>).catch(() => {});
        }
      } else {
        const ex = document.exitFullscreen?.() ?? docAny.webkitExitFullscreen?.();
        if (ex && typeof (ex as Promise<void>).catch === 'function') {
          (ex as Promise<void>).catch(() => {});
        }
      }
    } catch {
      // Ignore fullscreen restrictions inside sandboxed Google Sites iframes
    }
  }, []);

  const toggleMute = useCallback(() => {
    const nextMuted = !saveManager.getData().settings.muted;
    const updated = saveManager.updateSettings({ muted: nextMuted });
    soundManager.applySettings(updated.settings);
    setSaveData({ ...updated });
  }, []);

  const handleSaveChanged = useCallback((updated: SaveData) => {
    setSaveData(updated);
  }, []);

  const handleSavePlayerName = useCallback((name: string) => {
    const updated = saveManager.setPlayerName(name);
    setSaveData({ ...updated });
  }, []);

  const startMap = useCallback((mapId: string) => {
    setSelectedMapId(mapId);
    setGameState('PLAYING');
  }, []);

  const refreshSaveFromEngine = useCallback(() => {
    setSaveData({ ...saveManager.load() });
  }, []);

  const [showInBattleSettings, setShowInBattleSettings] = useState(false);

  const selectedMap = MAP_BY_ID[selectedMapId] || MAPS_DATA[0];
  const enableTutorial = selectedMap.id === 'lingnan' && saveData.stats.gamesPlayed === 0;
  const unclaimedSummary = saveManager.getUnclaimedSummary();
  const unclaimedMissions = unclaimedSummary.totalMissions;
  const codexUnlockedCount =
    (saveData.codex?.unlockedHeroes?.length ?? 0) +
    (saveData.codex?.unlockedEnemies?.length ?? 0);
  const codexTotalCount = HEROES_DATA.length + ENEMIES_DATA.length;
  const achievementsUnlockedCount = saveData.achievements?.unlockedIds?.length ?? 0;
  const achievementsTotalCount = ACHIEVEMENTS_DATA.length;
  const guardiansUnlockedCount = GUARDIANS_DATA.filter(
    (g) => saveData.guardians?.heroes?.[g.id]?.unlocked
  ).length;
  const guardiansTotalCount = GUARDIANS_DATA.length;
  const guardiansReadyCount = saveManager.getUpgradableOrUnlockableGuardianCount();

  if (gameState === 'BOOT' || gameState === 'LOADING') {
    const pct = Math.min(100, Math.max(0, Math.round(loadProgress.progress * 100)));
    return (
      <div className="w-full h-full ts-lattice-bg flex flex-col items-center justify-center p-6 text-center animate-ts-fade">
        <div className="wood-panel ts-ornate-frame rounded-2xl px-8 py-6 space-y-3 min-w-[280px] max-w-sm">
          <div className="font-display text-3xl font-extrabold text-amber-300 tracking-widest">
            TS THAMMAI
          </div>
          <div className="text-sm text-amber-200/85">กำลังจัดเตรียมทัพขุนพลและภาพ Sprite...</div>
          <div className="w-full h-2.5 bg-[#120a05] rounded-md border border-[#c9973e]/40 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 transition-all duration-150"
              style={{ width: `${Math.max(12, pct)}%` }}
            />
          </div>
          <div className="text-xs font-mono-num text-amber-200/70">
            {loadProgress.total > 0
              ? `โหลดทรัพยากร ${loadProgress.loaded}/${loadProgress.total} (${pct}%)`
              : `เตรียมพร้อมสมรภูมิ (${pct}%)`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="w-full h-full overflow-hidden relative">
      {gameState === 'MAIN_MENU' && (
        <MainMenu
          muted={saveData.settings.muted}
          selectedMapNameTH={selectedMap.nameTH}
          stats={saveData.stats}
          playerName={saveData.playerName || ''}
          commanderLevel={saveData.commander.level}
          bonusGold={saveData.commander.bonusGold}
          unclaimedMissions={unclaimedMissions}
          dailyLoginReady={unclaimedSummary.dailyLogin}
          loginStreakDays={saveData.dailyLogin.consecutiveDays}
          codexUnlockedCount={codexUnlockedCount}
          codexTotalCount={codexTotalCount}
          achievementsUnlockedCount={achievementsUnlockedCount}
          achievementsTotalCount={achievementsTotalCount}
          guardiansUnlockedCount={guardiansUnlockedCount}
          guardiansTotalCount={guardiansTotalCount}
          guardiansReadyCount={guardiansReadyCount}
          modalOpen={playerModalTab !== null || missionModalTab !== null}
          onPlay={() => startMap(selectedMapId)}
          onMapSelect={() => setGameState('MAP_SELECT')}
          onHeroCollection={() => setGameState('HERO_SELECT')}
          onGuardians={() => {
            refreshSaveFromEngine();
            setGameState('GUARDIANS');
          }}
          onCodex={() => {
            refreshSaveFromEngine();
            setGameState('CODEX');
          }}
          onAchievements={() => {
            refreshSaveFromEngine();
            setGameState('ACHIEVEMENTS');
          }}
          onHowToPlay={() => setGameState('HOW_TO_PLAY')}
          onSettings={() => {
            setReturnState('MAIN_MENU');
            setGameState('SETTINGS');
          }}
          onOpenPlayerModal={(tab) => setPlayerModalTab(tab)}
          onOpenDailyMissions={(tab = 'DAILY') => {
            refreshSaveFromEngine();
            setMissionModalTab(tab);
          }}
          onToggleMute={toggleMute}
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
        />
      )}

      {gameState === 'MAP_SELECT' && (
        <MapSelectScreen
          selectedMapId={selectedMapId}
          saveData={saveData}
          onSelectMap={(id) => setSelectedMapId(id)}
          onPlayMap={(id) => startMap(id)}
          onSaveChanged={handleSaveChanged}
          onOpenGuardians={() => {
            refreshSaveFromEngine();
            setGameState('GUARDIANS');
          }}
          onBack={() => setGameState('MAIN_MENU')}
        />
      )}

      {gameState === 'HERO_SELECT' && (
        <HeroCollectionScreen
          saveData={saveData}
          onSaveChanged={handleSaveChanged}
          onBack={() => setGameState('MAIN_MENU')}
        />
      )}

      {gameState === 'GUARDIANS' && (
        <GuardianCollectionScreen
          saveData={saveData}
          onSaveChanged={handleSaveChanged}
          onBack={() => setGameState('MAIN_MENU')}
        />
      )}

      {gameState === 'CODEX' && (
        <CodexScreen saveData={saveData} onBack={() => setGameState('MAIN_MENU')} />
      )}

      {gameState === 'ACHIEVEMENTS' && (
        <AchievementsScreen saveData={saveData} onBack={() => setGameState('MAIN_MENU')} />
      )}

      {gameState === 'HOW_TO_PLAY' && (
        <HowToPlayScreen onBack={() => setGameState('MAIN_MENU')} />
      )}

      {gameState === 'SETTINGS' && (
        <SettingsScreen
          saveData={saveData}
          onSaveChanged={handleSaveChanged}
          onBack={() => setGameState(returnState)}
        />
      )}

      {gameState === 'PLAYING' && (
        <BattleScreen
          mapId={selectedMapId}
          enableTutorial={enableTutorial}
          muted={saveData.settings.muted}
          isFullscreen={isFullscreen}
          playerName={saveData.playerName || ''}
          authState={authState}
          unclaimedMissions={unclaimedMissions}
          onSavePlayerName={handleSavePlayerName}
          onOpenLeaderboard={() => setPlayerModalTab('LEADERBOARD')}
          onOpenDailyMissions={() => {
            refreshSaveFromEngine();
            setMissionModalTab(unclaimedSummary.daily >= unclaimedSummary.weekly ? 'DAILY' : 'WEEKLY');
          }}
          onMatchComplete={refreshSaveFromEngine}
          onToggleMute={toggleMute}
          onToggleFullscreen={toggleFullscreen}
          onOpenSettings={() => setShowInBattleSettings(true)}
          onNextMap={(nextId) => {
            refreshSaveFromEngine();
            startMap(nextId);
          }}
          onExitToMenu={() => {
            setShowInBattleSettings(false);
            refreshSaveFromEngine();
            setGameState('MAIN_MENU');
          }}
          onOpenMapSelect={() => {
            setShowInBattleSettings(false);
            refreshSaveFromEngine();
            setGameState('MAP_SELECT');
          }}
        />
      )}

      {gameState === 'PLAYING' && showInBattleSettings && (
        <div className="fixed inset-0 z-50">
          <SettingsScreen
            saveData={saveData}
            onSaveChanged={handleSaveChanged}
            onBack={() => setShowInBattleSettings(false)}
          />
        </div>
      )}

      {playerModalTab && (
        <PlayerLeaderboardModal
          initialTab={playerModalTab}
          playerName={saveData.playerName || ''}
          authState={authState}
          onSavePlayerName={handleSavePlayerName}
          onClose={() => setPlayerModalTab(null)}
        />
      )}

      {missionModalTab && (
        <DailyMissionModal
          saveData={saveData}
          initialTab={missionModalTab}
          onSaveChanged={handleSaveChanged}
          onClose={() => setMissionModalTab(null)}
        />
      )}
    </main>
  );
}
