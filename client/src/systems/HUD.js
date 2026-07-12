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
        `;
    }

    // Cheap enough to call every frame -- just updates one span's text.
    updateHealthStat(health) {
        const healthEl = document.getElementById('stat-health');
        if (healthEl) healthEl.textContent = Math.max(0, Math.round(health));
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