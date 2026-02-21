// AI Football - Match Analysis Logic

class MatchAnalyzer {
    constructor() {
        this.canvas = document.getElementById('analysisOverlay');
        this.ctx = this.canvas?.getContext('2d');
        this.alerts = document.getElementById('alertFeed');
        this.isAnalyzing = false;
        this.players = [];
        
        this.init();
    }

    init() {
        if (!this.canvas) return;
        
        // Resize canvas to parent
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Setup Start Button
        const startBtn = document.getElementById('startAnalysis');
        startBtn.addEventListener('click', () => {
            this.isAnalyzing = !this.isAnalyzing;
            startBtn.textContent = this.isAnalyzing ? 'Stop Analysis' : 'Run AI Sync';
            startBtn.classList.toggle('btn-primary');
            startBtn.classList.toggle('btn-outline');
            
            if (this.isAnalyzing) {
                this.generatePlayers();
                this.animate();
                this.addAlert('AI Analytics Engine Synchronized', 'primary');
            }
        });
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    generatePlayers() {
        this.players = [];
        for (let i = 0; i < 22; i++) {
            this.players.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                team: i < 11 ? 'home' : 'away',
                id: i + 1
            });
        }
    }

    animate() {
        if (!this.isAnalyzing) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.players.forEach(p => {
            // Move
            p.x += p.vx;
            p.y += p.vy;

            // Bounce
            if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

            // Draw Tracker
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
            this.ctx.strokeStyle = p.team === 'home' ? '#22c55e' : '#3b82f6';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Draw ID
            this.ctx.fillStyle = 'white';
            this.ctx.font = '8px Arial';
            this.ctx.fillText(p.id, p.x - 4, p.y + 3);

            // Draw Vector line
            this.ctx.beginPath();
            this.ctx.moveTo(p.x, p.y);
            this.ctx.lineTo(p.x + p.vx * 10, p.y + p.vy * 10);
            this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            this.ctx.stroke();
        });

        requestAnimationFrame(() => this.animate());
    }

    addAlert(message, type) {
        const div = document.createElement('div');
        div.style.padding = '12px';
        div.style.borderLeft = `3px solid var(--${type})`;
        div.style.background = `rgba(34, 197, 94, 0.1)`;
        div.style.borderRadius = '0 8px 8px 0';
        div.style.marginBottom = '8px';
        div.style.animation = 'float 3s ease-in-out infinite';
        
        div.innerHTML = `
            <p style="font-size: 0.9rem; font-weight: 600;">${message}</p>
            <p style="font-size: 0.8rem; color: var(--text-muted);">Real-time tracking enabled.</p>
        `;
        
        this.alerts.prepend(div);
    }
}

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    new MatchAnalyzer();
});
