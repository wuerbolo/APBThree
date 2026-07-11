export class HUD {
    constructor(gameScene) {
        this.gameScene = gameScene;
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
        const civilianButton = this.createFactionButton('Civilian', '#388e3c', 'Neutral faction that can be targeted by anyone.');
        
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
        
        civilianButton.onclick = () => {
            const name = nameInput.value || `Civilian${Math.floor(Math.random() * 1000)}`;
            this.selectFaction('Civilian', name);
            overlay.remove();
        };
        
        buttonsContainer.appendChild(criminalButton);
        buttonsContainer.appendChild(enforcerButton);
        buttonsContainer.appendChild(civilianButton);
        
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
            <div>Level: ${character.level}</div>
            <div>Reputation: ${character.reputation}</div>
            <div>Money: $${character.money}</div>
        `;
    }
} 