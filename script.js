const tg = window.Telegram.WebApp;
tg.expand(); // Растянуть на весь экран

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const values = { '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };

let deck = [];
let trumpSuit = '';
let playerHand = [];
let botHand = [];
let table = []; // Карты на столе: {attack: card, defend: card}
let isPlayerTurn = true; // true = игрок атакует, false = игрок защищается
let selectedCard = null;

// Инициализация игры
function initGame() {
    deck = createDeck();
    shuffle(deck);
    
    // Определяем козырь (последняя карта)
    trumpSuit = deck[0].suit;
    
    dealCards(6);
    
    // Определяем кто ходит первым (просто для примера - всегда игрок)
    isPlayerTurn = true;
    updateUI();
}

function createDeck() {
    let d = [];
    for(let s of suits) {
        for(let r of ranks) {
            d.push({ suit: s, rank: r, value: values[r], isRed: (s === '♥' || s === '♦') });
        }
    }
    return d;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function dealCards(count) {
    while(playerHand.length < count && deck.length > 0) playerHand.push(deck.pop());
    while(botHand.length < count && deck.length > 0) botHand.push(deck.pop());
}

// Рендеринг (отрисовка)
function updateUI() {
    // Отображение колоды и козыря
    document.getElementById('deck-count').innerText = deck.length > 0 ? deck.length : '';
    const trumpEl = document.getElementById('trump-card');
    if(deck.length > 0) {
        trumpEl.innerText = deck[0].suit + deck[0].rank;
        trumpEl.className = `card ${deck[0].isRed ? 'red' : 'black'}`;
    } else {
        trumpEl.style.opacity = 0.5; // Козыря больше нет в колоде
        trumpEl.innerText = trumpSuit;
    }

    // Рука бота (рубашки)
    const botDiv = document.getElementById('bot-hand');
    botDiv.innerHTML = '';
    botHand.forEach(() => {
        const c = document.createElement('div');
        c.className = 'card back';
        botDiv.appendChild(c);
    });

    // Рука игрока
    const playerDiv = document.getElementById('player-hand');
    playerDiv.innerHTML = '';
    playerHand.forEach((card, index) => {
        const c = document.createElement('div');
        c.innerText = card.suit + card.rank;
        c.className = `card ${card.isRed ? 'red' : 'black'} ${selectedCard === index ? 'selected' : ''}`;
        c.onclick = () => selectCard(index);
        playerDiv.appendChild(c);
    });

    // Стол
    const tableDiv = document.getElementById('active-table');
    tableDiv.innerHTML = '';
    table.forEach(pair => {
        const pairDiv = document.createElement('div');
        pairDiv.className = 'pair';
        
        const card1 = document.createElement('div');
        card1.className = `card ${pair.attack.isRed ? 'red' : 'black'}`;
        card1.innerText = pair.attack.suit + pair.attack.rank;
        pairDiv.appendChild(card1);

        if(pair.defend) {
            const card2 = document.createElement('div');
            card2.className = `card ${pair.defend.isRed ? 'red' : 'black'}`;
            card2.innerText = pair.defend.suit + pair.defend.rank;
            pairDiv.appendChild(card2);
        }
        tableDiv.appendChild(pairDiv);
    });

    // Кнопка и статус
    const btn = document.getElementById('action-btn');
    const msg = document.getElementById('status-msg');
    
    if (isPlayerTurn) {
        msg.innerText = "Ваш ход (Атака)";
        btn.innerText = "Бито (Завершить ход)";
        // Если стол пуст, нельзя нажать Бито
        if(table.length === 0) btn.disabled = true; 
        else if (table.some(p => !p.defend)) btn.disabled = true; // Бот еще не отбился
        else btn.disabled = false;
    } else {
        msg.innerText = "Бот атакует (Защищайтесь)";
        btn.innerText = "Взять";
        btn.disabled = false;
    }
}

function selectCard(index) {
    selectedCard = index;
    updateUI();
    
    // Если игрок кликнул, пробуем сделать ход
    setTimeout(() => tryMove(index), 100);
}

function tryMove(index) {
    const card = playerHand[index];
    
    if (isPlayerTurn) {
        // Атака игрока
        // Можно ходить любой картой, если стол пуст, или картой того же ранга, что есть на столе
        let canAttack = false;
        if (table.length === 0) canAttack = true;
        else {
            table.forEach(p => {
                if (p.attack.rank === card.rank || (p.defend && p.defend.rank === card.rank)) canAttack = true;
            });
        }

        if (canAttack) {
            table.push({ attack: card, defend: null });
            playerHand.splice(index, 1);
            selectedCard = null;
            updateUI();
            
            // Ход бота (защита) через паузу
            setTimeout(botDefend, 1000);
        }
    } else {
        // Защита игрока
        // Ищем последнюю неотбитую карту
        const lastPair = table[table.length - 1];
        if (lastPair && !lastPair.defend) {
            if (canBeat(lastPair.attack, card)) {
                lastPair.defend = card;
                playerHand.splice(index, 1);
                selectedCard = null;
                updateUI();
                
                // Бот подкидывает
                setTimeout(botAttackMore, 1000);
            } else {
                tg.showAlert("Этой картой нельзя побить!");
            }
        }
    }
}

// Проверка: бьет ли карта c2 карту c1
function canBeat(c1, c2) {
    if (c1.suit === c2.suit) return c2.value > c1.value;
    if (c2.suit === trumpSuit && c1.suit !== trumpSuit) return true;
    return false;
}

// Кнопка действия (Бито или Взять)
function playerAction() {
    if (isPlayerTurn) {
        // Игрок нажал "Бито"
        // Проверяем, что все карты отбиты
        if (table.every(p => p.defend)) {
            table = []; // Очистка стола (в отбой)
            dealCards(6); // Добор карт
            isPlayerTurn = false; // Ход переходит боту
            botAttackStart();
        }
    } else {
        // Игрок нажал "Взять"
        table.forEach(p => {
            playerHand.push(p.attack);
            if(p.defend) playerHand.push(p.defend);
        });
        table = [];
        dealCards(6); // Бот добирает
        // Ход остается у бота, так как игрок взял
        botAttackStart();
    }
    updateUI();
}

// --- AI Бота (Очень простой) ---

function botDefend() {
    const lastPair = table[table.length - 1];
    if (!lastPair || lastPair.defend) return;

    const attackCard = lastPair.attack;
    
    // Ищем карту, которой можно побить (самую маленькую из возможных)
    let bestCardIdx = -1;
    let minVal = 100;

    botHand.forEach((c, i) => {
        if (canBeat(attackCard, c)) {
            // Примитивная логика: если козырь, добавляем "веса", чтобы беречь козыри
            let weight = c.value;
            if (c.suit === trumpSuit) weight += 20; 
            
            if (weight < minVal) {
                minVal = weight;
                bestCardIdx = i;
            }
        }
    });

    if (bestCardIdx !== -1) {
        lastPair.defend = botHand[bestCardIdx];
        botHand.splice(bestCardIdx, 1);
        updateUI();
    } else {
        // Бот берет
        setTimeout(() => {
            tg.showAlert("Бот берет карты!");
            table.forEach(p => {
                botHand.push(p.attack);
                if(p.defend) botHand.push(p.defend);
            });
            table = [];
            dealCards(6);
            isPlayerTurn = true; // Ход переходит игроку
            updateUI();
        }, 1000);
    }
}

function botAttackStart() {
    if (botHand.length === 0) {
        endGame("Бот выиграл!");
        return;
    }
    // Бот ходит самой маленькой некозырной картой
    let bestIdx = 0;
    let minVal = 100;
    
    botHand.forEach((c, i) => {
        let weight = c.value;
        if(c.suit === trumpSuit) weight += 20;
        if(weight < minVal) {
            minVal = weight;
            bestIdx = i;
        }
    });

    const card = botHand[bestIdx];
    botHand.splice(bestIdx, 1);
    table.push({ attack: card, defend: null });
    isPlayerTurn = false;
    updateUI();
}

function botAttackMore() {
    // Бот смотрит, может ли подкинуть
    if (botHand.length === 0) return;
    
    let tossIdx = -1;
    // Ищем карты совпадающие по рангу с теми, что на столе
    for(let i=0; i<botHand.length; i++) {
        let c = botHand[i];
        let match = false;
        table.forEach(p => {
            if (p.attack.rank === c.rank || (p.defend && p.defend.rank === c.rank)) match = true;
        });
        if(match) {
            tossIdx = i;
            break; 
        }
    }

    if (tossIdx !== -1 && table.filter(t => !t.defend).length === 0) { // Подкидываем только если предыдущие отбиты
        const card = botHand[tossIdx];
        botHand.splice(tossIdx, 1);
        table.push({ attack: card, defend: null });
        updateUI();
    } else {
        // Бот говорит "Бито" (в коде просто передаем ход игроку, если все отбито)
        if(table.every(p => p.defend)) {
            setTimeout(() => {
                table = [];
                dealCards(6);
                isPlayerTurn = true;
                updateUI();
            }, 1000);
        }
    }
}

function endGame(text) {
    tg.showAlert(text);
    initGame();
}

// Старт
initGame();
