// The DOM HUD: health, ammo, money, timer, score, kill feed, minimap, plant
// bar, banners and the buy menu. It never touches the simulation; game.js
// pushes numbers in and reads callbacks out.
import { WEAPONS, FRAG_PRICE } from './weapons.js';

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay'), title = $('overlay-title'), copy = $('overlay-copy'), play = $('play');
  const buyOverlay = $('buy-overlay'), buyGrid = $('buy-grid');
  const hpFill = $('hp-fill'), hpNum = $('hp-num');
  const ammoMag = $('ammo-mag'), ammoReserve = $('ammo-reserve'), weaponName = $('weapon-name');
  const moneyEl = $('money'), grenadesEl = $('grenades');
  const timerEl = $('timer'), objectiveEl = $('objective');
  const scoreEmber = $('score-ember'), scoreAsh = $('score-ash');
  const aliveEmber = $('alive-ember'), aliveAsh = $('alive-ash');
  const killfeedEl = $('killfeed'), bannerEl = $('banner'), bannerTitle = $('banner-title'), bannerSub = $('banner-sub');
  const plantBar = $('plantbar'), plantFill = $('plant-fill'), plantLabel = $('plant-label');
  const hintEl = $('hint'), vignette = $('damage-vignette'), hitmarker = $('hitmarker');
  const minimap = $('minimap'), mctx = minimap.getContext('2d');
  const crosshair = $('crosshair');
  let hitTimer = 0;
  let buyItems = [];

  const COPY = {
    start: { title: 'EMBER<span>LINE</span>', copy: 'Round-based tactical FPS. You are Ember, attacking the Foundry Yard. Plant the spike at Site A or Site B — or wipe out the Ash crew. First to 3 rounds takes the match.', action: 'Click to play' },
    paused: { title: 'EMBER<span>LINE</span>', copy: 'Paused. Click to resume — your round is still running.', action: 'Click to resume' },
    roundWin: { title: 'Round won', copy: '', action: 'Next round' },
    roundLose: { title: 'Round lost', copy: '', action: 'Next round' },
    matchWin: { title: 'MATCH WON', copy: '', action: 'Play again' },
    matchLose: { title: 'MATCH LOST', copy: '', action: 'Play again' },
  };

  function buildBuy() {
    buyGrid.innerHTML = '';
    buyItems = [];
    const items = [
      ...Object.values(WEAPONS).map((w) => ({ id: w.id, key: w.key, name: w.name, desc: `${w.damage} dmg · ${w.mag} rounds · ${w.kind}`, price: w.price })),
      { id: 'frag', key: '5', name: 'Frag grenade', desc: 'Thrown explosive, area damage', price: FRAG_PRICE },
    ];
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'buy-item';
      btn.innerHTML = `<span><kbd>${item.key}</kbd> <b>${item.name}</b><span class="desc">${item.desc}</span></span><span class="price">$${item.price}</span>`;
      btn.addEventListener('click', () => callbacks.onBuy(item.id));
      buyGrid.appendChild(btn);
      buyItems.push({ ...item, el: btn });
    }
  }
  buildBuy();

  return {
    setHealth(hp) {
      hpFill.style.width = `${Math.max(0, hp)}%`;
      hpFill.classList.toggle('low', hp <= 30);
      hpNum.textContent = String(Math.max(0, Math.ceil(hp)));
    },
    setAmmo(mag, reserve, name) {
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = ` / ${reserve}`;
      weaponName.textContent = name;
    },
    setMoney(m) { moneyEl.textContent = `$${m}`; },
    setGrenades(n) { grenadesEl.textContent = `Frag × ${n} — press G`; },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      timerEl.classList.toggle('low', s <= 15 && phase === 'live');
    },
    setScore(e, a, aliveE, aliveA) {
      scoreEmber.textContent = String(e);
      scoreAsh.textContent = String(a);
      aliveEmber.textContent = '●'.repeat(aliveE) + '○'.repeat(Math.max(0, 3 - aliveE));
      aliveAsh.textContent = '●'.repeat(aliveA) + '○'.repeat(Math.max(0, 4 - aliveA));
    },
    setObjective(text) { objectiveEl.innerHTML = text; },
    setHint(text) { hintEl.textContent = text; },
    hitMarker(kill, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on'), holdMs);
    },
    damageFlash() {
      vignette.style.opacity = '1';
      setTimeout(() => { vignette.style.opacity = '0'; }, 140);
    },
    setCrosshairSpread(px) {
      crosshair.style.transform = `translate(-50%, -50%) scale(${1 + px * 0.06})`;
    },
    killfeed(killer, victim, killerTeam, headshot) {
      const div = document.createElement('div');
      div.innerHTML = `<b class="${killerTeam === 'ember' ? 'fk' : 'ek'}">${killer}</b> ${headshot ? '◉' : '✕'} <b>${victim}</b>`;
      killfeedEl.prepend(div);
      while (killfeedEl.children.length > 5) killfeedEl.lastChild.remove();
      setTimeout(() => div.remove(), 6000);
    },
    banner(kind, titleText, sub) {
      bannerEl.style.display = 'block';
      bannerEl.className = kind;
      bannerTitle.textContent = titleText;
      bannerSub.textContent = sub;
      setTimeout(() => { bannerEl.style.display = 'none'; }, 3200);
    },
    hideBanner() { bannerEl.style.display = 'none'; },
    plantBar(show, progress, label) {
      plantBar.style.display = show ? 'block' : 'none';
      if (show) { plantFill.style.width = `${Math.round(progress * 100)}%`; plantLabel.textContent = label; }
    },
    showOverlay(mode, extra = '') {
      const c = COPY[mode];
      title.innerHTML = c.title;
      copy.textContent = extra || c.copy;
      play.textContent = c.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    showBuy(round, money, owned) {
      $('buy-round').textContent = `Round ${round}`;
      $('buy-money').textContent = `$${money} — spend it before the round starts`;
      for (const item of buyItems) {
        item.el.classList.toggle('owned', owned.has(item.id));
        item.el.querySelector('.price').textContent = owned.has(item.id) ? 'OWNED' : `$${item.price}`;
      }
      buyOverlay.hidden = false;
    },
    hideBuy() { buyOverlay.hidden = true; },
    isBuyOpen() { return !buyOverlay.hidden; },
    onBuyReady(handler) { $('buy-ready').addEventListener('click', handler); },
    onBuyClose(handler) { $('buy-close').addEventListener('click', handler); },
    drawMinimap(world, player, friends, visibleEnemies, spike) {
      const W = minimap.width, H = minimap.height;
      const { minX, maxX, minZ, maxZ } = world.bounds;
      const sx = (x) => ((x - minX) / (maxX - minX)) * W;
      const sy = (z) => ((z - minZ) / (maxZ - minZ)) * H;
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = '#141a21';
      mctx.fillRect(0, 0, W, H);
      // Site zones
      for (const site of world.sites) {
        mctx.fillStyle = 'rgba(245,197,66,0.25)';
        mctx.fillRect(sx(site.minX), sy(site.minZ), sx(site.maxX) - sx(site.minX), sy(site.maxZ) - sy(site.minZ));
        mctx.fillStyle = '#f5c542';
        mctx.font = 'bold 11px system-ui';
        mctx.fillText(site.id, sx(site.center.x) - 4, sy(site.center.z) + 4);
      }
      // Cover blocks (approximate from colliders, skip floor/walls)
      mctx.fillStyle = '#3a4552';
      for (const c of world.colliders) {
        const w = c.max.x - c.min.x, d = c.max.z - c.min.z;
        if (w > 40 || d > 34 || c.max.y < 0.5) continue;
        mctx.fillRect(sx(c.min.x), sy(c.min.z), Math.max(2, sx(c.max.x) - sx(c.min.x)), Math.max(2, sy(c.max.z) - sy(c.min.z)));
      }
      if (spike && spike.planted) {
        mctx.fillStyle = '#ff8a2a';
        mctx.beginPath(); mctx.arc(sx(spike.position.x), sy(spike.position.z), 4, 0, Math.PI * 2); mctx.fill();
      }
      for (const f of friends) {
        mctx.fillStyle = '#37c8a3';
        mctx.beginPath(); mctx.arc(sx(f.x), sy(f.z), 3, 0, Math.PI * 2); mctx.fill();
      }
      for (const e of visibleEnemies) {
        mctx.fillStyle = '#e5484d';
        mctx.beginPath(); mctx.arc(sx(e.x), sy(e.z), 3, 0, Math.PI * 2); mctx.fill();
      }
      // Player arrow
      const px = sx(player.x), py = sy(player.z);
      mctx.save();
      mctx.translate(px, py);
      mctx.rotate(Math.atan2(-Math.cos(player.yaw), -Math.sin(player.yaw)) + Math.PI / 2);
      mctx.fillStyle = '#ece7db';
      mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4, 5); mctx.lineTo(-4, 5); mctx.closePath(); mctx.fill();
      mctx.restore();
    },
  };
}
