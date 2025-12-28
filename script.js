const tg = window.Telegram.WebApp;
tg.expand();
tg.setHeaderColor('#2e7d32');

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_NAMES = {'6':'6', '7':'7', '8':'8', '9':'9', '10':'10', 'J':'В', 'Q':'Д', 'K':'К', 'A':'Т'};
const VALUES = {'6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14};
const BOT_DELAY = 2000; // Чуть ускорил ботов для динамики

// --- ЗВУКОВОЙ МЕНЕДЖЕР ---
const soundManager = {
    ctx: null,
    enabled: true,
    init: function() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    playTone: function(freq, type, duration, vol = 0.1) {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    playClick: function() { this.playTone(600, 'sine', 0.1); },
    playCard: function() { this.playTone(300, 'triangle', 0.1, 0.05); },
    playWin: function() { 
        if (!this.enabled || !this.ctx) return;
        [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.playTone(f, 'sine', 0.4, 0.2), i*150));
    },
    playLose: function() {
        if (!this.enabled || !this.ctx) return;
        [300, 250, 200, 150].forEach((f, i) => setTimeout(() => this.playTone(f, 'sawtooth', 0.5, 0.2), i*250));
    }
};

// --- ПРИЛОЖЕНИЕ ---
const app = {
    settings: { botCount: 3, mode: 'normal', sound: true },
    stats: { wins: 0, losses: 0 },
    isGameActive: false,

    init: function() {
        this.loadStats();
        const el = document.getElementById('game-mode-select');
        if(el) el.addEventListener('change', (e) => { this.setMode(e.target.value); });
        this.updateSettingsUI();
    },

    openSettings: function() {
        document.getElementById('settings-modal').classList.remove('hidden');
        soundManager.init(); soundManager.playClick();
    },
    closeSettings: function() {
        document.getElementById('settings-modal').classList.add('hidden');
        soundManager.playClick();
    },
    setBotCount: function(n) {
        this.settings.botCount = n;
        this.updateSettingsUI();
        soundManager.playClick();
    },
    setMode: function(m) {
        this.settings.mode = m;
        this.updateSettingsUI();
        soundManager.playClick();
    },
    toggleSound: function() {
        this.settings.sound = !this.settings.sound;
        soundManager.enabled = this.settings.sound;
        if(this.settings.sound) soundManager.init();
        this.updateSettingsUI();
        soundManager.playClick();
    },
    updateSettingsUI: function() {
        [1,2,3].forEach(n => {
            const btn = document.getElementById(`btn-bot-${n}`);
            if(n === this.settings.botCount) btn.classList.add('active'); else btn.classList.remove('active');
        });
        document.getElementById('btn-mode-normal').classList.toggle('active', this.settings.mode === 'normal');
        document.getElementById('btn-mode-transfer').classList.toggle('active', this.settings.mode === 'transfer');
        const sndBtn = document.getElementById('btn-sound');
        sndBtn.innerText = this.settings.sound ? "ВКЛЮЧЕН 🔊" : "ВЫКЛЮЧЕН 🔇";
        sndBtn.classList.toggle('active', this.settings.sound);
    },

    startGame: function() {
        soundManager.init();
        this.isGameActive = true;
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        game.startNewGame(this.settings.botCount, this.settings.mode);
        soundManager.playClick();
    },

    toMenu: function() {
        this.isGameActive = false;
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
    },
    exitGame: function() { tg.close(); },

    showStats: function() {
        document.getElementById('stat-wins').innerText = this.stats.wins;
        document.getElementById('stat-losses').innerText = this.stats.losses;
        document.getElementById('stats-modal').classList.remove('hidden');
        soundManager.playClick();
    },
    closeStats: function() { document.getElementById('stats-modal').classList.add('hidden'); soundManager.playClick(); },
    
    saveStats: function(isWin) {
        if(isWin) this.stats.wins++; else this.stats.losses++;
        localStorage.setItem('durak_stats_v3', JSON.stringify(this.stats));
    },
    loadStats: function() {
        const data = localStorage.getItem('durak_stats_v3');
        if(data) this.stats = JSON.parse(data);
    }
};

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.value = VALUES[rank];
        this.isRed = (suit === '♥' || suit === '♦');
        this.name = RANK_NAMES[rank];
    }
}

class DurakGame {
    constructor() {
        this.players = [];
        this.deck = [];
        this.trump = null;
        this.table = [];
        this.attackerIdx = 0;
        this.defenderIdx = 1;
        this.selectedCardIdx = null;
        this.gameMode = 'normal';
    }

    startNewGame(botCount, mode) {
        this.gameMode = mode;
        this.players = [];
        this.players.push({ id: 0, visualId: 'me', type: 'human', name: "Вы", hand: [] });

        if (botCount === 1) {
            this.players.push({ id: 1, visualId: 'p2', type: 'bot', name: "Женя", hand: [] });
        } else if (botCount === 2) {
            this.players.push({ id: 1, visualId: 'p1', type: 'bot', name: "Лиза", hand: [] });
            this.players.push({ id: 2, visualId: 'p3', type: 'bot', name: "Коля", hand: [] });
        } else {
            this.players.push({ id: 1, visualId: 'p1', type: 'bot', name: "Лиза", hand: [] });
            this.players.push({ id: 2, visualId: 'p2', type: 'bot', name: "Женя", hand: [] });
            this.players.push({ id: 3, visualId: 'p3', type: 'bot', name: "Коля", hand: [] });
        }

        this.updateVisualVisibility();
        this.createDeck();
        this.dealCards(6);
        this.determineFirstAttacker();
        this.updateUI();
        this.processTurn();
    }

    updateVisualVisibility() {
        ['p1', 'p2', 'p3'].forEach(vid => {
            const zone = document.getElementById(vid);
            const exists = this.players.some(p => p.visualId === vid);
            if (exists) zone.classList.remove('inactive'); else zone.classList.add('inactive');
        });
    }

    createDeck() {
        this.deck = [];
        for (let s of SUITS) for (let r of RANKS) this.deck.push(new Card(s, r));
        this.deck.sort(() => Math.random() - 0.5);
        this.trump = this.deck[0];
    }

    determineFirstAttacker() {
        let minTrump = 100; let startIdx = 0;
        this.players.forEach((p, idx) => {
            p.hand.forEach(c => {
                if(c.suit === this.trump.suit && c.value < minTrump) { minTrump = c.value; startIdx = idx; }
            });
        });
        this.attackerIdx = startIdx;
        this.defenderIdx = (startIdx + 1) % this.players.length;
    }

    dealCards(count) {
        let pIdx = this.attackerIdx;
        let anyDealt = false;
        for(let i=0; i < this.players.length; i++) {
            while(this.players[pIdx].hand.length < count && this.deck.length > 0) {
                this.players[pIdx].hand.push(this.deck.pop());
                anyDealt = true;
            }
            this.sortHand(this.players[pIdx].hand);
            pIdx = (pIdx + 1) % this.players.length;
        }
        if (anyDealt) soundManager.playCard();
    }

    sortHand(hand) {
        hand.sort((a, b) => {
            if (a.suit === this.trump.suit && b.suit !== this.trump.suit) return 1;
            if (a.suit !== this.trump.suit && b.suit === this.trump.suit) return -1;
            if (a.suit === b.suit) return a.value - b.value;
            return a.suit.localeCompare(b.suit);
        });
    }

    processTurn() {
        if (!app.isGameActive) return;

        this.selectedCardIdx = null;
        this.highlightActivePlayer();
        this.updateUI();

        const attacker = this.players[this.attackerIdx];
        const defender = this.players[this.defenderIdx];

        if (this.table.length === 0) {
            if(attacker.id === 0) this.showMessage("ВАШ ХОД");
            else this.showMessage(`ХОДИТ ${attacker.name.toUpperCase()}`);
        }

        if (attacker.type === 'bot' && this.table.every(p => p.defend)) {
            setTimeout(() => { if(app.isGameActive) this.botAttack(); }, BOT_DELAY);
        } else if (defender.type === 'bot' && this.table.some(p => !p.defend)) {
            setTimeout(() => { if(app.isGameActive) this.botDefend(); }, BOT_DELAY);
        }
    }

    selectCard(idx) {
        if (this.players[0].type !== 'human') return;
        soundManager.playClick();
        if (this.selectedCardIdx === idx) {
            this.selectedCardIdx = null;
        } else {
            this.selectedCardIdx = idx;
        }
        this.updateUI();
    }

    playerButtonAction() {
        if (this.selectedCardIdx === null) return;
        soundManager.playClick();
        const cardIdx = this.selectedCardIdx;
        const card = this.players[0].hand[cardIdx];

        if (this.attackerIdx === 0) {
            if (this.canAttack(card)) {
                this.playCard(0, cardIdx, 'attack');
                this.selectedCardIdx = null;
            } else {
                this.showMessage("НЕЛЬЗЯ ПОДКИНУТЬ");
            }
        } else if (this.defenderIdx === 0) {
             if (this.gameMode === 'transfer' && this.table.length > 0 && this.table.every(p => !p.defend)) {
                 if (card.rank === this.table[0].attack.rank) {
                     this.playCard(0, cardIdx, 'transfer');
                     this.selectedCardIdx = null;
                     return;
                 }
            }
            const attackCard = this.getLastUnbeaten();
            if (attackCard) {
                if (this.canBeat(attackCard, card)) {
                    this.playCard(0, cardIdx, 'defend');
                    this.selectedCardIdx = null;
                } else {
                    this.showMessage("НЕ ПОБИТЬ");
                }
            }
        }
    }

    playerPass() {
        soundManager.playClick();
        if (this.attackerIdx === 0) {
            if(this.table.length > 0 && this.isTableCovered()) this.endBout(false);
        } else if (this.defenderIdx === 0) {
            this.takeCards(0);
        }
    }

    playCard(playerId, cardIdx, type) {
        soundManager.playCard();
        const p = this.players[playerId];
        const card = p.hand.splice(cardIdx, 1)[0];
        
        if (type === 'transfer') {
            this.table.push({ attack: card, defend: null });
            this.showMessage("ПЕРЕВОД!");
            this.attackerIdx = this.defenderIdx;
            this.defenderIdx = (this.attackerIdx + 1) % this.players.length;
        } else if (type === 'attack') {
            this.table.push({ attack: card, defend: null });
        } else {
            // ФИКС ЗАВИСАНИЯ:
            // Ищем ПЕРВУЮ свободную пару, а не просто добавляем в конец или в последнюю.
            // Это важно, когда на столе куча карт после переводов.
            const pair = this.table.find(p => !p.defend);
            if (pair) pair.defend = card;
        }
        this.updateUI();
        this.processTurn();
    }

    // --- БОТЫ ---
    botAttack() {
        if (!app.isGameActive || this.attackerIdx === 0) return;
        
        // Защита от глюка "Бот ходит за меня":
        // Бот не должен подкидывать, если на столе лежат неотбитые карты (после перевода)
        if (!this.table.every(p => p.defend) && this.table.length > 0) return;

        const bot = this.players[this.attackerIdx];

        if (this.table.length === 0) {
            const idx = this.findMinCard(bot.hand);
            if (idx !== -1) this.playCard(this.attackerIdx, idx, 'attack');
            return;
        }

        let tossIdx = -1; let minVal = 100;
        bot.hand.forEach((c, i) => {
            if (this.canAttack(c)) {
                let v = c.value + (c.suit === this.trump.suit ? 20 : 0);
                if (v < minVal) { minVal = v; tossIdx = i; }
            }
        });

        if (tossIdx !== -1 && this.table.length < 6) {
            this.playCard(this.attackerIdx, tossIdx, 'attack');
        } else {
            this.showMessage("БИТО!");
            setTimeout(() => { if(app.isGameActive) this.endBout(false); }, 2000);
        }
    }

    botDefend() {
        if (!app.isGameActive) return;
        const bot = this.players[this.defenderIdx];
        const attack = this.getLastUnbeaten();
        if (!attack) return;

        if (this.gameMode === 'transfer' && this.table.every(p => !p.defend)) {
            const tIdx = bot.hand.findIndex(c => c.rank === attack.rank);
            if (tIdx !== -1) { this.playCard(this.defenderIdx, tIdx, 'transfer'); return; }
        }

        let bestIdx = -1; let minVal = 100;
        bot.hand.forEach((c, i) => {
            if (this.canBeat(attack, c)) {
                let v = c.value + (c.suit === this.trump.suit ? 20 : 0);
                if (v < minVal) { minVal = v; bestIdx = i; }
            }
        });

        if (bestIdx !== -1) {
            this.playCard(this.defenderIdx, bestIdx, 'defend');
        } else {
            this.showMessage(`${bot.name.toUpperCase()} БЕРЁТ`);
            setTimeout(() => { if(app.isGameActive) this.takeCards(this.defenderIdx); }, 2000);
        }
    }

    // --- Helpers ---
    canAttack(c) {
        if (this.table.length === 0) return true;
        const ranks = new Set();
        this.table.forEach(p => { ranks.add(p.attack.rank); if(p.defend) ranks.add(p.defend.rank); });
        return ranks.has(c.rank);
    }
    canBeat(att, def) {
        if (def.suit === this.trump.suit && att.suit !== this.trump.suit) return true;
        return (def.suit === att.suit && def.value > att.value);
    }
    
    // ФИКС ЗАВИСАНИЯ:
    // Ищем ПЕРВУЮ карту, которую еще не отбили, а не последнюю в массиве.
    getLastUnbeaten() {
        const pair = this.table.find(p => !p.defend);
        return pair ? pair.attack : null;
    }
    
    findMinCard(hand) {
        let idx = -1; let min = 100;
        hand.forEach((c, i) => {
            let v = c.value + (c.suit === this.trump.suit ? 20 : 0);
            if (v < min) { min = v; idx = i; }
        });
        return idx;
    }
    isTableCovered() { return this.table.every(p => p.defend !== null); }

    takeCards(pid) {
        soundManager.playCard();
        this.table.forEach(p => {
            this.players[pid].hand.push(p.attack);
            if(p.defend) this.players[pid].hand.push(p.defend);
        });
        this.endBout(true);
    }

    endBout(took) {
        this.table = [];
        this.dealCards(6);
        if (this.checkWin()) return; 

        if (took) this.attackerIdx = (this.defenderIdx + 1) % this.players.length;
        else this.attackerIdx = this.defenderIdx;
        this.defenderIdx = (this.attackerIdx + 1) % this.players.length;
        this.processTurn();
    }

    checkWin() {
        if (this.deck.length > 0) return false;

        const human = this.players[0];
        // Победа: карт нет у игрока
        if (human.hand.length === 0) {
            app.isGameActive = false;
            soundManager.playWin();
            setTimeout(() => {
                alert("Поздравляем! Карты закончились. Вы победили!");
                app.saveStats(true);
                app.toMenu();
            }, 500);
            return true;
        }

        // Проигрыш: У всех ботов нет карт, а у игрока есть
        const botsWithCards = this.players.filter(p => p.id !== 0 && p.hand.length > 0);
        if (botsWithCards.length === 0) {
            app.isGameActive = false;
            soundManager.playLose();
            setTimeout(() => {
                alert("Все соперники вышли. Вы остались дураком!");
                app.saveStats(false);
                app.toMenu();
            }, 500);
            return true;
        }
        return false;
    }

    showMessage(text) {
        const el = document.getElementById('big-message');
        el.innerText = text;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 3000);
    }

    highlightActivePlayer() {
        ['.name-tag.me', '#p1 .name-tag', '#p2 .name-tag', '#p3 .name-tag'].forEach(s => {
            const el = document.querySelector(s);
            if(el) el.classList.remove('active-turn');
        });
        let active = this.attackerIdx;
        if(this.table.length > 0 && !this.table[this.table.length-1].defend) active = this.defenderIdx;
        
        const p = this.players[active];
        let sel = (p.id === 0) ? '.name-tag.me' : `#${p.visualId} .name-tag`;

        const el = document.querySelector(sel);
        if(el) el.classList.add('active-turn');
    }

    updateUI() {
        document.getElementById('deck-count').innerText = this.deck.length;
        const tIcon = document.getElementById('trump-icon');
        if(this.trump) {
            tIcon.innerText = this.trump.suit;
            tIcon.style.color = (this.trump.suit === '♥' || this.trump.suit === '♦') ? '#d32f2f' : 'black';
        }

        const mainBtn = document.getElementById('action-btn');
        const secBtn = document.getElementById('pass-btn');
        mainBtn.className = "main-btn";
        mainBtn.disabled = true;
        secBtn.classList.remove('visible');

        if (this.attackerIdx === 0) {
            if (this.table.length > 0 && this.isTableCovered()) {
                secBtn.innerText = "БИТО";
                secBtn.classList.add('visible');
            }
            if (this.selectedCardIdx !== null) {
                mainBtn.innerText = "ПОЙТИ ЭТОЙ КАРТОЙ";
                mainBtn.classList.add('ready');
                mainBtn.disabled = false;
            } else {
                if (this.table.length === 0) {
                    mainBtn.innerText = "ВЫБЕРИТЕ КАРТУ";
                    mainBtn.classList.add('active-info');
                } else {
                    mainBtn.innerText = "ПОДКИДЫВАЙТЕ КАРТУ";
                }
            }
        } else if (this.defenderIdx === 0) {
            if (this.selectedCardIdx !== null) {
                // UI ТЕКСТ: ПЕРЕВОД ИЛИ ЗАЩИТА
                const card = this.players[0].hand[this.selectedCardIdx];
                const canTransfer = (this.gameMode === 'transfer' && 
                                     this.table.length > 0 && 
                                     this.table.every(p => !p.defend) && 
                                     card.rank === this.table[0].attack.rank);
                
                mainBtn.innerText = canTransfer ? "ПЕРЕВЕСТИ" : "ОТБИТЬСЯ ЭТОЙ";
                mainBtn.classList.add('ready');
                mainBtn.disabled = false;
            } else {
                const attack = this.getLastUnbeaten();
                if (attack) {
                    mainBtn.innerText = "ВЗЯТЬ (НА ВАС ИДУТ)";
                    mainBtn.classList.add('active-info');
                    mainBtn.disabled = false;
                    mainBtn.onclick = () => {
                         if(this.selectedCardIdx !== null) this.playerButtonAction();
                         else this.takeCards(0);
                    };
                } else {
                    mainBtn.innerText = "ЖДИТЕ ХОДА...";
                }
            }
        } else {
            mainBtn.innerText = "ХОДЯТ БОТЫ...";
        }

        const tbl = document.getElementById('active-table');
        tbl.innerHTML = '';
        this.table.forEach(pair => {
            const d = document.createElement('div'); d.className='pair';
            d.innerHTML = this.renderCard(pair.attack, 'attack');
            if(pair.defend) d.innerHTML += this.renderCard(pair.defend, 'defend');
            tbl.appendChild(d);
        });

        this.players.forEach(p => {
            if(p.type === 'bot') {
                const z = document.getElementById(p.visualId).querySelector('.hand');
                if(z) {
                    z.innerHTML = '';
                    p.hand.forEach(() => { z.innerHTML += '<div class="card-back"></div>'; });
                }
            }
        });

        const my = document.getElementById('my-hand');
        my.innerHTML = '';
        this.players[0].hand.forEach((c, i) => {
            const el = document.createElement('div');
            el.className = `card ${c.isRed ? 'red' : 'black'} ${this.selectedCardIdx === i ? 'selected' : ''}`;
            el.innerHTML = `
                <div class="top-idx"><span>${c.name}</span><span>${c.suit}</span></div>
                <div class="center-suit">${c.suit}</div>
                <div class="bot-idx"><span>${c.name}</span><span>${c.suit}</span></div>`;
            el.onclick = () => this.selectCard(i);
            my.appendChild(el);
        });
    }

    renderCard(c, type) {
        return `<div class="card ${type} ${c.isRed ? 'red' : 'black'}">
             <div class="top-idx"><span>${c.name}</span><span>${c.suit}</span></div>
             <div class="center-suit">${c.suit}</div>
             <div class="bot-idx"><span>${c.name}</span><span>${c.suit}</span></div>
        </div>`;
    }
}
app.init();
const game = new DurakGame();