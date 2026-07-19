import { getFactionDisplayName } from '../utils/factionColors.js';
import { COSMETICS } from '../utils/characterModel.js';

export class HUD {
    constructor(gameScene) {
        this.gameScene = gameScene;
    }

    // Title screen shown on arrival: big animated "B.O.L.O" letters
    // (Minecraft-style drop-in + idle bob, blocky 3D extrusion), a pulsing
    // yellow splash line, and a police-light color wash. The game keeps
    // connecting/rendering underneath; PLAY (or Enter) drops you in -- the
    // faction selection, if needed, is already waiting below this overlay.
    showTitleScreen() {
        if (document.getElementById('title-screen')) return;

        const style = document.createElement('style');
        style.id = 'title-screen-style';
        style.textContent = `
            @keyframes bolo-letter-drop {
                0% { transform: translateY(-140vh); }
                60% { transform: translateY(0); }
                75% { transform: translateY(-28px); }
                88% { transform: translateY(0); }
                95% { transform: translateY(-9px); }
                100% { transform: translateY(0); }
            }
            @keyframes bolo-letter-bob {
                0%, 100% { transform: translateY(0) rotate(-1.2deg); }
                50% { transform: translateY(-7px) rotate(1.2deg); }
            }
            @keyframes bolo-splash-pulse {
                0%, 100% { transform: rotate(-12deg) scale(1); }
                50% { transform: rotate(-12deg) scale(1.13); }
            }
            @keyframes bolo-lights {
                0%, 100% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
            }
            @keyframes bolo-fade-up {
                from { opacity: 0; transform: translateY(24px); }
                to { opacity: 1; transform: translateY(0); }
            }
            #title-screen .bolo-letter {
                display: inline-block;
                animation: bolo-letter-drop 1.1s cubic-bezier(0.22, 1, 0.36, 1) both,
                           bolo-letter-bob 2.6s ease-in-out infinite;
            }
            #title-screen .bolo-dot {
                display: inline-block;
                color: #ffb300;
                animation: bolo-fade-up 0.5s ease-out both;
            }
        `;
        document.head.appendChild(style);

        const overlay = document.createElement('div');
        overlay.id = 'title-screen';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            font-family: Arial, sans-serif;
            background:
                radial-gradient(circle at 50% 120%, rgba(0,0,0,0.35), rgba(0,0,0,0.92) 70%),
                linear-gradient(115deg, #3b0d0d, #10101c 35%, #0d1f3b 65%, #10101c);
            background-size: 100% 100%, 300% 300%;
            animation: bolo-lights 7s ease-in-out infinite;
            overflow: hidden;
        `;

        // B . O . L . O -- letters drop in one by one, dots fade in after
        const logo = document.createElement('div');
        logo.style.cssText = `
            font-size: clamp(72px, 16vw, 170px);
            font-weight: 900;
            color: #f5f5f5;
            letter-spacing: 0.04em;
            line-height: 1;
            text-shadow:
                3px 3px 0 #8a8a8a, 6px 6px 0 #5c5c5c, 9px 9px 0 #333,
                12px 12px 22px rgba(0, 0, 0, 0.9);
            user-select: none;
        `;
        const parts = ['B', '.', 'O', '.', 'L', '.', 'O'];
        parts.forEach((ch, i) => {
            const span = document.createElement('span');
            span.textContent = ch;
            if (ch === '.') {
                span.className = 'bolo-dot';
                span.style.animationDelay = `${1.0 + i * 0.08}s`;
            } else {
                span.className = 'bolo-letter';
                // Stagger the drop; desync the idle bob so it doesn't march in unison
                span.style.animationDelay = `${i * 0.14}s, ${1.4 + i * 0.33}s`;
            }
            logo.appendChild(span);
        });

        // Pulsing yellow splash, Minecraft-style, hanging off the logo's corner
        const SPLASHES = [
            'Be On the Look Out!',
            'Wanted: you!',
            'Crime pays. Sometimes.',
            'Protect and serve!',
            'Shoot first, respawn later!',
            'Now with 100% more sirens!'
        ];
        const splash = document.createElement('div');
        splash.textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
        splash.style.cssText = `
            color: #ffff54;
            font-size: clamp(14px, 2.4vw, 24px);
            font-weight: bold;
            text-shadow: 2px 2px 0 #3f3f00;
            animation: bolo-splash-pulse 0.9s ease-in-out infinite;
            margin-top: -0.6em;
            align-self: flex-end;
            margin-right: 8vw;
            user-select: none;
        `;

        const tagline = document.createElement('div');
        tagline.textContent = 'BE ON THE LOOK OUT';
        tagline.style.cssText = `
            color: rgba(255, 255, 255, 0.55);
            font-size: clamp(12px, 1.6vw, 17px);
            letter-spacing: 0.55em;
            margin-top: 26px;
            animation: bolo-fade-up 0.7s ease-out 1.5s both;
            user-select: none;
        `;

        const playButton = document.createElement('button');
        playButton.textContent = 'PLAY';
        playButton.style.cssText = `
            margin-top: 48px;
            padding: 16px 72px;
            font-size: 26px;
            font-weight: bold;
            letter-spacing: 0.2em;
            color: white;
            background: linear-gradient(180deg, #e53935, #b71c1c);
            border: 2px solid #ff8a80;
            border-radius: 6px;
            cursor: pointer;
            box-shadow: 0 6px 18px rgba(229, 57, 53, 0.45);
            transition: transform 0.15s, box-shadow 0.15s;
            animation: bolo-fade-up 0.7s ease-out 1.9s both;
            font-family: Arial, sans-serif;
        `;
        playButton.onmouseover = () => {
            playButton.style.transform = 'scale(1.07)';
            playButton.style.boxShadow = '0 10px 26px rgba(229, 57, 53, 0.7)';
        };
        playButton.onmouseout = () => {
            playButton.style.transform = 'scale(1)';
            playButton.style.boxShadow = '0 6px 18px rgba(229, 57, 53, 0.45)';
        };

        const enterHint = document.createElement('div');
        enterHint.textContent = 'or press Enter';
        enterHint.style.cssText = `
            color: rgba(255, 255, 255, 0.4);
            font-size: 13px;
            margin-top: 14px;
            animation: bolo-fade-up 0.7s ease-out 2.2s both;
            user-select: none;
        `;

        const dismiss = () => {
            window.removeEventListener('keydown', onEnter);
            overlay.remove();
            style.remove();
        };
        const onEnter = (event) => {
            if (event.key === 'Enter') dismiss();
        };
        playButton.onclick = dismiss;
        window.addEventListener('keydown', onEnter);

        overlay.appendChild(logo);
        overlay.appendChild(splash);
        overlay.appendChild(tagline);
        overlay.appendChild(playButton);
        overlay.appendChild(enterHint);
        document.body.appendChild(overlay);
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
        if (document.pointerLockElement) document.exitPointerLock();
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
            if (this.gameScene.cameraMode === 'firstPerson') {
                this.gameScene.renderer.domElement.requestPointerLock();
            }
        };

        document.body.appendChild(button);
    }

    showFactionSelection() {
        if (document.pointerLockElement) document.exitPointerLock();
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
        const enforcerButton = this.createFactionButton('Enforcer', '#1976d2', `Uphold the law, gain reputation by defeating ${getFactionDisplayName('Criminal')}s.`);

        criminalButton.onclick = () => {
            const name = nameInput.value || `${getFactionDisplayName('Criminal')}${Math.floor(Math.random() * 1000)}`;
            this.selectFaction('Criminal', name);
            overlay.remove();
            if (this.gameScene.cameraMode === 'firstPerson') {
                this.gameScene.renderer.domElement.requestPointerLock();
            }
        };

        enforcerButton.onclick = () => {
            const name = nameInput.value || `Enforcer${Math.floor(Math.random() * 1000)}`;
            this.selectFaction('Enforcer', name);
            overlay.remove();
            if (this.gameScene.cameraMode === 'firstPerson') {
                this.gameScene.renderer.domElement.requestPointerLock();
            }
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
        button.textContent = `Join ${getFactionDisplayName(faction)}s`;
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

    isFactionChangeMenuOpen() {
        return !!document.getElementById('faction-change-overlay');
    }

    // "N" key: switch sides mid-game. Unlike showFactionSelection (initial
    // character creation, needs a name), this just picks a faction on the
    // existing character -- server treats it like a respawn into the new
    // faction's spawn.
    showFactionChangeMenu(currentFaction) {
        if (this.isFactionChangeMenuOpen()) return;
        if (document.pointerLockElement) document.exitPointerLock();

        const overlay = document.createElement('div');
        overlay.id = 'faction-change-overlay';
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
            z-index: 1200;
            font-family: Arial, sans-serif;
        `;

        const title = document.createElement('h1');
        title.textContent = 'Switch Faction';
        title.style.cssText = `
            color: #ffffff;
            font-size: 40px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
            margin-bottom: 10px;
        `;

        const hint = document.createElement('div');
        hint.textContent = 'Full heal, teleport to your new side\'s spawn. Press N or Esc to cancel.';
        hint.style.cssText = `color: #aaaaaa; font-size: 14px; margin-bottom: 30px;`;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            justify-content: center;
            max-width: 600px;
        `;

        const criminalButton = this.createFactionButton('Criminal', '#d32f2f', 'Operate outside the law, gain reputation by defeating Enforcers.');
        const enforcerButton = this.createFactionButton('Enforcer', '#1976d2', `Uphold the law, gain reputation by defeating ${getFactionDisplayName('Criminal')}s.`);

        criminalButton.onclick = () => this.gameScene.network.changeFaction('Criminal');
        enforcerButton.onclick = () => this.gameScene.network.changeFaction('Enforcer');

        buttonsContainer.appendChild(criminalButton);
        buttonsContainer.appendChild(enforcerButton);

        const error = document.createElement('div');
        error.id = 'faction-change-error';
        error.style.cssText = `color: #ff5252; font-size: 14px; margin-top: 16px; min-height: 18px;`;

        overlay.appendChild(title);
        overlay.appendChild(hint);
        overlay.appendChild(buttonsContainer);
        overlay.appendChild(error);
        document.body.appendChild(overlay);
    }

    closeFactionChangeMenu() {
        const overlay = document.getElementById('faction-change-overlay');
        if (overlay) overlay.remove();
        if (this.gameScene && this.gameScene.cameraMode === 'firstPerson') {
            this.gameScene.renderer.domElement.requestPointerLock();
        }
    }

    showFactionChangeError(message) {
        const el = document.getElementById('faction-change-error');
        if (el) el.textContent = message;
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
            <div>Faction: <span style="color: ${factionColor};">${getFactionDisplayName(character.faction)}</span></div>
            <div>Health: <span id="stat-health">${this.gameScene.localPlayer ? this.gameScene.localPlayer.health : 100}</span></div>
            <div>Level: ${character.level}</div>
            <div>Reputation: <span id="stat-reputation">${character.reputation}</span> / ${character.reputationForNextLevel}</div>
            <div>Money: $<span id="stat-money">${character.money}</span></div>
            <div>Weapon: <span id="stat-weapon">${this.gameScene.currentWeapon}</span> <span style="opacity:0.6">(1-4 to switch)</span></div>
            <div>Wanted: <span id="stat-wanted">—</span></div>
            <div style="opacity:0.6; margin-top: 4px; font-size: 12px;">Press <b>H</b> for controls</div>
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

    updateWantedStars(stars) {
        const wantedEl = document.getElementById('stat-wanted');
        if (wantedEl) {
            wantedEl.textContent = stars > 0 ? '★'.repeat(stars) : '—';
            wantedEl.style.color = stars > 0 ? '#ffca28' : '';
        }
    }

    // Contextual "[F] do thing" prompt above the hotbar area. Pass null to hide.
    setInteractPrompt(text) {
        if (this._interactPromptText === text) return;
        this._interactPromptText = text;
        let prompt = document.getElementById('interact-prompt');
        if (!text) {
            if (prompt) prompt.style.display = 'none';
            return;
        }
        if (!prompt) {
            prompt = document.createElement('div');
            prompt.id = 'interact-prompt';
            prompt.style.cssText = `
                position: fixed;
                bottom: 140px;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(0, 0, 0, 0.75);
                color: #aed581;
                padding: 8px 16px;
                border-radius: 5px;
                font-family: Arial, sans-serif;
                font-size: 15px;
                z-index: 850;
                pointer-events: none;
            `;
            document.body.appendChild(prompt);
        }
        prompt.textContent = text;
        prompt.style.display = 'block';
    }

    // Fullscreen "you're in jail" overlay with a live countdown.
    showJailOverlay(seconds) {
        this.hideJailOverlay();
        const overlay = document.createElement('div');
        overlay.id = 'jail-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.8);
            color: #90a4ae;
            padding: 20px 40px;
            border-radius: 8px;
            border: 2px solid #546e7a;
            font-family: Arial, sans-serif;
            text-align: center;
            z-index: 1000;
        `;
        const releaseAt = Date.now() + seconds * 1000;
        const render = () => {
            const left = Math.max(0, Math.ceil((releaseAt - Date.now()) / 1000));
            overlay.innerHTML = `
                <div style="font-size: 28px; font-weight: bold;">🚔 ARRESTED</div>
                <div style="margin-top: 6px;">Released in <span style="color: #fff; font-weight: bold;">${left}s</span></div>
            `;
        };
        render();
        this._jailInterval = setInterval(render, 500);
        document.body.appendChild(overlay);
    }

    hideJailOverlay() {
        clearInterval(this._jailInterval);
        const overlay = document.getElementById('jail-overlay');
        if (overlay) overlay.remove();
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
            ['now', 'Now'], ['day', 'Today'], ['week', 'Week'], ['year', 'Year']
        ];
        const active = this._leaderboardTab;
        const entries = (this._rankings && this._rankings[active]) || [];

        const rows = entries.length
            ? entries.map((e, i) =>
                `<div><span style="opacity:0.6">${i + 1}.</span> <span style="color:${factionColor(e.faction)}">${e.name}</span> — ${active === 'now' ? e.reputation : e.score} rep</div>`
              ).join('')
            : `<div style="opacity:0.6">${active === 'now' ? 'Nobody online' : 'No data yet'}</div>`;

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

    // "H" key: full controls reference. A first-time player has no other
    // way to discover half of these (E/F/G/N/Tab aren't hinted anywhere
    // on screen), so keep this in sync whenever a new key binding is added.
    isHelpOpen() {
        return !!document.getElementById('help-overlay');
    }

    showHelp() {
        if (this.isHelpOpen()) return;
        if (document.pointerLockElement) document.exitPointerLock();

        const overlay = document.createElement('div');
        overlay.id = 'help-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.85);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1300;
            font-family: Arial, sans-serif;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            background-color: rgba(20, 20, 20, 0.95);
            color: white;
            padding: 30px 40px;
            border-radius: 8px;
            border: 2px solid #666;
            min-width: 420px;
            max-width: 90vw;
        `;

        const row = (keys, desc) => `
            <div style="display:flex; justify-content:space-between; gap:24px; padding:4px 0;">
                <span style="color:#ffb74d; font-weight:bold; white-space:nowrap;">${keys}</span>
                <span style="opacity:0.85; text-align:right;">${desc}</span>
            </div>
        `;

        const section = (title, rows) => `
            <div style="margin-top:16px;">
                <div style="font-size:13px; font-weight:bold; opacity:0.6; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">${title}</div>
                ${rows}
            </div>
        `;

        panel.innerHTML = `
            <div style="font-size:26px; font-weight:bold; margin-bottom:4px;">Controls</div>
            <div style="opacity:0.6; font-size:13px;">Press H or Esc to close</div>
            ${section('Movement', [
                row('WASD / Arrows', 'Move'),
                row('Space', 'Jump')
            ].join(''))}
            ${section('Camera', [
                row('V', 'Toggle first-person / top-down'),
                row('Mouse', 'Look around (first-person)'),
                row('Scroll', 'Zoom (top-down)'),
                row('Right-click', 'Aim down sights (sniper)')
            ].join(''))}
            ${section('Combat', [
                row('Left-click', 'Shoot (hold for SMG auto-fire)'),
                row('1 / 2 / 3 / 4', 'Pistol / Shotgun / SMG / Sniper')
            ].join(''))}
            ${section('Interaction', [
                row('E', 'Open/close the shop (near STORE)'),
                row('F', 'Talk to contact / revive / arrest'),
                row('M', 'Accept a pending mission'),
                row('G', 'Dance emote')
            ].join(''))}
            ${section('Social', [
                row('N', 'Switch faction'),
                row('Tab (hold)', 'Show online roster'),
                row('H', 'Toggle this help')
            ].join(''))}
        `;

        overlay.appendChild(panel);
        overlay.onclick = (event) => {
            if (event.target === overlay) this.hideHelp();
        };
        document.body.appendChild(overlay);
    }

    hideHelp() {
        const overlay = document.getElementById('help-overlay');
        if (overlay) overlay.remove();
        if (this.gameScene && this.gameScene.cameraMode === 'firstPerson') {
            this.gameScene.renderer.domElement.requestPointerLock();
        }
    }

    // Hold-Tab roster: who's online per faction, plus how many bots are
    // currently active. Pure display -- pointer-events: none so it never
    // steals the click that would otherwise go to gameplay, and it doesn't
    // touch pointer lock (unlike the shop/respawn/faction menus) since
    // there's nothing to click.
    showRoster({ players, bots }) {
        let panel = document.getElementById('roster-overlay');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'roster-overlay';
            panel.style.cssText = `
                position: fixed;
                top: 60px;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(10, 10, 10, 0.9);
                color: white;
                padding: 20px 30px;
                border-radius: 8px;
                border: 2px solid #555;
                font-family: Arial, sans-serif;
                z-index: 1150;
                min-width: 420px;
                pointer-events: none;
            `;
            document.body.appendChild(panel);
        }

        const factionColor = (faction) =>
            faction === 'Criminal' ? '#ff5252' : faction === 'Enforcer' ? '#64b5f6' : '#81c784';

        const column = (faction, label) => {
            const entries = players.filter(p => p.faction === faction);
            const rows = entries.length
                ? entries.map(p => `<div style="opacity:${p.isAlive ? '1' : '0.4'};">${p.isLocal ? '&#10148; ' : ''}${p.name}${p.isAlive ? '' : ' (down)'}</div>`).join('')
                : '<div style="opacity:0.5;">Nobody online</div>';
            const botCount = bots[faction] || 0;
            return `
                <div style="flex:1; min-width:180px;">
                    <div style="font-weight:bold; color:${factionColor(faction)}; margin-bottom:6px;">${label} (${entries.length})</div>
                    ${rows}
                    <div style="opacity:0.6; font-size:12px; margin-top:6px;">${botCount} active bot${botCount === 1 ? '' : 's'}</div>
                </div>
            `;
        };

        const civilianBots = bots.Civilian || 0;
        panel.innerHTML = `
            <div style="font-weight:bold; margin-bottom:12px; text-align:center;">Online</div>
            <div style="display:flex; gap:24px;">
                ${column('Criminal', getFactionDisplayName('Criminal'))}
                ${column('Enforcer', 'Enforcer')}
            </div>
            <div style="opacity:0.5; font-size:12px; margin-top:12px; text-align:center;">${civilianBots} civilian bot${civilianBots === 1 ? '' : 's'} active</div>
        `;
    }

    hideRoster() {
        const panel = document.getElementById('roster-overlay');
        if (panel) panel.remove();
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
                    <span style="color:${color}; width:62px; font-size:12px;">${getFactionDisplayName(faction)}</span>
                    <div style="flex:1; height:10px; background:rgba(255,255,255,0.15); border-radius:3px; overflow:hidden;">
                        <div id="round-bar-${faction}" style="width:0%; height:100%; background:${color}; transition:width 0.3s;"></div>
                    </div>
                </div>
            `;
            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-weight:bold;">
                    <span>Round</span><span id="round-timer">--:--</span>
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

    hasActiveMission() {
        return !!this._missionActive;
    }

    showMissionOffer(offer) {
        this._pendingMissionOffer = true;
        this._missionActive = false;
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
        this._missionActive = true;
        const panel = this.ensureMissionPanel();
        panel.innerHTML = `
            <div style="font-weight: bold; color: #ffb74d; margin-bottom: 3px;">${update.title}</div>
            <div>${update.objective}</div>
        `;
    }

    // Flash a completion/failure message, then clear the panel.
    showMissionResult(html) {
        this._pendingMissionOffer = false;
        this._missionActive = false;
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
        // Interactive menus need a visible, free-moving cursor -- pointer
        // lock (used for FPS mouselook) hides it and eats all mouse
        // movement, so buttons would be unclickable without an ESC first.
        if (document.pointerLockElement) document.exitPointerLock();
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
        const ownedWeapons = (character && character.weapons) || [];
        const cosmetics = (character && character.cosmetics) || [];
        const equipped = character ? character.equippedCosmetic : null;

        const buyButtonStyle = 'padding: 6px 14px; background: #ff9800; color: #111; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;';
        const equipButtonStyle = 'padding: 6px 14px; background: #455a64; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;';

        const SHOP_WEAPONS = {
            shotgun: { name: 'Shotgun', desc: '6 pellets, brutal up close', price: 50 },
            smg: { name: 'SMG', desc: 'Hold click to spray', price: 120 },
            sniper: { name: 'Sniper', desc: 'Right-click to zoom, huge damage', price: 200 }
        };

        const weaponRow = (id, item) => {
            const owned = ownedWeapons.includes(id);
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 8px 10px; background: rgba(255,255,255,0.06); border-radius: 5px; margin-top: 6px;">
                    <div>
                        <div style="font-weight: bold;">${item.name}</div>
                        <div style="font-size: 12px; opacity: 0.7;">${item.desc}</div>
                    </div>
                    ${owned
                        ? '<span style="color: #81c784; font-weight: bold;">OWNED</span>'
                        : `<button data-buy-weapon="${id}" style="${buyButtonStyle}">Buy $${item.price}</button>`}
                </div>
            `;
        };

        const cosmeticRow = (id, item) => {
            const owned = cosmetics.includes(id);
            const isEquipped = equipped === id;
            let action;
            if (!owned) {
                action = `<button data-buy-cosmetic="${id}" style="${buyButtonStyle}">Buy $${item.price}</button>`;
            } else if (isEquipped) {
                action = `<button data-equip-cosmetic="none" style="${equipButtonStyle}">Unequip</button>`;
            } else {
                action = `<button data-equip-cosmetic="${id}" style="${equipButtonStyle}">Equip</button>`;
            }
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 8px 10px; background: rgba(255,255,255,0.06); border-radius: 5px; margin-top: 6px;">
                    <div style="font-weight: bold;">${item.name}${isEquipped ? ' <span style="color:#81c784; font-size:11px;">(worn)</span>' : ''}</div>
                    ${action}
                </div>
            `;
        };

        overlay.innerHTML = `
            <div style="font-size: 22px; font-weight: bold; color: #ff9800; margin-bottom: 4px;">STORE</div>
            <div style="opacity: 0.7; margin-bottom: 14px;">Your money: $<span id="shop-money">${money}</span></div>
            <div style="font-size: 13px; font-weight: bold; opacity: 0.7; margin-bottom: 4px;">WEAPONS</div>
            ${Object.entries(SHOP_WEAPONS).map(([id, item]) => weaponRow(id, item)).join('')}
            <div style="font-size: 13px; font-weight: bold; opacity: 0.7; margin: 12px 0 0;">COSMETICS</div>
            ${Object.entries(COSMETICS).map(([id, item]) => cosmeticRow(id, item)).join('')}
            <div id="shop-error" style="color: #ff5252; font-size: 13px; min-height: 18px; margin-top: 8px;"></div>
            <div style="opacity: 0.5; font-size: 12px; margin-top: 6px;">Press E to close</div>
        `;

        overlay.querySelectorAll('[data-buy-weapon]').forEach(btn => {
            btn.onclick = () => this.gameScene.network.buyWeapon(btn.dataset.buyWeapon);
        });
        overlay.querySelectorAll('[data-buy-cosmetic]').forEach(btn => {
            btn.onclick = () => this.gameScene.network.buyCosmetic(btn.dataset.buyCosmetic);
        });
        overlay.querySelectorAll('[data-equip-cosmetic]').forEach(btn => {
            const id = btn.dataset.equipCosmetic;
            btn.onclick = () => this.gameScene.network.equipCosmetic(id === 'none' ? null : id);
        });
    }


    showShopError(message) {
        const errorEl = document.getElementById('shop-error');
        if (errorEl) errorEl.textContent = message;
    }

    closeShop() {
        const overlay = document.getElementById('shop-overlay');
        if (overlay) overlay.remove();
        // Back to normal gameplay -- re-capture the mouse for FPS look
        // instead of leaving the cursor visible until the next stray click.
        if (this.gameScene && this.gameScene.cameraMode === 'firstPerson') {
            this.gameScene.renderer.domElement.requestPointerLock();
        }
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