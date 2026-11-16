(() => {
  'use strict';
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = {11:'J', 12:'Q', 13:'K', 14:'A'};
  const HAND_NAMES = ['High card','One pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
  const STARTING_STACK = 1000, SMALL_BLIND = 10, BIG_BLIND = 20;
  const $ = (id) => document.getElementById(id);
  const ui = {
    opponents: $('opponents-row'), player: $('player-row'), board: $('community-cards'), pot: $('pot-amount'), street: $('street-label'),
    message: $('game-message'), title: $('action-title'), pill: $('turn-pill'), fold: $('fold-btn'), call: $('call-btn'), raise: $('raise-btn'),
    allin: $('allin-btn'), next: $('next-hand-btn'), newMatch: $('new-match')
  };
  let state;
  let botTimer = null;

  function makeDeck() {
    const deck = [];
    for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push({r, s});
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
  const rankText = r => RANKS[r] || String(r);
  const cardText = c => `${rankText(c.r)}${c.s}`;
  const money = n => `${Math.max(0, Math.round(n)).toLocaleString()} chips`;
  const livePlayers = () => state.players.filter(p => p.inHand && !p.folded);
  const canAct = p => p.inHand && !p.folded && !p.allIn && p.chips > 0;
  const humanTurn = () => state.actor === 0 && !state.handOver && state.players[0].inHand && canAct(state.players[0]);
  const totalPot = () => state.players.reduce((sum, p) => sum + p.totalBet, 0);
  const nextIndex = (from, predicate) => {
    for (let step = 1; step <= state.players.length; step++) {
      const idx = (from + step) % state.players.length;
      if (predicate(state.players[idx])) return idx;
    }
    return -1;
  };
  function say(message) { state.message = message; ui.message.textContent = message; }
  function makePlayers() {
    return [
      {name:'You', chips:STARTING_STACK, hole:[], folded:false, allIn:false, inHand:true, bet:0, totalBet:0, acted:false, human:true},
      {name:'Riley', chips:STARTING_STACK, hole:[], folded:false, allIn:false, inHand:true, bet:0, totalBet:0, acted:false, human:false},
      {name:'Jordan', chips:STARTING_STACK, hole:[], folded:false, allIn:false, inHand:true, bet:0, totalBet:0, acted:false, human:false},
      {name:'Casey', chips:STARTING_STACK, hole:[], folded:false, allIn:false, inHand:true, bet:0, totalBet:0, acted:false, human:false}
    ];
  }
  function newMatch() {
    if (botTimer) clearTimeout(botTimer);
    state = {players:makePlayers(), deck:[], board:[], pot:0, currentBet:0, actor:-1, dealer:0, smallBlind:-1, bigBlind:-1, street:'idle', handOver:true, message:'Welcome to the table. Deal your first hand.', lastResult:'', handNumber:0, reveal:false};
    render();
    beginHand();
  }
  function beginHand() {
    if (botTimer) clearTimeout(botTimer);
    const eligible = state.players.filter(p => p.chips > 0);
    if (eligible.length < 2) {
      state.handOver = true;
      say(state.players[0].chips > 0 ? 'You win the match! Start a new match to play again.' : 'Your stack is empty. Start a new match and try again.');
      render(); return;
    }
    state.handNumber++;
    state.deck = makeDeck(); state.board = []; state.pot = 0; state.currentBet = 0; state.lastResult = ''; state.reveal = false;
    state.players.forEach(p => {
      p.hole = []; p.folded = false; p.allIn = false; p.inHand = p.chips > 0; p.bet = 0; p.totalBet = 0; p.acted = false;
    });
    // Move the dealer to the next seat that still has chips.
    if (state.handNumber > 1 || state.players[state.dealer].chips <= 0) {
      const nextDealer = nextIndex(state.dealer, p => p.chips > 0);
      if (nextDealer >= 0) state.dealer = nextDealer;
    }
    state.smallBlind = nextIndex(state.dealer, p => p.inHand);
    state.bigBlind = nextIndex(state.smallBlind, p => p.inHand);
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < state.players.length; i++) {
        const p = state.players[(state.dealer + i) % state.players.length];
        if (p.inHand) p.hole.push(state.deck.pop());
      }
    }
    postBlind(state.smallBlind, SMALL_BLIND);
    postBlind(state.bigBlind, BIG_BLIND);
    state.currentBet = Math.max(...state.players.map(p => p.bet));
    state.street = 'pre-flop'; state.handOver = false;
    state.actor = nextIndex(state.bigBlind, canAct);
    say(`Hand #${state.handNumber}. You have ${cardText(state.players[0].hole[0])} ${cardText(state.players[0].hole[1])}. Your move.`);
    render(); scheduleBot();
  }
  function postBlind(index, amount) {
    if (index < 0) return;
    const p = state.players[index];
    const paid = Math.min(amount, p.chips);
    p.chips -= paid; p.bet += paid; p.totalBet += paid; state.pot += paid;
    if (p.chips === 0) p.allIn = true;
  }
  function commit(p, amount) {
    const paid = Math.max(0, Math.min(Math.floor(amount), p.chips));
    p.chips -= paid; p.bet += paid; p.totalBet += paid; state.pot += paid;
    if (p.chips === 0) p.allIn = true;
    return paid;
  }
  function setStreet(street) {
    state.street = street; state.currentBet = 0;
    state.players.forEach(p => {p.bet = 0; p.acted = false;});
    if (street === 'flop') state.board.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
    else if (street === 'turn' || street === 'river') state.board.push(state.deck.pop());
    say(street === 'flop' ? 'The flop is out. What are you thinking?' : street === 'turn' ? 'The turn card is out.' : 'River card. Last chance to make your hand.');
    state.actor = nextIndex(state.dealer, canAct);
    if (state.actor < 0) { runoutAndShowdown(); return; }
    render(); scheduleBot();
  }
  function allActed() {
    const active = state.players.filter(canAct);
    return active.every(p => p.acted && p.bet === state.currentBet);
  }
  function continueAfterAction(previousActor) {
    if (livePlayers().length === 1) { awardUncontested(livePlayers()[0]); return; }
    if (allActed()) {
      if (state.street === 'river') { showdown(); return; }
      if (state.players.filter(canAct).length <= 1) { runoutAndShowdown(); return; }
      if (state.street === 'pre-flop') setStreet('flop');
      else if (state.street === 'flop') setStreet('turn');
      else setStreet('river');
      return;
    }
    state.actor = nextIndex(previousActor, canAct);
    if (state.actor < 0) { runoutAndShowdown(); return; }
    render(); scheduleBot();
  }
  function doFold() {
    if (!humanTurn()) return;
    const p = state.players[0]; p.folded = true; p.acted = true;
    say('You fold. Let’s see how this hand plays out.');
    continueAfterAction(0); render();
  }
  function doCallCheck() {
    if (!humanTurn()) return;
    const p = state.players[0]; const need = Math.max(0, state.currentBet - p.bet);
    const paid = commit(p, need); p.acted = true;
    say(need === 0 ? 'You check.' : paid < need ? `You call all-in for ${paid} chips.` : `You call ${paid} chips.`);
    continueAfterAction(0); render();
  }
  function doRaise() {
    if (!humanTurn()) return;
    const p = state.players[0];
    const minTarget = state.currentBet + BIG_BLIND;
    const target = Math.max(minTarget, state.currentBet === 0 ? Math.floor((state.pot || BIG_BLIND) / 2) : Math.floor((state.pot + state.currentBet) / 2));
    const actualTarget = Math.min(p.bet + p.chips, target);
    if (actualTarget <= state.currentBet) { doCallCheck(); return; }
    const oldCurrent = state.currentBet;
    commit(p, actualTarget - p.bet);
    state.currentBet = p.bet;
    if (state.currentBet > oldCurrent) state.players.forEach((other, idx) => { if (idx !== 0 && canAct(other)) other.acted = false; });
    p.acted = true;
    say(`You raise to ${state.currentBet} chips.`);
    continueAfterAction(0); render();
  }
  function doAllIn() {
    if (!humanTurn()) return;
    const p = state.players[0], oldCurrent = state.currentBet;
    if (p.chips <= 0) return;
    const amount = p.chips; commit(p, amount);
    if (p.bet > oldCurrent) {
      state.currentBet = p.bet;
      state.players.forEach((other, idx) => { if (idx !== 0 && canAct(other)) other.acted = false; });
    }
    p.acted = true;
    say(`You move all in for ${amount} chips!`);
    continueAfterAction(0); render();
  }
  function botStrength(p) {
    if (state.board.length < 3) {
      const [a,b] = p.hole.map(c => c.r).sort((x,y) => y-x);
      let score = (a + b) / 30;
      if (a === b) score += .30;
      if (a >= 11 && b >= 10) score += .17;
      if (a - b <= 2 && p.hole[0].s === p.hole[1].s) score += .06;
      return Math.min(.92, score);
    }
    const result = evaluateBest([...p.hole, ...state.board]);
    return Math.min(.99, result.score[0] * .105 + .18 + Math.random() * .08);
  }
  function botAct() {
    if (state.handOver || state.actor < 0 || state.players[state.actor].human) return;
    const p = state.players[state.actor], idx = state.actor;
    if (!canAct(p)) { continueAfterAction(idx); return; }
    const need = Math.max(0, state.currentBet - p.bet), strength = botStrength(p), potOdds = need / Math.max(1, state.pot + need);
    const roll = Math.random();
    if (need > 0 && strength < .26 + potOdds * .75 && roll < .58) {
      p.folded = true; p.acted = true; say(`${p.name} folds.`);
    } else if (need === 0 && strength > .65 && roll < .20 && p.chips > BIG_BLIND * 2) {
      const oldCurrent = state.currentBet;
      const target = Math.min(p.bet + p.chips, Math.max(BIG_BLIND, Math.floor((state.pot || BIG_BLIND) * (.35 + Math.random() * .25))));
      commit(p, Math.max(0, target - p.bet));
      if (p.bet > oldCurrent) { state.currentBet = p.bet; state.players.forEach(other => { if (other !== p && canAct(other)) other.acted = false; }); }
      p.acted = true; say(`${p.name} raises to ${p.bet}.`);
    } else if (need > 0 && strength > .76 && roll < .17 && p.chips > need + BIG_BLIND) {
      commit(p, Math.min(p.chips, need + Math.max(BIG_BLIND, Math.floor(state.pot * .35))));
      if (p.bet > state.currentBet) { state.currentBet = p.bet; state.players.forEach(other => { if (other !== p && canAct(other)) other.acted = false; }); }
      p.acted = true; say(`${p.name} raises to ${p.bet}.`);
    } else {
      const paid = commit(p, need); p.acted = true;
      say(need > 0 ? `${p.name} calls ${paid}.` : `${p.name} checks.`);
    }
    continueAfterAction(idx); render();
  }
  function scheduleBot() {
    if (botTimer) clearTimeout(botTimer);
    if (!state || state.handOver || state.actor < 0) return;
    if (state.players[state.actor].human) { render(); return; }
    botTimer = setTimeout(botAct, 650 + Math.random() * 650);
  }

  function combinations(arr, n) {
    const out = [];
    function walk(start, chosen) {
      if (chosen.length === n) { out.push(chosen.slice()); return; }
      for (let i = start; i <= arr.length - (n - chosen.length); i++) { chosen.push(arr[i]); walk(i + 1, chosen); chosen.pop(); }
    }
    walk(0, []); return out;
  }
  function straightHigh(ranks) {
    const uniq = [...new Set(ranks)].sort((a,b)=>b-a);
    if (uniq.includes(14)) uniq.push(1);
    for (let i = 0; i <= uniq.length - 5; i++) {
      let ok = true;
      for (let j = 1; j < 5; j++) if (uniq[i+j] !== uniq[i]-j) { ok = false; break; }
      if (ok) return uniq[i] === 1 ? 5 : uniq[i];
    }
    return 0;
  }
  function evaluateFive(cards) {
    const ranks = cards.map(c=>c.r).sort((a,b)=>b-a);
    const counts = {};
    ranks.forEach(r=>counts[r]=(counts[r]||0)+1);
    const groups = Object.entries(counts).map(([r,n])=>({r:Number(r),n})).sort((a,b)=>b.n-a.n||b.r-a.r);
    const flush = cards.every(c=>c.s===cards[0].s), straight = straightHigh(ranks);
    if (flush && straight) return {score:[8,straight],name:straight===14?'Royal / straight flush':'Straight flush'};
    if (groups[0].n===4) return {score:[7,groups[0].r,groups[1].r],name:'Four of a kind'};
    if (groups[0].n===3 && groups[1].n===2) return {score:[6,groups[0].r,groups[1].r],name:'Full house'};
    if (flush) return {score:[5,...ranks],name:'Flush'};
    if (straight) return {score:[4,straight],name:'Straight'};
    if (groups[0].n===3) return {score:[3,groups[0].r,...groups.slice(1).map(g=>g.r).sort((a,b)=>b-a)],name:'Three of a kind'};
    const pairs=groups.filter(g=>g.n===2).map(g=>g.r).sort((a,b)=>b-a);
    if (pairs.length>=2) return {score:[2,pairs[0],pairs[1],groups.filter(g=>g.n===1).map(g=>g.r).sort((a,b)=>b-a)[0]||0],name:'Two pair'};
    if (pairs.length===1) return {score:[1,pairs[0],...groups.filter(g=>g.n===1).map(g=>g.r).sort((a,b)=>b-a)],name:'One pair'};
    return {score:[0,...ranks],name:'High card'};
  }
  function compareScores(a,b) {
    const len=Math.max(a.length,b.length);
    for(let i=0;i<len;i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x>y?1:-1;}
    return 0;
  }
  function evaluateBest(cards) {
    let best=null;
    for(const five of combinations(cards,5)){
      const result=evaluateFive(five);
      if(!best||compareScores(result.score,best.score)>0)best={...result,cards:five};
    }
    return best;
  }
  function prettyCards(cards) { return cards.map(cardText).join(' '); }
  function runoutAndShowdown() {
    while (state.board.length < 5) state.board.push(state.deck.pop());
    render(); showdown();
  }
  function awardUncontested(winner) {
    const won = totalPot(); winner.chips += won; state.pot = won; state.handOver = true; state.actor = -1; state.reveal = true;
    state.lastResult = `${winner.name} wins ${money(won)} — everyone else folded.`;
    say(state.lastResult); render();
  }
  function distributePots(results) {
    const contributions = [...new Set(state.players.map(p=>p.totalBet).filter(n=>n>0))].sort((a,b)=>a-b);
    let previous=0; const lines=[];
    for (const level of contributions) {
      const contributors=state.players.filter(p=>p.totalBet>=level);
      const potAmount=(level-previous)*contributors.length; previous=level;
      const eligible=contributors.filter(p=>p.inHand&&!p.folded);
      if (!potAmount||!eligible.length) continue;
      let best=eligible[0], winners=[best];
      for (const p of eligible.slice(1)) {
        const cmp=compareScores(results.get(p).score,results.get(best).score);
        if(cmp>0){best=p;winners=[p];} else if(cmp===0) winners.push(p);
      }
      const share=Math.floor(potAmount/winners.length), remainder=potAmount-share*winners.length;
      winners.forEach((p,i)=>p.chips+=share+(i<remainder?1:0));
      const handName=results.get(best).name;
      lines.push(`${winners.map(p=>p.name).join(' & ')} win ${money(potAmount)} with ${handName}${winners.length>1?' (split pot)':''}.`);
    }
    return lines;
  }
  function showdown() {
    if (state.handOver) return;
    state.handOver=true; state.actor=-1; state.reveal=true;
    const results=new Map();
    livePlayers().forEach(p=>results.set(p,evaluateBest([...p.hole,...state.board])));
    const lines=distributePots(results);
    state.lastResult=lines.join(' ');
    say(state.lastResult || 'Showdown complete.');
    render();
  }

  function makeCard(card, hidden=false, empty=false) {
    if (empty) { const e=document.createElement('div'); e.className='empty-card'; return e; }
    const el=document.createElement('div');
    if (hidden) { el.className='playing-card card-back'; el.setAttribute('aria-label','Face-down card'); return el; }
    el.className=`playing-card ${card.s==='♥'||card.s==='♦'?'red':''}`;
    const rank=rankText(card.r);
    const top=document.createElement('span'); top.className='corner'; top.innerHTML=`${rank}<span>${card.s}</span>`;
    const mid=document.createElement('span'); mid.className='pip'; mid.textContent=card.s;
    const bottom=document.createElement('span'); bottom.className='corner bottom'; bottom.innerHTML=`${rank}<span>${card.s}</span>`;
    el.append(top,mid,bottom); el.setAttribute('aria-label',`${rank} of ${({ '♠':'spades','♥':'hearts','♦':'diamonds','♣':'clubs'})[card.s]}`); return el;
  }
  function badge(text, muted=false) { const b=document.createElement('span'); b.className=`seat-badge${muted?' muted':''}`; b.textContent=text; return b; }
  function seatElement(p, idx) {
    const seat=document.createElement('div'); seat.className='player-seat';
    if (!state.handOver && idx===state.actor) seat.classList.add('is-active');
    if (state.handOver && state.winners && state.winners.includes(idx)) seat.classList.add('winner-highlight');
    const badges=document.createElement('div'); badges.className='seat-badges';
    if (idx===state.dealer) badges.append(badge('DEALER'));
    if (idx===state.smallBlind) badges.append(badge('SB',true));
    if (idx===state.bigBlind) badges.append(badge('BB',true));
    const name=document.createElement('div'); name.className='seat-name'; name.textContent=p.name;
    const chips=document.createElement('div'); chips.className='seat-chips'; chips.textContent=money(p.chips);
    const bet=document.createElement('div'); bet.className='seat-bet'; bet.textContent=p.bet>0?`Bet ${p.bet}`:' ';
    const cards=document.createElement('div'); cards.className='hole-cards';
    if (p.inHand && p.hole.length) p.hole.forEach(c=>cards.append(makeCard(c, idx!==0 && !state.reveal && !state.handOver)));
    else if (p.hole.length===0) { cards.append(makeCard(null,false,true),makeCard(null,false,true)); }
    if (p.folded) { const fold=badge('FOLDED',true); badges.append(fold); seat.style.opacity='.55'; }
    if (p.allIn && !state.handOver) badges.append(badge('ALL IN'));
    if (!p.inHand && p.chips===0) { seat.style.opacity='.42'; badges.append(badge('OUT',true)); }
    seat.append(badges,name,chips,cards,bet);
    if (state.handOver && p.inHand && !p.folded && state.board.length===5) {
      const res=evaluateBest([...p.hole,...state.board]); const label=document.createElement('div'); label.className='small-note'; label.textContent=res.name; seat.append(label);
    }
    return seat;
  }
  function render() {
    if (!state) return;
    ui.opponents.replaceChildren(); ui.player.replaceChildren();
    state.players.forEach((p,idx)=>{ if(idx!==0) ui.opponents.append(seatElement(p,idx)); });
    ui.player.append(seatElement(state.players[0],0));
    ui.board.replaceChildren();
    for (let i=0;i<5;i++) ui.board.append(i<state.board.length?makeCard(state.board[i]):makeCard(null,false,true));
    ui.pot.textContent=state.pot.toLocaleString();
    ui.street.textContent=state.handOver ? (state.street==='idle'?'Ready to play':state.street==='showdown'?'SHOWDOWN':`${state.street} · hand complete`) : state.street.toUpperCase();
    ui.title.textContent=state.handOver?'Hand complete':'Make your move';
    ui.pill.textContent=state.handOver?'Hand complete':(state.actor===0?'Your turn':`${state.players[state.actor]?.name || 'Table'} thinking`);
    ui.pill.classList.toggle('active',humanTurn());
    ui.message.textContent=state.message;
    const yourTurn=humanTurn(), p=state.players[0], need=Math.max(0,state.currentBet-p.bet);
    ui.fold.disabled=!yourTurn; ui.call.disabled=!yourTurn; ui.raise.disabled=!yourTurn; ui.allin.disabled=!yourTurn;
    ui.call.textContent=need===0?'Check':`Call ${Math.min(need,p.chips)}`;
    const target=Math.max(state.currentBet+BIG_BLIND,state.currentBet===0?Math.floor((state.pot||BIG_BLIND)/2):Math.floor((state.pot+state.currentBet)/2));
    ui.raise.textContent=target>=p.bet+p.chips?'Raise all-in':`Raise to ${target}`;
    ui.allin.textContent=`All in (${p.chips})`;
    ui.next.hidden=!state.handOver || (state.players.filter(p=>p.chips>0).length<2);
    ui.next.textContent='Deal next hand →';
  }
  // --- Plinko mini-game (separate play-chip balance from poker) ---
  const plinkoCanvas = $('plinko-canvas');
  const plinkoCtx = plinkoCanvas.getContext('2d');
  const plinkoBalanceEl = $('plinko-balance');
  const plinkoResultEl = $('plinko-result');
  const plinkoBetEl = $('bet-size');
  const dropBallBtn = $('drop-ball');
  const refillPlinkoBtn = $('refill-plinko');
  const pokerModeEl = $('poker-mode');
  const plinkoModeEl = $('plinko-mode');
  const pokerTab = $('poker-tab');
  const plinkoTab = $('plinko-tab');
  const PLINKO_STARTING_BALANCE = 1000;
  const PLINKO_ROWS = 12;
  const PLINKO_SPACING = 45;
  const PLINKO_TOP = 52;
  const PLINKO_ROW_GAP = 29;
  const PLINKO_SLOT_Y = 425;
  const PLINKO_MULTIPLIERS = [10, 4, 2, 1.5, 1, 0.7, 0.4, 0.7, 1, 1.5, 2, 4, 10];
  let plinkoBalance = PLINKO_STARTING_BALANCE;
  let plinkoBusy = false;
  let plinkoAnimationId = 0;

  function multiplierText(value) {
    return `${Number.isInteger(value) ? value : value.toFixed(1)}×`;
  }
  function updatePlinkoUI() {
    plinkoBalanceEl.textContent = plinkoBalance.toLocaleString();
    const stake = Number(plinkoBetEl.value);
    dropBallBtn.disabled = plinkoBusy || plinkoBalance < stake;
    dropBallBtn.textContent = plinkoBusy ? 'Ball bouncing…' : '⬇ Drop ball';
    plinkoBetEl.disabled = plinkoBusy;
    refillPlinkoBtn.disabled = plinkoBusy;
  }
  function setGameMode(mode) {
    const isPoker = mode === 'poker';
    pokerModeEl.hidden = !isPoker;
    plinkoModeEl.hidden = isPoker;
    pokerTab.classList.toggle('active', isPoker);
    plinkoTab.classList.toggle('active', !isPoker);
    pokerTab.setAttribute('aria-selected', String(isPoker));
    plinkoTab.setAttribute('aria-selected', String(!isPoker));
    ui.newMatch.hidden = !isPoker;
    if (!isPoker) drawPlinkoBoard();
  }
  function drawPlinkoBoard(ball = null, highlightSlot = -1) {
    const ctx = plinkoCtx;
    const W = plinkoCanvas.width, H = plinkoCanvas.height, center = W / 2;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#102b42'); bg.addColorStop(1, '#081624');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // Subtle arcade backdrop dots.
    for (let y = 18; y < H; y += 28) {
      for (let x = 18; x < W; x += 28) {
        ctx.fillStyle = 'rgba(167,210,234,0.045)';
        ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(127,180,212,.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(center, 10); ctx.lineTo(center, 30); ctx.stroke();
    ctx.fillStyle = '#bde4f2'; ctx.font = '700 10px DM Sans, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('DROP ZONE', center, 14);

    // Peg rows form a triangular board.
    for (let row = 0; row < PLINKO_ROWS; row++) {
      const y = PLINKO_TOP + row * PLINKO_ROW_GAP;
      for (let col = 0; col <= row; col++) {
        const x = center - (row * PLINKO_SPACING) / 2 + col * PLINKO_SPACING;
        ctx.fillStyle = 'rgba(68,183,220,.13)';
        ctx.beginPath(); ctx.arc(x, y, 7.3, 0, Math.PI * 2); ctx.fill();
        const peg = ctx.createRadialGradient(x - 1.4, y - 1.8, 0.4, x, y, 4.5);
        peg.addColorStop(0, '#f0fbff'); peg.addColorStop(.35, '#86d9ef'); peg.addColorStop(1, '#2d7fa5');
        ctx.fillStyle = peg; ctx.beginPath(); ctx.arc(x, y, 4.3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Prize bins. Higher multipliers sit farther from the center.
    const slotColors = ['#ff6585','#ff8d6b','#ffad61','#f3c96e','#b9d98a','#79d8b2','#51c8bd','#79d8b2','#b9d98a','#f3c96e','#ffad61','#ff8d6b','#ff6585'];
    const slotW = PLINKO_SPACING;
    const slotTop = PLINKO_SLOT_Y;
    for (let i = 0; i < PLINKO_MULTIPLIERS.length; i++) {
      const x = center + (i - 6) * slotW - slotW / 2 + 1;
      ctx.fillStyle = slotColors[i]; ctx.globalAlpha = 0.13; ctx.fillRect(x, slotTop, slotW - 2, 43); ctx.globalAlpha = 1;
      if (i === highlightSlot) {
        ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 3; ctx.strokeRect(x + 1, slotTop + 1, slotW - 4, 41);
        ctx.fillStyle = '#fff3b0'; ctx.fillRect(x + 1, slotTop + 1, slotW - 4, 3);
      } else {
        ctx.strokeStyle = 'rgba(225,240,250,.16)'; ctx.lineWidth = 1; ctx.strokeRect(x, slotTop, slotW - 2, 43);
      }
      ctx.fillStyle = slotColors[i]; ctx.font = '700 10px DM Sans, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(multiplierText(PLINKO_MULTIPLIERS[i]), center + (i - 6) * slotW, slotTop + 25);
    }
    ctx.fillStyle = 'rgba(216,234,243,.75)'; ctx.font = '9px DM Sans, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('PRIZE SLOTS', center, 494);

    if (ball && ball.trail && ball.trail.length > 1) {
      ctx.beginPath(); ctx.moveTo(ball.trail[0].x, ball.trail[0].y);
      for (const point of ball.trail.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = 'rgba(125,233,255,.4)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
    if (ball) {
      const glow = ctx.createRadialGradient(ball.x, ball.y, 1, ball.x, ball.y, 19);
      glow.addColorStop(0, 'rgba(255,244,171,.95)'); glow.addColorStop(.35, 'rgba(255,190,83,.55)'); glow.addColorStop(1, 'rgba(255,155,75,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ball.x, ball.y, 19, 0, Math.PI * 2); ctx.fill();
      const orb = ctx.createRadialGradient(ball.x - 3, ball.y - 4, 1, ball.x, ball.y, 8);
      orb.addColorStop(0, '#fffde5'); orb.addColorStop(.45, '#ffd86b'); orb.addColorStop(1, '#f58b42');
      ctx.fillStyle = orb; ctx.beginPath(); ctx.arc(ball.x, ball.y, 7.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff5c5'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  function dropPlinkoBall() {
    if (plinkoBusy) return;
    const stake = Number(plinkoBetEl.value);
    if (!Number.isFinite(stake) || stake <= 0 || plinkoBalance < stake) {
      plinkoResultEl.textContent = 'Not enough play chips for that bet. Pick a smaller stake or reset your chips.';
      updatePlinkoUI(); return;
    }
    plinkoBalance -= stake;
    plinkoBusy = true;
    updatePlinkoUI();
    plinkoResultEl.textContent = 'Ball is bouncing… please hold your breath, dawg 😭';

    const center = plinkoCanvas.width / 2;
    let x = center;
    const path = [{ x, y: PLINKO_TOP, trail: [] }];
    let rights = 0;
    for (let row = 0; row < PLINKO_ROWS; row++) {
      const goRight = Math.random() >= 0.5;
      if (goRight) rights++;
      x += goRight ? PLINKO_SPACING / 2 : -PLINKO_SPACING / 2;
      const y = row < PLINKO_ROWS - 1 ? PLINKO_TOP + (row + 1) * PLINKO_ROW_GAP : PLINKO_SLOT_Y - 13;
      path.push({ x, y });
    }
    const slot = Math.max(0, Math.min(PLINKO_MULTIPLIERS.length - 1, rights));
    const durationPerHop = 83;
    const started = performance.now();
    const trailPoints = [path[0]];
    function animate(now) {
      const elapsed = now - started;
      const hop = Math.min(path.length - 2, Math.floor(elapsed / durationPerHop));
      const progress = Math.min(1, (elapsed - hop * durationPerHop) / durationPerHop);
      const a = path[hop], b = path[hop + 1];
      // Ease into each peg for a bouncy arcade feel.
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const ball = { x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased };
      const trail = path.slice(0, hop + 1).concat([ball]);
      ball.trail = trail;
      drawPlinkoBoard(ball);
      if (elapsed < (path.length - 1) * durationPerHop) {
        plinkoAnimationId = requestAnimationFrame(animate);
      } else {
        const multiplier = PLINKO_MULTIPLIERS[slot];
        const payout = Math.round(stake * multiplier);
        const net = payout - stake;
        plinkoBalance += payout;
        plinkoBusy = false;
        drawPlinkoBoard({ x: path[path.length - 1].x, y: PLINKO_SLOT_Y - 13 }, slot);
        plinkoResultEl.textContent = `Landed in ${multiplierText(multiplier)}! Payout: ${payout.toLocaleString()} chips · ${net >= 0 ? `net +${net.toLocaleString()}` : `net −${Math.abs(net).toLocaleString()}`} chips ${net > 0 ? '🔥' : net === 0 ? '🤝' : '🥀'}`;
        updatePlinkoUI();
      }
    }
    plinkoAnimationId = requestAnimationFrame(animate);
  }
  function resetPlinkoBalance() {
    if (plinkoBusy) return;
    plinkoBalance = PLINKO_STARTING_BALANCE;
    drawPlinkoBoard();
    plinkoResultEl.textContent = 'Balance reset to 1,000 pretend chips. Run it back 😭✌️';
    updatePlinkoUI();
  }

  pokerTab.addEventListener('click', () => setGameMode('poker'));
  plinkoTab.addEventListener('click', () => setGameMode('plinko'));
  $('back-to-poker').addEventListener('click', () => setGameMode('poker'));
  dropBallBtn.addEventListener('click', dropPlinkoBall);
  refillPlinkoBtn.addEventListener('click', resetPlinkoBalance);
  plinkoBetEl.addEventListener('change', updatePlinkoUI);
  ui.fold.addEventListener('click',doFold);
  ui.call.addEventListener('click',doCallCheck);
  ui.raise.addEventListener('click',doRaise);
  ui.allin.addEventListener('click',doAllIn);
  ui.next.addEventListener('click',beginHand);
  ui.newMatch.addEventListener('click',newMatch);
  newMatch();
  drawPlinkoBoard();
  updatePlinkoUI();
})();
