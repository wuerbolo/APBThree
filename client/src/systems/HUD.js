export class HUD {
    constructor(gameScene) {
        this.gameScene = gameScene;
    }

    // Brief red vignette flash when the local player takes damage.
    flashDamage() {
        let flash = document.getElementById('damage-flash');
        if (!flash) {
            flash = document.createElement('div');
            flash.id = 'damage-flash';
            flash.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: radial-gradient(circle, rgba(255,0,0,0) 55%, rgba(255,0,0,0.55) 100%);
                pointer-events: none;
                z-index: 900;
                transition: opacity 0.3s ease-out;
                opacity: 0;
            `;
            document.body.appendChild(flash);
        }

        // Restart the fade even if a previous flash is still fading out.
        // The transition:none -> opacity:1 -> transition:opacity write below
        // needs a forced reflow in between, or the browser can batch both
        // writes into a single paint and the flash never becomes visible --
        // rAF alone doesn't guarantee a paint happens between the two.
        flash.style.transition = 'none';
        flash.style.opacity = '1';
        void flash.offsetWidth;
        flash.style.transition = 'opacity 0.3s ease-out';
        flash.style.opacity = '0';
    }

    showDeathOverlay() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(139, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            font-family: Arial, sans-serif;
        `;
        
        const text = document.createElement('h1');
        text.textContent = 'YOU DIED';
        text.style.cssText = `
            color: #ff0000;
            font-size: 72px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
            margin: 0;
            padding: 20px;
        `;
        
        overlay.appendChild(text);
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.remove();
            this.showDeathTint();
            this.showRespawnButton();
        }, 2000);
    }

    showRespawnButton() {
        const button = document.createElement('button');
        button.textContent = 'Respawn';
        button.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 15px 30px;
            font-size: 24px;
            background-color: #ff3333;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.3s;
            z-index: 1000;
            font-family: Arial, sans-serif;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        `;

        button.onmouseover = () => {
            button.style.backgroundColor = '#cc0000';
        };
        
        button.onmouseout = () => {
            button.style.backgroundColor = '#ff3333';
        };

        button.onclick = () => {
            this.gameScene.handleRespawn();
            this.hideDeathTint();
            button.remove();
        };

        document.body.appendChild(button);
    }

    showFactionSelection() {
        const overlay = document.createElement('div');
        overlay.id = 'factionSelection';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            font-family: Arial, sans-serif;
        `;
        
        const title = document.createElement('h1');
        title.textContent = 'Choose Your Faction';
        title.style.cssText = `
            color: #ffffff;
            font-size: 48px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
            margin-bottom: 40px;
        `;
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Enter your character name';
        nameInput.style.cssText = `
            padding: 15px;
            font-size: 18px;
            margin-bottom: 30px;
            width: 300px;
            border: none;
            border-radius: 5px;
            text-align: center;
        `;
        
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            justify-content: center;
            max-width: 600px;
        `;
        
        const criminalButton = this.createFactionButton('Criminal', '#d32f2f', 'Operate outside the law, gain reputation by defeating Enforcers.');
        const enforcerButton = this.createFactionButton('Enforcer', '#1976d2', 'Uphold the law, gain reputation by defeating Criminals.');

        criminalButton.onclick = () => {
            const name = nameInput.value || `Criminal${Math.floor(Math.random() * 1000)}`;
            this.selectFaction('Criminal', name);
            overlay.remove();
        };

        enforcerButton.onclick = () => {
            const name = nameInput.value || `Enforcer${Math.floor(Math.random() * 1000)}`;
            this.selectFaction('Enforcer', name);
            overlay.remove();
        };

        buttonsContainer.appendChild(criminalButton);
        buttonsContainer.appendChild(enforcerButton);
        
        overlay.appendChild(title);
        overlay.appendChild(nameInput);
        overlay.appendChild(buttonsContainer);
        document.body.appendChild(overlay);
    }
    
    createFactionButton(faction, color, description) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 180px;
        `;
        
        const button = document.createElement('button');
        button.textContent = `Join ${faction}s`;
        button.style.cssText = `
            padding: 20px 40px;
            font-size: 20px;
            background-color: ${color};
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            width: 100%;
            margin-bottom: 10px;
        `;
        
        const desc = document.createElement('div');
        desc.textContent = description;
        desc.style.cssText = `
            color: #aaaaaa;
            font-size: 14px;
            text-align: center;
        `;
        
        button.onmouseover = () => {
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
        };
        
        button.onmouseout = () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        };
        
        buttonContainer.appendChild(button);
        buttonContainer.appendChild(desc);
        
        return buttonContainer;
    }
    
    selectFaction(faction, name) {
        this.gameScene.network.createCharacter(name, faction);
    }
    
    showCharacterInfo(character) {
        // Create or update character info display
        let infoPanel = document.getElementById('character-info');
        if (!infoPanel) {
            infoPanel = document.createElement('div');
            infoPanel.id = 'character-info';
            infoPanel.style.cssText = `
                position: fixed;
                top: 10px;
                left: 10px;
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px;
                border-radius: 5px;
                font-family: Arial, sans-serif;
                z-index: 100;
                min-width: 200px;
            `;
            document.body.appendChild(infoPanel);
        }
        
        // Set faction-specific colors
        const factionColor = character.faction === 'Criminal' ? '#d32f2f' : character.faction === 'Enforcer' ? '#1976d2' : '#388e3c';
        
        infoPanel.innerHTML = `
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">
                <span style="color: ${factionColor};">${character.name}</span>
            </div>
            <div>Faction: <span style="color: ${factionColor};">${character.faction}</span></div>
            <div>Health: <span id="stat-health">${this.gameScene.localPlayer ? this.gameScene.localPlayer.health : 100}</span></div>
            <div>Level: ${character.level}</div>
            <div>Reputation: <span id="stat-reputation">${character.reputation}</span> / ${character.reputationForNextLevel}</div>
            <div>Money: $<span id="stat-money">${character.money}</span></div>
            <div>Weapon: <span id="stat-weapon">${this.gameScene.currentWeapon}</span> <span style="opacity:0.6">(1/2 to switch)</span></div>
        `;
    }

    // Cheap enough to call every frame -- just updates one span's text.
    updateHealthStat(health) {
        const healthEl = document.getElementById('stat-health');
        if (healthEl) healthEl.textContent = Math.max(0, Math.round(health));
    }

    updateWeaponStat(weaponId) {
        const weaponEl = document.getElementById('stat-weapon');
        if (weaponEl) weaponEl.textContent = weaponId;
    }

    // --- Crosshair ---------------------------------------------------------

    setCrosshairVisible(visible) {
        if (this._crosshairVisible === visible) return;
        this._crosshairVisible = visible;
        let crosshair = document.getElementById('crosshair');
        if (!crosshair) {
            crosshair = document.createElement('div');
            crosshair.id = 'crosshair';
            crosshair.textContent = '+';
            crosshair.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: rgba(255, 255, 255, 0.85);
                font-size: 28px;
                font-family: monospace;
                text-shadow: 0 0 3px rgba(0,0,0,0.9);
                pointer-events: none;
                z-index: 800;
            `;
            document.body.appendChild(crosshair);
        }
        crosshair.style.display = visible ? 'block' : 'none';
    }

    // --- Leaderboard -------------------------------------------------------

    // rankings: { now, day, week, year } -- 'now' entries carry .reputation,
    // the period tabs carry .score (rep earned within the period).
    updateLeaderboard(rankings) {
        this._rankings = rankings;
        this._leaderboardTab = this._leaderboardTab || 'now';
        this.renderLeaderboard();
    }

    renderLeaderboard() {
        let panel = document.getElementById('leaderboard');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'leaderboard';
            panel.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px;
                border-radius: 5px;
                font-family: Arial, sans-serif;
                font-size: 13px;
                z-index: 100;
                min-width: 190px;
            `;
            document.body.appendChild(panel);
        }

        const factionColor = (faction) =>
            faction === 'Criminal' ? '#ff5252' : faction === 'Enforcer' ? '#64b5f6' : '#81c784';

        const TABS = [
            ['now', 'Ahora'], ['day', 'Hoy'], ['week', 'Semana'], ['year', 'Año']
        ];
        const active = this._leaderboardTab;
        const entries = (this._rankings && this._rankings[active]) || [];

        const rows = entries.length
            ? entries.map((e, i) =>
                `<div><span style="opacity:0.6">${i + 1}.</span> <span style="color:${factionColor(e.faction)}">${e.name}</span> — ${active === 'now' ? e.reputation : e.score} rep</div>`
              ).join('')
            : `<div style="opacity:0.6">${active === 'now' ? 'Nobody online' : 'Sin datos aún'}</div>`;

        panel.innerHTML = `<div style="font-weight:bold; margin-bottom:4px;">Fame / Infamy</div><div id="leaderboard-tabs" style="display:flex; gap:8px; margin-bottom:6px;"></div>${rows}`;

        const tabRow = panel.querySelector('#leaderboard-tabs');
        for (const [key, label] of TABS) {
            const tab = document.createElement('span');
            tab.textContent = label;
            tab.style.cssText = `
                cursor: pointer;
                padding-bottom: 2px;
                font-size: 12px;
                opacity: ${key === active ? '1' : '0.55'};
                border-bottom: 2px solid ${key === active ? '#ffb74d' : 'transparent'};
            `;
            tab.onclick = () => {
                this._leaderboardTab = key;
                this.renderLeaderboard();
            };
            tabRow.appendChild(tab);
        }
    }

    // --- Faction rounds ------------------------------------------------------

    ensureRoundPanel() {
        let panel = document.getElementById('round-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'round-panel';
            panel.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 10px;
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px;
                border-radius: 5px;
                font-family: Arial, sans-serif;
                font-size: 13px;
                z-index: 100;
                min-width: 200px;
            `;
            const bar = (faction, color) => `
                <div style="display:flex; align-items:center; gap:6px; margin-top:5px;">
                    <span style="color:${color}; width:62px; font-size:12px;">${faction}</span>
                    <div style="flex:1; height:10px; background:rgba(255,255,255,0.15); border-radius:3px; overflow:hidden;">
                        <div id="round-bar-${faction}" style="width:0%; height:100%; background:${color}; transition:width 0.3s;"></div>
                    </div>
                </div>
            `;
            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-weight:bold;">
                    <span>Ronda</span><span id="round-timer">--:--</span>
                </div>
                ${bar('Criminal', '#ff5252')}
                ${bar('Enforcer', '#64b5f6')}
            `;
            document.body.appendChild(panel);
        }
        return panel;
    }

    // Full round snapshot: (re)sync the countdown and both bars. Called on
    // init and at each round start.
    updateRoundHUD(state) {
        this.ensureRoundPanel();
        this._roundGoal = state.goal;
        this._roundEndsAt = Date.now() + state.remainingMs;
        this.updateRoundBars(state.scores);

        if (!this._roundTimerInterval) {
            this._roundTimerInterval = setInterval(() => this.renderRoundTimer(), 1000);
        }
        this.renderRoundTimer();
    }

    renderRoundTimer() {
        const el = document.getElementById('round-timer');
        if (!el) return;
        const remaining = Math.max(0, this._roundEndsAt - Date.now());
        const m = Math.floor(remaining / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        el.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }

    updateRoundBars(scores) {
        this.ensureRoundPanel();
        for (const faction of ['Criminal', 'Enforcer']) {
            const fill = document.getElementById(`round-bar-${faction}`);
            if (!fill) continue;
            const pct = Math.min(100, ((scores[faction] || 0) / (this._roundGoal || 100)) * 100);
            fill.style.width = `${pct}%`;
        }
    }

    // Big centered announcement (90% warning, round result). Auto-hides.
    showRoundBanner(text, color) {
        let banner = document.getElementById('round-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'round-banner';
            banner.style.cssText = `
                position: fixed;
                top: 22%;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(0, 0, 0, 0.75);
                padding: 14px 30px;
                border-radius: 8px;
                font-family: Arial, sans-serif;
                font-size: 28px;
                font-weight: bold;
                text-align: center;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
                pointer-events: none;
                z-index: 1000;
                max-width: 80%;
            `;
            document.body.appendChild(banner);
        }
        banner.textContent = text;
        banner.style.color = color;
        clearTimeout(this._roundBannerTimer);
        this._roundBannerTimer = setTimeout(() => {
            const b = document.getElementById('round-banner');
            if (b) b.remove();
        }, 4000);
    }

    // --- Missions ----------------------------------------------------------

    ensureMissionPanel() {
        let panel = document.getElementById('mission-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'mission-panel';
            panel.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 10px;
                background-color: rgba(0, 0, 0, 0.75);
                color: white;
                padding: 12px 15px;
                border-radius: 5px;
                border-left: 4px solid #ffb74d;
                font-family: Arial, sans-serif;
                font-size: 14px;
                z-index: 100;
                max-width: 320px;
            `;
            document.body.appendChild(panel);
        }
        return panel;
    }

    hasPendingMissionOffer() {
        return !!this._pendingMissionOffer;
    }

    showMissionOffer(offer) {
        this._pendingMissionOffer = true;
        const panel = this.ensureMissionPanel();
        panel.innerHTML = `
            <div style="font-weight: bold; color: #ffb74d; margin-bottom: 3px;">NEW JOB: ${offer.title}</div>
            <div style="opacity: 0.85; margin-bottom: 6px;">${offer.description}</div>
            <div style="opacity: 0.7; font-size: 13px;">Reward: $${offer.rewardMoney} + ${offer.rewardRep} rep</div>
            <div style="color: #ffe082; margin-top: 6px; font-weight: bold;">[M] Accept</div>
        `;
    }

    showMissionTracker(update) {
        this._pendingMissionOffer = false;
        const panel = this.ensureMissionPanel();
        panel.innerHTML = `
            <div style="font-weight: bold; color: #ffb74d; margin-bottom: 3px;">${update.title}</div>
            <div>${update.objective}</div>
        `;
    }

    // Flash a completion/failure message, then clear the panel.
    showMissionResult(html) {
        this._pendingMissionOffer = false;
        const panel = this.ensureMissionPanel();
        panel.innerHTML = html;
        clearTimeout(this._missionResultTimer);
        this._missionResultTimer = setTimeout(() => {
            const p = document.getElementById('mission-panel');
            if (p) p.remove();
        }, 5000);
    }

    showMissionCompleted(data) {
        this.showMissionResult(`
            <div style="font-weight: bold; color: #81c784; margin-bottom: 3px;">MISSION COMPLETE: ${data.title}</div>
            <div>+$${data.rewardMoney}, +${data.rewardRep} rep</div>
        `);
    }

    showMissionFailed(data) {
        this.showMissionResult(`
            <div style="font-weight: bold; color: #ff5252; margin-bottom: 3px;">MISSION FAILED</div>
            <div style="opacity: 0.85;">${data.reason}</div>
        `);
    }

    // --- Shop --------------------------------------------------------------

    showShopPrompt() {
        let prompt = document.getElementById('shop-prompt');
        if (!prompt) {
            prompt = document.createElement('div');
            prompt.id = 'shop-prompt';
            prompt.textContent = 'Press E to open the STORE';
            prompt.style.cssText = `
                position: fixed;
                bottom: 90px;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(0, 0, 0, 0.75);
                color: #ffb74d;
                padding: 10px 18px;
                border-radius: 5px;
                font-family: Arial, sans-serif;
                font-size: 16px;
                z-index: 850;
                pointer-events: none;
            `;
            document.body.appendChild(prompt);
        }
        prompt.style.display = 'block';
    }

    hideShopPrompt() {
        const prompt = document.getElementById('shop-prompt');
        if (prompt) prompt.style.display = 'none';
    }

    isShopOpen() {
        return !!document.getElementById('shop-overlay');
    }

    openShop(character) {
        if (this.isShopOpen()) return;
        const overlay = document.createElement('div');
        overlay.id = 'shop-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(15, 15, 15, 0.95);
            color: white;
            padding: 25px 30px;
            border-radius: 8px;
            border: 2px solid #ff9800;
            font-family: Arial, sans-serif;
            z-index: 1100;
            min-width: 320px;
        `;
        document.body.appendChild(overlay);
        this.renderShop(character);
    }

    renderShop(character) {
        const overlay = document.getElementById('shop-overlay');
        if (!overlay) return;

        const money = character ? character.money : 0;
        const ownsShotgun = !!(character && Array.isArray(character.weapons) && character.weapons.includes('shotgun'));

        overlay.innerHTML = `
            <div style="font-size: 22px; font-weight: bold; color: #ff9800; margin-bottom: 4px;">STORE</div>
            <div style="opacity: 0.7; margin-bottom: 14px;">Your money: $<span id="shop-money">${money}</span></div>
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 10px; background: rgba(255,255,255,0.06); border-radius: 5px;">
                <div>
                    <div style="font-weight: bold;">Shotgun</div>
                    <div style="font-size: 12px; opacity: 0.7;">6 pellets, brutal up close</div>
                </div>
                ${ownsShotgun
                    ? '<span style="color: #81c784; font-weight: bold;">OWNED</span>'
                    : '<button id="shop-buy-shotgun" style="padding: 8px 16px; background: #ff9800; color: #111; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Buy $50</button>'}
            </div>
            <div id="shop-error" style="color: #ff5252; font-size: 13px; min-height: 18px; margin-top: 8px;"></div>
            <div style="opacity: 0.5; font-size: 12px; margin-top: 6px;">Press E to close</div>
        `;

        const buyButton = document.getElementById('shop-buy-shotgun');
        if (buyButton) {
            buyButton.onclick = () => this.gameScene.network.buyWeapon('shotgun');
        }
    }

    showShopError(message) {
        const errorEl = document.getElementById('shop-error');
        if (errorEl) errorEl.textContent = message;
    }

    closeShop() {
        const overlay = document.getElementById('shop-overlay');
        if (overlay) overlay.remove();
    }

    // Death penalty: roll the money/reputation numbers down from their old
    // values to the new (post-penalty) ones, like a lock combination
    // settling into place, instead of just snapping to the new numbers.
    animateCharacterPenalty(oldCharacter, newCharacter) {
        this.showCharacterInfo(newCharacter);
        if (!oldCharacter) return;

        const moneyEl = document.getElementById('stat-money');
        const repEl = document.getElementById('stat-reputation');
        if (moneyEl) this.rollNumber(moneyEl, oldCharacter.money, newCharacter.money);
        if (repEl) this.rollNumber(repEl, oldCharacter.reputation, newCharacter.reputation);
    }

    rollNumber(el, from, to) {
        const duration = 900;
        const start = performance.now();

        const step = (now) => {
            const progress = Math.min(1, (now - start) / duration);
            if (progress < 1) {
                const settled = from + (to - from) * progress;
                const jitter = (1 - progress) * Math.abs(from - to) * 0.4;
                const displayValue = Math.round(settled + (Math.random() - 0.5) * jitter);
                el.textContent = Math.max(0, displayValue);
                requestAnimationFrame(step);
            } else {
                el.textContent = to;
            }
        };
        requestAnimationFrame(step);
    }

    // Persistent dark red tint while dead -- cleared on respawn.
    showDeathTint() {
        if (document.getElementById('death-tint')) return;
        const tint = document.createElement('div');
        tint.id = 'death-tint';
        tint.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(90, 0, 0, 0.45);
            pointer-events: none;
            z-index: 950;
        `;
        document.body.appendChild(tint);
    }

    hideDeathTint() {
        const tint = document.getElementById('death-tint');
        if (tint) tint.remove();
    }
}