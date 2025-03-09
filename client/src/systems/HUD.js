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
} 