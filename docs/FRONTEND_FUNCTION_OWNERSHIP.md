# Frontend Function Ownership Audit

## Baseline and method

- Baseline: `fea25bf:script.js` (`refactor(frontend): split HTML CSS and JavaScript`), 995 lines and 720,804 bytes. This is the 994-line-class source referenced by T-0016, not the earlier pre-asset-split `script.js` at `fea25bf^`.
- Current snapshot: 42 JavaScript files; `script.js` is a 291-line application composition root.
- Static inventory: 212 named function declarations and named arrow-function assignments in the baseline. All 212 have a current owner or an explicitly documented rename/nested-helper mapping below; there are no unresolved names.
- The inventory contains 211 unique identifiers because `categoryOrder` is intentionally declared twice in separate local scopes; both declarations remain in `ui/inventory.js`, matching the baseline's two local declarations.
- Anonymous callbacks, object-literal method shorthand, and event-handler bodies are not counted as named declarations. This inventory tracks named function ownership, not every executable statement.
- A same-named `script.js` wrapper is not treated as the implementation owner when the implementation now lives in a feature module.

## Original function ownership by current implementation module

### `data/dice.js`

- `rarityColor`

### `data/pets.js`

- `petBaseIncome`, `randomPet`

### `core/format.js`

- `format`, `formatWalletScientific`, `compactNum`, `escapeHTML`

### `core/game-state.js`

- `fresh`, `normalizeGloves`, `migrateCurrency`, `load`, `autoSellPrefsStorageKey`, `persistAutoSellPrefs`, `restoreAutoSellPrefs`

### `services/device-lock.js`

- `getDeviceLockId`, `acquireDeviceLock`, `releaseDeviceLock`
- Renamed during extraction: `stopDeviceHeartbeat` → `stopHeartbeat`; `scheduleDeviceUnlock` → `scheduleUnlock`

### `services/visit-tracking.js`

- `getVisitorId`, `recordGameVisit`, `startGameVisitTracking`

### `services/presence.js`

- `heartbeat`

### `services/activity-logs.js`

- `logCraft`, `logPotionAction`

### `services/auth.js`

- `showAuthMessage`, `openAuth`, `closeAuth`, `setAuthButtonsDisabled`, `isEmailRateLimitError`, `taipeiDayKey`, `getDeviceAccountLedger`, `checkAndRecordDeviceAccount`, `enforceDeviceAccountLimit`, `authAction`

### `services/cloud-save.js`

- `flushCloudSave`, `userSaveKey`, `save`, `savePayload`, `achievementStats`, `applyPendingGrants`, `syncCloudSave`, `loadCloudSave`, `localSaveBeforeCloud`

### `systems/global-announcements.js`

- `addGlobalAnnouncement`, `triggerWeatherSurge`, `announceWeatherSummon`, `showSecretPetMarquee`, `safe`, `recordPetFusion`, `loadAdminPetFusionLogs`, `setupGlobalAnnouncements`, `broadcastRareRoll`

### `systems/weather.js`

- `summonedWeatherGuardUntil`, `forcedWeatherState`, `specialWeatherLocked`, `applyServerWeatherRow`, `applyPlayerWeatherRow`, `refreshPlayerWeatherOverride`, `setupPlayerWeatherSubscription`, `refreshServerWeather`, `applyForcedWeather`, `minuteSeed`, `getWeather`, `activeWeatherDice`, `convertWeather`, `updateWeatherUI`, `renderWeatherSummon`, `loadWeatherSummonData`, `depositWeatherDice`, `summonSpecialWeather`, `toggleAutoDepositWeather`, `autoDepositRolledWeatherDice`

### `systems/coin-boost.js`

- `coinEarningMultiplier`, `refreshCoinBoosts`

### `systems/global-boost.js`

- `activeGlobalBoost`, `refreshGlobalBoost`, `updateGlobalBoostStatus`

### `systems/leaderboards.js`

- `refreshLeaderboards`, `name`, `medal`, `rank`

### `systems/dice.js`

- `addWeatherOdds`, `isHalloweenDice`, `halloweenDiceUnavailable`, `weightedRoll`, `wait`, `playRarityReveal`, `playSmallReveal`, `doRoll`, `stopAuto`, `restartAutoInterval`

### `systems/pet-skills.js`

- `petWeightSkillMultiplier`

### `systems/pet-income.js`

- `petIncomeMultiplier`, `rollPetVariant`, `petIncomePerSecond`, `equippedPetIncomePerSecond`, `renderPetIncome`

### `systems/pets.js`

- `petBonusTotals`, `equippedPetHas`, `applyPetSkillDailyReset`, `populateAdminPetSelects`, `petRarity`, `petArt`, `petTierFromDen`, `weightedPetRarity`, `ensurePetData`, `petMutationForDice`, `petMutationLabel`, `rollPetWeightKg`, `addPet`, `applyPetAutoSell`, `ownedPetName`, `renderPetsPage`, `renderPetCodex`, `renderPetChance`, `dicePairAllowed`, `dicePairTier`, `refreshPetDiceSelects`, `optionsFor`, `make`, `updatePetDicePreview`, `onPetDiceSelectionChange`

### `systems/progression.js`

- `rewardText`, `showAchievementPopup`, `showNextAchievementPopup`, `closeAchievementPopup`, `checkAchievements`, `dailyTaskIdsForDate`, `ensureDailyQuest`, `dailyTaskProgress`, `checkDailyReward`, `renderQuests`, `renderProfile`
- `grantAchievementReward` is retained as a private helper inside `createProgressionSystem` and is returned through the factory API.

### `systems/realm-polls.js`

- `realmUsername`, `realmShowAnnouncement`, `realmHidePoll`, `realmRefreshPollResults`, `realmPollTick`, `realmSendMessage`, `realmStartPoll`

### `admin/grants.js`

- `adminApi`, `writeAdminGrantLog`, `loadAdminGrantHistory`

### `admin/pet-odds.js`

- `petTierRangeLabel`, `petTierEntries`, `renderAdminPetTierOdds`, `fillAdminPetOddsEditor`, `updateAdminPetOddsTotal`, `loadPetFusionOdds`

### `admin/player-management.js`

- `loadAdminDashboard`, `setOptions`, `loadAdminRareRolls`, `analyzeSuspiciousRolls`

### `admin/monitoring.js`

- `loadAdminWeatherHistory`, `renderOnlineCurve`, `loadAdminOnlineCurve`, `loadAdminAchievementCounts`, `loadAdminPotionLogs`, `loadAdminDeletedAccounts`, `loadAdminIncomeMonitor`, `setPlayerBan`

### `ui/navigation.js`

- `updateAdminVisibility`, `navHTML`, `go`

### `ui/inventory.js`

- `itemHTML`, `renderAutoSellOptions`, `categoryOrder`, `renderOne`, `renderAutoDepositOptions`, `updateInventorySelectedCount`, `renderInventory`, `sellMany`, `bagUpgradeCost`

### `ui/codex.js`

- `renderCodex`

### `ui/pet-notices.js`

- `showPetAutoSellNotice`

### `ui/gloves.js`

- `canCraft`, `renderGloves`, `purchaseGlove`, `craft`

### `ui/potions.js`

- `potionMaterialTotal`, `renderPotionAutoAddChoices`, `potionIngredientInfo`, `renderPotions`, `craftPotion`, `usePotion`

### `ui/main-render.js`

- `render`

### `ui/pet-selling.js`

- `ready`, `$`, `listPets`, `rarityOf`, `renderChoices`, `updateSummary`, `open`, `close`

## Functions intentionally remaining in `script.js`

These are shared application helpers or small composition-root lookups rather than feature implementations:

- `byId`, `glove`, `totalUnique`, `totalDice`, `currentGlove`, `activePotion`, `potionLuck`, `potionSpeed`, `luck`, `speed`, `effectiveDen`, `chanceText`, `toast`, `isAdmin`, `loadWeatherDiceExistCounts`

## Compatibility wrappers retained in `script.js`

The following original call names remain as entry-point wrappers so existing cross-module wiring and initialization order can continue to call them. Their implementation ownership is the module listed here, not `script.js`:

| Entry-point wrapper | Implementation owner |
|---|---|
| `triggerWeatherSurge`, `announceWeatherSummon`, `recordPetFusion`, `loadAdminPetFusionLogs`, `setupGlobalAnnouncements`, `broadcastRareRoll` | `systems/global-announcements.js` |
| `loadPetFusionOdds` | `admin/pet-odds.js` |
| `flushCloudSave`, `userSaveKey`, `save`, `savePayload`, `achievementStats`, `applyPendingGrants`, `syncCloudSave`, `loadCloudSave` | `services/cloud-save.js` |
| `showAuthMessage`, `openAuth`, `closeAuth`, `authAction` | `services/auth.js` |
| `heartbeat` | `services/presence.js` |
| `ensurePetData` | `systems/pets.js` (the entry wrapper also preserves the early game-state initialization call) |
| `renderCodex` | `ui/codex.js` |
| `renderGloves` | `ui/gloves.js` |
| `potionMaterialTotal`, `renderPotions` | `ui/potions.js` |
| `logCraft`, `logPotionAction` | `services/activity-logs.js` |
| `render` | `ui/main-render.js` |
| `loadAdminWeatherHistory`, `loadAdminOnlineCurve`, `loadAdminAchievementCounts`, `loadAdminPotionLogs`, `loadAdminDeletedAccounts`, `loadAdminIncomeMonitor`, `setPlayerBan` | `admin/monitoring.js` |
| `loadAdminDashboard`, `loadAdminRareRolls`, `analyzeSuspiciousRolls` | `admin/player-management.js` |
| `restartAutoInterval` | `systems/dice.js` (the entry point retains the function reference for cross-module injection) |

## Added orchestration and module-local helpers

The current module tree also contains factory/setup entry points and helpers introduced during extraction. These are not missing baseline functions; they establish explicit dependency-injection boundaries or replace top-level initialization:

- Composition facades: `systems/realm-social.js`, `ui/equipment.js`.
- Services and setup entry points: `createGameStateService`, `createCloudSaveService`, `createAuthService`, `createDeviceLockService`, `createVisitTrackingService`, `createPresenceService`, `createActivityLogService`, `setupAccountActions`, `createAdminGrantService`, `createAdminPlayerManagement`, `createAdminMonitoringSystem`, `setupAdminUIBindings`.
- Feature/UI factories: `createWeatherSystem`, `createDiceSystem`, `createPetSystem`, `createProgressionSystem`, `createGlobalAnnouncements`, `createRealmPolls`, `createCoinBoostService`, `createGlobalBoostSystem`, `createLeaderboardSystem`, `createPetIncomeSystem`, `createCodexUI`, `createInventoryUI`, `createMainRenderUI`, `createNavigationUI`, `createPetNoticeUI`, `setupPetSellingUI`, `createGloveUI`, `createPotionUI`.
- Additional private helpers remain local to their owning factory, including event-binding callbacks and UI rendering helpers.

## Audit result and limits

- Baseline named function/arrow inventory: 212.
- Mapped to current implementation modules, shared entry-point helpers, or documented rename/private-helper equivalents: 212 / 212.
- Unresolved baseline function names: 0.
- The audit is static source ownership reconciliation. It does not prove runtime behavior, event-listener uniqueness, browser compatibility, or GitHub Pages deployment correctness; those remain separate T-0016 validation items.
