const tg = window.Telegram.WebApp;
tg.expand();

// Проверка версии для цвета шапки
if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) {
    tg.setHeaderColor('#2e7d32');
}

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_NAMES = {'6':'6', '7':'7', '8':'8', '9':'9', '10':'10', 'J':'В', 'Q':'Д', 'K':'К', 'A':'Т'};
const VALUES = {'6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14};
const BOT_DELAY = 1500; 

// --- ЗВУК ---
const soundManager = {
    ctx: null, enabled: true,
    init: function() {
        if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    playTone: function(freq, type, duration, vol=0.1) {
        if (!this.enabled || !this.ctx) return;
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, this.ctx.currentTime);
        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime+duration);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(); o.stop(this.ctx.currentTime+duration);
    },
    playClick: function() { this.playTone(600, 'sine', 0.1); },
    playCard: function() { this.playTone(300, 'triangle', 0.1, 0.05); },
    playWin: function() { if(this.enabled && this.ctx) [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.playTone(f,'sine',0.4,0.2),i*150)); },
    playLose: function() { if(this.enabled && this.ctx) [300,250,200].forEach((f,i)=>setTimeout(()=>this.playTone(f,'sawtooth',0.5,0.2),i*250)); }
};

// --- STORAGE ---
const storage = {
    get: function(key, callback) {
        if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) {
            tg.CloudStorage.getItem(key, (err, val) => {
                if (!err && val) callback(val); else callback(localStorage.getItem(key));
            });
        } else { callback(localStorage.getItem(key)); }
    },
    set: function(key, val) {
        if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) {
            tg.CloudStorage.setItem(key, val, (err, saved) => {});
        }
        localStorage.setItem(key, val);
    },
    remove: function(key) {
        if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) {
            tg.CloudStorage.removeItem(key, (err, del) => {});
        }
        localStorage.removeItem(key);
    }
};

// --- APP ---
const app = {
    settings: { botCount: 3, mode: 'normal', sound: true },
    stats: { wins: 0, losses: 0, score: 0 },
    savedGameState: null,
    isGameActive: false,

    init: function() {
        this.loadStats();
        this.loadSettings();
        this.checkSavedGame();
        const el = document.getElementById('game-mode-select');
        if(el) el.addEventListener('change', (e) => { this.setMode(e.target.value); });
    },

    loadStats: function() {
        storage.get('durak_stats_v8', (data) => {
            if(data) { this.stats = JSON.parse(data); if(!this.stats.score) this.stats.score = 0; }
            this.updateMenuStats();
        });
    },

    loadSettings: function() {
        storage.get('durak_settings_v1', (data) => {
            if (data) {
                const s = JSON.parse(data);
                this.settings = { ...this.settings, ...s };
            }
            this.updateSettingsUI();
        });
    },

    saveSettings: function() { storage.set('durak_settings_v1', JSON.stringify(this.settings)); },

    checkSavedGame: function() {
        storage.get('durak_save_v1', (data) => {
            if (data) {
                this.savedGameState = JSON.parse(data);
                document.getElementById('btn-continue').classList.remove('hidden');
                document.getElementById('btn-newgame').innerText = "▶ НОВАЯ ИГРА";
            } else {
                document.getElementById('btn-continue').classList.add('hidden');
                document.getElementById('btn-newgame').innerText = "▶ ИГРАТЬ";
            }
        });
    },

    saveGame: function(gameStateStr) { storage.set('durak_save_v1', gameStateStr); },
    clearSavedGame: function() { storage.remove('durak_save_v1'); this.savedGameState = null; },

    saveStats: function(isWin) {
        if(isWin) { this.stats.wins++; this.stats.score += 100; } 
        else { this.stats.losses++; this.stats.score = Math.max(0, this.stats.score - 50); }
        storage.set('durak_stats_v8', JSON.stringify(this.stats));
        this.updateMenuStats();
        this.clearSavedGame(); 
    },

    getRankName: function(score) {
        if(score < 200) return "Новичок";
        if(score < 500) return "Любитель";
        if(score < 1000) return "Опытный";
        if(score < 2000) return "Мастер";
        if(score < 5000) return "Шулер";
        return "Легенда";
    },

    updateMenuStats: function() {
        const sc = document.getElementById('menu-score'); if(sc) sc.innerText = `${this.stats.score} очков`;
        const rn = document.getElementById('menu-rank'); if(rn) rn.innerText = this.getRankName(this.stats.score);
    },

    openSettings: function() { document.getElementById('settings-modal').classList.remove('hidden'); soundManager.init(); },
    closeSettings: function() { document.getElementById('settings-modal').classList.add('hidden'); soundManager.playClick(); },
    
    setBotCount: function(n) { this.settings.botCount = n; this.saveSettings(); this.updateSettingsUI(); soundManager.playClick(); },
    setMode: function(m) { this.settings.mode = m; this.saveSettings(); this.updateSettingsUI(); soundManager.playClick(); },
    toggleSound: function() { this.settings.sound = !this.settings.sound; soundManager.enabled = this.settings.sound; if(this.settings.sound) soundManager.init(); this.saveSettings(); this.updateSettingsUI(); soundManager.playClick(); },

    updateSettingsUI: function() {
        [1,2,3].forEach(n => {
            const btn = document.getElementById(`btn-bot-${n}`);
            if(btn) { if(n===this.settings.botCount) btn.classList.add('active'); else btn.classList.remove('active'); }
        });
        const sel = document.getElementById('game-mode-select'); if(sel) sel.value = this.settings.mode;
        const snd = document.getElementById('btn-sound'); if(snd) { snd.innerText = this.settings.sound ? "ВКЛЮЧЕН 🔊" : "ВЫКЛЮЧЕН 🔇"; snd.classList.toggle('active', this.settings.sound); }
    },
    
    startGame: function() {
        if(this.savedGameState && !confirm("Начать новую игру? Текущее сохранение будет удалено.")) return;
        soundManager.init();
        this.clearSavedGame();
        this.isGameActive = true;
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        game.startNewGame(this.settings.botCount, this.settings.mode);
        soundManager.playClick();
    },

    continueGame: function() {
        if (!this.savedGameState) return;
        soundManager.init();
        this.isGameActive = true;
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        game.loadFromState(this.savedGameState);
        soundManager.playClick();
    },

    toMenu: function() {
        if (this.isGameActive) {
            if (!confirm("Выйти в меню? Текущая игра будет потеряна.")) return;
            this.clearSavedGame();
        }
        this.isGameActive = false;
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
        this.checkSavedGame();
    },
    
    exitGame: function() { tg.close(); },
    showStats: function() {
        document.getElementById('stat-wins').innerText = this.stats.wins;
        document.getElementById('stat-losses').innerText = this.stats.losses;
        document.getElementById('stat-score').innerText = this.stats.score;
        document.getElementById('stat-rank').innerText = this.getRankName(this.stats.score);
        document.getElementById('stats-modal').classList.remove('hidden');
        soundManager.playClick();
    },
    closeStats: function() { document.getElementById('stats-modal').classList.add('hidden'); soundManager.playClick(); }
};

class Card {
    constructor(suit, rank) {
        this.suit = suit; this.rank = rank; this.value = VALUES[rank];
        this.isRed = (suit === '♥' || suit === '♦'); this.name = RANK_NAMES[rank];
    }
}

class DurakGame {
    constructor() {
        this.players = []; this.deck = []; this.trump = null; this.table = [];
        this.attackerIdx = 0; this.defenderIdx = 1; 
        this.selectedCardIdx = null; 
        this.gameMode = 'normal';
        this.playerPassedToss = false;
    }

    startNewGame(botCount, mode) {
        this.gameMode = mode;
        this.playerPassedToss = false;
        this.players = [{ id:0, visualId:'me', type:'human', name:"Вы", hand:[], isOut: false }];
        
        const botNames = ["Женя", "Лиза", "Коля"];
        const setup = [
            [{id:1, vid:'p2'}],
            [{id:1, vid:'p1'}, {id:2, vid:'p3'}],
            [{id:1, vid:'p1'}, {id:2, vid:'p2'}, {id:3, vid:'p3'}]
        ][botCount-1];

        setup.forEach((s, i) => {
            this.players.push({ id:s.id, visualId:s.vid, type:'bot', name:botNames[i], hand:[], isOut: false });
        });

        this.createDeck();
        this.dealCards(6);
        this.determineFirstAttacker();
        this.updateVisualVisibility();
        this.saveGameState();
        this.updateUI();
        this.processTurn();
    }

    loadFromState(state) {
        this.gameMode = state.gameMode;
        this.attackerIdx = state.attackerIdx;
        this.defenderIdx = state.defenderIdx;
        this.playerPassedToss = state.playerPassedToss;
        
        this.trump = new Card(state.trump.suit, state.trump.rank);
        this.deck = state.deck.map(c => new Card(c.suit, c.rank));
        
        this.players = state.players.map(p => {
            p.hand = p.hand.map(c => new Card(c.suit, c.rank));
            return p;
        });

        this.table = state.table.map(pair => ({
            attack: new Card(pair.attack.suit, pair.attack.rank),
            defend: pair.defend ? new Card(pair.defend.suit, pair.defend.rank) : null
        }));

        this.updateVisualVisibility();
        this.updateUI();
        this.processTurn();
    }

    saveGameState() {
        const state = {
            gameMode: this.gameMode,
            players: this.players,
            deck: this.deck,
            trump: this.trump,
            table: this.table,
            attackerIdx: this.attackerIdx,
            defenderIdx: this.defenderIdx,
            playerPassedToss: this.playerPassedToss
        };
        app.saveGame(JSON.stringify(state));
    }

    updateVisualVisibility() {
        ['p1','p2','p3'].forEach(vid => {
            const el = document.getElementById(vid);
            const player = this.players.find(p => p.visualId === vid);
            
            if (!player) {
                el.classList.add('inactive');
                el.style.opacity = '0';
                return;
            }
            
            el.classList.remove('inactive');
            el.style.opacity = '1';

            if (player.isOut) {
                el.style.opacity = '0.4';
                el.querySelector('.name-tag').innerText = "✅ " + player.name;
                const z = el.querySelector('.hand');
                if(z) z.innerHTML = '';
            } else {
                el.querySelector('.name-tag').innerText = player.name;
            }
        });
    }

    createDeck() {
        this.deck = [];
        for(let s of SUITS) for(let r of RANKS) this.deck.push(new Card(s, r));
        this.deck.sort(()=>Math.random()-0.5);
        this.trump = this.deck[0];
    }

    determineFirstAttacker() {
        this.attackerIdx = 0; 
        this.defenderIdx = 1;
    }

    getNextActiveIndex(currentIdx) {
        let next = (currentIdx + 1) % this.players.length;
        let loops = 0;
        while (this.players[next].isOut && loops < this.players.length) {
            next = (next + 1) % this.players.length;
            loops++;
        }
        return next;
    }

    dealCards(cnt) {
        let p = this.attackerIdx;
        if (this.players[p].isOut) p = this.getNextActiveIndex(p);

        let anyDealt = false;
        let activeCount = this.players.filter(pl => !pl.isOut).length;
        let attempts = 0;

        while (attempts < activeCount && this.deck.length > 0) {
            if (!this.players[p].isOut) {
                while(this.players[p].hand.length < cnt && this.deck.length > 0) {
                    this.players[p].hand.push(this.deck.pop());
                    anyDealt = true;
                }
                this.sortHand(this.players[p].hand);
            }
            p = (p + 1) % this.players.length;
            if (!this.players[p].isOut) attempts++;
        }
        
        if(anyDealt) soundManager.playCard();
    }

    sortHand(h) {
        h.sort((a,b) => {
            if(a.suit===this.trump.suit && b.suit!==this.trump.suit) return 1;
            if(a.suit!==this.trump.suit && b.suit===this.trump.suit) return -1;
            if(a.suit===b.suit) return a.value - b.value;
            return a.suit.localeCompare(b.suit);
        });
    }

    processTurn() {
        if(!app.isGameActive) return;
        this.selectedCardIdx = null; 
        this.highlightActivePlayer();
        this.updateUI();

        const att = this.players[this.attackerIdx];
        const def = this.players[this.defenderIdx];

        if(this.table.length===0) {
            this.showMessage(att.id===0 ? "ВАШ ХОД" : `ХОДИТ ${att.name.toUpperCase()}`);
        }

        this.saveGameState(); 

        if(att.type==='bot' && this.table.every(p=>p.defend)) {
            setTimeout(()=>{if(app.isGameActive)this.botAttack()}, BOT_DELAY);
        }
        else if(def.type==='bot' && this.table.some(p=>!p.defend)) {
            setTimeout(()=>{if(app.isGameActive)this.botDefend()}, BOT_DELAY);
        }
    }

    selectCard(idx) {
        if(this.players[0].type !== 'human') return;
        if(this.players[0].isOut) return; 

        soundManager.playClick();
        this.selectedCardIdx = (this.selectedCardIdx === idx) ? null : idx;
        this.updateUI();
    }

    playerButtonAction() {
        if(this.selectedCardIdx === null) return;
        soundManager.playClick();
        
        const cardIdx = this.selectedCardIdx;
        const card = this.players[0].hand[cardIdx];

        if(this.attackerIdx === 0) {
            if(this.canAttack(card)) {
                this.playCard(0, cardIdx, 'attack');
            } else {
                this.showMessage("НЕЛЬЗЯ ПОДКИНУТЬ");
                this.selectedCardIdx = null; this.updateUI();
            }
        } 
        else if(this.defenderIdx === 0) {
            if(this.gameMode === 'transfer' && this.table.length > 0 && this.table.every(p => !p.defend) && card.rank === this.table[0].attack.rank) {
                this.playCard(0, cardIdx, 'transfer');
            } else {
                const targetPair = this.table.find(p => !p.defend && this.canBeat(p.attack, card));
                if(targetPair) this.playCard(0, cardIdx, 'defend', targetPair);
                else { this.showMessage("ЭТОЙ НЕ ПОБИТЬ"); this.selectedCardIdx = null; this.updateUI(); }
            }
        }
        else {
            if (this.canAttack(card)) {
                this.playCard(0, cardIdx, 'attack');
            } else {
                this.showMessage("НЕЛЬЗЯ ПОДКИНУТЬ");
            }
        }
    }

    playCard(playerId, cardIdx, type, targetPair = null) {
        const p = this.players[playerId];
        const card = p.hand.splice(cardIdx, 1)[0];
        
        this.selectedCardIdx = null; 
        soundManager.playCard();

        // 1. ПЕРЕВОД
        if (type === 'transfer') {
            this.table.push({ attack: card, defend: null });
            this.showMessage("ПЕРЕВОД!");
            this.attackerIdx = this.defenderIdx;
            this.defenderIdx = this.getNextActiveIndex(this.defenderIdx);
        } 
        // 2. АТАКА
        else if (type === 'attack') {
            this.table.push({ attack: card, defend: null });
        } 
        // 3. ЗАЩИТА
        else { 
            const pair = targetPair || this.table.find(p => !p.defend);
            if(pair) pair.defend = card;
        }

        if (playerId === 0 && type === 'attack') this.playerPassedToss = false; 

        this.updateUI();

        // --- ПРОВЕРКИ ПОСЛЕ ХОДА ---

        // А. МГНОВЕННАЯ ПОБЕДА: если колода пуста и карт нет
        if (this.deck.length === 0 && p.hand.length === 0) {
            this.checkWin(); 
            return;
        }

        // Б. ПРАВИЛО "НЕТ КАРТ - НЕТ ВЗЯТКИ": 
        // Если защищающийся отбился и у него кончились карты - конец боя (БИТО)
        // (При условии, что колода не пуста, иначе сработала бы победа выше)
        if (type === 'defend' && p.hand.length === 0) {
            setTimeout(() => { if(app.isGameActive) this.endBout(false); }, 500);
            return;
        }
        
        // В. ПЕРЕХОД ХОДА БОТАМ
        if (type === 'transfer') {
             const newDef = this.players[this.defenderIdx];
             if (newDef.type === 'bot') setTimeout(() => { if(app.isGameActive) this.botDefend(); }, BOT_DELAY);
             return; 
        }

        if (type === 'defend') {
             if (this.table.every(p=>p.defend)) {
                 const att = this.players[this.attackerIdx];
                 if (att.type === 'bot') setTimeout(() => { if(app.isGameActive) this.botAttack(); }, BOT_DELAY);
             } else {
                 if (this.players[this.defenderIdx].type === 'bot') setTimeout(() => { if(app.isGameActive) this.botDefend(); }, BOT_DELAY);
             }
        }
        
        if (type === 'attack') {
             const def = this.players[this.defenderIdx];
             if (def.type === 'bot') setTimeout(() => { if(app.isGameActive) this.botDefend(); }, BOT_DELAY);
        }
    }

    playerPass() {
        soundManager.playClick();
        if (this.attackerIdx === 0) {
            if(this.table.length > 0 && this.isTableCovered()) this.endBout(false);
        } else if (this.defenderIdx === 0) {
            this.takeCards(0);
        } else {
            this.playerPassedToss = true;
            this.updateUI();
            const att = this.players[this.attackerIdx];
            if (att.type === 'bot') setTimeout(() => { if(app.isGameActive) this.botAttack(); }, 500);
        }
    }

    // --- БОТЫ ---
    botAttack() {
        if (!app.isGameActive || this.attackerIdx === 0) return;
        if (!this.table.every(p => p.defend) && this.table.length > 0) return;

        const bot = this.players[this.attackerIdx];
        const defender = this.players[this.defenderIdx];

        // ВАЖНОЕ ПРАВИЛО: Не подкидывать игроку, у которого нет карт (и колода еще есть)
        // Хотя в playCard мы делаем endBout, но на всякий случай
        if (defender.hand.length === 0) {
            this.endBout(false);
            return;
        }

        if (this.table.length === 0) {
            const idx = this.findMinCard(bot.hand);
            if (idx !== -1) this.botPlayCard(idx, 'attack');
            return;
        }

        let tossIdx = -1; let minVal = 100;
        bot.hand.forEach((c, i) => {
            if (this.canAttack(c)) {
                let v = c.value + (c.suit === this.trump.suit ? 20 : 0);
                if (v < minVal) { minVal = v; tossIdx = i; }
            }
        });

        if (tossIdx !== -1 && this.table.length < 6 && defender.hand.length > (this.table.length - this.table.filter(p=>p.defend).length)) {
            // Проверка: нельзя подкинуть больше карт, чем есть у защищающегося
            // (Упрощенно: если 6 карт уже на столе - не кидаем)
            this.botPlayCard(tossIdx, 'attack');
        } else {
            const player = this.players[0];
            const playerCanToss = !player.isOut && player.hand.some(c => this.canAttack(c));
            
            if (playerCanToss && !this.playerPassedToss && this.defenderIdx !== 0 && defender.hand.length > 0) {
                this.updateUI(); 
                return;
            }

            this.showMessage("БИТО!");
            setTimeout(() => { if(app.isGameActive) this.endBout(false); }, 1500);
        }
    }

    botDefend() {
        if (!app.isGameActive) return;
        const bot = this.players[this.defenderIdx];
        const attack = this.getLastUnbeaten();
        if (!attack || this.players[this.defenderIdx].type !== 'bot') return;

        if (this.gameMode === 'transfer' && this.table.every(p => !p.defend)) {
            const tIdx = bot.hand.findIndex(c => c.rank === attack.rank);
            if (tIdx !== -1) { this.botPlayCard(tIdx, 'transfer'); return; }
        }

        let bestIdx = -1; let minVal = 100;
        bot.hand.forEach((c, i) => {
            if (this.canBeat(attack, c)) {
                let v = c.value + (c.suit === this.trump.suit ? 20 : 0);
                if (v < minVal) { minVal = v; bestIdx = i; }
            }
        });

        if (bestIdx !== -1) {
            this.botPlayCard(bestIdx, 'defend');
        } else {
            this.showMessage(`${bot.name.toUpperCase()} БЕРЁТ`);
            setTimeout(() => { if(app.isGameActive) this.takeCards(this.defenderIdx); }, 1500);
        }
    }

    botPlayCard(idx, type) {
        const activeIdx = (type==='transfer'||type==='defend') ? this.defenderIdx : this.attackerIdx;
        const bot = this.players[activeIdx];
        const card = bot.hand.splice(idx, 1)[0];
        soundManager.playCard();

        if (type === 'transfer') {
            this.table.push({ attack: card, defend: null });
            this.showMessage("ПЕРЕВОД!");
            this.attackerIdx = this.defenderIdx;
            this.defenderIdx = this.getNextActiveIndex(this.defenderIdx);
        } else if (type === 'attack') {
            this.table.push({ attack: card, defend: null });
            this.playerPassedToss = false; 
        } else {
            const pair = this.table.find(p => !p.defend);
            if(pair) pair.defend = card;
        }
        
        this.updateUI();

        // Проверка: если бот защищался и карты кончились
        if (type === 'defend' && bot.hand.length === 0 && this.deck.length > 0) {
             setTimeout(() => { if(app.isGameActive) this.endBout(false); }, 500);
             return;
        }
        
        if (this.deck.length === 0 && bot.hand.length === 0) {
            this.checkWin();
            return;
        }

        if (type === 'transfer') {
             const newDef = this.players[this.defenderIdx];
             if (newDef.type === 'bot') setTimeout(() => { if(app.isGameActive) this.botDefend(); }, BOT_DELAY);
             return;
        }

        if (type === 'defend') {
             if (this.table.every(p=>p.defend)) {
                 const att = this.players[this.attackerIdx];
                 if (att.type === 'bot') setTimeout(() => { if(app.isGameActive) this.botAttack(); }, BOT_DELAY);
             } else {
                 setTimeout(() => { if(app.isGameActive) this.botDefend(); }, BOT_DELAY);
             }
        } else if (type === 'attack') {
             const nextDef = this.players[this.defenderIdx];
             if (nextDef.type === 'bot') setTimeout(() => { if(app.isGameActive) this.botDefend(); }, BOT_DELAY);
        }
    }

    // --- HELPERS ---
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
    getLastUnbeaten() { const pair = this.table.find(p => !p.defend); return pair ? pair.attack : null; }
    findMinCard(hand) {
        let idx = -1; let min = 100;
        hand.forEach((c, i) => { let v = c.value + (c.suit === this.trump.suit ? 20 : 0); if (v < min) { min = v; idx = i; } });
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
        this.playerPassedToss = false; 
        this.updateStatus(); 
        this.dealCards(6);
        
        if (this.checkWin()) return; 

        if (took) this.attackerIdx = this.getNextActiveIndex(this.defenderIdx); 
        else this.attackerIdx = this.defenderIdx; 
        
        this.defenderIdx = this.getNextActiveIndex(this.attackerIdx);
        this.processTurn();
    }

    updateStatus() {
        if (this.deck.length === 0) {
            this.players.forEach(p => {
                if (p.hand.length === 0 && !p.isOut) {
                    p.isOut = true;
                }
            });
            this.updateVisualVisibility();
        }
    }

    checkWin() {
        this.updateStatus();
        const human = this.players[0];
        
        if (human.isOut) {
            app.isGameActive = false; soundManager.playWin();
            setTimeout(() => { alert("Победа! (+100 очков)"); app.saveStats(true); app.toMenu(); }, 500);
            return true;
        }

        const activeCount = this.players.filter(p => !p.isOut).length;
        if (activeCount <= 1) {
            if (!human.isOut) {
                app.isGameActive = false; soundManager.playLose();
                setTimeout(() => { alert("Вы дурак! (-50 очков)"); app.saveStats(false); app.toMenu(); }, 500);
                return true;
            }
        }
        return false;
    }

    showMessage(text) {
        const el = document.getElementById('big-message');
        el.innerText = text; el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 3000);
    }

    highlightActivePlayer() {
        ['.name-tag.me', '#p1 .name-tag', '#p2 .name-tag', '#p3 .name-tag'].forEach(s => {
            const el = document.querySelector(s); if(el) el.classList.remove('active-turn');
        });
        
        let active;
        if(this.table.length > 0 && this.table.some(p => !p.defend)) active = this.defenderIdx;
        else active = this.attackerIdx;
        
        const p = this.players[active];
        let sel = (p.id === 0) ? '.name-tag.me' : `#${p.visualId} .name-tag`;
        const el = document.querySelector(sel); if(el) el.classList.add('active-turn');
    }

    updateUI() {
        document.getElementById('deck-count').innerText = this.deck.length;
        const tIcon = document.getElementById('trump-icon');
        if(this.trump) {
            tIcon.innerText = this.trump.suit;
            tIcon.style.color = (this.trump.suit === '♥' || this.trump.suit === '♦') ? '#d32f2f' : 'black';
        }
        
        this.highlightActivePlayer();

        const mainBtn = document.getElementById('action-btn');
        const secBtn = document.getElementById('pass-btn');
        mainBtn.className = "main-btn"; mainBtn.disabled = true; secBtn.classList.remove('visible');

        if (this.attackerIdx === 0) {
            if (this.table.length > 0 && this.isTableCovered()) { secBtn.innerText = "БИТО"; secBtn.classList.add('visible'); }
            
            if (this.selectedCardIdx !== null) {
                mainBtn.innerText = "ПОЙТИ ЭТОЙ КАРТОЙ";
                mainBtn.classList.add('ready');
                mainBtn.disabled = false;
            } else {
                if (this.table.length === 0) { mainBtn.innerText = "ВЫБЕРИТЕ КАРТУ"; mainBtn.classList.add('active-info'); }
                else {
                    if (!this.isTableCovered()) { mainBtn.innerText = "ЖДИТЕ ОТВЕТА..."; mainBtn.disabled = true; }
                    else {
                        const hasCard = this.players[0].hand.some(c => this.canAttack(c));
                        if(hasCard) mainBtn.innerText = "ПОДКИДЫВАЙТЕ КАРТУ";
                        else { mainBtn.innerText = "ЖМИТЕ БИТО ->"; mainBtn.disabled = true; }
                    }
                }
            }
        } 
        else if (this.defenderIdx === 0) {
            if (this.selectedCardIdx !== null) {
                const card = this.players[0].hand[this.selectedCardIdx];
                const canTransfer = (this.gameMode === 'transfer' && this.table.length > 0 && this.table.every(p => !p.defend) && card.rank === this.table[0].attack.rank);
                
                mainBtn.innerText = canTransfer ? "ПЕРЕВЕСТИ" : "ОТБИТЬСЯ ЭТОЙ";
                mainBtn.classList.add('ready'); mainBtn.disabled = false;
            } else {
                const attack = this.getLastUnbeaten();
                if (attack) {
                    mainBtn.innerText = "ВЗЯТЬ (НА ВАС ИДУТ)"; mainBtn.classList.add('active-info'); mainBtn.disabled = false;
                    mainBtn.onclick = () => { if(this.selectedCardIdx !== null) this.playerButtonAction(); else this.takeCards(0); };
                } else mainBtn.innerText = "ЖДИТЕ ХОДА...";
            }
        } 
        else {
            const hasCard = !this.players[0].isOut && this.players[0].hand.some(c => this.canAttack(c));
            if (this.selectedCardIdx !== null) {
                mainBtn.innerText = "ПОДКИНУТЬ ЭТУ";
                mainBtn.classList.add('ready');
                mainBtn.disabled = false;
            } else {
                // ПОКАЗЫВАЕМ "НЕ БУДУ" ТОЛЬКО ЕСЛИ КАРТЫ ЕСТЬ
                if (hasCard && !this.playerPassedToss && this.isTableCovered() && this.table.length > 0) {
                    mainBtn.innerText = "ВЫБЕРИТЕ КАРТУ";
                    mainBtn.disabled = true; 
                    secBtn.innerText = "НЕ БУДУ";
                    secBtn.classList.add('visible');
                } else {
                    mainBtn.innerText = "ХОДЯТ БОТЫ...";
                }
            }
        }

        const tbl = document.getElementById('active-table'); tbl.innerHTML = '';
        this.table.forEach(pair => {
            const d = document.createElement('div'); d.className='pair';
            d.innerHTML = this.renderCard(pair.attack, 'attack');
            if(pair.defend) d.innerHTML += this.renderCard(pair.defend, 'defend');
            tbl.appendChild(d);
        });

        this.players.forEach(p => {
            if(p.type === 'bot') {
                const z = document.getElementById(p.visualId).querySelector('.hand');
                if(z) { z.innerHTML = ''; p.hand.forEach(() => { z.innerHTML += '<div class="card-back"></div>'; }); }
            }
        });

        const my = document.getElementById('my-hand'); my.innerHTML = '';
        this.players[0].hand.forEach((c, i) => {
            const el = document.createElement('div');
            const isSelected = (this.selectedCardIdx === i);
            el.className = `card ${c.isRed ? 'red' : 'black'} ${isSelected ? 'selected' : ''}`;
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