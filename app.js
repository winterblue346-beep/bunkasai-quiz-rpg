// --- 🏆 キャラクターレベル・熟練度システム ---
let characterLevels = {
    "国語": { level: 0, exp: 0, maxExp: 3 },
    "数学": { level: 0, exp: 0, maxExp: 3 },
    "英語": { level: 0, exp: 0, maxExp: 3 },
    "物理": { level: 0, exp: 0, maxExp: 3 },
    "化学": { level: 0, exp: 0, maxExp: 3 },
    "歴史": { level: 0, exp: 0, maxExp: 3 },
    "地理": { level: 0, exp: 0, maxExp: 3 }
};

let currentBattleMode = "raid";
let evolutionSubject = "";

// --- 🎴 教科ごとの表示メタ情報(カードID・キャラ名・画像ファイル接頭辞・絵文字) ---
const subjectMeta = {
    "国語": { cardId: "japanese", name: "紫鳴 結月", emoji: "👩", imgBase: "yuzuki" },
    "数学": { cardId: "math", name: "アルゲブラ", emoji: "📐", imgBase: "algebra" },
    "英語": { cardId: "english", name: "エルメシア・ルミナリア", emoji: "🔤", imgBase: "elmesia" },
    "物理": { cardId: "physics", name: "ファイ", emoji: "🍎", imgBase: "phi" },
    "化学": { cardId: "chemistry", name: "ルイス・ジョンソン", emoji: "🧪", imgBase: "lewis" },
    "歴史": { cardId: "history", name: "大和誠", emoji: "⚔️", imgBase: "yamato" },
    "地理": { cardId: "geography", name: "伊能大地", emoji: "🗺️", imgBase: "inoh" },
    // ゲスト(仲間にはならず、試練・編成にも出ない。レイドの特定の場面にだけ登場する)
    //   画像: elis_battle_normal.png(通常) / elis_battle_shock.png(被弾) / elis_cutin.webp(攻撃のカットイン)
    "エリス": { cardId: null, name: "エリス・ジョンソン", emoji: "👧", imgBase: "elis", guest: true }   // ルイスの妹
};

// --- 📝 試練（10問クイズ）用の状態管理 ---
let trialCurrentIndex = 0;
let trialCorrectCount = 0;
let currentTrialQuestion = null;

// --- 通常レイド用 ---
let maxHp = 1000;
let currentBossHp = 1000;
let currentPlayerHp = 1000;
let currentGeneratedQuestion = null;

// ロビー用
let lobbyTimer = null;
let lobbyPlayers = [];

// --- 🔥 オンラインレイド用 (Firebase Realtime Database) ---
const db = firebase.database();
let raidPlayerId = null;
let raidPlayerName = null;
let raidPlayerHearts = 5;
let raidPlayerMaxHearts = 5;
let raidQuestion = null;
let raidBossHpListenerAttached = false;
let raidPlayersListenerAttached = false;
let raidStatusListenerAttached = false;
const RAID_DEFAULT_HP = 100000;
let raidActive = false;      // ロビー〜バトル中は true
let raidInLobby = false;     // ロビー待機中だけ true(この間だけ出撃通知で戦闘へ入る)
let lobbyEnterToken = 0;     // 入室中に「抜ける」を押された場合の中断用
let lastLobbyPlayers = {};

// --- 昇格戦用 ---
let evolutionBossHp = 500;
let evolutionBossMaxHp = 500;
let evolutionPlayerHearts = 5;
let evolutionPlayerMaxHearts = 5;
let evolutionQuestion = null;
let evolutionUsedQuestionKeys = new Set();   // この昇格戦で、すでに出した問題

// ==========================================
// ⭐ キャラ別スキル(出撃しているキャラ全員のスキルが、ボタンに並ぶ。ボタンは最大 SKILL_BUTTON_MAX 個)
//   ・下の CHARACTER_SKILLS に、キャラごとに書く
//   ・各スキルの書き方:
//       name  : ボタンに出る名前(5文字くらいまで)
//       icon  : 絵文字
//       type  : 効果の種類(下の一覧から選ぶ)
//       cooldown : クールタイム。使ったあと、再び使えるようになるまでに必要な「正解した回数」(時間ではない)
//                  戦闘が始まった時点では、どのスキルも使える
//       そのほか: 効果ごとの数字(下の一覧)。[Lv1, Lv2, Lv3] の配列で書くと、レベルで強くなる
//   ・「1問」= 問題に答える(または時間切れになる)ごとに、1つ進む。使った問題から数える
//   ・効果の種類(type):
//       flame    … 攻撃。power=攻撃力の何倍か / crit=クリティカルの確率 / critMult=クリティカルの倍率
//       beam     … 攻撃+ハート回復。power=攻撃力の何倍か / heal=回復するハート
//       slash    … 攻撃+切り傷。power=攻撃力の何倍か / turns=切り傷の続く問題数(その間、敵の攻撃が半減)
//       block    … turns 問のあいだ、間違えても(時間切れでも)ダメージを受けない(行動阻害)
//       teamGuard… turns 問のあいだ、ダメージ無効(全体防御。効果は自分だけ。他の参加者には及ばない)
//       reflect  … turns 問のあいだ、受けるはずのダメージを無効にして、reflectDamage をボスに反射する
//       poison   … turns 問のあいだ、1問ごとに dot ダメージをボスに与える
//       (以前の型) timestop / hint / heal / extend / reroll / powerup / shield / autocorrect も使える
//   ・第二形態のイベント中(負けイベ・覚醒中)は、スキルは使えない
// ==========================================
const SKILLS_ENABLED = true;   // false にすると、スキル欄は空になる

const CHARACTER_SKILLS = {
    "国語": [   // 紫鳴 結月: 紫炎の魔法で攻撃(40%でクリティカル = ダメージ2倍)
        { name: "紫炎の魔法", icon: "🔥", type: "flame", power: [2, 2.5, 3], crit: 0.4, critMult: 2, cooldown: 3 }
    ],
    "数学": [   // アルゲブラ: 敵の行動を阻害(3問のあいだ、間違えても攻撃を受けない)
        { name: "行動阻害", icon: "⛓️", type: "block", turns: 3, cooldown: 5 }
    ],
    "英語": [   // エルメシア: 光のビームで攻撃(追加効果でダメージ回復)
        { name: "光のビーム", icon: "✨", type: "beam", power: [2, 2.5, 3], heal: [1, 1, 2], cooldown: 4 }
    ],
    "物理": [   // ファイ: 攻撃反射(自分だけ)。敵の攻撃を引き付けて、ダメージをそのまま反射する
        { name: "攻撃反射", icon: "🪞", type: "reflect", turns: 3, reflectDamage: 200, cooldown: 5 }
    ],
    "化学": [   // ルイス: 毒のスリップダメージ(1問ごとに50ダメージ)
        { name: "毒の霧", icon: "☠️", type: "poison", turns: [4, 5, 6], dot: 50, cooldown: 6 }
    ],
    "歴史": [   // 大和誠: 抜刀による攻撃とデバフ(相手は切り傷を得て、相手の攻撃が半減)
        { name: "抜刀", icon: "⚔️", type: "slash", power: [2, 2.5, 3], turns: 3, cooldown: 4 }
    ],
    "地理": [   // 伊能大地: 全体防御(3問のあいだ、ダメージ無効。自分だけに効く)
        { name: "全体防御", icon: "🌍", type: "teamGuard", turns: 3, cooldown: 5 }
    ]
};

const SKILL_BUTTON_MAX = 4;         // スキルボタンの最大数(出撃キャラ全員ぶんを並べる)
const DEFAULT_SKILL_COOLDOWN = 3;   // cooldown を書き忘れたスキルの、クールタイム(正解数)
let skillEntries = [];              // いま並んでいるスキル [{ subject: 持ち主のキャラ, sk: スキル }]
let skillCooldownLeft = [];         // 各スキルの、再び使えるまでの残り正解数(0 なら使える)
let skillPowerMult = 1;             // 「次の正解のダメージ」の倍率(powerup)
let skillShield = 0;                // 「次の失敗を無効」の残り(shield)
let skillEpoch = 0;                 // 戦闘のたびに増やして、前の戦闘の予約を無効にする

function currentSkillSubject() {
    return currentBattleMode === "raid" ? raidFighter : evolutionSubject;
}
function currentSkillLevel(subject) {
    const d = characterLevels[subject];
    return Math.max(1, Math.min(3, d ? d.level : 1));
}
function skillsOf(subject) {
    return (CHARACTER_SKILLS[subject] || []).slice(0, 4);
}
function skillPower(sk, lv) {
    if (Array.isArray(sk.power)) return sk.power[Math.min(lv, sk.power.length) - 1];
    return sk.power;
}
function skillShortEffect(sk, lv) {
    const p = skillPower(sk, lv);
    switch (sk.type) {
        case "timestop":    return `停止${p}秒`;
        case "hint":        return `誤答-${p}`;
        case "heal":        return `ハート+${p}`;
        case "extend":      return `+${p}秒`;
        case "reroll":      return "問題替え";
        case "powerup":     return `次の一撃×${p}`;
        case "shield":      return "ミス無効";
        case "autocorrect": return "正解にする";
        case "flame":       return `×${p}${sk.crit ? ` 会心${Math.round(sk.crit * 100)}%` : ""}`;
        case "beam":        return `×${p} 回復${lvPick(sk.heal, lv)}`;
        case "slash":       return `×${p} 敵の攻撃半減`;
        case "block":       return `${lvPick(sk.turns, lv)}問 ダメージ無効`;
        case "teamGuard":   return `${lvPick(sk.turns, lv)}問 無効`;
        case "reflect":     return `${lvPick(sk.turns, lv)}問 反射`;
        case "poison":      return `毒${lvPick(sk.turns, lv)}問 -${sk.dot}/問`;
        default:            return "";
    }
}

// スキル欄(4つのボタンが並ぶ行)を取得する。古い index.html でも動くように、行にIDが無ければ付ける
function getSkillRow() {
    let row = document.getElementById("skill-row");
    if (row) return row;
    const old = document.getElementById("skill-timestop-btn");
    if (old && old.parentElement) { old.parentElement.id = "skill-row"; return old.parentElement; }
    return null;
}

// 効果の残りを表示する欄(スキル欄の上)。無ければ作る
function ensureBattleStatus() {
    let el = document.getElementById("battle-status");
    if (el) return el;
    const row = getSkillRow();
    if (!row || !row.parentElement) return null;
    el = document.createElement("div");
    el.id = "battle-status";
    row.parentElement.insertBefore(el, row);
    return el;
}

function updateBattleStatus() {
    const el = ensureBattleStatus();
    if (!el) return;
    const parts = [];
    if (fx.block > 0)     parts.push(`⛓️ 行動阻害 あと${fx.block}問`);
    if (fx.teamGuard > 0) parts.push(`🌍 全体防御 あと${fx.teamGuard}問`);
    if (fx.reflect > 0)   parts.push(`🪞 反射 あと${fx.reflect}問`);
    if (fx.poison > 0)    parts.push(`☠️ 毒 あと${fx.poison}問`);
    if (fx.cut > 0)       parts.push(`🩸 切り傷 あと${fx.cut}問`);
    const text = parts.join("　");
    if (el.textContent !== text) el.textContent = text;
}

// 出撃しているキャラ(画面に出る味方)の並び。先頭は、いま戦っているキャラ
function computeDeployedSlots(activeSubject) {
    let slots = [activeSubject, ...playerParty.filter(sub => sub !== activeSubject)].slice(0, 4);
    // レイドで覚醒したあとは、残った1体だけ
    if (currentBattleMode === "raid" && raidStage === "awakened") {
        slots = raidAwakenedSubjects.length ? raidAwakenedSubjects.slice() : [activeSubject];
    }
    return slots;
}

// 出撃しているキャラ全員のスキルを、先頭のキャラから順に並べる
function buildSkillEntries(activeSubject) {
    const list = [];
    if (!SKILLS_ENABLED) return list;
    computeDeployedSlots(activeSubject).forEach(sub => {
        if (!sub || !subjectMeta[sub]) return;
        skillsOf(sub).forEach(sk => list.push({ subject: sub, sk }));
    });
    return list.slice(0, SKILL_BUTTON_MAX);
}

function skillCooldownOf(sk) {
    return (typeof sk.cooldown === "number") ? sk.cooldown : DEFAULT_SKILL_COOLDOWN;
}

// スキルのボタンを並べ直す
function renderSkillBar() {
    const row = getSkillRow();
    if (!row) return;
    row.innerHTML = "";
    const list = skillEntries;
    const slotCount = list.length > 0 ? list.length : 4;   // スキルがあれば、その数だけ並べる。1つも無ければ、空き枠4つ
    for (let i = 0; i < slotCount; i++) {
        const ent = list[i];
        const btn = document.createElement("button");
        btn.className = "skill-slot" + (ent ? "" : " empty");
        btn.dataset.slot = String(i);
        if (ent) {
            const lv = currentSkillLevel(ent.subject);
            btn.title = `${subjectMeta[ent.subject].name}: ${ent.sk.name}`;
            btn.innerHTML = `<span class="sk-name">${ent.sk.icon} ${ent.sk.name}</span><span class="sk-sub"></span>`;
            btn.dataset.effect = skillShortEffect(ent.sk, lv);
            btn.onclick = () => useSkill(i);
        } else {
            btn.innerHTML = '<span class="sk-name">—</span>';
        }
        btn.disabled = true;
        row.appendChild(btn);
    }
    updateSkillBarState();
}

// 戦闘開始: 状態をリセットして、出撃キャラ全員のスキルを並べる(どのスキルも、最初から使える)
function setupSkillBar(stats) {
    skillEpoch++;
    skillPowerMult = 1;
    skillShield = 0;
    clearSkillEffects();
    timeStopActive = false;
    skillEntries = buildSkillEntries(currentSkillSubject());
    skillCooldownLeft = skillEntries.map(() => 0);
    renderSkillBar();
}

// 出撃キャラが変わったとき(レイドの覚醒など)に、スキル欄を並べ直す(覚醒中は使えない)
function refreshSkillBarForSubject() {
    skillEntries = buildSkillEntries(currentSkillSubject());
    skillCooldownLeft = skillEntries.map(() => 0);
    renderSkillBar();
}

// 問題に正解するたびに呼ぶ: クールタイム中のスキルの、残り正解数を1つ減らす
function tickSkillCooldowns() {
    let changed = false;
    for (let i = 0; i < skillCooldownLeft.length; i++) {
        if (skillCooldownLeft[i] > 0) { skillCooldownLeft[i]--; changed = true; }
    }
    if (changed) updateSkillBarState();
}

// いま、スキルを使える場面か(問題が出ていて、まだ回答していない / 第二形態のイベント中ではない)
function canUseSkillNow() {
    if (!SKILLS_ENABLED) return false;
    const bs = document.getElementById("battle-screen");
    if (!bs || getComputedStyle(bs).display === "none") return false;
    if (currentBattleMode === "raid" && (!raidActive || raidStage !== "normal")) return false;
    return [0, 1, 2, 3].some(i => { const b = document.getElementById("choice" + i); return b && !b.disabled; });
}

// ボタンの押せる/押せないと、クールタイムの表示を更新する(一定間隔で呼ばれる)
function updateSkillBarState() {
    const row = getSkillRow();
    if (!row) return;
    updateBattleStatus();
    const usable = canUseSkillNow();
    row.querySelectorAll(".skill-slot").forEach(btn => {
        const i = parseInt(btn.dataset.slot, 10);
        const ent = skillEntries[i];
        if (!ent) { btn.disabled = true; return; }
        const left = skillCooldownLeft[i] || 0;
        const sub = btn.querySelector(".sk-sub");
        if (sub) {
            const html = left > 0 ? `あと<b class="sk-uses">${left}</b>問正解` : (btn.dataset.effect || "");
            if (sub.innerHTML !== html) sub.innerHTML = html;
        }
        btn.classList.toggle("used", left > 0);
        btn.disabled = !(usable && left <= 0);
    });
}

// ダメージ計算・失敗判定から呼ばれる(スキルの効果を、1回だけ使って消費する)
function takeSkillDamage(base) {
    const m = skillPowerMult;
    skillPowerMult = 1;
    return Math.round(base * m);
}
// ---- スキルの継続効果(残り問題数で管理する) ----
const fx = { block: 0, teamGuard: 0, reflect: 0, reflectDmg: 0, cut: 0, poison: 0, poisonDmg: 0 };

function clearSkillEffects() {
    fx.block = 0; fx.teamGuard = 0; fx.reflect = 0; fx.reflectDmg = 0; fx.cut = 0; fx.poison = 0; fx.poisonDmg = 0;
}

function lvPick(v, lv) {   // [Lv1, Lv2, Lv3] の配列なら、レベルに合う値を / 数字ならそのまま返す
    return Array.isArray(v) ? v[Math.min(lv, v.length) - 1] : v;
}

// ボスに、直接ダメージを与える(スキル・毒・反射用)
function applyBossDamage(d) {
    if (currentBattleMode === "raid") {
        db.ref("raid/bossHp").transaction(hp => (hp == null ? hp : Math.max(0, hp - d)));   // みんなで共有しているHPを削る
    } else {
        evolutionBossHp = Math.max(0, evolutionBossHp - d);
        updateEvolutionUI();
    }
}

// 不正解・時間切れのとき、ハートがどれだけ減るかを決める(効果の優先: 無効化 > 反射 > 切り傷(半減))
function computeMistake() {
    if (skillShield > 0) { skillShield--; return { lost: 0, note: "🛡️ シールドで、ダメージ無効" }; }
    if (fx.block > 0)     return { lost: 0, note: "⛓️ 行動阻害で、敵の攻撃は届かない" };
    if (fx.teamGuard > 0) return { lost: 0, note: "🌍 全体防御で、ダメージ無効" };
    if (fx.reflect > 0)   return { lost: 0, note: `🪞 攻撃を反射！ 敵に${fx.reflectDmg}ダメージ`, reflectDmg: fx.reflectDmg };
    if (fx.cut > 0)       return { lost: 0.5, note: "🩸 切り傷で、敵の攻撃が半減" };
    return { lost: 1, note: "" };
}

function mistakeText(kind, m) {   // kind: "wrong"(不正解) / "timeup"(時間切れ)
    const head = kind === "timeup" ? "⌛ 時間切れ！" : "❌ 不正解！";
    if (m.lost >= 1) return `${head} ハートが1つ減った！`;
    if (m.lost > 0) return `${head} ${m.note}！ ハートが${m.lost}減った！`;
    return `${head} ${m.note}！ ハートは減らない！`;
}

// 1問が終わるたびに呼ぶ: 毒のダメージを与えて、継続効果の残り問題数を1つ進める。メッセージに足す文字を返す
function endQuestionTick() {
    let note = "";
    if (fx.poison > 0 && fx.poisonDmg > 0) {
        applyBossDamage(fx.poisonDmg);
        note += ` ☠️ 毒で${fx.poisonDmg}ダメージ！`;
    }
    ["block", "teamGuard", "reflect", "cut", "poison"].forEach(k => { if (fx[k] > 0) fx[k]--; });
    return note;
}

// スキルでボスを倒したとき(昇格戦): 回答のあとと同じ流れ(次の敵 / 勝利)へ進める
function evolutionSkillKill() {
    stopTimer();
    for (let i = 0; i < 4; i++) { const b = document.getElementById("choice" + i); if (b) b.disabled = true; }
    const epoch = skillEpoch;
    setTimeout(() => { if (epoch === skillEpoch) evolutionAfterTurn(); }, 1300);
}

function takeSkillShield() {
    if (skillShield > 0) { skillShield--; return true; }
    return false;
}

// スキルの効果を発動する。成功したら、メッセージ(文字列)を返す。意味がない場面なら false(回数は減らさない)
function applySkillEffect(sk, p, subject, lv) {
    const raid = currentBattleMode === "raid";
    const answer = raid ? raidQuestion.answer : evolutionQuestion.answer;
    const epoch = skillEpoch;
    switch (sk.type) {
        case "timestop": {
            if (timeStopActive) return false;
            timeStopActive = true;
            updateTimerUI();
            setTimeout(() => {
                if (epoch !== skillEpoch) return;
                timeStopActive = false;
                updateTimerUI();
                showBattleMessage("▶️ 時間が動き出した！");
            }, p * 1000);
            return `タイマーが${p}秒止まる！`;
        }
        case "hint": {
            const cands = [0, 1, 2, 3].filter(i => i !== answer && !document.getElementById("choice" + i).disabled);
            if (cands.length === 0) return false;
            for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
            const n = Math.min(p, cands.length);
            for (let k = 0; k < n; k++) {
                const b = document.getElementById("choice" + cands[k]);
                b.disabled = true;
                b.style.opacity = "0.25";
            }
            return `誤答を${n}つ消した！`;
        }
        case "heal": {
            const cur = raid ? raidPlayerHearts : evolutionPlayerHearts;
            const max = raid ? raidPlayerMaxHearts : evolutionPlayerMaxHearts;
            if (cur >= max) return false;
            const gain = Math.min(p, max - cur);
            if (raid) { raidPlayerHearts += gain; updateRaidHeartsUI(); }
            else { evolutionPlayerHearts += gain; updateEvolutionUI(); }
            return `ハートが${gain}つ回復！`;
        }
        case "extend": {
            if (!timer && !timeStopActive) return false;
            timeLeft = Math.min(TIMER_MAX + 10, timeLeft + p);
            updateTimerUI();
            return `制限時間が${p}秒のびた！`;
        }
        case "reroll": {
            if (raid) generateRaidQuestion(); else generateEvolutionQuestion();
            startTimer();
            return "問題を入れ替えた！";
        }
        case "powerup": {
            if (skillPowerMult > 1) return false;
            skillPowerMult = p;
            return `次の正解のダメージが${p}倍！`;
        }
        case "shield": {
            if (skillShield > 0) return false;
            skillShield = 1;
            return "次の失敗を、1回だけ防ぐ！";
        }
        case "autocorrect": {
            stopTimer();
            for (let i = 0; i < 4; i++) { const b = document.getElementById("choice" + i); if (b) b.disabled = true; }
            setTimeout(() => {
                if (epoch !== skillEpoch) return;
                if (raid) handleRaidAnswer(answer); else handleEvolutionAnswer(answer);
            }, 500);
            return "この問題を正解にした！";
        }
        case "flame":
        case "beam":
        case "slash": {
            // 攻撃スキル: 先頭のキャラの攻撃力 × 倍率でダメージ。問題には答えず、すぐ攻撃する
            const base = getPlayerStats(Math.max(1, lv)).attack;
            let dmg = Math.round(base * (p || 1));
            let crit = false;
            if (sk.crit && Math.random() < sk.crit) { dmg = Math.round(dmg * (sk.critMult || 2)); crit = true; }
            let text;
            if (sk.type === "flame") {
                text = crit ? `💥 クリティカル！ 紫炎が敵を焼き尽くす！ ${dmg} ダメージ！` : `紫炎が敵を焼いた！ ${dmg} ダメージ！`;
            } else if (sk.type === "beam") {
                const heal = lvPick(sk.heal, lv) || 0;
                const cur = raid ? raidPlayerHearts : evolutionPlayerHearts;
                const max = raid ? raidPlayerMaxHearts : evolutionPlayerMaxHearts;
                const gain = Math.max(0, Math.min(heal, max - cur));
                if (gain > 0) {
                    if (raid) { raidPlayerHearts += gain; updateRaidHeartsUI(); }
                    else { evolutionPlayerHearts += gain; updateEvolutionUI(); }
                }
                text = `光のビームが敵を貫いた！ ${dmg} ダメージ！` + (gain > 0 ? ` ハートが${gain}つ回復！` : "");
            } else {
                const t = lvPick(sk.turns, lv) || 3;
                fx.cut = Math.max(fx.cut, t);
                text = `抜刀！ ${dmg} ダメージ！ 敵に切り傷を負わせ、${t}問のあいだ敵の攻撃が半減！`;
            }
            playAttackPose(subject);
            applyBossDamage(dmg);
            if (!raid && evolutionBossHp <= 0) evolutionSkillKill();      // 昇格戦で倒したら、次の敵・勝利へ
            return text;
        }
        case "block": {
            if (fx.block > 0) return false;
            fx.block = lvPick(sk.turns, lv) || 3;
            return `敵の行動を阻害！ ${fx.block}問のあいだ、ダメージを受けない！`;
        }
        case "teamGuard": {
            if (fx.teamGuard > 0) return false;
            fx.teamGuard = lvPick(sk.turns, lv) || 3;
            return `守りの結界！ ${fx.teamGuard}問のあいだ、ダメージ無効！`;
        }
        case "reflect": {
            if (fx.reflect > 0) return false;
            fx.reflect = lvPick(sk.turns, lv) || 3;
            fx.reflectDmg = sk.reflectDamage || 200;
            return `敵の攻撃を引き付けた！ ${fx.reflect}問のあいだ、受けるはずのダメージを反射する！`;
        }
        case "poison": {
            if (fx.poison > 0) return false;
            fx.poison = lvPick(sk.turns, lv) || 4;
            fx.poisonDmg = sk.dot || 50;
            return `毒の霧！ ${fx.poison}問のあいだ、1問ごとに${fx.poisonDmg}ダメージ！`;
        }
        default:
            return false;
    }
}

function useSkill(i) {
    if (!SKILLS_ENABLED) return;
    const ent = skillEntries[i];
    if (!ent || (skillCooldownLeft[i] || 0) > 0 || !canUseSkillNow()) return;
    const sk = ent.sk, subject = ent.subject;

    const lv = currentSkillLevel(subject);
    const msg = applySkillEffect(sk, skillPower(sk, lv), subject, lv);
    if (!msg) return;                                   // 意味がない場面では、クールタイムに入らない

    skillCooldownLeft[i] = skillCooldownOf(sk);         // 使ったら、クールタイム開始(正解した回数で数える)
    showBattleMessage(`${sk.icon} ${subjectMeta[subject].name}の「${sk.name}」！ ${msg}`);
    const slotIdx = Math.max(0, battlePartySlots.indexOf(subject));
    const slotEl = document.getElementById(`party-slot-${slotIdx}`);
    if (slotEl) {                                       // 使ったキャラが、一瞬光る
        slotEl.classList.remove("skill-cast"); void slotEl.offsetWidth; slotEl.classList.add("skill-cast");
        setTimeout(() => slotEl.classList.remove("skill-cast"), 800);
    }
    updateSkillBarState();
}

// --- タイマー ---
let timer = null;
let timeLeft = 15;
let timeStopActive = false;

// ==========================================
// 💾 セーブ・ロード
// ==========================================
// --- ブラウザの保存領域を安全に読み書きするための道具(使えない環境でも落ちないように) ---
function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { console.error("保存に失敗:", key, e); return false; }
}
function safeStorageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
}

let saveReady = false;     // 起動時の読み込みが終わるまでは、自動保存で初期データを上書きしない
let saveWarned = false;

function warnSaveFailed() {
    if (saveWarned) return;
    saveWarned = true;
    alert("⚠️ このブラウザでは進行状況を保存できません。\nプライベートブラウズをやめるか、SafariかChromeで開いてください。");
}

function saveGame() {
    if (!safeStorageSet("characterLevels", JSON.stringify(characterLevels))) warnSaveFailed();
}

function loadGame() {
    loadTrialUnlocked();
    loadTrialHintTaps();
    const saved = safeStorageGet("characterLevels");
    if (!saved) return;
    let parsed;
    try {
        parsed = JSON.parse(saved);
    } catch (e) {
        console.error("セーブデータを読めませんでした(初期状態で開始します):", e);
        return;
    }
    if (!parsed || typeof parsed !== "object") return;

    // 保存データを読み込みつつ、値が壊れていても範囲内に収める(新教科は初期値のまま)
    Object.keys(characterLevels).forEach(subject => {
        const p = parsed[subject];
        if (!p || typeof p !== "object") return;
        const level = Math.max(0, Math.min(3, parseInt(p.level, 10) || 0));
        const exp = Math.max(0, parseInt(p.exp, 10) || 0);
        characterLevels[subject] = { level: level, exp: exp, maxExp: characterLevels[subject].maxExp };
    });
}

// 画面を閉じる・アプリを切り替えるときにも、念のため保存する
function saveAll() {
    if (!saveReady) return;
    saveGame();
    savePlayerParty();
}
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveAll();
});
window.addEventListener("pagehide", saveAll);

// 起動時のチェック: 保存できる環境か / アプリ内ブラウザでないか / 保存領域を消されにくくする
function checkSaveEnvironment() {
    try {
        localStorage.setItem("__save_test", "1");
        localStorage.removeItem("__save_test");
    } catch (e) {
        warnSaveFailed();
        return;
    }

    const ua = navigator.userAgent || "";
    if (/Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger|KAKAOTALK/i.test(ua)) {
        let warned = false;
        try { warned = sessionStorage.getItem("inAppWarned") === "1"; } catch (e) {}
        if (!warned) {
            alert("⚠️ LINEなどのアプリ内ブラウザだと、進行状況が消えることがあります。\nSafari や Chrome で開くのがおすすめです。");
            try { sessionStorage.setItem("inAppWarned", "1"); } catch (e) {}
        }
    }

    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
}

// ==========================================
// ❤️ ステータス取得
// ==========================================
function getPlayerStats(level) {
    const stats = {
        1: { hearts: 5,  attack: 100, stopSec: 3 },
        2: { hearts: 8,  attack: 150, stopSec: 4 },
        3: { hearts: 11, attack: 200, stopSec: 5 },
    };
    return stats[level] || stats[1];
}

// ==========================================
// 👾 雑魚敵プール(昇格戦でボスの前に登場)
//   img  : 画像ファイル名(index.html と同じ階層に置く)
//   name : 戦闘画面に表示される名前(自由に変更OK)
// ==========================================
const MOB_POOL = [
    { img: "enemy1.png",  name: "ハテナ・ゴーレム" },
    { img: "enemy2.png",  name: "ブック・フェアリー" },
    { img: "enemy4.png",  name: "ギア・ロボ" },
    { img: "enemy5.png",  name: "フラスコの老魔術師" },
    { img: "enemy6.png",  name: "ペーパー・バット" },
    { img: "enemy7.png",  name: "ABCのエルフ" },
    { img: "enemy8.png",  name: "墨絵のタコ師匠" },
    { img: "enemy9.png",  name: "コード・クラーケン" },
    { img: "enemy10.png", name: "くしゃくしゃ答案" }
];
// 昇格戦で「最後の敵」の前に追加で出す雑魚の数(0 = 1戦につき1体だけ)。増やしたいときは数字を変える
const MOB_EXTRA_BY_LEVEL = { 1: 0, 2: 0 };
const MOB_HP_ATTACK_MULTIPLIER = 2;   // 追加で出る雑魚のHP = 攻撃力 × この数

let evolutionWaves = [];
let evolutionWaveIndex = 0;

// 昇格戦の敵リストを作る。最後の1体は、従来どおりのHP(getEnemyHp)で戦う。
function buildEvolutionWaves(lv, stats) {
    const extra = MOB_EXTRA_BY_LEVEL[lv] !== undefined ? MOB_EXTRA_BY_LEVEL[lv] : 0;
    const pool = MOB_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {          // シャッフル(同じ敵が連続しない)
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = pool.slice(0, extra + 1);
    return picked.map((m, i) => {
        const isLast = (i === picked.length - 1);
        return {
            boss: isLast,
            name: m.name,
            img: m.img,
            hp: isLast ? getEnemyHp(lv) : stats.attack * MOB_HP_ATTACK_MULTIPLIER
        };
    });
}

function loadEvolutionEnemy(healed) {
    const e = evolutionWaves[evolutionWaveIndex];
    if (!e) return;
    evolutionBossHp = e.hp;
    evolutionBossMaxHp = e.hp;

    const bossNameEl = document.getElementById("boss-name");
    if (bossNameEl) {
        bossNameEl.innerText = evolutionWaves.length > 1
            ? `${e.name}（${evolutionWaveIndex + 1}/${evolutionWaves.length}）`
            : e.name;
    }
    const bossImg = document.getElementById("boss-img");
    if (bossImg) { bossImg.style.display = "block"; bossImg.src = e.img; }

    updateEvolutionUI();
    showBattleMessage(`${healed ? "💚 ハート回復！ " : ""}⚔️ ${e.name} が現れた！`);
}

function getEnemyHp(level) {
    // level = 現在のレベル（これに勝つと level+1 になる）
    if (level === 1) return 500;
    if (level === 2) return 800;
    return 500;
}

// ==========================================
// 🎨 選択肢シャッフル共通関数
// ==========================================
function shuffleChoices(correct, dummies) {
    let choices = [correct, ...dummies.slice(0, 3)];
    choices = Array.from(new Set(choices));
    while (choices.length < 4) choices.push("その他");
    for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[j], choices[i]] = [choices[i], choices[j]];
    }
    return { choices, answerIndex: choices.indexOf(correct) };
}

// ==========================================
// 🌋 クイズ生成
// ==========================================
function generateRandomRaidQuestion() {
    const subjects = ["国語", "数学", "英語", "物理", "化学", "歴史", "地理"];
    const chosenSubject = subjects[Math.floor(Math.random() * subjects.length)];
    let currentLv = characterLevels[chosenSubject] ? characterLevels[chosenSubject].level : 0;

    let qText = ""; let correct = ""; let dummies = [];

    if (chosenSubject === "国語") {
        if (currentLv === 0 || currentLv === 1) {
            const lv1Words = [
                {k:"毎日", y:"まいにち", d:["まいにっち", "めいにち", "まにち"]},
                {k:"博士", y:"はかせ", d:["はくし", "ばかせ", "ひろし"]},
                {k:"宿題", y:"しゅくだい", d:["しゅくたい", "すくだい", "しゅくだえ"]},
                {k:"学校", y:"がっこう", d:["かくこう", "かっこう", "がくこう"]},
                {k:"先生", y:"せんせい", d:["ぜんせい", "せんせ", "しんせい"]},
                {k:"友達", y:"ともだち", d:["どもだち", "ともたち", "ゆうだち"]},
                {k:"昨日", y:"きのう", d:["さくじつ", "きじつ", "きの"]},
                {k:"今日", y:"きょう", d:["こんにち", "こにち", "きょ"]},
                {k:"明日", y:"あした", d:["みょうにち", "あす", "あしたた"]},
                {k:"元気", y:"げんき", d:["かんき", "がんき", "げんぎ"]},
                {k:"天気", y:"てんき", d:["でんき", "てんぎ", "てんきい"]},
                {k:"自動", y:"じどう", d:["しどう", "じとう", "じど"]},
                {k:"安心", y:"あんしん", d:["あんじん", "あんし", "はんしん"]},
                {k:"注意", y:"ちゅうい", d:["じゅうい", "ちゅい", "きょうい"]},
                {k:"計算", y:"けいさん", d:["けんさん", "けいざん", "けいさんん"]},
                {k:"用意", y:"ようい", d:["よ意", "ようり", "ゆい"]},
                {k:"料理", y:"りょうり", d:["りょり", "りょうじ", "りより"]},
                {k:"家族", y:"かぞく", d:["かぞっく", "やぞく", "かぞぐ"]},
                {k:"仕事", y:"しごと", d:["しこと", "じごと", "つかえごと"]},
                {k:"勉強", y:"べんきょう", d:["べんきょ", "めんきょう", "べんごう"]},
                {k:"音楽", y:"おんがく", d:["おんらく", "いんがく", "おんがぐ"]},
                {k:"旅行", y:"りょこう", d:["りょくこう", "りよこう", "りこう"]},
                {k:"時計", y:"とけい", d:["どけい", "とけえ", "ときけい"]},
                {k:"電話", y:"でんわ", d:["てんわ", "でんわわ", "でんが"]},
                {k:"電車", y:"でんしゃ", d:["てんしゃ", "でんじゃ", "れっしゃ"]},
                {k:"自転車", y:"じてんしゃ", d:["してんしゃ", "じてんじゃ", "じどうしゃ"]},
                {k:"自動車", y:"じどうしゃ", d:["しどうしゃ", "じどうじゃ", "くるま"]},
                {k:"飛行機", y:"ひこうき", d:["びこうき", "ひごうき", "ひくうき"]},
                {k:"駅前", y:"えきまえ", d:["えきぜん", "うまやまえ", "えきまい"]},
                {k:"公園", y:"こうえん", d:["ごうえん", "ほうえん", "こういん"]},
                {k:"動物園", y:"どうぶつえん", d:["とぶつえん", "どうぶついん", "どうぶつえ"]},
                {k:"図書館", y:"としょかん", d:["ずしょかん", "としょいん", "とすょかん"]},
                {k:"体育館", y:"たいいくかん", d:["たいくかん", "たいいくいん", "たいいぐかん"]},
                {k:"映画館", y:"えいがかん", d:["えがかん", "えいがいん", "えいかかん"]},
                {k:"病院", y:"びょういん", d:["びよいいん", "びょうえん", "びおん"]},
                {k:"郵便局", y:"ゆうびんきょく", d:["ゆびんきょく", "ゆうびんきょくく", "ゆうべんきょく"]},
                {k:"銀行", y:"ぎんこう", d:["きんこう", "ぎんごう", "ぎんくう"]},
                {k:"商店", y:"しょうてん", d:["あきぜん", "しょうでん", "しょうて"]},
                {k:"市場", y:"いちば", d:["しじょう", "いちばば", "しじょ"]},
                {k:"教室", y:"きょうしつ", d:["きょしつ", "きょうしづ", "きょうし"]},
                {k:"教科書", y:"きょうかしょ", d:["きょかしょ", "きょうかしょょ", "きょうがしょ"]},
                {k:"黒板", y:"こくばん", d:["くろいた", "こくぱん", "こぐばん"]},
                {k:"質問", y:"しつもん", d:["しづもん", "しつもんん", "ひつもん"]},
                {k:"答え", y:"こたえ", d:["とうえ", "こたええ", "ごたえ"]},
                {k:"試験", y:"しけん", d:["じけん", "しけんん", "しげん"]},
                {k:"成績", y:"せいせき", d:["せいぜき", "せんせき", "せいせぐ"]},
                {k:"卒業", y:"そつぎょう", d:["そつぎょ", "そづぎょう", "しゅつぎょう"]},
                {k:"入学", y:"にゅうがく", d:["にゅうかく", "にゅうがくく", "にうがく"]},
                {k:"見学", y:"けんがく", d:["みがく", "けんかく", "げんがく"]},
                {k:"練習", y:"れんしゅう", d:["れんしゅ", "ねんしゅう", "れんじゅう"]},
                {k:"運動", y:"うんどう", d:["おんどう", "うんとう", "はこびうごき"]},
                {k:"水泳", y:"すいえい", d:["みずえい", "すいええ", "ずいえい"]},
                {k:"走る", y:"はしる", d:["そうる", "はしいる", "ぱしる"]},
                {k:"歩く", y:"あるく", d:["ほく", "あゆく", "あるぐ"]},
                {k:"飛ぶ", y:"とぶ", d:["ひぶ", "とぷ", "とぶぶ"]},
                {k:"投げる", y:"なげる", d:["とうげる", "なける", "なげえる"]},
                {k:"拾う", y:"ひろう", d:["じゅうう", "ひろお", "しゅうう"]},
                {k:"探す", y:"さがす", d:["たんす", "さがお", "さがづ"]},
                {k:"集める", y:"あつめる", d:["しゅうめる", "あづめる", "あつめえる"]},
                {k:"発表", y:"はっぴょう", d:["はつひょう", "はっぴょ", "ばっぴょう"]},
                {k:"葛藤", y:"かっとう", d:["かつどう", "ちるとう", "きんとう"]},
            ];
            const p = lv1Words[Math.floor(Math.random() * lv1Words.length)];
            qText = `「${p.k}」の正しい読み方は？`; correct = p.y; dummies = p.d;

        } else if (currentLv === 2) {
            const lv2Words = [
                {k:"雰囲気", y:"ふんいき", d:["ふいんき", "ふんいぎ", "ふいんぎ"]},
                {k:"重複", y:"ちょうふく", d:["じゅうふく", "おもぶく", "ちょうぶく"]},
                {k:"一段落", y:"いちだんらく", d:["ひとだんらく", "いっちょくらく", "いちだんろく"]},
                {k:"建立", y:"こんりゅう", d:["けんりつ", "conりつ", "たてりつ"]},
                {k:"流石", y:"さすが", d:["ながれいし", "りゅうせき", "かせき"]},
                {k:"相殺", y:"そうさい", d:["そうさつ", "あいさつ", "あいさい"]},
                {k:"刷新", y:"さっしん", d:["すいしん", "さつあたら", "さつしん"]},
                {k:"更迭", y:"こうてつ", d:["そいてつ", "さいてつ", "こうてき"]},
                {k:"言質", y:"げんち", d:["げんしつ", "ことじつ", "げんしち"]},
                {k:"便宜", y:"べんぎ", d:["びんぎ", "べんよろ", "たより"]},
                {k:"境内", y:"けいだい", d:["けいない", "さかいうち", "きょうない"]},
                {k:"貼付", y:"ちょうふ", d:["はりつけ", "てんぷ", "はっつけ"]},
                {k:"五月雨", y:"さみだれ", d:["ごがつあめ", "さつきあめ", "さみだに"]},
                {k:"割愛", y:"かつあい", d:["わりあい", "かつめぐ", "わりまな"]},
                {k:"依存", y:"いぞん", d:["いそん", "よりかかり", "いぞう"]},
                {k:"既出", y:"きしゅつ", d:["がいしゅつ", "すでにで", "すでしゅつ"]},
                {k:"出頭", y:"しゅっとう", d:["であたま", "しゅつず", "でとう"]},
                {k:"読経", y:"どきょう", d:["どくきょう", "よみきょう", "どけい"]},
                {k:"固執", y:"こしつ", d:["こしゅう", "かたしつ", "こじつ"]},
                {k:"脆弱", y:"ぜいじゃく", d:["きしゃく", "くちよわ", "よわよわ"]},
                {k:"汎用", y:"はんよう", d:["ぼんよう", "ぱんよう", "なみよう"]},
                {k:"遵守", y:"じゅんしゅ", d:["そんしゅ", "じゅんまもり", "たてしゅ"]},
                {k:"破綻", y:"はたん", d:["へいてい", "ばくじょう", "やぶたん"]},
                {k:"進捗", y:"しんちょく", d:["しんぽ", "しんあゆみ", "しんてき"]},
                {k:"過分", y:"かぶん", d:["すぎぶん", "かふん", "すぎわけ"]},
                {k:"捏造", y:"ねつぞう", d:["でつぞう", "こねぞう", "まつぞう"]},
                {k:"凡例", y:"はんれい", d:["ぼんれい", "なみれい", "ぱんれい"]},
                {k:"示唆", y:"しさ", d:["しじ", "じさ", "しそ"]},
                {k:"出生率", y:"しゅっしょうりつ", d:["しゅっせいりつ", "でうまれりつ", "でしょうりつ"]}
            ];
            const p = lv2Words[Math.floor(Math.random() * lv2Words.length)];
            qText = `【中級】「${p.k}」の正しい読み方は？`; correct = p.y; dummies = p.d;

        } else {
            const lv3Words = [
                {k:"葛藤", y:"かっとう", d:["かつどう", "ちるとう", "きんとう"]},
                {k:"一期一会", y:"いちごいちえ", d:["いちごいちかい", "いっきいちえ", "いちごいちあい"]},
                {k:"不如帰", y:"ほととぎす", d:["ふじょき", "おかえらず", "はずき"]},
                {k:"玉響", y:"たまゆら", d:["たまひびき", "ぎょくきょう", "たまおと"]},
                {k:"出納", y:"すいとう", d:["しゅつのう", "でいれ", "しゅつなう"]},
                {k:"間髪をいれず", y:"かんはつをいれず", d:["かんぱつをいれず", "まがみをいれず", "かんはつをいれ"]},
                {k:"未曾有", y:"みぞう", d:["みぞうう", "みそゆう", "いままだ"]},
                {k:"一蓮托生", y:"いちれんたくしょう", d:["いちれんたくせい", "ひとつはす", "いちれんたくす"]},
                {k:"魑魅魍魎", y:"ちみもうりょう", d:["すだま", "おにもの", "ちみもうりょ"]},
                {k:"乾坤一擲", y:"けんこんいってき", d:["けんこんいっちょう", "いぬゐとう", "けんこんいっつる"]},
                {k:"毀誉褒貶", y:"きよほうへん", d:["きよほうべん", "こわしほめ", "きよほうほう"]},
                {k:"八面六臂", y:"はちめんろっぴ", d:["はちめんろっぴび", "やつめんろっぴ", "はちめんろくうで"]},
                {k:"獅子奮迅", y:"ししふんじん", d:["ししふんしん", "いのししふんじん", "ししふるい"]},
                {k:"臥薪嘗胆", y:"がしんしょうたん", d:["がしんしょうたに", "ふしきも", "がしんしょうだん"]},
                {k:"大器晩成", y:"たいきばんせい", d:["だいきばんせい", "たいきばんじょう", "おおきわき"]},
                {k:"融通無碍", y:"ゆうずうむげ", d:["ゆうつうむげ", "とおるむげ", "ゆうずうむかい"]},
                {k:"森羅万象", y:"しんらばんしょう", d:["しんらばんぞう", "しんらまんしょう", "しんらばしょう"]},
                {k:"切磋琢磨", y:"せっさたくま", d:["さいさたくま", "せっさたくば", "せっさだくま"]},
                {k:"曖昧模糊", y:"あいまいもこ", d:["あいまいもご", "くらもこ", "あいまいもく"]},
                {k:"支離滅裂", y:"しりめつれつ", d:["しりべつれつ", "しりめつれづ", "しりめづれづ"]},
                {k:"荒唐無稽", y:"こうとうむけい", d:["あらとうむけい", "こうとうむかい", "こうとうむき"]},
                {k:"傍若無人", y:"ぼうじゃくぶじん", d:["ほうじゃくむじん", "はたわかむじん", "ぼうじゃくむにん"]},
                {k:"言語道断", y:"ごんごどうだん", d:["げんごどうだん", "ことばどうだん", "ごんごどうだ"]},
                {k:"紆余曲折", y:"うよきょくせつ", d:["うよきょくせづ", "うよきょく", "うよきょくせっしん"]},
                {k:"厚顔無恥", y:"こうがんむち", d:["あつがおむち", "こうがんむじ", "こうがんむし"]},
                {k:"孤立無援", y:"こりつむえん", d:["ひとりむえん", "こりづむえん", "こりつむえ"]},
                {k:"試行錯誤", y:"しこうさくご", d:["しこうさくこ", "ためしさくご", "しこうさく"]},
                {k:"自業自得", y:"じごうじとく", d:["じごうじえ", "みからでたさび", "じごうじとぐ"]},
                {k:"神出鬼没", y:"しんしゅつきぼつ", d:["かみでつきぼつ", "しんしゅつきぼづ", "しんしゅつきも"]},
                {k:"単刀直入", y:"たんとうちょくにゅう", d:["たんとうちょくいれ", "かたなちょくにゅう", "たんとうちょくにゅ"]}
            ];
            const p = lv3Words[Math.floor(Math.random() * lv3Words.length)];
            qText = `【上級】「${p.k}」の正しい読み方は？`; correct = p.y; dummies = p.d;
        }
    } else if (chosenSubject === "地理") {
        const geoEasyQuestions = [
            { q: "日本で一番大きい湖は？", correct: "琵琶湖", dummies: ["霞ヶ浦", "猪苗代湖", "洞爺湖"] },
            { q: "日本で一番高い山は？", correct: "富士山", dummies: ["立山", "北岳", "御嶽山"] },
            { q: "日本の首都は？", correct: "東京", dummies: ["大阪", "京都", "名古屋"] },
            { q: "日本で一番大きい島は？", correct: "本州", dummies: ["北海道", "九州", "四国"] },
            { q: "日本列島の主な4つの島に含まれないのは？", correct: "沖縄島", dummies: ["北海道", "本州", "九州"] },
            { q: "世界で一番広い大陸は？", correct: "ユーラシア大陸", dummies: ["アフリカ大陸", "北アメリカ大陸", "南アメリカ大陸"] },
            { q: "世界で一番長い川は？", correct: "ナイル川", dummies: ["アマゾン川", "長江", "ミシシッピ川"] },
            { q: "世界で一番広い海(大洋)は？", correct: "太平洋", dummies: ["大西洋", "インド洋", "北極海"] },
            { q: "沖縄県の県庁所在地は？", correct: "那覇市", dummies: ["石垣市", "宮古島市", "名護市"] },
            { q: "北海道の道庁所在地は？", correct: "札幌市", dummies: ["函館市", "旭川市", "釧路市"] },
            { q: "47都道府県のうち「都」がつくのはどこ？", correct: "東京都", dummies: ["大阪都", "京都都", "北海道"] },
            { q: "日本で一番人口が多い都道府県は？", correct: "東京都", dummies: ["大阪府", "神奈川県", "愛知県"] },
            { q: "日本で一番長い川は？", correct: "信濃川", dummies: ["利根川", "石狩川", "最上川"] },
            { q: "世界で一番人口が多い国は？(2024年時点)", correct: "インド", dummies: ["中国", "アメリカ", "インドネシア"] },
            { q: "日本にある都道府県の数は？", correct: "47", dummies: ["43", "50", "45"] },
        ];
        const geoNormalQuestions = [
            { q: "次のうち「日本アルプス」に含まれないものは？", correct: "奥羽山脈", dummies: ["飛騨山脈", "木曽山脈", "赤石山脈"] },
            { q: "日本で最も面積が広い都道府県は？", correct: "北海道", dummies: ["岩手県", "福島県", "長野県"] },
            { q: "日本で最も面積が狭い都道府県は？", correct: "香川県", dummies: ["大阪府", "東京都", "沖縄県"] },
            { q: "瀬戸内海式気候の特徴として正しいものは？", correct: "年間降水量が少なく温暖", dummies: ["冬に雪が多い", "夏に台風が多い", "一年中寒冷"] },
            { q: "冬に「からっ風」と呼ばれる乾いた強い風が吹くことで知られる地域は？", correct: "北関東地方", dummies: ["東北地方", "九州地方", "北陸地方"] },
            { q: "日本三大急流に含まれない川は？", correct: "信濃川", dummies: ["最上川", "富士川", "球磨川"] },
            { q: "世界最大の砂漠は？", correct: "サハラ砂漠", dummies: ["ゴビ砂漠", "タクラマカン砂漠", "カラハリ砂漠"] },
            { q: "環太平洋造山帯に含まれない山脈は？", correct: "アルプス山脈", dummies: ["アンデス山脈", "ロッキー山脈", "日本アルプス"] },
            { q: "三大穀物に含まれないものは？", correct: "大豆", dummies: ["米", "小麦", "とうもろこし"] },
            { q: "経度0度の基準となる線を何という？", correct: "本初子午線", dummies: ["赤道", "日付変更線", "回帰線"] },
            { q: "緯度0度の線を何という？", correct: "赤道", dummies: ["本初子午線", "回帰線", "極線"] },
            { q: "EU(欧州連合)の本部が置かれている都市は？", correct: "ブリュッセル", dummies: ["パリ", "ベルリン", "ロンドン"] },
            { q: "アメリカの首都は？", correct: "ワシントンD.C.", dummies: ["ニューヨーク", "ロサンゼルス", "シカゴ"] },
            { q: "オーストラリアの首都は？", correct: "キャンベラ", dummies: ["シドニー", "メルボルン", "パース"] },
            { q: "日本で最も人口が少ない都道府県は？", correct: "鳥取県", dummies: ["島根県", "高知県", "徳島県"] },
        ];
        const geoHardQuestions = [
            { q: "ケッペンの気候区分で「温暖湿潤気候」を表す記号は？", correct: "Cfa", dummies: ["Cfb", "Cwa", "Dfa"] },
            { q: "フォッサマグナ東側の境界とされる構造線は？", correct: "糸魚川静岡構造線", dummies: ["中央構造線", "柏崎千葉構造線", "棚倉構造線"] },
            { q: "六大陸のうち面積が最小の大陸は？", correct: "オーストラリア大陸", dummies: ["南極大陸", "ヨーロッパ大陸", "南アメリカ大陸"] },
            { q: "偏西風の影響を強く受ける温帯気候区は？", correct: "西岸海洋性気候", dummies: ["地中海性気候", "ステップ気候", "サバナ気候"] },
            { q: "日本の三大工業地帯に含まれないものは？", correct: "北九州工業地帯", dummies: ["京浜工業地帯", "中京工業地帯", "阪神工業地帯"] },
            { q: "大陸を除いて世界最大の島は？", correct: "グリーンランド", dummies: ["ボルネオ島", "ニューギニア島", "マダガスカル島"] },
            { q: "排他的経済水域は海岸線から何海里までとされている？", correct: "200海里", dummies: ["12海里", "100海里", "350海里"] },
            { q: "世界で最も深い海溝は？", correct: "マリアナ海溝", dummies: ["日本海溝", "ペルー海溝", "トンガ海溝"] },
            { q: "赤道付近で上昇気流が発生し低圧帯となる帯を何という？", correct: "赤道低圧帯", dummies: ["亜熱帯高圧帯", "偏西風帯", "極高圧帯"] },
            { q: "日本列島が位置する4つのプレートに含まれないものは？", correct: "インド・オーストラリアプレート", dummies: ["太平洋プレート", "北米プレート", "フィリピン海プレート"] },
            { q: "世界三大宗教に含まれないものは？", correct: "ヒンドゥー教", dummies: ["仏教", "キリスト教", "イスラム教"] },
            { q: "人口が最も多い大陸は？", correct: "アジア", dummies: ["アフリカ", "ヨーロッパ", "北アメリカ"] },
            { q: "「モンスーン」の意味に最も近いものは？", correct: "季節風", dummies: ["偏西風", "貿易風", "台風"] },
            { q: "日本標準時の基準となる経線は東経何度？", correct: "東経135度", dummies: ["東経140度", "東経120度", "東経150度"] },
            { q: "経度15度ごとに生じる時差はおよそ何時間？", correct: "1時間", dummies: ["15分", "30分", "2時間"] },
        ];

        let geoPool;
        if (currentLv === 0 || currentLv === 1) {
            geoPool = geoEasyQuestions;
        } else if (currentLv === 2) {
            geoPool = geoNormalQuestions;
        } else {
            geoPool = geoHardQuestions;
        }
        const p = geoPool[Math.floor(Math.random() * geoPool.length)];
        qText = p.q; correct = p.correct; dummies = p.dummies;
    } else if (chosenSubject === "歴史") {
            const historyEasyQuestions = [
                { q: "邪馬台国の女王として知られる人物は誰？", correct: "卑弥呼", dummies: ["推古天皇", "持統天皇", "紫式部"] },
                { q: "冠位十二階や十七条の憲法を定めた人物は誰？", correct: "聖徳太子", dummies: ["中大兄皇子", "中臣鎌足", "藤原道長"] },
                { q: "奈良時代に東大寺の大仏を作らせた天皇は誰？", correct: "聖武天皇", dummies: ["桓武天皇", "推古天皇", "天武天皇"] },
                { q: "平安京へ都を移した天皇は誰？", correct: "桓武天皇", dummies: ["聖武天皇", "推古天皇", "後鳥羽天皇"] },
                { q: "『源氏物語』を書いた人物は誰？", correct: "紫式部", dummies: ["清少納言", "与謝野晶子", "和泉式部"] },
                { q: "『枕草子』を書いた人物は誰？", correct: "清少納言", dummies: ["紫式部", "樋口一葉", "与謝野晶子"] },
                { q: "鎌倉幕府を開いた人物は誰？", correct: "源頼朝", dummies: ["平清盛", "源義経", "北条時宗"] },
                { q: "鎌倉時代に、将軍と御家人の間で結ばれた、土地を認めてもらう代わりに命がけで戦うという絆（きずな）の関係を何という？", correct: "御恩と奉公", dummies: ["参勤交代", "班田収授", "墾田永年私財"] },
                { q: "室町幕府を開いた人物は誰？", correct: "足利尊氏", dummies: ["足利義満", "足利義政", "徳川家康"] },
                { q: "金閣を建てた将軍は誰？", correct: "足利義満", dummies: ["足利義政", "足利尊氏", "徳川家光"] },
                { q: "銀閣を建てた将軍は誰？", correct: "足利義政", dummies: ["足利義昭", "足利義満", "足利義教"] },
                { q: "1543年に日本へ伝わった武器は何？", correct: "鉄砲", dummies: ["大砲", "弓矢", "槍"] },
                { q: "1549年にキリスト教を伝えた人物は誰？", correct: "ザビエル", dummies: ["ペリー", "マルコ・ポーロ", "コロンブス"] },
                { q: "本能寺の変で亡くなった武将は誰？", correct: "織田信長", dummies: ["豊臣秀吉", "徳川家康", "武田信玄"] },
                { q: "織田信長や豊臣秀吉の時代、お城のまわりに作られ、商人が自由に売り買いできるようにしたきらびやかな町を何という？", correct: "城下町", dummies: ["門前町", "宿場町", "港町"] },
                { q: "関ヶ原の戦いで勝利した武将は誰？", correct: "徳川家康", dummies: ["石田三成", "豊臣秀頼", "真田幸村"] },
                { q: "江戸幕府を開いた人物は誰？", correct: "徳川家康", dummies: ["徳川家光", "徳川吉宗", "徳川慶喜"] },
                { q: "参勤交代を制度化した将軍は誰？", correct: "徳川家光", dummies: ["徳川綱吉", "徳川家康", "徳川吉宗"] },
                { q: "「生類憐みの令」を出した将軍は誰？", correct: "徳川綱吉", dummies: ["徳川吉宗", "徳川家斉", "徳川家茂"] },
                { q: "徳川吉宗が、身分に関係なく、お医者さんの知恵や政治の意見を箱に入れて人々に投稿させた仕組みを何という？", correct: "目安箱", dummies: ["かわら版", "公事方御定書", "寺子屋"] },
                { q: "日本地図を完成させた人物は誰？", correct: "伊能忠敬", dummies: ["杉田玄白", "本居宣長", "平賀源内"] },
                { q: "黒船で来航し開国を求めた人物は誰？", correct: "ペリー", dummies: ["ハリス", "マッカーサー", "リンカーン"] },
                { q: "薩長同盟の成立に尽力した人物は誰？", correct: "坂本龍馬", dummies: ["西郷隆盛", "高杉晋作", "木戸孝允"] },
                { q: "江戸幕府最後の将軍は誰？", correct: "徳川慶喜", dummies: ["徳川家茂", "徳川家光", "徳川綱吉"] },
                { q: "政権を天皇へ返した出来事を何という？", correct: "大政奉還", dummies: ["王政復古", "明治維新", "廃藩置県"] },
                { q: "藩を廃止して県を置いた改革を何という？", correct: "廃藩置県", dummies: ["地租改正", "学制発布", "殖産興業"] },
                { q: "日本初の内閣総理大臣は誰？", correct: "伊藤博文", dummies: ["大隈重信", "板垣退助", "西園寺公望"] },
                { q: "西南戦争で政府に反乱を起こした人物は誰？", correct: "西郷隆盛", dummies: ["大久保利通", "木戸孝允", "板垣退助"] },
                { q: "日清戦争の相手国はどこ？", correct: "中国（清）", dummies: ["ロシア", "アメリカ", "イギリス"] },
                { q: "1945年に終わった世界的な戦争は何？", correct: "第二次世界大戦", dummies: ["日露戦争", "第一次世界大戦", "西南戦争"] },
                { q: "2024年に新しいお札（1万円札）の肖像になった人物は誰？", correct: "渋沢栄一", dummies: ["福沢諭吉", "伊藤博文", "夏目漱石"] },
                { q: "奈良時代の都はどこ？", correct: "平城京", dummies: ["平安京", "藤原京", "江戸"] },
                { q: "日本で最も古い木造建築の一つとして知られる寺は？", correct: "法隆寺", dummies: ["東大寺", "清水寺", "金閣"] },
                { q: "平安時代に栄えた貴族の一族は？", correct: "藤原氏", dummies: ["平氏", "源氏", "北条氏"] },
                { q: "武士として初めて太政大臣になった人物は誰？", correct: "平清盛", dummies: ["源頼朝", "足利尊氏", "徳川家康"] },
                { q: "源頼朝の弟として有名な武将は誰？", correct: "源義経", dummies: ["源義家", "源実朝", "源為朝"] },
                { q: "元（モンゴル）が日本を攻めてきた出来事を何という？", correct: "元寇", dummies: ["承久の乱", "応仁の乱", "壬申の乱"] },
                { q: "現在の日本の元号は？", correct: "令和", dummies: ["平成", "昭和", "大正"] },
                { q: "「鳴かぬなら鳴かせてみせようホトトギス」とたとえられる武将は？", correct: "豊臣秀吉", dummies: ["織田信長", "徳川家康", "武田信玄"] },
                { q: "「鳴かぬなら殺してしまえホトトギス」とたとえられる武将は？", correct: "織田信長", dummies: ["徳川家康", "豊臣秀吉", "上杉謙信"] },
                { q: "大阪城を築いた武将は誰？", correct: "豊臣秀吉", dummies: ["徳川家康", "織田信長", "伊達政宗"] },
                { q: "天下統一の最後を飾った戦いとして有名なのは？", correct: "関ヶ原の戦い", dummies: ["桶狭間の戦い", "長篠の戦い", "川中島の戦い"] },
                { q: "江戸時代、日本の政治の中心となった都市は？", correct: "江戸", dummies: ["京都", "奈良", "鎌倉"] },
                { q: "江戸時代に外国との交流が認められていた長崎の人工島は？", correct: "出島", dummies: ["屋久島", "佐渡島", "淡路島"] },
                { q: "江戸時代に全国へ広まった子どもの学びの場は？", correct: "寺子屋", dummies: ["大学", "専門学校", "塾"] },
                { q: "「学問の神様」として知られる人物は誰？", correct: "菅原道真", dummies: ["聖徳太子", "藤原道長", "徳川吉宗"] },
                { q: "明治時代の初め、日本の政治の中心となった都市は？", correct: "東京", dummies: ["京都", "大阪", "奈良"] },
                { q: "明治時代に始まった、国民が兵役につく制度は？", correct: "徴兵令", dummies: ["刀狩", "参勤交代", "鎖国"] },
                { q: "明治時代に学校教育の制度を整えた政策は？", correct: "学制", dummies: ["鎖国", "刀狩", "参勤交代"] },
                { q: "明治時代、外国に負けない強い国にするために、進んだ技術を持つ国から大きな機械を呼び寄せて群馬県に作られた、日本最初の国営の製糸工場（シルクの工場）はどこ？", correct: "富岡製糸場", dummies: ["八幡製鉄所", "長崎造船所", "足尾銅山"] },
                { q: "日本と中国（清）が戦った戦争は？", correct: "日清戦争", dummies: ["日露戦争", "応仁の乱", "西南戦争"] },
                { q: "大正時代、男の人ならだれでも投票できるようにしよう、と人々の間で民主主義（デモクラシー）を求める運動がさかんになりました。この時代の動きを何という？", correct: "大正デモクラシー", dummies: ["文明開化", "自由民権運動", "明治維新"] },
                { q: "第二次世界大戦中、日本に原子爆弾が最初に投下された都市は？", correct: "広島", dummies: ["長崎", "東京", "大阪"] },
                { q: "原子爆弾が2番目に投下された都市は？", correct: "長崎", dummies: ["広島", "横浜", "神戸"] },
                { q: "日本国憲法が大切にしている「3つの大きな柱（原則）」に含まれないものはどれ？", correct: "鎖国（さこく）", dummies: ["国民主権", "基本的人権の尊重", "平和主義"] },
                { q: "日本国憲法で戦争の放棄を定めている条文は？", correct: "第9条", dummies: ["第1条", "第5条", "第15条"] },
                { q: "日本の国旗の名前は？", correct: "日の丸", dummies: ["旭日旗", "錦旗", "桜旗"] },
                { q: "「大谷翔平」が活躍しているスポーツは？", correct: "野球", dummies: ["サッカー", "バスケットボール", "テニス"] },
                { q: "日本で最も高い山は？", correct: "富士山", dummies: ["北岳", "阿蘇山", "浅間山"] },
                { q: "日本の国会が開かれる建物の名前は何？", correct: "国会議事堂", dummies: ["皇居", "東京駅", "最高裁判所"] },
            ];

            const historyNormalQuestions = [
                { q: "645年、中大兄皇子と中臣鎌足が蘇我氏を倒した出来事を何という？", correct: "乙巳の変", dummies: ["承久の乱", "応仁の乱", "壬申の乱"] },
                { q: "日本で初めて本格的な法律や政治制度を整えた「大宝律令」が作られた年は？", correct: "701年", dummies: ["645年", "710年", "794年"] },
                { q: "開墾した土地の永久私有を認めた法律は何？", correct: "墾田永年私財法", dummies: ["班田収授法", "大宝律令", "地租改正"] },
                { q: "平安時代に摂関政治の最盛期を築いた人物は誰？", correct: "藤原道長", dummies: ["藤原良房", "藤原頼通", "菅原道真"] },
                { q: "「平家にあらずんば人にあらず」と言われるほど権力を持った人物は誰？", correct: "平清盛", dummies: ["源頼朝", "藤原道長", "足利尊氏"] },
                { q: "後鳥羽上皇が鎌倉幕府を倒そうとして起こした戦いは？", correct: "承久の乱", dummies: ["保元の乱", "平治の乱", "応仁の乱"] },
                { q: "鎌倉時代の後半、借金に苦しむ御家人（武士）たちを救うため、幕府が出した「借金を帳消し（ゼロ）にする命令」を何という？", correct: "徳政令（とくせいれい）", dummies: ["御成敗式目", "武家諸法度", "惣無事令"] },
                { q: "元寇のとき執権だった人物は誰？", correct: "北条時宗", dummies: ["北条義時", "北条泰時", "源頼朝"] },
                { q: "天皇中心の政治を目指した「建武の新政」を始めた天皇は誰？", correct: "後醍醐天皇", dummies: ["後鳥羽天皇", "桓武天皇", "明治天皇"] },
                { q: "銀閣を建て、東山文化を発展させた将軍は誰？", correct: "足利義政", dummies: ["足利義満", "足利義昭", "足利尊氏"] },
                { q: "戦国時代の始まりとなった戦乱は？", correct: "応仁の乱", dummies: ["保元の乱", "承久の乱", "壬申の乱"] },
                { q: "織田信長が最初に天下統一へ大きく近づくきっかけとなった戦いは？", correct: "桶狭間の戦い", dummies: ["長篠の戦い", "関ヶ原の戦い", "姉川の戦い"] },
                { q: "長篠の戦いで織田・徳川連合軍と戦った武将は誰？", correct: "武田勝頼", dummies: ["武田信玄", "上杉謙信", "今川義元"] },
                { q: "織田信長が、自分のお城のまわり（城下町）で誰でも自由に、税金なしで商売ができるようにした先進的な政策を何という？", correct: "楽市・楽座（らくいち・らくざ）", dummies: ["太閤検地", "株仲間の結成", "参勤交代"] },
                { q: "武士以外から武器を集めた政策は？", correct: "刀狩", dummies: ["太閤検地", "地租改正", "鎖国"] },
                { q: "関ヶ原の戦いで西軍を率いた人物は誰？", correct: "石田三成", dummies: ["徳川家康", "真田幸村", "豊臣秀頼"] },
                { q: "江戸幕府が外国との交流を制限した政策を何という？", correct: "鎖国", dummies: ["参勤交代", "刀狩", "地租改正"] },
                { q: "江戸時代、オランダとの貿易が行われた場所は？", correct: "長崎・出島", dummies: ["函館", "横浜", "神戸"] },
                { q: "「解体新書」の出版に関わった人物は誰？", correct: "杉田玄白", dummies: ["本居宣長", "伊能忠敬", "平賀源内"] },
                { q: "『古事記伝』を書いた国学者は誰？", correct: "本居宣長", dummies: ["杉田玄白", "新井白石", "福沢諭吉"] },
                { q: "1837年、大坂で幕府に反乱を起こした人物は誰？", correct: "大塩平八郎", dummies: ["西郷隆盛", "吉田松陰", "板垣退助"] },
                { q: "1858年に日米修好通商条約を結んだアメリカの総領事は誰？", correct: "ハリス", dummies: ["ペリー", "マッカーサー", "ケネディ"] },
                { q: "「尊王攘夷」の考え方を広めた人物として有名なのは？", correct: "吉田松陰", dummies: ["福沢諭吉", "伊藤博文", "西園寺公望"] },
                { q: "明治政府が土地制度を改革した政策は？", correct: "地租改正", dummies: ["刀狩", "徴兵令", "学制"] },
                { q: "自由民権運動で国会開設を求めた人物は誰？", correct: "板垣退助", dummies: ["大久保利通", "西郷隆盛", "木戸孝允"] },
                { q: "日本最初の憲法として1889年に発布されたものは？", correct: "大日本帝国憲法", dummies: ["日本国憲法", "十七条の憲法", "教育基本法"] },
                { q: "明治時代の終わり、日本が日露戦争に勝ったあと、ロシアとの間で結ばれた講和条約（仲直りの条約）は何？", correct: "ポーツマス条約", dummies: ["下関条約", "日米和親条約", "ベルサイユ条約"] },
                { q: "1914年に始まった世界規模の戦争は？", correct: "第一次世界大戦", dummies: ["日露戦争", "第二次世界大戦", "太平洋戦争"] },
                { q: "1931年に日本が中国東北部へ進出するきっかけとなった出来事は？", correct: "満州事変", dummies: ["盧溝橋事件", "日比谷焼き打ち事件", "米騒動"] },
                { q: "1945年に日本が受け入れ、第二次世界大戦が終結するきっかけとなったものは？", correct: "ポツダム宣言", dummies: ["カイロ宣言", "ポーツマス条約", "日米和親条約"] },
                { q: "飛鳥文化が栄えたころ、日本で広まった宗教は何？", correct: "仏教", dummies: ["神道", "キリスト教", "イスラム教"] },
                { q: "奈良時代の743年、新しく自分で開墾した（耕した）土地であれば、永遠に自分の畑にしてよいと認めた法律は何？", correct: "墾田永年私財法", dummies: ["班田収授法", "大宝律令", "地租改正"] },
                { q: "遣唐使として唐に渡り、帰国後に活躍した人物は誰？", correct: "吉備真備", dummies: ["小野妹子", "中臣鎌足", "空海"] },
                { q: "天台宗を開いた人物は誰？", correct: "最澄", dummies: ["空海", "法然", "親鸞"] },
                { q: "真言宗を開いた人物は誰？", correct: "空海", dummies: ["最澄", "栄西", "道元"] },
                { q: "平安時代後期に始まった、上皇が政治を行う仕組みを何という？", correct: "院政", dummies: ["摂関政治", "武家政治", "執権政治"] },
                { q: "平氏を滅ぼした戦いとして有名なのは？", correct: "壇ノ浦の戦い", dummies: ["関ヶ原の戦い", "長篠の戦い", "桶狭間の戦い"] },
                { q: "鎌倉幕府で将軍を助ける役職を何という？", correct: "執権", dummies: ["関白", "太政大臣", "征夷大将軍"] },
                { q: "元寇の際、日本軍を助けたと伝えられる強い風を何という？", correct: "神風", dummies: ["春一番", "偏西風", "季節風"] },
                { q: "室町時代、中国（明）との貿易を何という？", correct: "勘合貿易", dummies: ["南蛮貿易", "朱印船貿易", "日宋貿易"] },
                { q: "茶の湯を大成した人物は誰？", correct: "千利休", dummies: ["本阿弥光悦", "雪舟", "狩野永徳"] },
                { q: "安土城を築いた武将は誰？", correct: "織田信長", dummies: ["豊臣秀吉", "徳川家康", "上杉謙信"] },
                { q: "江戸幕府が開かれた年は？", correct: "1603年", dummies: ["1600年", "1615年", "1582年"] },
                { q: "江戸時代、農民同士で連帯責任を負った制度は？", correct: "五人組", dummies: ["参勤交代", "絵踏", "刀狩"] },
                { q: "江戸時代、幕府の許可を得て、商品の販売や製造の権利を独占した大商人たちの同盟組織を何という？", correct: "株仲間（かぶなかま）", dummies: ["座", "五人組", "問屋"] },
                { q: "「東海道五十三次」を描いた浮世絵師は誰？", correct: "歌川広重", dummies: ["葛飾北斎", "東洲斎写楽", "喜多川歌麿"] },
                { q: "『富嶽三十六景』を描いた人物は誰？", correct: "葛飾北斎", dummies: ["歌川広重", "写楽", "雪舟"] },
                { q: "桜田門外の変で暗殺された大老は誰？", correct: "井伊直弼", dummies: ["阿部正弘", "水野忠邦", "勝海舟"] },
                { q: "大政奉還の後に行われた「王政復古の大号令」は何を目指した？", correct: "天皇中心の政治", dummies: ["幕府の復活", "鎖国", "参勤交代"] },
                { q: "明治時代に富国強兵と並んで進められた政策は？", correct: "殖産興業", dummies: ["鎖国", "参勤交代", "刀狩"] },
                { q: "「学問のすゝめ」を書いた人物は誰？", correct: "福沢諭吉", dummies: ["板垣退助", "伊藤博文", "夏目漱石"] },
                { q: "鹿鳴館が建てられた目的として最も適切なのは？", correct: "外国との交流を深めるため", dummies: ["軍事訓練のため", "学校として使うため", "裁判所として使うため"] },
                { q: "日清戦争の講和条約は何？", correct: "下関条約", dummies: ["ポーツマス条約", "日米和親条約", "サンフランシスコ平和条約"] },
                { q: "日露戦争の講和条約は何？", correct: "ポーツマス条約", dummies: ["下関条約", "ベルサイユ条約", "ワシントン条約"] },
                { q: "韓国併合が行われた年は？", correct: "1910年", dummies: ["1905年", "1914年", "1920年"] },
                { q: "1918年に全国へ広がった米の値上がりへの抗議運動は？", correct: "米騒動", dummies: ["自由民権運動", "血盟団事件", "五・一五事件"] },
                { q: "日本で男子普通選挙が実現した年は？", correct: "1925年", dummies: ["1912年", "1931年", "1945年"] },
                { q: "1937年、日本と中国の全面戦争のきっかけとなった事件は？", correct: "盧溝橋事件", dummies: ["満州事変", "柳条湖事件", "ノモンハン事件"] },
                { q: "日本が真珠湾を攻撃し、太平洋戦争が始まった年は？", correct: "1941年", dummies: ["1939年", "1940年", "1945年"] },
                { q: "第二次世界大戦後、日本の占領を中心となって進めた連合国軍総司令部をアルファベット3文字で何という？", correct: "GHQ", dummies: ["NHK", "JAXA", "GDP"] },
            ];

            const historyHardQuestions = [
                { q: "白村江の戦いで日本が支援した国はどこ？", correct: "百済", dummies: ["新羅", "高句麗", "唐"] },
                { q: "「壬申の乱」に勝利し、その後天皇となった人物は誰？", correct: "天武天皇", dummies: ["天智天皇", "持統天皇", "桓武天皇"] },
                { q: "奈良時代に鑑真が日本へ伝えたものは？", correct: "仏教の戒律", dummies: ["鉄砲", "キリスト教", "活版印刷"] },
                { q: "菅原道真が左遷された場所は？", correct: "太宰府", dummies: ["長崎", "平泉", "鎌倉"] },
                { q: "浄土宗を開いた人物は誰？", correct: "法然", dummies: ["親鸞", "栄西", "道元"] },
                { q: "浄土真宗を開いた人物は誰？", correct: "親鸞", dummies: ["法然", "日蓮", "一遍"] },
                { q: "日蓮が開いた宗派は？", correct: "日蓮宗", dummies: ["真言宗", "浄土宗", "天台宗"] },
                { q: "鎌倉新仏教で座禅を重視した宗派は？", correct: "禅宗", dummies: ["浄土宗", "時宗", "日蓮宗"] },
                { q: "『徒然草』を書いた人物は誰？", correct: "吉田兼好", dummies: ["鴨長明", "紫式部", "清少納言"] },
                { q: "『方丈記』を書いた人物は誰？", correct: "鴨長明", dummies: ["吉田兼好", "紀貫之", "西行"] },
                { q: "勘合貿易を始めた室町幕府の将軍は誰？", correct: "足利義満", dummies: ["足利義政", "足利義昭", "足利尊氏"] },
                { q: "一向一揆の中心となった宗派は？", correct: "浄土真宗", dummies: ["天台宗", "真言宗", "日蓮宗"] },
                { q: "楽市・楽座を行った武将は誰？", correct: "織田信長", dummies: ["豊臣秀吉", "徳川家康", "武田信玄"] },
                { q: "キリスト教の宣教師を保護したことで知られる戦国武将は誰？", correct: "織田信長", dummies: ["徳川家康", "武田信玄", "北条氏康"] },
                { q: "豊臣秀吉が朝鮮へ出兵した戦いをまとめて何という？", correct: "文禄・慶長の役", dummies: ["応仁の乱", "承久の乱", "元寇"] },
                { q: "武家諸法度を制定した将軍は誰？", correct: "徳川秀忠", dummies: ["徳川家康", "徳川家光", "徳川吉宗"] },
                { q: "島原・天草一揆の総大将は誰？", correct: "天草四郎", dummies: ["真田幸村", "由井正雪", "大塩平八郎"] },
                { q: "寛政の改革で、旗本や御家人を救うために、彼らの借金を帳消し（チャラ）にした幕府の命令を何という？", correct: "棄捐令（きえんれい）", dummies: ["徳政令", "武家諸法度", "惣無事令"] },
                { q: "「寛政の改革」を行った老中は誰？", correct: "松平定信", dummies: ["田沼意次", "水野忠邦", "井伊直弼"] },
                { q: "「天保の改革」を行った老中は誰？", correct: "水野忠邦", dummies: ["松平定信", "田沼意次", "阿部正弘"] },
                { q: "黒船来航当時のアメリカ大統領は誰？", correct: "フィルモア", dummies: ["リンカーン", "ワシントン", "ルーズベルト"] },
                { q: "安政の大獄を行った人物は誰？", correct: "井伊直弼", dummies: ["阿部正弘", "勝海舟", "西郷隆盛"] },
                { q: "明治維新の三傑に含まれない人物は誰？", correct: "伊藤博文", dummies: ["大久保利通", "木戸孝允", "西郷隆盛"] },
                { q: "「学制」が公布された年は？", correct: "1872年", dummies: ["1871年", "1873年", "1889年"] },
                { q: "1872年、明治政府によって日本で初めて鉄道が開通した区間はどこからどこまで？", correct: "新橋〜横浜", dummies: ["東京〜大阪", "京都〜神戸", "上野〜青森"] },
                { q: "日露戦争で日本海海戦を指揮した人物は誰？", correct: "東郷平八郎", dummies: ["乃木希典", "児玉源太郎", "山県有朋"] },
                { q: "第一次世界大戦後に設立された国際機関は？", correct: "国際連盟", dummies: ["国際連合", "EU", "NATO"] },
                { q: "五・一五事件で暗殺された首相は誰？", correct: "犬養毅", dummies: ["原敬", "加藤高明", "近衛文麿"] },
                { q: "二・二六事件が起こった年は？", correct: "1936年", dummies: ["1931年", "1939年", "1941年"] },
                { q: "第二次世界大戦後、日本が加盟した国際機関は？", correct: "国際連合", dummies: ["国際連盟", "EU", "ASEAN"] },
                { q: "遣隋使として隋に派遣され、「日出づる処の天子」の国書を持参した人物は誰？", correct: "小野妹子", dummies: ["吉備真備", "阿倍仲麻呂", "犬上御田鍬"] },
                { q: "日本最古の和歌集『万葉集』の編さんに深く関わった人物は誰？", correct: "大伴家持", dummies: ["柿本人麻呂", "山上憶良", "紀貫之"] },
                { q: "『古今和歌集』の編集に携わった人物は誰？", correct: "紀貫之", dummies: ["藤原定家", "西行", "紫式部"] },
                { q: "平安時代に国風文化が栄えた背景として最も関係が深い出来事は？", correct: "遣唐使の廃止", dummies: ["鎖国", "元寇", "応仁の乱"] },
                { q: "源頼朝の妻として、鎌倉幕府を支えた人物は誰？", correct: "北条政子", dummies: ["日野富子", "淀殿", "春日局"] },
                { q: "元寇で九州に築かれた防御施設を何という？", correct: "防塁（元寇防塁）", dummies: ["石垣", "城壁", "砦"] },
                { q: "室町時代の代表的な水墨画家は誰？", correct: "雪舟", dummies: ["狩野永徳", "俵屋宗達", "尾形光琳"] },
                { q: "安土桃山時代に豪華な障壁画を多く描いた画家は誰？", correct: "狩野永徳", dummies: ["雪舟", "葛飾北斎", "東洲斎写楽"] },
                { q: "織田信長が比叡山延暦寺を焼き討ちした理由として最も適切なのは？", correct: "敵対勢力だったため", dummies: ["貿易を広げるため", "都を移すため", "税金を集めるため"] },
                { q: "江戸時代、長崎でオランダのほかに貿易を認められていた、当時の中国の国名（王朝）は何？", correct: "清（しん）", dummies: ["明（みん）", "宋（そう）", "唐（とう）"] },
                { q: "江戸幕府が、天皇や公家（貴族）の行動を制限し、政治に口出しさせないために定めた法令は何？", correct: "禁中並公家諸法度", dummies: ["武家諸法度", "諸宗寺院法度", "御成敗式目"] },
                { q: "江戸時代に蘭学を学ぶきっかけとなった国は？", correct: "オランダ", dummies: ["イギリス", "フランス", "中国"] },
                { q: "『東海道中膝栗毛』を書いた人物は誰？", correct: "十返舎一九", dummies: ["井原西鶴", "松尾芭蕉", "近松門左衛門"] },
                { q: "「奥の細道」を書いた人物は誰？", correct: "松尾芭蕉", dummies: ["与謝蕪村", "小林一茶", "十返舎一九"] },
                { q: "1854年に結ばれた、日本とアメリカの最初の条約は？", correct: "日米和親条約", dummies: ["日米修好通商条約", "下関条約", "ポーツマス条約"] },
                { q: "戊辰戦争の際、江戸の町を戦火から救うため、西郷隆盛と話し合って「江戸城無血開城」を実現させた幕府側の人物は誰？", correct: "勝海舟", dummies: ["井伊直弼", "徳川慶喜", "近藤勇"] },
                { q: "五箇条の御誓文が出されたのは何時代？", correct: "明治時代", dummies: ["江戸時代", "大正時代", "昭和時代"] },
                { q: "明治時代に北海道の開拓を進めるため設置された役所は？", correct: "開拓使", dummies: ["勘定奉行", "民部省", "内務省"] },
                { q: "日本銀行が設立された年は？", correct: "1882年", dummies: ["1872年", "1892年", "1902年"] },
                { q: "大日本帝国憲法が発布された年は？", correct: "1889年", dummies: ["1885年", "1890年", "1894年"] },
                { q: "日清戦争後、日本・ロシア・ドイツ・フランスが関係した出来事は？", correct: "三国干渉", dummies: ["三国同盟", "日英同盟", "ベルサイユ条約"] },
                { q: "日本がイギリスと結んだ同盟は？", correct: "日英同盟", dummies: ["日独伊三国同盟", "三国干渉", "日米安全保障条約"] },
                { q: "「平民宰相」と呼ばれた首相は誰？", correct: "原敬", dummies: ["伊藤博文", "犬養毅", "西園寺公望"] },
                { q: "1923年に発生した大災害は？", correct: "関東大震災", dummies: ["阪神・淡路大震災", "東日本大震災", "濃尾地震"] },
                { q: "世界恐慌が始まった国はどこ？", correct: "アメリカ", dummies: ["イギリス", "ドイツ", "フランス"] },
                { q: "満州事変のきっかけとなった事件は？", correct: "柳条湖事件", dummies: ["盧溝橋事件", "五・一五事件", "二・二六事件"] },
                { q: "1940年に日本・ドイツ・イタリアが結んだ同盟は？", correct: "三国同盟", dummies: ["日英同盟", "日独協約", "ワシントン条約"] },
                { q: "太平洋戦争中、日本が攻撃したアメリカの海軍基地は？", correct: "真珠湾", dummies: ["ミッドウェー", "ガダルカナル", "サイパン"] },
                { q: "日本国憲法で主権を持つのは誰？", correct: "国民", dummies: ["天皇", "内閣", "国会"] },
                { q: "日本国憲法が施行されたのは何年？", correct: "1947年", dummies: ["1945年", "1946年", "1952年"] },
                { q: "日本で最初に遣隋使として隋へ派遣された人物は誰？", correct: "小野妹子", dummies: ["犬上御田鍬", "阿倍仲麻呂", "吉備真備"] },
                { q: "729年、「長屋王の変」で無実の罪を着せられて自害した人物は誰？", correct: "長屋王", dummies: ["橘諸兄", "藤原仲麻呂", "吉備真備"] },
                { q: "鎌倉時代、日本初の武家法である「御成敗式目」を制定した執権は誰？", correct: "北条泰時", dummies: ["北条義時", "北条時宗", "北条時頼"] },
                { q: "1285年、安達泰盛が滅ぼされた鎌倉幕府最大の内紛を何という？", correct: "霜月騒動", dummies: ["宝治合戦", "承久の乱", "建武の新政"] },
                { q: "室町時代、1488年に一向一揆によって守護大名が追放され、約100年間自治が続いた国はどこ？", correct: "加賀国", dummies: ["越前国", "山城国", "近江国"] },
                { q: "江戸時代、田沼意次の後に「寛政の改革」を行った老中は誰？", correct: "松平定信", dummies: ["水野忠邦", "新井白石", "井伊直弼"] },
                { q: "1894年、不平等条約の「領事裁判権」の撤廃に成功した外務大臣は誰？", correct: "陸奥宗光", dummies: ["井上馨", "小村寿太郎", "大隈重信"] },
                { q: "1911年、「関税自主権」を完全に回復した外務大臣は誰？", correct: "小村寿太郎", dummies: ["陸奥宗光", "加藤高明", "西園寺公望"] },
                { q: "1905年、ポーツマス条約への不満から東京で発生した暴動事件は何？", correct: "日比谷焼き打ち事件", dummies: ["米騒動", "血盟団事件", "五・一五事件"] },
                { q: "1941年、日本の国家機密をソ連へ流していたことが発覚し、ドイツ人記者リヒャルト・ゾルゲらが逮捕された事件は何？", correct: "ゾルゲ事件", dummies: ["甘粕事件", "虎ノ門事件", "レフチェンコ事件"] },
            ];

        let historyPool;
        if (currentLv === 0 || currentLv === 1) {
            historyPool = historyEasyQuestions;
        } else if (currentLv === 2) {
            historyPool = historyNormalQuestions;
        } else {
            historyPool = historyHardQuestions;
        }
        const p = historyPool[Math.floor(Math.random() * historyPool.length)];
        qText = p.q; correct = p.correct; dummies = p.dummies;
    } else if (chosenSubject === "化学") {
        const chemScientists = [
            { name: "アントワーヌ・ラボアジエ", desc: "質量保存の法則を発見し、フロギストン説を否定した酸素の名付け親。" },
            { name: "ロバート・ボイル", desc: "気体の温度が変わらない時、気体にかける圧力と気体の体積は反比例するという法則を発見した人物。" },
            { name: "ジャック・シャルル", desc: "気体にかかる圧力が変わらない時、気体の体積と気体の絶対温度は比例する法則を発見した人物。" },
            { name: "ジョン・ドルトン", desc: "全ての物質は分割できない原子から構成され、同一元素であれば質量と性質が同じであるという「原子論」を発表した化学者。分圧の法則を発見した物理学者でもある。" },
            { name: "アボガドロ", desc: "同温同圧の下では、全ての気体は同じ体積中に同数の分子を含むという法則を発見した人物。" },
            { name: "マイケル・ファラデー", desc: "電磁誘導など電磁気学の基礎を築いた物理学者である一方で、電気分解の法則を確立した化学者でもある。ベンゼンを発見した人物でもある。" },
            { name: "フリードリヒ・アウグスト・ケクレ", desc: "炭素の電子の価数が常に4であることを発表し、ベンゼンが六角形の環状構造であることを導き出した化学者。" },
            { name: "ドミトリー・メンデレーエフ", desc: "周期表を作り、1869年発表当時発見されていなかった元素を予測した人物である。" },
            { name: "マリー・キュリー", desc: "ラジウムとポロニウムを発見した女性初のノーベル賞受賞者で、史上初の異分野でのノーベル賞二冠(化学賞と物理学賞)の受賞者でもある。" },
            { name: "アレニウス", desc: "電離した際にH+(水素イオン)を放出する物質を酸、OH-(水酸化物イオン)を放出する物質を塩基とする定義を作り、発表した人物である。" },
            { name: "ヨハンス・ブレンステッド", desc: "水溶液中で水素イオン(H+)を与える物質を酸、受け取る物質を塩基とする定義を、トーマス・マーチン・ローリーと共に発表した人物。" },
            { name: "トーマス・マーチン・ローリー", desc: "水溶液中で水素イオン(H+)を与える物質を酸、受け取る物質を塩基とする定義を、ヨハンス・ブレンステッドと共に発表した人物。" },
            { name: "ギルバート・ルイス", desc: "電子を受け取る物質を酸、電子を与える物質を塩基とする定義を作り、発表した人物である。" },
            { name: "アルフレッド・ノーベル", desc: "工事や採掘作業のためにダイナマイトを発明したが、戦争にも利用され結果的に沢山の人命を奪うこととなったことで、発明を悔いた人物である。" },
            { name: "アンリ・ル・シャトリエ", desc: "平衡状態にある可逆反応に温度や気圧などの変化を与えると、それを相殺する方向に平衡点が移動するという法則を発見した化学者。" },
            { name: "フリッツ・ハーバー", desc: "高圧下で触媒を用いて水素と窒素からアンモニアを合成する工業手法を、カール・ボッシュと共に発明した人物。" },
            { name: "カール・ボッシュ", desc: "高圧下で触媒を用いて水素と窒素からアンモニアを合成する工業手法を、フリッツ・ハーバーと共に発明した人物。" },
            { name: "ユストゥス・フォン・リービッヒ", desc: "実験で使われる蒸留・冷却器具「リービッヒ冷却器」を発明した化学者である。" },
            { name: "森田浩介", desc: "アジアで初めて新元素(原子番号113番、現在のニホニウム)の合成を成功させた理化学研究所のグループディレクター。" },
            { name: "吉野彰", desc: "スマートフォンや電気自動車、探査機「はやぶさ」にも使われるリチウムイオン二次電池の実用化に貢献し、2019年にノーベル化学賞を受賞した日本人研究者。" },
            { name: "北川進", desc: "金属有機構造体（MOF）を持つ多孔性材料を開発し、環境保全に役立つ技術として2025年にノーベル化学賞を受賞した日本人。" },
        ];
        const chemElements = [
            { symbol: "H", correct: "水素", choices: ["ひょっとこ", "水銀", "水素", "ヘンリー"] },
            { symbol: "He", correct: "ヘリウム", choices: ["ヘチマ", "ヘキサゴン", "ヘリウム", "下手の横好き"] },
            { symbol: "Li", correct: "リチウム", choices: ["リチャード", "リンカーン", "リムル", "リチウム"] },
            { symbol: "Be", correct: "ベリリウム", choices: ["ホウ素", "ベッキー", "ベリリウム", "臭素"] },
            { symbol: "B", correct: "ホウ素", choices: ["ビスマス", "バリウム", "ホウ素", "ベリリウム"] },
            { symbol: "C", correct: "カーボン(炭素)", choices: ["クーロン", "カーボン(炭素)", "塩素", "コバルト"] },
            { symbol: "N", correct: "窒素", choices: ["ニュートン", "ニトロ基", "窒素", "ネオン"] },
            { symbol: "O", correct: "オキシゲン(酸素)", choices: ["オキシゲン(酸素)", "オガネソン", "オートマ", "オクタ"] },
            { symbol: "F", correct: "フッ素", choices: ["フェイント", "鉄", "フッ素", "ファラデー"] },
            { symbol: "Ne", correct: "ネオン", choices: ["ネット", "ネオン", "窒素", "ネタ"] },
            { symbol: "Na", correct: "ナトリウム", choices: ["NATO", "納豆", "ナトリウム", "窒素"] },
            { symbol: "Mg", correct: "マグネシウム", choices: ["マグネシウム", "マグネット", "マーガリン", "曲がり角"] },
            { symbol: "Al", correct: "アルミニウム", choices: ["アルゴン", "アルミニウム", "アルキル基", "アラジン"] },
            { symbol: "Si", correct: "ケイ素", choices: ["鎌", "シンク", "硫黄", "ケイ素"] },
            { symbol: "P", correct: "リン", choices: ["パーキングエリア", "パラジウム", "ポロニウム", "リン"] },
            { symbol: "S", correct: "硫黄", choices: ["硫黄", "ケイ素", "スズ", "アンチモン"] },
            { symbol: "Cl", correct: "塩素", choices: ["クーロン", "カーボン(炭素)", "塩素", "クラシック"] },
            { symbol: "Ar", correct: "アルゴン", choices: ["アルゴン", "ヒ素", "銀", "金"] },
            { symbol: "K", correct: "カリウム", choices: ["カルシウム", "クリプトン", "カリウム", "カブトムシ"] },
            { symbol: "Ca", correct: "カルシウム", choices: ["カドミウム", "カルシウム", "セシウム", "キュリウム"] },
            { symbol: "Fe", correct: "鉄", choices: ["フェイント", "フランシウム", "フッ素", "鉄"] },
            { symbol: "Cu", correct: "銅", choices: ["コバルト", "炭素", "銅", "カルシウム"] },
            { symbol: "Zn", correct: "亜鉛", choices: ["ゾーン", "亜鉛", "ジルコニウム", "残金"] },
            { symbol: "Br", correct: "臭素", choices: ["ビスマス", "臭素", "ブロー", "ホウ素"] },
            { symbol: "Ag", correct: "銀", choices: ["銀", "エージェント", "金", "顎(あご)"] },
            { symbol: "Sn", correct: "錫(すず)", choices: ["スナック", "鈴", "錫(すず)", "スノー"] },
            { symbol: "I", correct: "ヨウ素", choices: ["イットリウム", "犬", "インジウム", "ヨウ素"] },
            { symbol: "Ba", correct: "バリウム", choices: ["バンズ", "バス", "ホウ素", "バリウム"] },
            { symbol: "Pt", correct: "白金", choices: ["鉛", "パラジウム", "白金", "ペトリ皿"] },
            { symbol: "Au", correct: "金", choices: ["英雄", "鮎", "金", "阿吽の呼吸"] },
            { symbol: "Hg", correct: "水銀", choices: ["ハフニウム", "ヘリウム", "水銀", "水"] },
            { symbol: "Pb", correct: "鉛", choices: ["亜鉛", "パラジウム", "白金", "鉛"] },
            { symbol: "Bi", correct: "ビスマス", choices: ["ビスケット", "ホウ素", "ベリリウム", "ビスマス"] },
            { symbol: "U", correct: "ウラン", choices: ["アンダー", "後ろにいるよ・・・", "鰻", "ウラン"] },
            { symbol: "Nh", correct: "ニホニウム", choices: ["日本", "ニオブ", "ニホニウム", "那覇"] },
            { symbol: "Og", correct: "オガネソン", choices: ["オガネソン", "オーギュスト", "卒業生", "奢りなｗｗｗ"] },
        ];

        const chemQuestionType = Math.floor(Math.random() * 3);

        if (chemQuestionType === 0) {
            // 化学史：人物名当てクイズ(ダミーは他の人物名からランダムに選出)
            const target = chemScientists[Math.floor(Math.random() * chemScientists.length)];
            const otherNames = chemScientists.filter(s => s.name !== target.name).map(s => s.name);
            const shuffledOthers = otherNames.sort(() => Math.random() - 0.5).slice(0, 3);
            qText = `【化学史】${target.desc}`;
            correct = target.name;
            dummies = shuffledOthers;

        } else if (chemQuestionType === 1) {
            // 元素記号クイズ
            const target = chemElements[Math.floor(Math.random() * chemElements.length)];
            qText = `元素記号「${target.symbol}」が表す元素は？`;
            correct = target.correct;
            dummies = target.choices.filter(c => c !== target.correct);

        } else {
            // 絶対温度(ケルビン)⇔セルシウス温度の変換問題 (K = ℃ + 273)
            const celsius = Math.floor(Math.random() * 570) - 270; // -270℃ ～ 299℃
            const kelvin = celsius + 273;
            qText = `セルシウス温度 ${celsius}℃ を絶対温度で表すと何Kですか？`;
            correct = `${kelvin}K`;
            dummies = [`${kelvin + 1}K`, `${kelvin - 1}K`, `${celsius}K`];
        }
    } else if (chosenSubject === "物理") {
        const physicsQuestions = [
            { q: "地球上で、りんごを手から離すと地面に向かって落ちます。このとき、りんごを地面の方へ引っ張っている力を何といいますか？", correct: "重力", dummies: ["摩擦", "磁力", "空気抵抗"] },
            { q: "下敷きを髪の毛でこすってから離すと、髪の毛が下敷きに吸い寄せられます。この現象を引き起こしているのは何の力ですか？", correct: "静電気の力", dummies: ["重力", "空気の力", "脳波の力"] },
            { q: "水を火にかけて沸騰させると、勢いよく出てくる「湯気」は、本来目に見えない「水蒸気」が冷えて何に変わったものですか？", correct: "小さな水の粒（液体）", dummies: ["空気（気体）", "小さな氷（固体）", "火の粉"] },
            { q: "雷が光ってから、音が聞こえるまでに時間がかかるのはなぜですか？", correct: "光の方が音よりも早いから", dummies: ["音の方が光よりも早いから", "音は空気中を伝わることができないから", "音がさぼったから"] },
            { q: "磁石の「N極」と「N極」を近づけると、どのようになりますか？", correct: "反発する", dummies: ["くっつく", "NN極になる", "何も起きない"] },
            { q: "糸電話で声が伝わるのは、声が何を伝わっているからですか？", correct: "糸の振動", dummies: ["電気", "想い♡", "糸の中の空気"] },
            { q: "重さが同じでも、ハイヒールで踏まれるほうが、スニーカーで踏まれるより痛いのはなぜですか？", correct: "接している面積が小さく、圧力が大きいから", dummies: ["ハイヒールの方が重いから", "スニーカーは空気を吸い込むから", "ハイヒールの方が硬いから"] },
            { q: "お風呂の中に手を入れると、腕が曲がって見えたり、短く見えたりするのはなぜですか？", correct: "光の屈折", dummies: ["光の反射", "水が光を吸収するから", "腕が溶けるから"] },
            { q: "2つの電球を電池に「直列」につないだとき、回路を流れる電流について正しいものはどれですか？", correct: "回路のどこでも電流の大きさは同じ", dummies: ["電池に近いほど電流が大きい", "マイナス極側は電流が流れない", "電球が破裂する"] },
            { q: "水の中に物体を入れたとき、物体が浮くか沈むかを決める性質は何ですか？", correct: "物体の密度", dummies: ["物体の硬さ", "物体の形", "物体の気分"] },
            { q: "地球の重力加速度は何m/s²ですか？", correct: "9.8m/s²", dummies: ["90.0m/s²", "8.9m/s²", "1.62m/s²"] },
            { q: "120mの道のりを15秒で走ったときの速さは秒速何mですか。", correct: "8m/s", dummies: ["1800m/s", "6m/s", "10m/s"] },
            { q: "時速72km/hで走っている自動車が、15分間に進む距離は何kmか求めなさい。", correct: "18km", dummies: ["10.8km", "4.8km", "1.08km"] },
            { q: "てんびんの左側に、中心から10cmのところに30gのおもりを吊るしました。右側の中心から15cmのところには何gのおもりを吊るせばつり合いますか。", correct: "20g", dummies: ["5g", "45g", "15g"] },
            { q: "月面での重力は地球の約1/6です。地球で重さが60kgの人が月に行くと、バネばかりが示す値は何kgになりますか。", correct: "10kg", dummies: ["60kg", "360kg", "0kg"] },
            { q: "電気抵抗が4Ωの電熱線に12Vの電圧をかけたとき、流れる電流は何Aですか。", correct: "3A", dummies: ["0.33A", "48A", "8A"] },
            { q: "抵抗20Ωの電気抵抗に5.0Vの電圧をかけたとき、流れる電流は何Aか求めなさい。", correct: "0.25A", dummies: ["0.50A", "100A", "4.0A"] },
            { q: "質量500gの物体が床に置いてあります。この物体と床が接している面積が0.05m²であるとき、床にはたらく圧力は何Paですか。ただし、100gの物体にはたらく重力の大きさを1Nとします。", correct: "100Pa", dummies: ["25Pa", "10Pa", "1000Pa"] },
            { q: "質量200gの水の温度を10K上昇させるのに必要な熱量は何Jか。ただし、水の比熱を4.2J/(g・K)とする。", correct: "8400J", dummies: ["2100J", "840J", "4200J"] },
            { q: "なめらかな水平面上で、質量5.0kgの物体に20Nの一定の力を加え続けたとき、物体の加速度の大きさは何m/s²か求めなさい。", correct: "4.0m/s²", dummies: ["9.8m/s²", "100m/s²", "0.25m/s²"] },
            { q: "物体に10Nの力を加えて、その力の向きに2.0m動かしました。このとき、力が物体にした仕事は何Jですか？", correct: "20J", dummies: ["5.0J", "12J", "物体に職は無いので0J"] },
            { q: "100mを20秒で走ったときの平均の速さは秒速何mですか？", correct: "秒速5m", dummies: ["秒速2000m", "秒速10m", "秒速999999999999m"] },
            { q: "質量2.0kgの物体に4.0Nの力を加え続けたとき、生じる加速度の大きさは何m/s²ですか？", correct: "2.0m/s²", dummies: ["6.0m/s²", "8.0m/s²", "0.5m/s²"] },
            { q: "振動数が440Hzの音波が、速度340m/sで伝わっているとき、この音波の波長は何mか求めなさい（小数点第3位を四捨五入）。", correct: "0.77m", dummies: ["1.29m", "0.34m", "149600m"] },
            { q: "水平面とのなす角が30°のあらい斜面上に質量mの物体が置かれ、静止している。重力加速度をgとするとき、物体が受けている静止摩擦力の大きさはいくらか。", correct: "1/2mg", dummies: ["√3/2mg", "mg", "1/√3mg"] },
            { q: "質量2.0kgで速さ4.0m/sの小球Aが、静止している質量3.0kgの小球Bに正面衝突した。衝突後、2つの小球が合体して一体となって動くとき、その速さは何m/sか求めなさい。", correct: "1.6m/s", dummies: ["2.0m/s", "0.8m/s", "2.7m/s"] },
            { q: "なめらかに動くピストンがついた容器に、1.0molの理想気体が入っている。圧力を一定に保ったまま、温度を300Kから400Kまで上昇させた。このとき気体が外部にした仕事は何Jか。気体定数を8.3J/(mol・K)とする。", correct: "830J", dummies: ["2490J", "3320J", "1245J"] },
            { q: "「相対性理論」を提唱し、現代物理学の基礎を築いた20世紀最大の物理学者は誰？", correct: "アルベルト・アインシュタイン", dummies: ["アイザック・ニュートン", "トーマス・エジソン", "ガリレオ・ガリレイ"] },
            { q: "「それでも地球は動いている」という言葉を残したとされ、望遠鏡で木星の衛星を発見したイタリアの物理学者は誰？", correct: "ガリレオ・ガリレイ", dummies: ["ルネ・デカルト", "ヨハネス・ケプラー", "ニコラウス・コペルニクス"] },
            { q: "箱の中の猫が「生きている状態」と「死んでいる状態」の重ね合わせにあるという、量子力学の奇妙さを指摘した思考実験で有名なオーストリアの物理学者は誰？", correct: "エルヴィン・シュレディンガー", dummies: ["ウォルフガング・パウリ", "ヴェルナー・ハイゼンベルク", "マックス・ボルン"] },
            { q: "お風呂に入っているときに浮力の原理を思いつき、「エウレカ（分かった）！」と叫んで裸で飛び出したとされる古代ギリシャの学者は誰？", correct: "アルキメデス", dummies: ["ソクラテス", "アリストテレス", "ピタゴラス"] },
            { q: "カミナリが電気であることを証明するために、嵐の中で凧を揚げる危険な実験を行った、アメリカ100ドル札の肖像でもおなじみの政治家・物理学者は誰？", correct: "ベンジャミン・フランクリン", dummies: ["アレクサンダー・ハミルトン", "トマス・ジェファーソン", "この中にはいない"] },
            { q: "日本人で初めてノーベル賞（物理学賞）を受賞し、中間子の存在を予言した物理学者は誰？", correct: "湯川秀樹", dummies: ["野口英世", "南部陽一郎", "朝永振一郎"] },
            { q: "「ブラックホールの蒸発（放射）」を理論的に予言した、「車椅子の物理学者」として知られるイギリスの宇宙物理学者は誰？", correct: "スティーヴン・ホーキング", dummies: ["ニールス・ボーア", "カール・セーガン", "アルベルト・アインシュタイン"] },
            { q: "ラジウムおよびポロニウムを発見し、女性として初めてノーベル賞を受賞、さらに物理学賞と化学賞の2度受賞した人物は誰？", correct: "マリー・キュリー", dummies: ["ジェーン・グドール", "ロザリンド・フランクリン", "リーゼ・マイトナー"] },
            { q: "「経路積分」という量子力学の新しい手法を考案し、量子電磁力学の発展でノーベル賞を受賞した、ユーモア溢れるエッセイでも有名な物理学者は誰？", correct: "リチャード・ファインマン", dummies: ["ジョン・フォン・ノイマン", "マレー・ゲルマン", "ジュリアン・シュウィンガー"] },
            { q: "「β崩壊（弱い相互作用）におけるパリティ対称性の破れ」を実験によって実証し、素粒子物理学に激震を与えた中国系アメリカ人の女性物理学者は誰？", correct: "チエンシュン・ウー", dummies: ["エンリコ・フェルミ", "ショウ＝チェン・ジャン", "トゥ・ヨウヨウ"] },
            { q: "統計力学の基礎を築き、エントロピーの微視的な定義（S = k log W）を導いた、オーストリアの物理学者は誰？", correct: "ルードヴィヒ・ボルツマン", dummies: ["エルンスト・マッハ", "マックス・プランク", "ウィルヘルム・ヴィーン"] },
        ];
        const p = physicsQuestions[Math.floor(Math.random() * physicsQuestions.length)];
        qText = p.q; correct = p.correct; dummies = p.dummies;
    } else if (chosenSubject === "数学") {
        const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

        if (currentLv === 0 || currentLv === 1) {
            // 小学レベル
            const elemGenerators = [
                () => { const a = rand(1, 50), b = rand(1, 50); return { q: `${a} + ${b} = ?`, correct: `${a + b}` }; },
                () => { const a = rand(10, 99), b = rand(1, a); return { q: `${a} - ${b} = ?`, correct: `${a - b}` }; },
                () => { const a = rand(1, 9), b = rand(1, 9); return { q: `${a} × ${b} = ?`, correct: `${a * b}` }; },
                () => { const a = rand(1, 20), b = rand(1, 20), c = rand(1, 20); return { q: `${a} + ${b} + ${c} = ?`, correct: `${a + b + c}` }; },
                () => { const a = rand(1, 9), b = rand(1, 9), c = rand(1, 9); return { q: `${a} + ${b} × ${c} = ?`, correct: `${a + b * c}` }; },
                () => { const a = rand(100, 999), b = rand(100, 999); return { q: `${a} + ${b} = ?`, correct: `${a + b}` }; },
                () => { const b = rand(2, 9), qv = rand(2, 9), a = b * qv; return { q: `${a} ÷ ${b} = ?`, correct: `${qv}` }; },
            ];
            const gen = elemGenerators[Math.floor(Math.random() * elemGenerators.length)]();
            qText = `【小学レベル】${gen.q}`; correct = gen.correct;
            dummies = [`${Number(correct) + rand(1, 3)}`, `${Number(correct) - rand(1, 3)}`, `${Number(correct) + rand(4, 8)}`];

        } else if (currentLv === 2) {
            // 中学レベル
            const middleGenerators = [
                () => { const a = rand(-20, 20) || 1, b = rand(-20, 20) || 1; return { q: `${a} + (${b}) = ?`, correct: `${a + b}` }; },
                () => { const x0 = rand(1, 10), a = rand(2, 9), b = rand(1, 20), c = a * x0 + b; return { q: `${a}x + ${b} = ${c} のときのxの値は？`, correct: `${x0}` }; },
                () => { const w = rand(2, 20), h = rand(2, 20); return { q: `縦${h}cm、横${w}cmの長方形の面積は？`, correct: `${w * h}cm²` }; },
                () => { const w = rand(2, 20), h = rand(2, 20); return { q: `縦${h}cm、横${w}cmの長方形の周の長さは？`, correct: `${2 * (w + h)}cm` }; },
                () => { const r = rand(1, 20); return { q: `半径${r}cmの円の直径は？`, correct: `${2 * r}cm` }; },
                () => { const a = rand(-9, 9) || 1, b = rand(-20, 20); return { q: `y = ${a}x + ${b} の傾きは？`, correct: `${a}` }; },
            ];
            const gen = middleGenerators[Math.floor(Math.random() * middleGenerators.length)]();
            qText = `【中学レベル】${gen.q}`; correct = gen.correct;
            const numMatch = parseFloat(correct);
            dummies = [`${numMatch + 1}${correct.replace(/^-?\d+(\.\d+)?/, "")}`, `${numMatch - 1}${correct.replace(/^-?\d+(\.\d+)?/, "")}`, `${numMatch * 2}${correct.replace(/^-?\d+(\.\d+)?/, "")}`];

        } else {
            // 高校レベル
            const perfectSquares = [4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144];
            const highGenerators = [
                () => { const n = perfectSquares[Math.floor(Math.random() * perfectSquares.length)]; return { q: `√${n} の値は？`, correct: `${Math.sqrt(n)}` }; },
                () => { const base = [2, 3, 5][Math.floor(Math.random() * 3)], m = rand(1, 4), n = rand(1, 4); return { q: `${base}^${m} × ${base}^${n} を計算すると？`, correct: `${Math.pow(base, m + n)}` }; },
                () => { const angles = { "30": { sin: "1/2", cos: "√3/2", tan: "1/√3" }, "45": { sin: "√2/2", cos: "√2/2", tan: "1" }, "60": { sin: "√3/2", cos: "1/2", tan: "√3" } };
                        const keys = Object.keys(angles); const angle = keys[Math.floor(Math.random() * keys.length)];
                        const funcs = ["sin", "cos", "tan"]; const f = funcs[Math.floor(Math.random() * funcs.length)];
                        return { q: `${f}${angle}° の値は？`, correct: angles[angle][f] }; },
                () => { const bases = [2, 3, 5, 10], b = bases[Math.floor(Math.random() * bases.length)], n = rand(1, 4), val = Math.pow(b, n);
                        return { q: `log${b}(${val}) の値は？(底は${b})`, correct: `${n}` }; },
                () => { const b = rand(-10, 10) * 2, c = rand(1, 20); return { q: `y = x² + ${b}x + ${c} の頂点のx座標は？`, correct: `${-b / 2}` }; },
            ];
            const gen = highGenerators[Math.floor(Math.random() * highGenerators.length)]();
            qText = `【高校レベル】${gen.q}`; correct = gen.correct;
            const numMatch = parseFloat(correct);
            if (!isNaN(numMatch)) {
                dummies = [`${numMatch + 1}`, `${numMatch - 1}`, `${numMatch * 2}`];
            } else {
                dummies = ["√2/2", "1/2", "√3/2"].filter(d => d !== correct);
                while (dummies.length < 3) dummies.push("わからない");
            }
        }
    } else {
        if (currentLv === 0 || currentLv === 1) {
            const easyQuestions = [
                { q: "I'm ___ home now.", correct: "at", dummies: ["in", "to", "on"] },
                { q: "Can you ___ that again?", correct: "say", dummies: ["tell", "speak", "talk"] },
                { q: "I usually ___ breakfast at 7.", correct: "have", dummies: ["take", "eat", "get"] },
                { q: "She ___ to work by bus.", correct: "goes", dummies: ["go", "going", "went"] },
                { q: "Do you ___ coffee?", correct: "like", dummies: ["likes", "liking", "liked"] },
                { q: "I need ___ water.", correct: "some", dummies: ["any", "a", "the"] },
                { q: "Let's ___ lunch together.", correct: "have", dummies: ["do", "make", "take"] },
                { q: "He is ___ the phone now.", correct: "on", dummies: ["in", "at", "to"] },
                { q: "I'm looking ___ my keys.", correct: "for", dummies: ["at", "to", "on"] },
                { q: "What time ___ the meeting start?", correct: "does", dummies: ["do", "is", "are"] },
                { q: "I'd like ___ coffee, please.", correct: "some", dummies: ["a", "any", "the"] },
                { q: "She is good ___ cooking.", correct: "at", dummies: ["in", "to", "for"] },
                { q: "I'm going ___ the supermarket.", correct: "to", dummies: ["at", "in", "for"] },
                { q: "Can I ___ you later?", correct: "call", dummies: ["called", "calling", "calls"] },
                { q: "He ___ to music every night.", correct: "listens", dummies: ["listen", "listening", "listened"] },
            ];
            const p = easyQuestions[Math.floor(Math.random() * easyQuestions.length)];
            qText = `【Easy】${p.q}`; correct = p.correct; dummies = p.dummies;

        } else if (currentLv === 2) {
            const normalQuestions = [
                { q: "I'll call you when I ___ home.", correct: "get", dummies: ["got", "will get", "am getting"] },
                { q: "Could you ___ me a favor?", correct: "do", dummies: ["make", "give", "take"] },
                { q: "I'm not sure ___ he will come.", correct: "if", dummies: ["that", "what", "which"] },
                { q: "She has been busy ___ the report.", correct: "with", dummies: ["for", "to", "at"] },
                { q: "Let me know ___ you need anything.", correct: "if", dummies: ["that", "what", "when"] },
                { q: "I'm looking forward ___ you.", correct: "to seeing", dummies: ["to see", "see", "seeing"] },
                { q: "Do you know ___ the nearest station is?", correct: "where", dummies: ["what", "how", "which"] },
                { q: "He told me ___ earlier next time.", correct: "to come", dummies: ["come", "coming", "came"] },
                { q: "I'm sorry for ___ late.", correct: "being", dummies: ["be", "been", "to be"] },
                { q: "It takes about 10 minutes ___ there.", correct: "to get", dummies: ["get", "getting", "got"] },
                { q: "I wonder ___ he will join us.", correct: "if", dummies: ["that", "what", "how"] },
                { q: "She asked me ___ I could help her.", correct: "if", dummies: ["that", "which", "how"] },
                { q: "I'm used ___ early.", correct: "to getting", dummies: ["to get", "getting", "get"] },
                { q: "He promised ___ on time.", correct: "to come", dummies: ["come", "coming", "came"] },
                { q: "This bag is similar ___ mine.", correct: "to", dummies: ["with", "at", "for"] },
            ];
            const p = normalQuestions[Math.floor(Math.random() * normalQuestions.length)];
            qText = `【Normal】${p.q}`; correct = p.correct; dummies = p.dummies;

        } else {
            const hardQuestions = [
                { q: "If I had known, I ___ earlier.", correct: "would have come", dummies: ["will come", "would come", "came"] },
                { q: "I'd rather you ___ me first.", correct: "had told", dummies: ["tell", "told", "telling"] },
                { q: "The more you practice, ___ you get.", correct: "better", dummies: ["good", "best", "more good"] },
                { q: "Not until yesterday ___ the truth.", correct: "did I know", dummies: ["I knew", "have I known", "was I knowing"] },
                { q: "She acts as if she ___ everything.", correct: "knew", dummies: ["knows", "known", "has known"] },
                { q: "I suggest that he ___ a rest.", correct: "take", dummies: ["takes", "taken", "to take"] },
                { q: "It's high time you ___ working.", correct: "started", dummies: ["start", "starting", "have started"] },
                { q: "He insisted that the plan ___ changed.", correct: "be", dummies: ["is", "was", "has been"] },
                { q: "Hardly ___ home when it started raining.", correct: "had I arrived", dummies: ["I arrived", "have I arrived", "did I arrive"] },
                { q: "She spoke as though she ___ there before.", correct: "had been", dummies: ["was", "were", "has been"] },
                { q: "I would appreciate it if you ___ me know.", correct: "let", dummies: ["lets", "let to", "letting"] },
                { q: "Had it not been for your help, I ___ succeeded.", correct: "wouldn't have", dummies: ["would", "did", "have"] },
                { q: "She talks as though she ___ the answer.", correct: "had known", dummies: ["knows", "knew", "has known"] },
                { q: "No sooner ___ the message than he replied.", correct: "had he read", dummies: ["he read", "did he read", "has he read"] },
                { q: "I'd prefer that you ___ earlier next time.", correct: "came", dummies: ["come", "had come", "coming"] },
            ];
            const p = hardQuestions[Math.floor(Math.random() * hardQuestions.length)];
            qText = `【Hard】${p.q}`; correct = p.correct; dummies = p.dummies;
        }
    }

    const shuffler = shuffleChoices(correct, dummies);
    return {
        question: `【${chosenSubject}】${qText}`,
        choices: shuffler.choices,
        answer: shuffler.answerIndex,
        subject: chosenSubject
    };
}

// ==========================================
// 🏰 画面切り替え
// ==========================================
// ==========================================
// 🎵 BGM
//   ・音声ファイルを index.html と同じ場所に置くだけで鳴ります(下の file の名前に合わせる)
//   ・ファイルが無いシーンは、BGM_FALLBACK で別のシーンの曲を使い、それも無ければ無音になります
//   ・ブラウザの決まりで、最初に画面をタップするまで音は鳴りません
// ==========================================
const BGM_DIR = "";   // フォルダに入れる場合は "bgm/" のように書く(最後に / が必要)
const BGM_SCENES = {
    hub:    { file: "bgm_hub.mp3",    volume: 0.4 },   // 拠点・編成・チュートリアル・名前入力・スキャン・レイドのロビー(カナリアスキップ。元の音が大きめなので音量を下げている)
    trial:  { file: "bgm_trial.mp3",  volume: 0.55 },  // キャラ獲得試練(404_フリーズ_コード)
    battle: { file: "bgm_battle.m4a", volume: 0.5 },   // 昇格戦
    raid:   { file: "bgm_raid1.mp3",  volume: 0.5 },   // レイドバトル 第一形態(ロビーでは流さない)
    raid2:  { file: "bgm_raid2.mp3",  volume: 0.5 },   // レイドバトル 第二形態の曲(変身しても第一形態の曲のまま。キャラが覚醒した瞬間に切り替わる)
    ending: { file: "bgm_ending.mp3", volume: 0.7 }    // エンディング(雨の音。元の音が小さめなので音量を上げている)。エンディング画面の id を "ending-screen" にすれば自動で流れる。別の方法で出すなら setBgmScene("ending")
};
const BGM_FALLBACK = { trial: "hub", battle: "hub", raid: "battle", raid2: "raid" };   // 曲が無いときの代わり

let bgmMuted = safeStorageGet("bgmMuted") === "1";
let bgmUnlocked = false;      // 最初のタップのあとに true
let bgmWanted = null;         // いま流したいシーン
let bgmCurrent = null;        // いま実際に流れているシーン
const bgmAudios = {};
const bgmMissing = {};        // 読み込みに失敗した(ファイルが無い)シーン
const bgmFadeTimers = new Map();

function bgmGetAudio(scene) {
    if (bgmMissing[scene]) return null;
    if (bgmAudios[scene]) return bgmAudios[scene];
    const cfg = BGM_SCENES[scene];
    if (!cfg || !cfg.file) return null;
    const a = new Audio(BGM_DIR + cfg.file);
    a.loop = true;
    a.preload = "auto";
    a.volume = cfg.volume;
    a.addEventListener("error", () => {
        console.warn("BGMを読み込めません:", cfg.file);
        bgmMissing[scene] = true;
        delete bgmAudios[scene];
        if (bgmCurrent === scene) bgmCurrent = null;
        applyBgm();   // 代わりの曲があればそちらへ
    });
    bgmAudios[scene] = a;
    return a;
}

// フォールバックをたどって、実際に流すシーンを決める
function bgmResolve(scene) {
    let sc = scene;
    for (let i = 0; sc && i < 4; i++) {
        if (bgmGetAudio(sc)) return sc;
        sc = BGM_FALLBACK[sc];
    }
    return null;
}

function bgmFade(audio, target, ms, done) {
    if (bgmFadeTimers.has(audio)) clearInterval(bgmFadeTimers.get(audio));
    const from = audio.volume;
    const steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    const timer = setInterval(() => {
        i++;
        try { audio.volume = Math.max(0, Math.min(1, from + (target - from) * (i / steps))); } catch (e) {}   // iPhoneでは音量が変えられず、すぐ切り替わる
        if (i >= steps) {
            clearInterval(timer);
            bgmFadeTimers.delete(audio);
            if (done) done();
        }
    }, 50);
    bgmFadeTimers.set(audio, timer);
}

function bgmStopAll(exceptScene) {
    Object.keys(bgmAudios).forEach(sc => {
        if (sc === exceptScene) return;
        const a = bgmAudios[sc];
        if (a && !a.paused) bgmFade(a, 0, 400, () => { a.pause(); });
    });
}

function applyBgm() {
    const silent = !bgmUnlocked || bgmMuted || document.visibilityState === "hidden" || !bgmWanted;
    if (silent) {
        bgmStopAll(null);
        bgmCurrent = null;
        return;
    }
    const sc = bgmResolve(bgmWanted);
    bgmStopAll(sc);
    bgmCurrent = sc;
    if (!sc) return;

    const a = bgmAudios[sc];
    const target = BGM_SCENES[sc].volume;
    if (a.paused) {
        try { a.volume = 0; } catch (e) {}
        const p = a.play();
        if (p && p.catch) p.catch(e => console.warn("BGMの再生を開始できません:", e));
    }
    bgmFade(a, target, 600);
}

function setBgmScene(scene) {
    bgmWanted = scene;
    applyBgm();
}

// 画面ごとに流す曲を決める(showOnlyThisScreen から呼ばれる)
function updateBgmForScreen(screenId) {
    let scene = "hub";
    if (screenId === "trial-screen") scene = "trial";
    else if (screenId === "ending-screen") scene = "ending";
    else if (screenId === "battle-screen") scene = (currentBattleMode === "raid") ? "raid" : "battle";
    setBgmScene(scene);

    // ミュートボタンは、バトル画面ではタイマーと重なるので隠す
    const btn = document.getElementById("bgm-toggle-btn");
    if (btn) btn.style.display = (screenId === "battle-screen") ? "none" : "flex";
}

function updateBgmButton() {
    const btn = document.getElementById("bgm-toggle-btn");
    if (btn) btn.textContent = bgmMuted ? "🔇" : "🔊";
}

function toggleBgm() {
    bgmMuted = !bgmMuted;
    safeStorageSet("bgmMuted", bgmMuted ? "1" : "0");
    updateBgmButton();
    // このタップ自体が「ユーザー操作」なので、ここで解放しておく
    bgmUnlocked = true;
    applyBgm();
}

// 最初のタップで音を解放する(自動再生禁止への対応)。iPhoneでは touchend / click が有効
function bgmUnlockOnce() {
    if (bgmUnlocked) return;
    bgmUnlocked = true;
    ["click", "touchend", "keydown"].forEach(ev => document.removeEventListener(ev, bgmUnlockOnce, true));
    applyBgm();
}
["click", "touchend", "keydown"].forEach(ev => document.addEventListener(ev, bgmUnlockOnce, true));

// 別のアプリに切り替えたら止め、戻ってきたら再開する
document.addEventListener("visibilitychange", applyBgm);

function showOnlyThisScreen(screenId) {
    const screens = ["hub-screen", "lobby-screen", "trial-screen", "battle-screen", "tutorial-screen", "camera-screen", "party-screen", "name-screen"];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === screenId) {
                el.style.display = (id === "trial-screen" || id === "battle-screen" || id === "camera-screen" || id === "party-screen" || id === "name-screen") ? "flex" : "block";
            } else {
                el.style.display = "none";
            }
        }
    });
    const fixedArea = document.getElementById("fixed-action-area");
    if (fixedArea) fixedArea.style.display = (screenId === "hub-screen") ? "block" : "none";
    // レイドのときだけ、ボスを大きく左寄りに表示するレイアウトにする
    const bf = document.getElementById("battlefield");
    if (bf) {
        const isRaid = screenId === "battle-screen" && currentBattleMode === "raid";
        bf.classList.toggle("raid-mode", isRaid);
        if (!isRaid) bf.classList.remove("raid-phase2");
    }
    updateBgmForScreen(screenId);
}
// ==========================================
// 🌟 主人公(プレイヤー)の名前
// ==========================================
const PLAYER_NAME_MAX = 8;
let playerNameMemory = "";   // 保存できない環境でも、そのセッション中は名前を覚えておく
let nameEditMode = false;    // true = 名前の変更(すでに名前がある) / false = 初回入力

function getPlayerName() {
    return safeStorageGet("playerName") || playerNameMemory || "";
}

// メッセージ用の呼び名(名前が無ければ「あなた」)
function playerCallName() {
    const n = getPlayerName();
    return n ? `${n}さん` : "あなた";
}

function sanitizePlayerName(raw) {
    const cleaned = String(raw || "")
        .replace(/[\u0000-\u001f\u007f<>]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return Array.from(cleaned).slice(0, PLAYER_NAME_MAX).join("");   // 絵文字も1文字として数える
}

function updatePlayerNameLabel() {
    const el = document.getElementById("player-name-label");
    if (!el) return;
    const n = getPlayerName();
    el.textContent = n ? `👤 ${n} ✏️` : "";
    el.style.display = n ? "inline-block" : "none";
}

function showNameEntry(isEdit) {
    nameEditMode = !!isEdit;
    showOnlyThisScreen("name-screen");

    const input = document.getElementById("player-name-input");
    const errEl = document.getElementById("name-error");
    const confirmBtn = document.getElementById("name-confirm-btn");
    const cancelBtn = document.getElementById("name-cancel-btn");
    const titleEl = document.getElementById("name-screen-title");

    if (titleEl) titleEl.textContent = isEdit ? "名前を変更する" : "あなたの名前は？";
    if (confirmBtn) confirmBtn.textContent = isEdit ? "この名前に変更する" : "この名前で始める";
    if (cancelBtn) cancelBtn.style.display = isEdit ? "block" : "none";
    if (errEl) errEl.textContent = "";
    if (input) {
        input.value = isEdit ? getPlayerName() : "";
        setTimeout(() => { try { input.focus(); } catch (e) {} }, 150);
    }
}

function confirmPlayerName() {
    const input = document.getElementById("player-name-input");
    const errEl = document.getElementById("name-error");
    const name = sanitizePlayerName(input ? input.value : "");
    if (!name) {
        if (errEl) errEl.textContent = "名前を入力してください";
        return;
    }
    playerNameMemory = name;
    if (!safeStorageSet("playerName", name)) warnSaveFailed();
    showOnlyThisScreen("hub-screen");
    updateHubUI();
}

function cancelNameEdit() {
    showOnlyThisScreen("hub-screen");
    updateHubUI();
}

function openNameEdit() {
    showNameEntry(true);
}

// チュートリアルの終わり: 名前が未登録なら入力画面へ、登録済みならハブへ
function finishTutorial() {
    if (getPlayerName()) {
        showOnlyThisScreen("hub-screen");
        updateHubUI();
    } else {
        showNameEntry(false);
    }
}

// --- 🎏 パーティ編成システム(最大4体) ---
function loadPlayerParty() {
    try {
        const arr = JSON.parse(safeStorageGet("playerParty") || "[]");
        if (!Array.isArray(arr)) return [];
        // 存在する教科だけ・重複なし・最大4体
        return arr.filter((sub, i) => subjectMeta[sub] && arr.indexOf(sub) === i).slice(0, 4);
    } catch (e) {
        console.error("パーティのセーブデータを読めませんでした:", e);
        return [];
    }
}
let playerParty = loadPlayerParty();

function savePlayerParty() {
    safeStorageSet("playerParty", JSON.stringify(playerParty));
}

function togglePartyMember(subject) {
    const idx = playerParty.indexOf(subject);
    if (idx >= 0) {
        playerParty.splice(idx, 1);
    } else {
        if (playerParty.length >= 4) {
            alert("パーティは最大4体までです。外してから追加してください。");
            return;
        }
        playerParty.push(subject);
    }
    savePlayerParty();
    renderPartyScreen();
}

function renderPartyScreen() {
    const listEl = document.getElementById("party-select-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    // ハブ(試練)画面のキャラカードと同じデザインで並べる
    Object.keys(subjectMeta).forEach(subject => {
        if (subjectMeta[subject].guest) return;          // ゲストは、編成画面には出さない
        const data = characterLevels[subject];
        const meta = subjectMeta[subject];
        const unlocked = data && data.level > 0;
        const selected = playerParty.includes(subject);

        // 名前はハブのカードに書いてある表記をそのまま使う
        const hubNameEl = document.querySelector(`#card-${meta.cardId} .char-name`);
        const displayName = hubNameEl ? hubNameEl.innerText : `${meta.name} (${subject})`;

        const badgeText = !unlocked ? "未開放" : (data.level >= 3 ? "Lv.3 (MAX)" : `Lv.${data.level}`);
        const badgeBg = !unlocked ? "#777" : (data.level >= 3 ? "#ff1177" : "#0077ff");
        const noteText = !unlocked ? "🔒 試練でキャラを獲得しよう" : (selected ? "✅ 編成中" : "タップで編成");
        const noteColor = selected ? "#00ffcc" : "#8892b0";

        const card = document.createElement("div");
        card.className = unlocked ? "char-card unlocked" : "char-card locked";
        if (selected) {
            card.style.cssText = "border:2px solid #00ffcc !important; box-shadow:0 0 16px rgba(0,255,204,0.55) !important;";
        }
        if (!unlocked) card.style.cursor = "not-allowed";

        card.innerHTML = `
            <div class="status-badge" style="background:${badgeBg};">${badgeText}</div>
            <div class="char-img-container">
                <img src="${getCharImgFile(subject, "normal")}" alt="${subject}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <div class="fallback-avatar" style="display:none; font-size:40px;">${meta.emoji}</div>
            </div>
            <div class="char-name">${displayName}</div>
            <div style="font-size:11px; margin-top:6px; font-weight:${selected ? "bold" : "normal"}; color:${noteColor};">${noteText}</div>
        `;
        if (unlocked) card.onclick = () => togglePartyMember(subject);
        listEl.appendChild(card);
    });

    const countEl = document.getElementById("party-select-count");
    if (countEl) countEl.innerText = `${playerParty.length} / 4`;
}

function openPartyScreen() {
    showOnlyThisScreen("party-screen");
    renderPartyScreen();
}

function closePartyScreen() {
    showOnlyThisScreen("hub-screen");
    updateHubUI();
}

// バトル画面のパーティ表示欄を更新する。activeSubjectが実際に問題に答えている(HPが動く)キャラ
// ==========================================
// 🎲 正解したときに攻撃するキャラ: 画面に出ている味方の中から、同じ確率でランダムに1体
//   ・攻撃ポーズ・セリフは、選ばれたキャラのもの。ダメージは、これまでどおり先頭のキャラの強さで計算する
// ==========================================
const RANDOM_ATTACKER_ENABLED = true;   // false にすると、いつも先頭のキャラが攻撃する
let battlePartySlots = [];              // いま画面に出ている味方(最大4体)
let lastAttacker = null;                // 直前に攻撃したキャラ(確認用)
const attackTally = {};                 // キャラごとの攻撃回数(確認用。ページを開き直すまで貯まる)

const ATTACK_USES_ATTACKER_STATS = true;   // true: 攻撃したキャラ自身のレベルの強さでダメージを計算 / false: いつも先頭のキャラの強さ

// 攻撃したキャラの、攻撃力(Lv1=100 / Lv2=150 / Lv3=200)。leadStats は、先頭のキャラの強さ(false のときに使う)
function attackPowerOf(subject, leadStats) {
    if (!ATTACK_USES_ATTACKER_STATS) return leadStats.attack;
    const d = characterLevels[subject];
    return getPlayerStats(Math.max(1, d ? d.level : 1)).attack;
}

function pickAttacker(lead) {
    let attacker = lead;
    if (RANDOM_ATTACKER_ENABLED && battlePartySlots.length > 0) {
        attacker = battlePartySlots[Math.floor(Math.random() * battlePartySlots.length)];
    }
    lastAttacker = attacker;
    attackTally[attacker] = (attackTally[attacker] || 0) + 1;   // 確認用: 誰が何回攻撃したか(?debug=1 で画面に出る)
    return attacker;
}

function renderPartyDisplay(activeSubject) {
    // 表示する4枠を決定：先頭にactiveSubjectを置き、残りをplayerPartyから埋める(重複除外)
    const slots = computeDeployedSlots(activeSubject);   // レイドで覚醒したあとは、残った1体だけ

    battlePartySlots = slots.filter(sub => sub && subjectMeta[sub]);   // いま画面に出ている味方(攻撃するキャラの候補)

    lastActiveHp = null;   // 新しい戦闘の開始。次のHP更新を「満タン」の基準にする
    const hpFloatEl = document.getElementById("party-slot-0-hpfloat");
    if (hpFloatEl) hpFloatEl.classList.remove("show");

    for (let i = 0; i < 4; i++) {
        const subject = slots[i];
        const slotEl = document.getElementById(`party-slot-${i}`);
        const imgEl = document.getElementById(`party-slot-${i}-img`);
        const nameEl = document.getElementById(`party-slot-${i}-name`);
        const barEl = document.getElementById(`party-slot-${i}-hpbar`);
        if (!slotEl) continue;
        slotEl.classList.remove("vanished", "survivor", "awakened");

        if (subject && subjectMeta[subject]) {
            slotEl.style.display = "flex";
            slotEl.style.opacity = "1";
            if (imgEl) {
                imgEl.src = getBattleSpriteFile(subject, "normal");
                imgEl.style.visibility = "visible";
                imgEl.onerror = function () {
                    this.onerror = null;
                    this.src = getCharImgFile(subject, "normal");
                };
            }
            if (nameEl) nameEl.innerText = subjectMeta[subject].name;
            if (barEl) barEl.style.width = "100%"; // 控えメンバーは今のところ常に満タン表示(次段階で連動予定)
        } else {
            slotEl.style.display = "none";   // 空きスロットは表示しない
            if (imgEl) { imgEl.src = ""; imgEl.style.visibility = "hidden"; }
            if (nameEl) nameEl.innerText = "空きスロット";
            if (barEl) barEl.style.width = "0%";
        }
    }
}

// 実際に問題に答えているキャラ(スロット0)のHPバーを更新する
let lastActiveHp = null;       // 直前のHP(減ったかどうかの判定用)
let partyHpHideTimer = null;

function updateActivePartyHpBar(current, max) {
    const barEl = document.getElementById("party-slot-0-hpbar");
    if (!barEl) return;
    const pct = max > 0 ? Math.max(0, (current / max) * 100) : 0;
    barEl.style.width = `${pct}%`;
    barEl.style.background = pct <= 25 ? "#ff4444" : (pct <= 50 ? "#ffaa00" : "#33cc66");

    if (lastActiveHp === null) lastActiveHp = max;   // 戦闘開始時は満タンが基準
    if (current < lastActiveHp) showPartyDamage(lastActiveHp - current);
    lastActiveHp = current;
}

// ダメージを受けた時: キャラの上にHPバーを2秒ほど表示し、揺れとダメージ数字を出す
function showPartyDamage(amount) {
    const hpFloat = document.getElementById("party-slot-0-hpfloat");
    if (hpFloat) {
        hpFloat.classList.add("show");
        if (partyHpHideTimer) clearTimeout(partyHpHideTimer);
        partyHpHideTimer = setTimeout(() => hpFloat.classList.remove("show"), 2200);
    }
    const wrap = document.getElementById("party-slot-0-wrap");
    if (wrap) {
        wrap.classList.remove("hit-shake");
        void wrap.offsetWidth;                // アニメーションを最初から再生し直す
        wrap.classList.add("hit-shake");
        const pop = document.createElement("div");
        pop.className = "dmg-pop";
        pop.innerText = `-${amount}`;
        wrap.appendChild(pop);
        setTimeout(() => pop.remove(), 900);
    }
}

function updateHubUI() {
    updatePlayerNameLabel();
    const partyBadge = document.getElementById("party-count-badge");
    if (partyBadge) partyBadge.innerText = playerParty.length;

    // レイドボタン: どれか1人でも仲間(解放済み)になっていれば挑戦できる
    const raidBtn = document.getElementById("raid-start-btn");
    if (raidBtn) {
        const hasAnyCharacter = Object.keys(subjectMeta).some(sub => characterLevels[sub] && characterLevels[sub].level > 0);
        if (hasAnyCharacter) {
            raidBtn.disabled = false;
            raidBtn.style.background = "linear-gradient(135deg, #ff9900, #ff5500)";
            raidBtn.style.color = "#fff";
            raidBtn.style.border = "2px solid #ffcc00";
            raidBtn.style.cursor = "pointer";
            raidBtn.innerText = "💥 レイドボスに挑む";
        } else {
            raidBtn.disabled = true;
            raidBtn.style.background = "#444";
            raidBtn.style.color = "#777";
            raidBtn.style.border = "2px solid #555";
            raidBtn.style.cursor = "not-allowed";
            raidBtn.innerText = "🔒 レイドボスに挑む (キャラを1人仲間にすると解放)";
        }
    }

    Object.keys(subjectMeta).forEach(subject => {
        if (subjectMeta[subject].guest) return;          // ゲストは、拠点のカードには出さない
        const data = characterLevels[subject];
        if (!data) return;
        const meta = subjectMeta[subject];

        const card = document.getElementById(`card-${meta.cardId}`);
        const badge = document.getElementById(`badge-${meta.cardId}`);
        const bar = document.getElementById(`exp-bar-${meta.cardId}`);
        const txt = document.getElementById(`exp-text-${meta.cardId}`);
        if (!card) return;

        if (data.level === 0) {
            if (badge) { badge.innerText = "未開放"; badge.style.background = "#777"; }
            if (bar) bar.style.width = "0%";
            if (txt) txt.innerText = isTrialUnlocked(subject)
                ? "タップして「キャラ獲得試練」に挑戦！"
                : "📷 スキャンで試練の扉を開こう";
            card.className = "char-card locked shining-ready";
        } else if (data.level >= 3) {
            if (badge) { badge.innerText = "Lv.3 (MAX)"; badge.style.background = "#ff1177"; }
            if (bar) bar.style.width = "100%";
            if (txt) txt.innerText = "✨ レベル最大";
            card.className = "char-card unlocked";
        } else {
            if (badge) { badge.innerText = `Lv.${data.level}`; badge.style.background = "#0077ff"; }
            if (bar) bar.style.width = `${(data.level / 3) * 100}%`;
            if (txt) txt.innerText = `🔥 タップして Lv.${data.level + 1} 昇格戦へ！`;
            card.className = "char-card unlocked shining-ready";
        }
    });
}

// ==========================================
// 🗝️ 試練の扉(カメラのスキャンで開く)と、キャラのヒント
// ==========================================
let trialUnlockedList = [];              // スキャンして試練の扉が開いている(まだ合格していない)キャラの教科

function loadTrialUnlocked() {
    try {
        const arr = JSON.parse(safeStorageGet("trialUnlocked") || "[]");
        trialUnlockedList = Array.isArray(arr) ? arr.filter(sub => subjectMeta[sub] && !subjectMeta[sub].guest) : [];
    } catch (e) {
        trialUnlockedList = [];
    }
}
function saveTrialUnlocked() {
    safeStorageSet("trialUnlocked", JSON.stringify(trialUnlockedList));
}
function isTrialUnlocked(subject) {
    return trialUnlockedList.includes(subject);
}
function unlockTrial(subject) {
    if (!trialUnlockedList.includes(subject)) { trialUnlockedList.push(subject); saveTrialUnlocked(); }
}
function relockTrial(subject) {          // 仲間になったら、扉の記録はいらない
    if (trialHintTaps[subject]) { delete trialHintTaps[subject]; saveTrialHintTaps(); }
    if (trialUnlockedList.includes(subject)) {
        trialUnlockedList = trialUnlockedList.filter(sub => sub !== subject);
        saveTrialUnlocked();
    }
}

// そのキャラをスキャンで見つけるための場所(SCAN_CLASS_TO_SUBJECT のクラス名)
function scanPlaceOf(subject) {
    return Object.keys(SCAN_CLASS_TO_SUBJECT).find(name => SCAN_CLASS_TO_SUBJECT[name] === subject) || "";
}

// カードをタップしたときに、キャラが場所を教えてくれるセリフ。{place} には、場所の名前が入る
const TRIAL_HINT_LINES = {
    "国語": "べ、別にあんたのために教えるわけじゃないけど……「{place}」に行ってみなさいよ。そこをカメラで写せば、私の試練の扉が開くんだから！",
    "数学": "……試練を受けたいのだね。ヒントをあげよう。場所は「{place}」だ。そこをカメラで写してくれれば、扉は開く。",
    "英語": "……私に会いに来てくださったのですね。「{place}」へ行って、カメラを向けてください。そこで、試練の扉が開きます。",
    "物理": "よぉ！ 試練を受けたいのか？ なら「{place}」に行ってみな。そこをカメラで写せば、俺に会えるぜ。",
    "化学": "やあ。僕に会いたいなら、「{place}」に行ってみて。そこをカメラで写せば、試練の扉が開くよ。",
    "歴史": "俺に会いに来てくれたのか。「{place}」へ行ってみてくれ。そこをカメラで写せば、試練が始まる。",
    "地理": "へへっ、試練を受けたいんだね！ 「{place}」を探してみて！ カメラで写せば、試練の扉が開くよ！"
};

function ensureHintStyle() {
    if (document.getElementById("hint-style")) return;
    const st = document.createElement("style");
    st.id = "hint-style";
    st.textContent = `
#hint-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 20000; background: rgba(0,0,0,0.6); display: flex; flex-direction: column; justify-content: flex-end; padding: 14px 14px 18px; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
#hint-portrait { align-self: flex-start; width: 150px; height: 190px; object-fit: contain; object-position: left bottom; margin-bottom: -6px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.7)); animation: hint-pop 0.3s ease-out; }
#hint-portrait-fallback { align-self: flex-start; font-size: 80px; line-height: 150px; }
#hint-box { background: rgba(20,24,40,0.96); border: 2px solid rgba(255,255,255,0.55); border-radius: 14px; padding: 12px 14px 12px; color: #fff; box-shadow: 0 6px 20px rgba(0,0,0,0.6); animation: hint-pop 0.3s ease-out; }
#hint-name { font-size: 13px; font-weight: bold; color: #ffe27a; margin-bottom: 6px; }
#hint-text { font-size: 15px; line-height: 1.6; min-height: 72px; white-space: pre-wrap; }
#hint-next { font-size: 11px; color: #9fb4ff; text-align: right; min-height: 14px; margin-top: 2px; }
#hint-btns { display: flex; gap: 8px; margin-top: 10px; }
#hint-btns button { flex: 1; padding: 11px 6px; font-size: 13px; font-weight: bold; border-radius: 22px; border: none; cursor: pointer; color: #fff; }
#hint-go { background: linear-gradient(135deg, #00c6ff, #0072ff); }
#hint-close { background: #444; color: #ccc !important; }
@keyframes hint-pop { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
`;
    document.head.appendChild(st);
}

// ==========================================
// 🆘 救済: スキャンする場所に行けないとき(例: 歴史の「図書館」に入れない)
//   ・扉が閉じているカードを、決められた回数(taps)タップすると、キャラが少し話して救済をくれる
//   ・話し終わったら、そのまま試練の問題に進む(扉は開いた扱いになる)
//   ・救済を作りたいキャラだけ、ここに書く。lines は、セリフを順に出す(セリフ欄をタップすると次へ)
// ==========================================
const TRIAL_RELIEF = {
    "歴史": {
        taps: 2,                         // 何回目のタップで、救済になるか
        lines: [
            "……図書館に行けなかったのか。入れなかったり、時間が合わなかったり、そういうこともあるよな。",
            "特別に、今回は直接、俺から試練を出そう。歴史は、積み重ねの学問だ。君のこれまでの積み重ね、見せてくれ。"
        ],
        goLabel: "📖 試練に挑戦する"
    }
};
let trialHintTaps = {};                  // 扉が閉じているカードを、何回タップしたか(セーブされる)

function loadTrialHintTaps() {
    try {
        const o = JSON.parse(safeStorageGet("trialHintTaps") || "{}");
        trialHintTaps = (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    } catch (e) { trialHintTaps = {}; }
}
function saveTrialHintTaps() {
    safeStorageSet("trialHintTaps", JSON.stringify(trialHintTaps));
}

let hintOverlayOpen = false;
let hintTimer = null;

function closeTrialHint() {
    if (hintTimer) { clearInterval(hintTimer); hintTimer = null; }
    const el = document.getElementById("hint-overlay");
    if (el) el.remove();
    hintOverlayOpen = false;
}

// キャラが話すウィンドウを出す。lines: セリフ(順に出す) / go: { label, onClick } 最後のセリフのあとに出る主なボタン / closeLabel: 閉じるボタンの文字
function openCharDialog(subject, lines, go, closeLabel) {
    const meta = subjectMeta[subject];
    const container = document.getElementById("game-container");
    if (!meta || !container || hintOverlayOpen) return;
    ensureHintStyle();
    hintOverlayOpen = true;

    const overlay = document.createElement("div");
    overlay.id = "hint-overlay";

    const portrait = document.createElement("img");
    portrait.id = "hint-portrait";
    portrait.alt = "";
    portrait.src = getCharImgFile(subject, "normal");
    portrait.onerror = () => {                         // 画像が無いときは、絵文字で代わりにする
        const fb = document.createElement("div");
        fb.id = "hint-portrait-fallback";
        fb.innerText = meta.emoji || "💬";
        portrait.replaceWith(fb);
    };
    overlay.appendChild(portrait);

    const box = document.createElement("div");
    box.id = "hint-box";
    const nameEl = document.createElement("div");
    nameEl.id = "hint-name";
    nameEl.innerText = meta.name;
    const textEl = document.createElement("div");
    textEl.id = "hint-text";
    const nextEl = document.createElement("div");
    nextEl.id = "hint-next";
    const btns = document.createElement("div");
    btns.id = "hint-btns";
    const goBtn = document.createElement("button");
    goBtn.id = "hint-go";
    goBtn.type = "button";
    goBtn.innerText = go.label;
    const close = document.createElement("button");
    close.id = "hint-close";
    close.type = "button";
    close.innerText = closeLabel || "閉じる";
    btns.appendChild(goBtn);
    btns.appendChild(close);
    box.appendChild(nameEl);
    box.appendChild(textEl);
    box.appendChild(nextEl);
    box.appendChild(btns);
    overlay.appendChild(box);
    container.appendChild(overlay);

    // セリフを1文字ずつ表示する。セリフ欄をタップすると、全部すぐ出る → もう一度タップすると、次のセリフへ
    let lineIdx = 0;
    let typing = false;
    const stopTyping = () => { if (hintTimer) { clearInterval(hintTimer); hintTimer = null; } typing = false; };
    const refreshButtons = () => {
        const last = lineIdx >= lines.length - 1;
        btns.style.display = (last && !typing) ? "flex" : "none";
        nextEl.innerText = (!last && !typing) ? "▼ タップで次へ" : "";
    };
    const playLine = () => {
        stopTyping();
        const chars = Array.from(lines[lineIdx]);
        let n = 0;
        typing = true;
        textEl.innerText = "";
        refreshButtons();
        hintTimer = setInterval(() => {
            n++;
            textEl.innerText = chars.slice(0, n).join("");
            if (n >= chars.length) { stopTyping(); refreshButtons(); }
        }, 35);
    };
    box.addEventListener("click", ev => {
        if (ev.target === goBtn || ev.target === close) return;
        if (typing) { stopTyping(); textEl.innerText = lines[lineIdx]; refreshButtons(); }
        else if (lineIdx < lines.length - 1) { lineIdx++; playLine(); }
    });
    goBtn.addEventListener("click", ev => { ev.stopPropagation(); closeTrialHint(); go.onClick(); });
    close.addEventListener("click", ev => { ev.stopPropagation(); closeTrialHint(); });
    overlay.addEventListener("click", ev => { if (ev.target === overlay) closeTrialHint(); });   // 外側をタップしても閉じる
    playLine();
}

// まだ試練の扉が開いていないキャラのカードをタップしたとき: キャラが、スキャンする場所を教えてくれる
// 救済のあるキャラ(TRIAL_RELIEF)は、決められた回数目のタップで、救済になる
function showTrialHint(subject) {
    if (!subjectMeta[subject] || hintOverlayOpen) return;

    const relief = TRIAL_RELIEF[subject];
    trialHintTaps[subject] = (trialHintTaps[subject] || 0) + 1;
    saveTrialHintTaps();

    if (relief && trialHintTaps[subject] >= relief.taps) {
        openCharDialog(subject, relief.lines, {
            label: relief.goLabel || "📖 試練に挑戦する",
            onClick: () => checkLevelUp(subject, true)       // 扉を開けて、そのまま試練の問題へ
        }, "やめておく");
        return;
    }

    const place = scanPlaceOf(subject);
    const template = TRIAL_HINT_LINES[subject] || "試練を受けたいなら、キャンパスのどこかをカメラで写してみて。";
    const line = place ? template.replace("{place}", place) : "試練を受けたいなら、キャンパスのどこかをカメラで写してみて。";
    openCharDialog(subject, [line], { label: "📷 スキャンしに行く", onClick: openCameraScreen }, "閉じる");
}

// subject: 押した(または、スキャンで見つけた)キャラの教科 / viaScan: カメラのスキャンで見つけたときは true
//   ・まだ仲間でないキャラの「獲得試練」は、そのキャラの場所をカメラで写さないと開かない
//   ・カードをタップしただけのときは、試練は始まらず、キャラが場所を教えてくれる(showTrialHint)
//   ・一度スキャンして開いた試練は、合格するまで(失敗しても)、カードをタップして何度でも挑戦できる
function checkLevelUp(subject, viaScan) {
    
    if (!characterLevels[subject]) return;
    const data = characterLevels[subject];
    evolutionSubject = subject;

    if (data.level === 0) {
        if (viaScan) unlockTrial(subject);
        else if (!isTrialUnlocked(subject)) { showTrialHint(subject); return; }
        trialCurrentIndex = 0;
        trialCorrectCount = 0;
        showOnlyThisScreen("trial-screen");
        const trialTitles = {
            "国語": "【キャラ獲得試練】紫鳴結月",
            "数学": "【キャラ獲得試練】アルゲブラ",
            "英語": "【キャラ獲得試練】エルメシア・ルミナリア",
            "物理": "【キャラ獲得試練】ファイ",
            "化学": "【キャラ獲得試練】ルイス・ジョンソン",
            "歴史": "【キャラ獲得試練】大和誠",
            "地理": "【キャラ獲得試練】伊能大地",
        };
        startTrialQuiz(trialTitles[subject] || `【キャラ獲得試練】${subject}`);
        return;
    }
    if (data.level >= 3) {
        alert("既に最大レベルです！");
        return;
    }
    startEvolutionBattle();
}

// ==========================================
// 👩‍🏫 試練専用 10問クイズシステム
// ==========================================
let trialQuestionPool = [];

// ==========================================
// 🔁 問題のかぶり防止(試練・昇格戦)
//   ・1回の試練 / 1回の昇格戦のあいだは、同じ問題を出さない
//   ・直近に出した問題(RECENT_QUESTION_LIMIT 個ぶん)も、できるだけ避ける
//   ・問題が足りないとき(候補が尽きたとき)だけ、重複を許す
//   ・レイドは対象外
// ==========================================
const RECENT_QUESTION_LIMIT = 40;     // 「直近」として覚えておく問題の数
let recentQuestionKeys = [];          // 直近に出した問題(新しいものが後ろ)

function questionKey(q) {
    return q && q.question ? String(q.question) : "";
}

function rememberRecentQuestion(q) {
    const key = questionKey(q);
    if (!key) return;
    recentQuestionKeys = recentQuestionKeys.filter(k => k !== key);
    recentQuestionKeys.push(key);
    if (recentQuestionKeys.length > RECENT_QUESTION_LIMIT) {
        recentQuestionKeys = recentQuestionKeys.slice(-RECENT_QUESTION_LIMIT);
    }
}

// makeFn() で問題を作り、除外条件に合うものを返す。
//   第1段階: 今回すでに出した問題 + 直近の問題を避ける
//   第2段階: 今回すでに出した問題だけ避ける(直近は許す)
//   第3段階: 何でもOK(候補が足りないとき)
// subject を渡すと、その教科の問題だけを採用する
function pickFreshQuestion(makeFn, usedKeys, subject) {
    const tryPick = (avoidRecent, avoidUsed, maxAttempts) => {
        for (let i = 0; i < maxAttempts; i++) {
            const q = makeFn();
            if (!q) continue;
            if (subject && q.subject !== subject) continue;
            const key = questionKey(q);
            if (avoidUsed && usedKeys.has(key)) continue;
            if (avoidRecent && recentQuestionKeys.includes(key)) continue;
            return q;
        }
        return null;
    };
    return tryPick(true, true, 300)
        || tryPick(false, true, 300)
        || tryPick(false, false, 300);
}

function buildTrialPool(subject) {
    const pool = [];
    const used = new Set();
    for (let n = 0; n < 10; n++) {
        const q = pickFreshQuestion(() => generateQuestionForSubject(subject), used, null);
        if (!q) break;
        pool.push(q);
        used.add(questionKey(q));
    }
    trialQuestionPool = pool;
    pool.forEach(rememberRecentQuestion);
}

function generateQuestionForSubject(subject) {
    const lv = characterLevels[subject] ? characterLevels[subject].level : 0;
    let qText = ""; let correct = ""; let dummies = [];

    if (subject === "国語") {
        if (lv === 0 || lv === 1) {
            const lv1Words = [
                {k:"毎日", y:"まいにち", d:["まいにっち", "めいにち", "まにち"]},
                {k:"博士", y:"はかせ", d:["はくし", "ばかせ", "ひろし"]},
                {k:"宿題", y:"しゅくだい", d:["しゅくたい", "すくだい", "しゅくだえ"]},
                {k:"学校", y:"がっこう", d:["かくこう", "かっこう", "がくこう"]},
                {k:"先生", y:"せんせい", d:["ぜんせい", "せんせ", "しんせい"]},
                {k:"友達", y:"ともだち", d:["どもだち", "ともたち", "ゆうだち"]},
                {k:"昨日", y:"きのう", d:["さくじつ", "きじつ", "きの"]},
                {k:"今日", y:"きょう", d:["こんにち", "こにち", "きょ"]},
                {k:"明日", y:"あした", d:["みょうにち", "あす", "あしたた"]},
                {k:"元気", y:"げんき", d:["かんき", "がんき", "げんぎ"]},
                {k:"天気", y:"てんき", d:["でんき", "てんぎ", "てんきい"]},
                {k:"自動", y:"じどう", d:["しどう", "じとう", "じど"]},
                {k:"安心", y:"あんしん", d:["あんじん", "あんし", "はんしん"]},
                {k:"注意", y:"ちゅうい", d:["じゅうい", "ちゅい", "きょうい"]},
                {k:"計算", y:"けいさん", d:["けんさん", "けいざん", "けいさんん"]},
                {k:"用意", y:"ようい", d:["よ意", "ようり", "ゆい"]},
                {k:"料理", y:"りょうり", d:["りょり", "りょうじ", "りより"]},
                {k:"家族", y:"かぞく", d:["かぞっく", "やぞく", "かぞぐ"]},
                {k:"仕事", y:"しごと", d:["しこと", "じごと", "つかえごと"]},
                {k:"勉強", y:"べんきょう", d:["べんきょ", "めんきょう", "べんごう"]},
                {k:"音楽", y:"おんがく", d:["おんらく", "いんがく", "おんがぐ"]},
                {k:"旅行", y:"りょこう", d:["りょくこう", "りよこう", "りこう"]},
                {k:"時計", y:"とけい", d:["どけい", "とけえ", "ときけい"]},
                {k:"電話", y:"でんわ", d:["てんわ", "でんわわ", "でんが"]},
                {k:"電車", y:"でんしゃ", d:["てんしゃ", "でんじゃ", "れっしゃ"]},
                {k:"自転車", y:"じてんしゃ", d:["してんしゃ", "じてんじゃ", "じどうしゃ"]},
                {k:"自動車", y:"じどうしゃ", d:["しどうしゃ", "じどうじゃ", "くるま"]},
                {k:"飛行機", y:"ひこうき", d:["びこうき", "ひごうき", "ひくうき"]},
                {k:"駅前", y:"えきまえ", d:["えきぜん", "うまやまえ", "えきまい"]},
                {k:"公園", y:"こうえん", d:["ごうえん", "ほうえん", "こういん"]},
                {k:"動物園", y:"どうぶつえん", d:["とぶつえん", "どうぶついん", "どうぶつえ"]},
                {k:"図書館", y:"としょかん", d:["ずしょかん", "としょいん", "とすょかん"]},
                {k:"体育館", y:"たいいくかん", d:["たいくかん", "たいいくいん", "たいいぐかん"]},
                {k:"映画館", y:"えいがかん", d:["えがかん", "えいがいん", "えいかかん"]},
                {k:"病院", y:"びょういん", d:["びよいいん", "びょうえん", "びおん"]},
                {k:"郵便局", y:"ゆうびんきょく", d:["ゆびんきょく", "ゆうびんきょくく", "ゆうべんきょく"]},
                {k:"銀行", y:"ぎんこう", d:["きんこう", "ぎんごう", "ぎんくう"]},
                {k:"商店", y:"しょうてん", d:["あきぜん", "しょうでん", "しょうて"]},
                {k:"市場", y:"いちば", d:["しじょう", "いちばば", "しじょ"]},
                {k:"教室", y:"きょうしつ", d:["きょしつ", "きょうしづ", "きょうし"]},
                {k:"教科書", y:"きょうかしょ", d:["きょかしょ", "きょうかしょょ", "きょうがしょ"]},
                {k:"黒板", y:"こくばん", d:["くろいた", "こくぱん", "こぐばん"]},
                {k:"質問", y:"しつもん", d:["しづもん", "しつもんん", "ひつもん"]},
                {k:"答え", y:"こたえ", d:["とうえ", "こたええ", "ごたえ"]},
                {k:"試験", y:"しけん", d:["じけん", "しけんん", "しげん"]},
                {k:"成績", y:"せいせき", d:["せいぜき", "せんせき", "せいせぐ"]},
                {k:"卒業", y:"そつぎょう", d:["そつぎょ", "そづぎょう", "しゅつぎょう"]},
                {k:"入学", y:"にゅうがく", d:["にゅうかく", "にゅうがくく", "にうがく"]},
                {k:"見学", y:"けんがく", d:["みがく", "けんかく", "げんがく"]},
                {k:"練習", y:"れんしゅう", d:["れんしゅ", "ねんしゅう", "れんじゅう"]},
                {k:"運動", y:"うんどう", d:["おんどう", "うんとう", "はこびうごき"]},
                {k:"水泳", y:"すいえい", d:["みずえい", "すいええ", "ずいえい"]},
                {k:"走る", y:"はしる", d:["そうる", "はしいる", "ぱしる"]},
                {k:"歩く", y:"あるく", d:["ほく", "あゆく", "あるぐ"]},
                {k:"飛ぶ", y:"とぶ", d:["ひぶ", "とぷ", "とぶぶ"]},
                {k:"投げる", y:"なげる", d:["とうげる", "なける", "なげえる"]},
                {k:"拾う", y:"ひろう", d:["じゅうう", "ひろお", "しゅうう"]},
                {k:"探す", y:"さがす", d:["たんす", "さがお", "さがづ"]},
                {k:"集める", y:"あつめる", d:["しゅうめる", "あづめる", "あつめえる"]},
                {k:"発表", y:"はっぴょう", d:["はつひょう", "はっぴょ", "ばっぴょう"]},
                {k:"葛藤", y:"かっとう", d:["かつどう", "ちるとう", "きんとう"]},
            ];
            const p = lv1Words[Math.floor(Math.random() * lv1Words.length)];
            qText = `「${p.k}」の正しい読み方は？`; correct = p.y; dummies = p.d;
        } else {
            // lv2以上はgenerateRandomRaidQuestionに任せる
            const q = generateRandomRaidQuestion();
            if (q.subject === "国語") return q;
            return null;
        }
        const shuffler = shuffleChoices(correct, dummies);
        return { question: `【国語】${qText}`, choices: shuffler.choices, answer: shuffler.answerIndex, subject: "国語" };
    }

    // 国語以外はgenerateRandomRaidQuestionを使う
    let attempts = 0;
    while (attempts < 50) {
        attempts++;
        const q = generateRandomRaidQuestion();
        if (q.subject === subject) return q;
    }
    return null;
}

// --- 💬 教科ごとのキャラのセリフ集 ---
// --- ⚔️ 教科ごとのキャラの技リスト(演出用。正解時にランダムで1つ表示。ダメージ計算には影響しません) ---
const characterAttacks = {
    "国語": [
        "「広辞苑」で殴りつけた！",
        "斬撃の魔法を放った！",
        "無属性のレーザーを放った！",
        "炎のレーザーを浴びせた！",
        "業火を叩きつけた！"
    ],
    "数学": [
        "剣で斬りつけた！",
        "衝撃波を伴う斬撃を放った！",
        "無属性のレーザーを放った！",
        "凍結のレーザーを浴びせた！",
        "「絶対零度」の冷気で凍りつかせた！"
    ],
    "英語": [
        "光の杖で打ち据えた！",
        "祝福の光を浴びせた！",
        "翼を広げて突撃した！",
        "聖なる詠唱で切り裂いた！",
        "黄金の羽根を撃ち出した！"
    ],
    "物理": [
        "拳で殴りつけた！",
        "衝撃波を伴う打撃を放った！",
        "雷撃を浴びせた！",
        "風の刃を放った！",
        "重力で押しつぶした！",
        "放射線を浴びせた！"
    ],
    "化学": [
        "炎の薬品を投げつけた！",
        "水属性の薬品を浴びせた！",
        "雷属性の薬品で感電させた！",
        "凍結の薬品で凍りつかせた！",
        "無機の毒素を撒き散らした！",
        "「ボラジンガード」で身を固めた！"
    ],
    "歴史": [
        "刀で斬りつけた！",
        "魔法剣を放った！",
        "風の一撃を放った！",
        "「薬丸示現流・蜻蛉の構え」で斬りかかった！",
        "「薩摩示現流・蜻蛉の構え」で斬りかかった！"
    ],
    "地理": [
        "杖で殴りつけた！",
        "岩を叩きつけた！",
        "風を巻き起こした！",
        "凍らせる息を吹きかけた！",
        "炎を放った！",
        "水を浴びせた！"
    ]
};

function getRandomAttackLine(subject) {
    const list = characterAttacks[subject] || characterAttacks["国語"];
    return list[Math.floor(Math.random() * list.length)];
}

const characterQuotes = {
    "国語": {
        intro: "さあ、私の問題に答えられるかしら？",
        win: [
            "ふん、当然よね。",
            "いいじゃない！その調子よ！",
            "別に…仲間になりたいわけじゃないわよ！"
        ],
        lose: [
            "それは違うわよ！",
            "なんで間違えるのよ！",
            "私を仲間にするんでしょ！"
        ]
    },
    "数学": {
        intro: "さあ、この方程式を解いてみせろ。答えは一つしかない。",
        win: [
            "ふっ、正確な計算だ。悪くない。",
            "証明完了、というやつだな。",
            "無駄のない、美しい正解だ。"
        ],
        lose: [
            "計算ミスだ。もう一度、冷静に見直せ。",
            "惜しい……が、数字は嘘をつかない。",
            "答えは一つ。お前が選んだそれではない。"
        ]
    },
    "英語": {
        intro: "さあ、私と言葉を交わしましょう。準備はいいですか？",
        win: [
            "素晴らしいですわ！お見事な答えです。",
            "ふふ、その調子ですわ。とても優秀ですね。",
            "正解です。あなたの努力が伝わってきますわ。"
        ],
        lose: [
            "あら、少し惜しかったですわね。",
            "残念ですわ。でも次はきっと大丈夫。",
            "そこは間違えやすいところですものね。"
        ]
    },
    "物理": {
        intro: "この宇宙の法則、お前はどこまで理解している？かかってこい！",
        win: [
            "そうだ！それが自然の答えだ！",
            "見事だ、法則を見抜いたな！",
            "その通り！世界はそうやって動いている！"
        ],
        lose: [
            "違うな。もう一度、力の流れを考えろ。",
            "残念、それでは辻褄が合わないぞ。",
            "自然はそんなに単純じゃない。よく見ろ。"
        ]
    },
    "化学": {
        intro: "ようこそ、私の実験室へ。さあ、正しい反応を見せてくれ。",
        win: [
            "素晴らしい反応だ！実に美しい結果だな。",
            "ふはは、その通り！化学の神髄を見た！",
            "完璧な調合だ。才能を感じるぞ。"
        ],
        lose: [
            "むっ、その組み合わせでは爆発してしまうぞ。",
            "残念、反応が起きなかったようだな。",
            "もう一度、周期表とよく相談することだ。"
        ]
    },
    "歴史": {
        intro: "歴史に学ばぬ者に、未来はない。さあ、答えてみせよ。",
        win: [
            "うむ、見事な答えだ。歴史はお前の味方だな。",
            "その通り。過去を正しく知る者は強い。",
            "良い答えだ。先人たちも誇らしかろう。"
        ],
        lose: [
            "残念だ。歴史は繰り返す、と言うがな。",
            "むぅ、それは違う。もう一度学び直せ。",
            "答えを間違えるとは……修行が足りぬな。"
        ]
    },
    "地理": {
        intro: "さあ、世界を見て回ろう！この問題、答えられるか？",
        win: [
            "よし、正解だ！世界はお前の足元にあるぞ！",
            "いいぞ、その調子で世界を旅しよう！",
            "正解！地図の読み方がわかってきたな！"
        ],
        lose: [
            "おっと、道に迷ったな。地図をよく見てみろ。",
            "残念、そこはよくある間違いだ。",
            "うーん、方角が逆だったかもしれないな。"
        ]
    }
};

function getCharacterQuotes(subject) {
    return characterQuotes[subject] || characterQuotes["国語"];
}

function startTrialQuiz(titleText) {
    currentBattleMode = "evolution";

    const titleEl = document.getElementById("trial-title");
    if (titleEl) titleEl.innerText = titleText;

    if (trialCurrentIndex === 0) buildTrialPool(evolutionSubject);

    const counterEl = document.getElementById("trial-counter");
    if (counterEl) counterEl.innerText = `第 ${trialCurrentIndex + 1} 問目 / 全 10 問 （現在: ${trialCorrectCount} 問正解）`;

    currentTrialQuestion = trialQuestionPool[trialCurrentIndex];

    const qTextEl = document.getElementById("trial-question-text");
    if (qTextEl) qTextEl.innerText = currentTrialQuestion.question;

    const imgEl = document.getElementById("trial-p-img");
    if (imgEl) { imgEl.src = getCharImgFile(evolutionSubject, "normal"); imgEl.style.display = "block"; imgEl.style.height = "280px"; imgEl.style.maxHeight = "280px"; }
    const dummyEl = document.getElementById("trial-dummy-avatar");
    if (dummyEl) { dummyEl.innerText = subjectMeta[evolutionSubject] ? subjectMeta[evolutionSubject].emoji : "❓"; dummyEl.style.display = "none"; }
    const dialogueEl = document.getElementById("trial-dialogue-text");
    if (dialogueEl) dialogueEl.innerText = getCharacterQuotes(evolutionSubject).intro;

    const buttons = document.querySelectorAll("#trial-choices-area button");
    buttons.forEach((btn, idx) => {
        if (btn) { btn.innerText = currentTrialQuestion.choices[idx] || ""; btn.disabled = false; }
    });
}

function selectTrialChoice(selectedIndex) {
    const imgEl = document.getElementById("trial-p-img");
    const dialogueEl = document.getElementById("trial-dialogue-text");
    const buttons = document.querySelectorAll("#trial-choices-area button");

    buttons.forEach(btn => { if (btn) btn.disabled = true; });

    const quotes = getCharacterQuotes(evolutionSubject);
    const winQuotes = quotes.win;
    const loseQuotes = quotes.lose;

    if (selectedIndex === currentTrialQuestion.answer) {
        if (imgEl) { imgEl.src = getCharImgFile(evolutionSubject, "simile"); imgEl.style.height = "280px"; imgEl.style.maxHeight = "280px"; }
        if (dialogueEl) {
            dialogueEl.innerText = `⭕ ${winQuotes[Math.floor(Math.random() * winQuotes.length)]}`;
            dialogueEl.style.color = "#00ffcc";
        }
        trialCorrectCount++;
    } else {
       if (imgEl) { imgEl.src = getCharImgFile(evolutionSubject, "shock"); imgEl.style.height = "280px"; imgEl.style.maxHeight = "280px"; }
        if (dialogueEl) {
            dialogueEl.innerText = `❌ ${loseQuotes[Math.floor(Math.random() * loseQuotes.length)]}\n(正解は「${currentTrialQuestion.choices[currentTrialQuestion.answer]}」)`;
            dialogueEl.style.color = "#ff4444";
        }
    }

    setTimeout(() => {
        if (dialogueEl) dialogueEl.style.color = "#fff";
        trialCurrentIndex++;

        if (trialCurrentIndex < 10) {
            startTrialQuiz(document.getElementById("trial-title").innerText);
        } else {
            let recruitedNow = false;                 // 今回、初めて仲間になったか(なったときだけ漫画を見せる)
            const recruitedSubject = evolutionSubject;
            if (trialCorrectCount >= 8) {
                if (characterLevels[evolutionSubject].level === 0) {
                    recruitedNow = true;
                    relockTrial(evolutionSubject);
                    characterLevels[evolutionSubject].level = 1;
                    const charName = subjectMeta[evolutionSubject] ? subjectMeta[evolutionSubject].name : evolutionSubject;
                    let partyMsg = "";
                    if (!playerParty.includes(evolutionSubject) && playerParty.length < 4) {
                        playerParty.push(evolutionSubject);
                        savePlayerParty();
                        partyMsg = "\nパーティに自動で加わりました！";
                    }
                    alert(`🎉 ${playerCallName()}、合格！10問中 ${trialCorrectCount} 問正解！\n${charName}が仲間になりました！${partyMsg}`);
                } else {
                    characterLevels[evolutionSubject].level++;
                    alert(`🎉 ${playerCallName()}、合格！10問中 ${trialCorrectCount} 問正解！\nLv.${characterLevels[evolutionSubject].level} にアップ！`);
                }
                characterLevels[evolutionSubject].exp = 0;
                saveGame();
            } else {
                alert(`💀 不合格...\n正解数が ${trialCorrectCount} 問でした。合格には8問以上の正解が必要です。`);
            }
            if (recruitedNow) showRecruitManga(recruitedSubject, backToHub);   // 仲間になった直後の漫画 → 閉じたら拠点へ
            else backToHub();
        }
    }, 2000);
}

// ==========================================
// 📖 漫画ビューア(全画面)
//   ・画面をタップするたびに、漫画が1段ずつ現れて進む。最後の段のあとにタップすると閉じる
//   ・右下の「スキップ」で、いつでも閉じられる
//   ・画像が読み込めないときは、何も出さずにそのまま次へ進む(ゲームは止まらない)
//   ・画像は index.html と同じ場所に置く。段の切れ目(cuts)は、画像の縦の位置(px)。w / h は画像の幅・高さ
//     画像を差し替えたら、ここの数値も直す
//
//   ① 仲間になった直後の漫画: manga_キャラ接頭辞.webp(例: manga_lewis.webp)
//        キャラの試練に初めて合格した直後に出る → 閉じたら拠点へ戻る
//   ② レイドで覚醒するときの漫画: manga_awaken_キャラ接頭辞.webp(例: manga_awaken_lewis.webp)
//        第二形態の負けイベのあと、キャラが覚醒する直前に出る → 閉じたら覚醒して決戦が始まる
//        特別ルートでは、2人の漫画が出る: 結月+エルメシア=manga_awaken_pair.webp / アルゲブラ+ファイ=manga_awaken_pair_algebra_phi.webp
//        変身したあとに入室した人(負けイベを見ていない人)には出ない
//   ③ レイドが終わったあとの漫画(お別れ): manga_farewell_キャラ接頭辞.webp(例: manga_farewell_lewis.webp)
//        覚醒したキャラの手でボスを倒して勝利したあとに出る → 閉じたら拠点へ戻る
//        特別ルートでは、2人の漫画が出る: 結月+エルメシア=manga_farewell_pair.webp / アルゲブラ+ファイ=manga_farewell_pair_algebra_phi.webp
//        覚醒する前に、ほかのプレイヤーがボスを倒した場合は出ない
//   ④ オープニング漫画: manga_opening.webp
//        ゲームを初めて開いたとき(チュートリアルの前)に、一度だけ出る → 閉じたらチュートリアルへ
//        ?reset=1 でセーブを消して始め直したときも、もう一度出る
// ==========================================
const MANGA_DATA = {
    lewis: { w: 940, h: 1673, cuts: [419, 798, 1108, 1376] },
    yamato: { w: 941, h: 1672, cuts: [427, 806, 1100, 1379] },
    phi: { w: 940, h: 1672, cuts: [416, 795, 1110, 1381] },
    inoh: { w: 941, h: 1672, cuts: [418, 735, 1053, 1324] },
    elmesia: { w: 941, h: 1672, cuts: [424, 831, 1240] },
    algebra: { w: 941, h: 1672, cuts: [438, 828, 1256] },
    yuzuki: { w: 941, h: 1672, cuts: [571, 1081] }
};
const MANGA_AWAKEN_DATA = {
    pair_algebra_phi: { w: 941, h: 1672, cuts: [294, 574, 896, 1068, 1321] },
    pair: { w: 1024, h: 1536, cuts: [188, 358, 606] },
    yamato: { w: 941, h: 1672, cuts: [276, 582, 838, 1322] },
    phi: { w: 1024, h: 1536, cuts: [371, 685, 799] },
    lewis: { w: 1024, h: 1536, cuts: [378, 715, 890, 1162] },
    inoh: { w: 941, h: 1672, cuts: [309, 650, 918, 1432] },
    elmesia: { w: 941, h: 1672, cuts: [284, 592, 874, 1392] },
    algebra: { w: 941, h: 1671, cuts: [333, 601, 895, 1302] },
    yuzuki: { w: 941, h: 1672, cuts: [288, 686, 1034] }
};

const MANGA_OPENING_DATA = { w: 1312, h: 1199, cuts: [271, 628, 867] };   // オープニング(manga_opening.webp)

const MANGA_FAREWELL_DATA = {
    pair_algebra_phi: { w: 941, h: 1672, cuts: [338, 647, 974, 1310] },
    lewis: { w: 1024, h: 1536, cuts: [256, 566, 850, 1148] },
    algebra: { w: 1024, h: 1536, cuts: [438, 812, 1127] },
    inoh: { w: 1024, h: 1536, cuts: [279, 766, 1184] },
    yamato: { w: 1024, h: 1536, cuts: [312, 640, 1048] },
    yuzuki: { w: 1024, h: 1536, cuts: [348, 691, 1154] },
    phi: { w: 941, h: 1672, cuts: [289, 581, 848, 1127] },
    elmesia: { w: 1024, h: 1536, cuts: [378, 806, 1166] },
    pair: { w: 941, h: 1672, cuts: [308, 569, 772, 1047, 1429] }
};

let mangaOverlayOpen = false;
let mangaCloseNow = null;                // 開いている漫画を、いますぐ閉じる関数(退出・レイド終了のときに使う)

function ensureMangaStyle() {
    if (document.getElementById("manga-style")) return;
    const st = document.createElement("style");
    st.id = "manga-style";
    st.textContent = `
#manga-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 20000; background: #000; display: flex; flex-direction: column; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
#manga-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; justify-content: center; }
#manga-inner { width: 100%; }
.manga-row { position: relative; width: 100%; overflow: hidden; display: none; }
.manga-row.shown { display: block; animation: manga-in 0.35s ease-out; }
.manga-row img { position: absolute; left: 0; width: 100%; height: auto; display: block; }
@keyframes manga-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
#manga-hint { flex: 0 0 auto; text-align: center; font-size: 13px; color: #fff; padding: 8px 0 10px; background: #000; animation: manga-blink 1.2s ease-in-out infinite alternate; }
@keyframes manga-blink { from { opacity: 0.45; } to { opacity: 1; } }
#manga-skip { position: absolute; bottom: 5px; right: 8px; z-index: 2; padding: 5px 10px; font-size: 12px; font-weight: bold; color: #fff; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.6); border-radius: 14px; cursor: pointer; }
`;
    document.head.appendChild(st);
}

// 漫画を全画面で見せる。file: 画像ファイル名 / data: { w, h, cuts } / onClose: 閉じたあとにすること / lastHint: 最後の段のときの案内
function showMangaViewer(file, data, onClose, lastHint) {
    const done = typeof onClose === "function" ? onClose : () => {};
    const container = document.getElementById("game-container");
    if (!data || !container || mangaOverlayOpen) { done(); return; }

    const probe = new Image();
    probe.onerror = () => done();                       // 画像が無い・読めないときは、漫画なしで進む
    probe.onload = () => {
        if (mangaOverlayOpen) { done(); return; }
        ensureMangaStyle();
        mangaOverlayOpen = true;

        const overlay = document.createElement("div");
        overlay.id = "manga-overlay";
        const scroll = document.createElement("div");
        scroll.id = "manga-scroll";
        const inner = document.createElement("div");
        inner.id = "manga-inner";
        scroll.appendChild(inner);

        // 段ごとに、同じ画像の「一部分だけ」を見せる(段は最初は隠しておき、タップで1段ずつ出す)
        const edges = [0, ...data.cuts, data.h];
        const rows = [];
        for (let i = 0; i < edges.length - 1; i++) {
            const y0 = edges[i], y1 = edges[i + 1];
            const row = document.createElement("div");
            row.className = "manga-row";
            row.style.aspectRatio = `${data.w} / ${y1 - y0}`;
            const img = document.createElement("img");
            img.src = probe.src;
            img.alt = "";
            img.draggable = false;
            img.style.top = `${-(y0 / (y1 - y0)) * 100}%`;
            row.appendChild(img);
            inner.appendChild(row);
            rows.push(row);
        }

        const hint = document.createElement("div");
        hint.id = "manga-hint";
        const skip = document.createElement("button");
        skip.id = "manga-skip";
        skip.type = "button";
        skip.innerText = "スキップ ⏭";

        overlay.appendChild(scroll);
        overlay.appendChild(hint);
        overlay.appendChild(skip);
        container.appendChild(overlay);

        let shown = 0;
        let lastTap = 0;
        let closed = false;
        const close = (runCallback) => {
            if (closed) return;
            closed = true;
            mangaOverlayOpen = false;
            mangaCloseNow = null;
            overlay.remove();
            if (runCallback) done();
        };
        mangaCloseNow = () => close(false);              // 退出・レイド終了のときは、あとの処理はせずに閉じるだけ
        const updateHint = () => {
            hint.innerText = shown >= rows.length ? (lastHint || "▼ タップして閉じる") : `▼ タップで進む (${shown}/${rows.length})`;
        };
        const showNext = () => {
            if (shown >= rows.length) { close(true); return; }
            rows[shown].classList.add("shown");
            shown++;
            updateHint();
            setTimeout(() => { scroll.scrollTo({ top: scroll.scrollHeight, behavior: "smooth" }); }, 30);
        };

        overlay.addEventListener("click", ev => {
            if (ev.target === skip) return;
            const now = Date.now();
            if (now - lastTap < 250) return;             // 連打で、うっかり飛ばさないように
            lastTap = now;
            showNext();
        });
        skip.addEventListener("click", ev => { ev.stopPropagation(); close(true); });

        showNext();                                      // 最初の1段を表示
    };
    probe.src = file;
}

// 開いている漫画があれば、あとの処理はせずに閉じる
function closeMangaViewer() {
    if (mangaCloseNow) mangaCloseNow();
    if (endingCloseNow) endingCloseNow();                // エンディングを流している途中で拠点へ戻る場合も、閉じる
}

// ① 仲間になった直後の漫画。subject: 仲間になった教科 / onClose: 閉じたあとにすること(拠点へ戻るなど)
function showRecruitManga(subject, onClose) {
    const meta = subjectMeta[subject];
    const data = meta ? MANGA_DATA[meta.imgBase] : null;
    showMangaViewer(meta ? `manga_${meta.imgBase}.webp` : "", data, onClose, "▼ タップして閉じる");
}

// ④ オープニング漫画(ゲームを初めて開いたとき)。onClose: 閉じたあとにすること(チュートリアルへ)
function showOpeningManga(onClose) {
    showMangaViewer("manga_opening.webp", MANGA_OPENING_DATA, onClose, "▼ タップして、はじめる");
}

// ③ レイドが終わったあとの漫画。key: キャラの接頭辞 / 特別ルート(2人)なら "pair"
function showFarewellManga(key, onClose) {
    showMangaViewer(`manga_farewell_${key}.webp`, MANGA_FAREWELL_DATA[key], onClose, "▼ タップして、拠点へ戻る");
}

// ② レイドで覚醒するときの漫画。key: キャラの接頭辞 / 特別ルート(2人)なら "pair"
function showAwakenManga(key, onClose) {
    showMangaViewer(`manga_awaken_${key}.webp`, MANGA_AWAKEN_DATA[key], onClose, "▼ タップして、覚醒へ！");
}

// ==========================================
// 🎬 エンディング(エンドロール)
//   ・レイドに勝利したあと、お別れの漫画のあとに流れる(漫画が出ない人は、勝利のメッセージのあとにすぐ流れる)
//   ・動画(ending_roll.mp4)を背景に、名前が下から上へ流れる。曲は雨の音(bgm_ending.mp3)
//   ・流れ終わると「THE END」が出て、タップすると拠点へ戻る。右下の「スキップ」でいつでも戻れる
//   ・動画が読み込めなくても、夜明け色の背景で名前は流れる
//   ・載せる名前は、下の ENDING_CREDITS に書く(役割ごとのまとまりを、上から順に流す)
// ==========================================
const ENDING_VIDEO_FILE = "ending_roll.mp4";   // 背景の動画(ループ再生。音声は使わない)
const ENDING_SCROLL_PX_PER_SEC = 42;           // 名前が流れる速さ(大きいほど速い。全体の長さは、載せる名前の量で決まる)
const ENDING_PLAY_MODE = "always";             // "always" = 勝利するたびに流す / "first" = 初めて勝利したときだけ流す
const ENDING_SEEN_KEY = "endingSeen";

// 役割(title)ごとに、名前(names)を並べる。names が空のまとまりは出ない。
// names には、文字列のほか、「名前を返す関数」も書ける(主人公の名前など)
const ENDING_CREDITS = [
    { title: "主人公", names: [() => getPlayerName() || "あなた"] },
    { title: "仲間たち", names: ["紫鳴 結月", "アルゲブラ", "エルメシア・ルミナリア", "ファイ", "ルイス・ジョンソン", "大和 誠", "伊能 大地"] },
    { title: "ゲスト出演", names: ["エリス・ジョンソン"] },
    // ▼ 制作に関わった人(上から順に流れる。足す・並べ替えるときは、この形で書く)
    { title: "ゼミ", names: ["柴崎ゼミ"] },
    { title: "企画", names: ["新岡嶺"] },
    { title: "プログラミング", names: ["アルセリア"] },
    { title: "キャラデザイン", names: ["菅 肇真"] },
    { title: "BGM", names: ["tak_mfk 提供", "まんぼう二等兵 提供"] },
    { title: "ポスター", names: ["安藤裕基", "松原快青", "杉浦琉生"] },
];
const ENDING_TITLE = "文化祭クイズRPG";           // 最初に流れるタイトル
const ENDING_THANKS = "Thank you for playing!";     // 最後に流れるひとこと

let endingOpen = false;
let endingCloseNow = null;               // 開いているエンディングを、いますぐ閉じる関数

function ensureEndingStyle() {
    if (document.getElementById("ending-style")) return;
    const st = document.createElement("style");
    st.id = "ending-style";
    st.textContent = `
#ending-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 20000; overflow: hidden; background: linear-gradient(#0b1236 0%, #4a3f7d 55%, #f0a38a 100%); -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
#ending-video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
#ending-shade { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(rgba(0,0,20,0.30), rgba(0,0,20,0.12) 50%, rgba(40,10,10,0.35)); pointer-events: none; }
#ending-credits { position: absolute; top: 0; left: 0; right: 0; padding: 0 18px; text-align: center; color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,0.85), 0 0 14px rgba(0,0,30,0.7); will-change: transform; }
#ending-credits .ec-title { font-size: 26px; font-weight: bold; letter-spacing: 3px; margin-bottom: 70px; }
#ending-credits .ec-block { margin-bottom: 54px; }
#ending-credits .ec-role { font-size: 13px; letter-spacing: 4px; color: #ffe9a8; margin-bottom: 14px; }
#ending-credits .ec-name { font-size: 19px; font-weight: bold; line-height: 1.55; }
#ending-credits .ec-thanks { font-size: 20px; font-weight: bold; margin-top: 30px; letter-spacing: 1px; }
#ending-end { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: none; flex-direction: column; align-items: center; justify-content: center; color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,0.85); text-align: center; }
#ending-end.show { display: flex; animation: ending-fade 1.6s ease-out; }
#ending-end .ee-main { font-size: 34px; font-weight: bold; letter-spacing: 6px; }
#ending-end .ee-hint { margin-top: 26px; font-size: 13px; animation: manga-blink 1.2s ease-in-out infinite alternate; }
@keyframes ending-fade { from { opacity: 0; } to { opacity: 1; } }
#ending-skip { position: absolute; bottom: 8px; right: 8px; z-index: 2; padding: 5px 10px; font-size: 12px; font-weight: bold; color: #fff; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.6); border-radius: 14px; cursor: pointer; }
`;
    document.head.appendChild(st);
}

// エンドロールを流す。onClose: 終わったあとにすること(拠点へ戻る)
function showEnding(onClose) {
    const done = typeof onClose === "function" ? onClose : () => {};
    const container = document.getElementById("game-container");
    const alreadySeen = safeStorageGet(ENDING_SEEN_KEY) === "1";
    if (!container || endingOpen || (ENDING_PLAY_MODE === "first" && alreadySeen)) { done(); return; }

    ensureEndingStyle();
    endingOpen = true;
    safeStorageSet(ENDING_SEEN_KEY, "1");

    const overlay = document.createElement("div");
    overlay.id = "ending-overlay";

    const video = document.createElement("video");
    video.id = "ending-video";
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "auto";
    video.onerror = () => video.remove();             // 動画が読めなくても、背景色のまま名前は流れる
    video.src = ENDING_VIDEO_FILE;
    overlay.appendChild(video);

    const shade = document.createElement("div");
    shade.id = "ending-shade";
    overlay.appendChild(shade);

    // 名前の一覧を組み立てる
    const credits = document.createElement("div");
    credits.id = "ending-credits";
    const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    let html = `<div class="ec-title">${esc(ENDING_TITLE)}</div>`;
    ENDING_CREDITS.forEach(block => {
        const names = (block.names || []).map(n => (typeof n === "function" ? n() : n)).filter(n => n);
        if (!names.length) return;
        html += `<div class="ec-block"><div class="ec-role">${esc(block.title)}</div>` +
                names.map(n => `<div class="ec-name">${esc(n)}</div>`).join("") + `</div>`;
    });
    html += `<div class="ec-thanks">${esc(ENDING_THANKS)}</div>`;
    credits.innerHTML = html;
    overlay.appendChild(credits);

    const endBox = document.createElement("div");
    endBox.id = "ending-end";
    endBox.innerHTML = '<div class="ee-main">THE END</div><div class="ee-hint">▼ タップして、拠点へ戻る</div>';
    overlay.appendChild(endBox);

    const skip = document.createElement("button");
    skip.id = "ending-skip";
    skip.type = "button";
    skip.innerText = "スキップ ⏭";
    overlay.appendChild(skip);

    container.appendChild(overlay);
    setBgmScene("ending");                            // 曲は、雨の音

    let closed = false;
    let finished = false;
    let anim = null;
    const close = (runCallback) => {
        if (closed) return;
        closed = true;
        endingOpen = false;
        endingCloseNow = null;
        if (anim) { try { anim.cancel(); } catch (e) {} }
        try { video.pause(); } catch (e) {}
        overlay.remove();
        if (runCallback) done();
    };
    endingCloseNow = () => close(false);              // 退出などのときは、あとの処理はせずに閉じるだけ

    const showEnd = () => {
        if (finished || closed) return;
        finished = true;
        credits.style.visibility = "hidden";
        endBox.classList.add("show");
        skip.style.display = "none";
    };

    // 画面の下から上へ、名前をゆっくり流す(全部が見えなくなったら終わり)
    const startRoll = () => {
        const from = overlay.clientHeight;
        const to = -credits.offsetHeight - 20;
        const duration = Math.max(8000, ((from - to) / ENDING_SCROLL_PX_PER_SEC) * 1000);
        credits.style.transform = `translateY(${from}px)`;
        if (credits.animate) {
            anim = credits.animate(
                [{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }],
                { duration, easing: "linear", fill: "forwards" }
            );
            anim.onfinish = showEnd;
        } else {
            setTimeout(showEnd, duration);            // 古いブラウザ: 流さずに、名前を見せてから終わる
            credits.style.transform = "none";
        }
    };

    overlay.addEventListener("click", ev => {
        if (ev.target === skip) return;
        if (finished) close(true);                    // 流れている途中のタップは無視(うっかり飛ばさない)
    });
    skip.addEventListener("click", ev => { ev.stopPropagation(); close(true); });

    requestAnimationFrame(() => {
        startRoll();
        const pr = video.play();
        if (pr && pr.catch) pr.catch(() => {});       // 自動再生が許可されなくても、背景色で続ける
    });
}

// ==========================================
// ⚔️ 昇格戦システム
// ==========================================
function startEvolutionBattle() {
    currentBattleMode = "evolution";
    showOnlyThisScreen("battle-screen");

    const lv = characterLevels[evolutionSubject].level;
    const stats = getPlayerStats(lv);

    evolutionPlayerHearts = stats.hearts;
    evolutionPlayerMaxHearts = stats.hearts;
    lastActiveHp = null;   // 前回の戦闘のHPを引き継がない

    evolutionUsedQuestionKeys = new Set();   // 昇格戦ごとに、出題済みをリセット
    evolutionWaves = buildEvolutionWaves(lv, stats);
    evolutionWaveIndex = 0;
    loadEvolutionEnemy();

    setupSkillBar(stats);

    updateEvolutionUI();
    setBattleCharacterDisplay(evolutionSubject);
    generateEvolutionQuestion();
    startTimer();
}

function updateEvolutionUI() {
    const bossHpEl = document.getElementById("boss-hp");
    if (bossHpEl) bossHpEl.innerText = evolutionBossHp;

    // 味方パーティ・スロット0(実際に戦っているキャラ)のHPバーを更新
    updateActivePartyHpBar(evolutionPlayerHearts, evolutionPlayerMaxHearts);

    // ボスHPバー
    const bossBarEl = document.getElementById("boss-hp-bar");
    if (bossBarEl) bossBarEl.style.width = `${(evolutionBossHp / evolutionBossMaxHp) * 100}%`;
}

function generateEvolutionQuestion() {
    evolutionQuestion = pickFreshQuestion(
        generateRandomRaidQuestion, evolutionUsedQuestionKeys, evolutionSubject
    ) || generateRandomRaidQuestion();
    evolutionUsedQuestionKeys.add(questionKey(evolutionQuestion));
    rememberRecentQuestion(evolutionQuestion);

    const qEl = document.getElementById("battle-question-text");
    if (qEl) qEl.innerText = evolutionQuestion.question;

    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById("choice" + i);
        if (btn) {
            btn.innerText = evolutionQuestion.choices[i];
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.background = "#333";
            btn.style.borderColor = "#666";
        }
    }
}

// 教科(evolutionSubjectなど)に応じた画像ファイル名を組み立てる。アートが無い教科は自動的に絵文字表示にフォールバックする
// ※ハブ画面・試練画面用の「イラスト」に使用する
function getCharImgFile(subject, mood) {
    const meta = subjectMeta[subject];
    return meta ? `${meta.imgBase}_${mood}.png` : `yuzuki_${mood}.png`;
}

// バトル画面専用の「ドット絵」ファイル名を組み立てる(例: algebra_battle_normal.png)
// ドット絵がまだ無いキャラは自動的にイラスト版(getCharImgFile)にフォールバックする
// ==========================================
// ⚡ 攻撃ポーズ: 正解したとき、戦っているキャラが「攻撃の絵」に切り替わる
//   画像は index.html と同じ場所に「キャラ接頭辞_cutin.webp」の名前で置く(例: yamato_cutin.webp)
//   画像が無いキャラは、何も切り替わらないだけで、ゲームは普通に進む
// ==========================================
const ATTACK_POSE_ENABLED = true;    // false にすると、攻撃ポーズへの切り替えをしない
const ATTACK_POSE_MS = 1100;         // CSS の attack-pose / idle-away のアニメ時間と合わせる
const ENEMY_HIT_DELAY_MS = 450;      // 攻撃ポーズの開始から、敵が揺れるまでの時間
let attackPoseTimer = null;

function getAttackArtFile(subject) {
    const meta = subjectMeta[subject];
    return meta ? `${meta.imgBase}_cutin.webp` : null;
}

// バトル開始時に先読みして、初回の切り替えで遅れないようにする
function preloadAttackArt(subject) {
    const file = getAttackArtFile(subject);
    if (file) { const im = new Image(); im.src = file; }
}

// index.html が古いままでも動くように、攻撃ポーズに必要な要素が無ければ自分で作る(保険)
function ensureAttackPoseElements() {
    for (let i = 0; i < 4; i++) {
        const w = document.getElementById(`party-slot-${i}-wrap`);
        if (w && !document.getElementById(`party-slot-${i}-attackart`)) {
            const a = document.createElement("img");
            a.id = `party-slot-${i}-attackart`;
            a.className = "party-attack-art";
            a.alt = "";
            w.appendChild(a);
        }
    }
    const field = document.getElementById("battlefield");
    if (field && !document.getElementById("attack-dim")) {
        const dim = document.createElement("div");
        dim.id = "attack-dim";
        dim.setAttribute("aria-hidden", "true");
        field.appendChild(dim);
    }
}

// URLの末尾に ?debug=1 を付けて開くと、正解したときに診断が画面に出る(切り替わらない原因の特定用)
const ATTACK_DEBUG = /[?&]debug=1/.test(location.search);
function showAttackDebug(lines) {
    let el = document.getElementById("attack-debug");
    if (!el) {
        el = document.createElement("div");
        el.id = "attack-debug";
        el.style.cssText = "position:fixed;left:6px;right:6px;top:60px;z-index:9999;background:rgba(0,0,0,0.88);color:#0f0;font:12px/1.6 monospace;padding:8px 10px;border-radius:8px;white-space:pre-wrap;pointer-events:none;";
        document.body.appendChild(el);
    }
    el.textContent = lines.join("\n");
    if (el._t) clearTimeout(el._t);
    el._t = setTimeout(() => el.remove(), 7000);
}

function playAttackPose(subject) {
    if (!ATTACK_POSE_ENABLED) return;
    ensureAttackPoseElements();
    let slotIdx = battlePartySlots.indexOf(subject);   // 攻撃するキャラが、左の何番目に立っているか
    if (slotIdx < 0) slotIdx = 0;
    for (let i = 0; i < 4; i++) {                        // 前の攻撃ポーズが残っていれば、先に戻す
        const w = document.getElementById(`party-slot-${i}-wrap`);
        if (w && i !== slotIdx) w.classList.remove("attacking");
    }
    const wrap = document.getElementById(`party-slot-${slotIdx}-wrap`);
    const art = document.getElementById(`party-slot-${slotIdx}-attackart`);
    const dim = document.getElementById("attack-dim");
    const file = getAttackArtFile(subject);

    if (ATTACK_DEBUG) {
        const cssOk = art ? getComputedStyle(art).position === "absolute" : false;
        const lines = [
            `app.js    : ${APP_BUILD}`,
            `HTML要素  : ${wrap && art && dim ? "OK" : "NG (index.html が古い)"}`,
            `CSS       : ${cssOk ? "OK" : "NG (style.css が古い)"}`,
            `画像      : ${file} 確認中...`,
            `攻撃回数  : ${Object.keys(attackTally).map(k => `${subjectMeta[k] ? subjectMeta[k].name : k} ${attackTally[k]}`).join(" / ")}`
        ];
        showAttackDebug(lines);
        if (file) {
            const probe = new Image();
            probe.onload = () => { lines[3] = `画像      : ${file} OK`; showAttackDebug(lines); };
            probe.onerror = () => { lines[3] = `画像      : ${file} NG (ファイルが無い)`; showAttackDebug(lines); };
            probe.src = file;
        }
    }
    if (!wrap || !art || !file) return;

    const finish = () => {
        wrap.classList.remove("attacking");
        if (dim) dim.classList.remove("on");
    };
    art.onerror = finish;                      // 画像が無い・読めないときは、いつもの姿のまま
    wrap.classList.remove("attacking");
    void wrap.offsetWidth;                     // アニメーションを最初から再生し直す
    art.src = file;
    wrap.classList.add("attacking");
    if (dim) dim.classList.add("on");

    if (attackPoseTimer) clearTimeout(attackPoseTimer);
    attackPoseTimer = setTimeout(finish, ATTACK_POSE_MS + 60);

    // 技が当たるタイミングで、敵を揺らす
    const enemyWrap = document.getElementById("boss-img-wrap");
    if (enemyWrap) {
        setTimeout(() => {
            enemyWrap.classList.remove("enemy-hit");
            void enemyWrap.offsetWidth;
            enemyWrap.classList.add("enemy-hit");
        }, ENEMY_HIT_DELAY_MS);
    }
}

function getBattleSpriteFile(subject, mood) {
    const meta = subjectMeta[subject];
    return meta ? `${meta.imgBase}_battle_${mood}.png` : `yuzuki_battle_${mood}.png`;
}

// 昇格戦・レイド戦の画面に、そのキャラの画像と名前を反映する
function setBattleCharacterDisplay(subject) {
    const meta = subjectMeta[subject];
    const nameEl = document.getElementById("battle-player-name");
    if (nameEl && meta) nameEl.innerText = meta.name;
    renderPartyDisplay(subject);
    playSpriteState(subject, "idle");
    preloadAttackArt(subject);
}

function setBattlePlayerImg(src) {
    const el = document.getElementById("battle-player-img");
    if (el) el.src = src;
    // 実際に画面に見えているのはパーティ表示のスロット0
    const slotImgEl = document.getElementById("party-slot-0-img");
    if (slotImgEl) {
        slotImgEl.src = src;
        slotImgEl.style.visibility = "visible";
        // ドット絵ファイルが見つからない場合は、通常のイラスト版に自動でフォールバックする
        slotImgEl.onerror = function () {
            this.onerror = null;
            const fallbackSubject = Object.keys(subjectMeta).find(s => src.startsWith(subjectMeta[s].imgBase + "_battle_"));
            this.src = fallbackSubject ? getCharImgFile(fallbackSubject, "normal") : "";
        };
    }
}

// --- 🎞️ ドット絵アニメーション設定 ---
// 画像が届いたらここのframes(コマ数)とfps(1秒あたりのコマ数)を書き換えるだけでOK。
// frames:1 のままなら「まだアニメ絵が無い」とみなし、自動で今までの静止画表示にフォールバックする。
const spriteAnimConfig = {
    // 例: "国語": { idle: { frames: 4, fps: 6 }, attack: { frames: 6, fps: 12 }, hurt: { frames: 3, fps: 10 } },
};

function getSpriteAnimSetting(subject, state) {
    const cfg = spriteAnimConfig[subject];
    if (cfg && cfg[state]) return cfg[state];
    return { frames: 1, fps: 6 };
}

// 攻撃/被弾アニメ終了後に待機へ自動で戻すためのタイマーID
let activeSpriteTimeoutId = null;

// subjectの「state」(idle / attack / hurt)アニメーションをパーティスロット0に再生する。
// スプライトシートがまだ無ければ、自動的に今までの静止画(normal/simile/shock)にフォールバックする。
function playSpriteState(subject, state, onDone) {
    const imgEl = document.getElementById("party-slot-0-img");
    const spriteEl = document.getElementById("party-slot-0-sprite");
    if (!imgEl || !spriteEl) return;

    const { frames, fps } = getSpriteAnimSetting(subject, state);
    const meta = subjectMeta[subject];
    const sheetFile = meta ? `${meta.imgBase}_battle_${state}.png` : `yuzuki_battle_${state}.png`;

    if (frames <= 1) {
        // アニメ未設定 → 今まで通りの静止画にフォールバック
        spriteEl.style.display = "none";
        imgEl.style.display = "block";
        const staticMood = state === "attack" ? "simile" : (state === "hurt" ? "shock" : "normal");
        setBattlePlayerImg(getBattleSpriteFile(subject, staticMood));
        if (onDone) onDone();
        return;
    }

    // スプライトシートが実在するか確認してから切り替える(無ければ静止画にフォールバック)
    const testImg = new Image();
    testImg.onload = function () {
        imgEl.style.display = "none";
        spriteEl.style.display = "block";
        spriteEl.style.backgroundImage = `url("${sheetFile}")`;
        spriteEl.style.setProperty("--frames", frames);
        spriteEl.style.setProperty("--anim-duration", `${frames / fps}s`);

        spriteEl.classList.remove("sprite-anim", "sprite-once");
        void spriteEl.offsetWidth; // アニメーションを最初から再生し直すためのリフロー
        spriteEl.classList.add("sprite-anim");

        if (state === "attack" || state === "hurt") {
            spriteEl.classList.add("sprite-once");
            if (activeSpriteTimeoutId) clearTimeout(activeSpriteTimeoutId);
            activeSpriteTimeoutId = setTimeout(() => {
                playSpriteState(subject, "idle");
                if (onDone) onDone();
            }, (frames / fps) * 1000);
        } else if (onDone) {
            onDone();
        }
    };
    testImg.onerror = function () {
        spriteEl.style.display = "none";
        imgEl.style.display = "block";
        const staticMood = state === "attack" ? "simile" : (state === "hurt" ? "shock" : "normal");
        setBattlePlayerImg(getBattleSpriteFile(subject, staticMood));
        if (onDone) onDone();
    };
    testImg.src = sheetFile;
}

function handleEvolutionAnswer(selectedIndex) {
    stopTimer();

    const lv = characterLevels[evolutionSubject].level;
    const stats = getPlayerStats(lv);

    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById("choice" + i);
        if (btn) btn.disabled = true;
    }

    if (selectedIndex === evolutionQuestion.answer) {
        // 正解 → 笑顔
        const attacker = pickAttacker(evolutionSubject);          // 出撃している味方の中から、ランダムで1体が攻撃する
        const dmg = takeSkillDamage(attackPowerOf(attacker, stats));   // 攻撃したキャラ自身の強さ + スキル(powerup)の倍率
        evolutionBossHp = Math.max(0, evolutionBossHp - dmg);
        const tickNote = endQuestionTick();                       // 毒のダメージ・継続効果を1問ぶん進める
        tickSkillCooldowns();                                     // スキルのクールタイムを、正解1回ぶん進める
        flashScreen("correct");
        showBattleMessage(`✅ 正解！ ${subjectMeta[attacker].name}の攻撃！ ${getRandomAttackLine(attacker)} ${dmg} ダメージ！${tickNote}`);
        if (attacker === evolutionSubject) playSpriteState(evolutionSubject, "attack");   // ドット絵の切り替えは、先頭のキャラのときだけ
        playAttackPose(attacker);

        const correctBtn = document.getElementById("choice" + selectedIndex);
        if (correctBtn) { correctBtn.style.background = "#004400"; correctBtn.style.borderColor = "#00ff00"; }
    } else {
        // 不正解 → ショック
        const m = computeMistake();                   // 行動阻害・全体防御・反射・切り傷などの効果を反映
        evolutionPlayerHearts -= m.lost;
        if (m.reflectDmg) evolutionBossHp = Math.max(0, evolutionBossHp - m.reflectDmg);   // 反射: 受けるはずのダメージをボスへ
        const tickNote = endQuestionTick();
        flashScreen("wrong");
        showBattleMessage(mistakeText("wrong", m) + tickNote);
        if (m.lost > 0) playSpriteState(evolutionSubject, "hurt");

        const wrongBtn = document.getElementById("choice" + selectedIndex);
        if (wrongBtn) { wrongBtn.style.background = "#440000"; wrongBtn.style.borderColor = "#ff0000"; }
        const correctBtn = document.getElementById("choice" + evolutionQuestion.answer);
        if (correctBtn) { correctBtn.style.background = "#004400"; correctBtn.style.borderColor = "#00ff00"; }
    }

    updateEvolutionUI();

    setTimeout(evolutionAfterTurn, 1500);
}

// 1問(または時間切れ)のあとの流れ: 次の敵へ / 昇格成功 / 敗北 / 次の問題
function evolutionAfterTurn() {
    if (evolutionBossHp <= 0 && evolutionWaveIndex < evolutionWaves.length - 1) {
        // 雑魚敵を撃破 → 次の敵へ(雑魚ならハート1回復)
        const defeated = evolutionWaves[evolutionWaveIndex];
        let healed = false;
        if (!defeated.boss && evolutionPlayerHearts < evolutionPlayerMaxHearts) {
            evolutionPlayerHearts = Math.min(evolutionPlayerMaxHearts, evolutionPlayerHearts + 1);
            healed = true;
        }
        evolutionWaveIndex++;
        loadEvolutionEnemy(healed);
        playSpriteState(evolutionSubject, "idle");
        generateEvolutionQuestion();
        startTimer();
    } else if (evolutionBossHp <= 0) {
        // 勝利
        characterLevels[evolutionSubject].level++;
        saveGame();
        alert(`🎉 昇格成功！おめでとう、${playerCallName()}！\nLv.${characterLevels[evolutionSubject].level} になりました！`);
        backToHub();
    } else if (evolutionPlayerHearts <= 0) {
        // 敗北
        alert("💀 敗北...\nハートがなくなりました。また挑戦してください！");
        backToHub();
    } else {
        playSpriteState(evolutionSubject, "idle");
        generateEvolutionQuestion();
        startTimer();
    }
}

// ==========================================
// ⏱️ タイマーシステム
// ==========================================
function startTimer() {
    stopTimer();
    timeLeft = TIMER_MAX;
    updateTimerUI();

    timer = setInterval(() => {
        if (timeStopActive) return;
        timeLeft--;
        updateTimerUI();
        if (timeLeft <= 0) {
            stopTimer();
            onTimeUp();
        }
    }, 1000);
}

function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
}

const TIMER_MAX = 15;   // 1問の制限時間(秒)。startTimer の初期値と合わせる

function updateTimerUI() {
    const timerEl = document.getElementById("battle-timer");
    const barEl = document.getElementById("battle-timer-bar");
    if (!timerEl) return;
    timerEl.innerText = timeStopActive ? "⏸ 時間停止中" : `⏱ ${timeLeft}`;
    if (barEl) {
        barEl.style.width = `${Math.max(0, Math.min(100, (timeLeft / TIMER_MAX) * 100))}%`;
        barEl.style.background = timeStopActive ? "#33ccff" : (timeLeft <= 5 ? "#ff4444" : "#ffcc00");
    }
}

function onTimeUp() {
    // 時間切れ → ハート1個減
    if (currentBattleMode === "evolution") {
        const m = computeMistake();                   // 行動阻害・全体防御・反射・切り傷などの効果を反映
        evolutionPlayerHearts -= m.lost;
        if (m.reflectDmg) evolutionBossHp = Math.max(0, evolutionBossHp - m.reflectDmg);
        const tickNote = endQuestionTick();
        flashScreen("wrong");
        showBattleMessage(mistakeText("timeup", m) + tickNote);
        if (m.lost > 0) playSpriteState(evolutionSubject, "hurt");

        updateEvolutionUI();

        setTimeout(evolutionAfterTurn, 1500);
    } else if (currentBattleMode === "raid") {
        if (raidStage === "loss") {                  // 負けイベ中の時間切れも、1体倒される
            if (raidAlive.length > raidAliveTarget()) raidLossBlow("timeup");
            return;
        }
        if (raidStage !== "normal") return;          // 覚醒中は、時間切れにならない
        const m = computeMistake();                   // 行動阻害・全体防御・反射・切り傷などの効果を反映
        raidPlayerHearts -= m.lost;
        if (m.reflectDmg) applyBossDamage(m.reflectDmg);
        const tickNote = endQuestionTick();
        flashScreen("wrong");
        showBattleMessage(mistakeText("timeup", m) + tickNote);
        if (m.lost > 0) playSpriteState(raidFighter, "hurt");

        for (let i = 0; i < 4; i++) {
            const btn = document.getElementById("choice" + i);
            if (btn) btn.disabled = true;
        }
        const correctBtn = document.getElementById("choice" + raidQuestion.answer);
        if (correctBtn) { correctBtn.style.background = "#004400"; correctBtn.style.borderColor = "#00ff00"; }

        updateRaidHeartsUI();

        setTimeout(() => {
            if (!raidActive) return;
            if (raidPlayerHearts <= 0) {
                alert("💀 あなたは力尽きた…\n他の仲間の活躍を見守ろう！拠点に戻ります。");
                endBattle();
            } else if (raidStage === "normal") {     // 第二形態の演出に入っていたら、次の問題は出さない
                playSpriteState(raidFighter, "idle");
                generateRaidQuestion();
                startTimer();
            }
        }, 1500);
    }
}

// ==========================================
// 🎨 演出ヘルパー
// ==========================================
function flashScreen(type) {
    const container = document.getElementById("game-container");
    if (!container) return;
    container.style.boxShadow = type === "correct"
        ? "0 0 30px 10px rgba(0,255,100,0.6)"
        : "0 0 30px 10px rgba(255,0,0,0.6)";
    setTimeout(() => { container.style.boxShadow = "0 0 20px rgba(0,0,0,0.8)"; }, 400);
}

function showBattleMessage(msg) {
    const el = document.getElementById("battle-message");
    if (!el) return;
    el.innerText = msg;
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0"; }, 1200);
}

// ==========================================
// 🔀 その他
// ==========================================
function selectChoice(i) {
    if (currentBattleMode === "evolution") {
        handleEvolutionAnswer(i);
        return;
    }
    if (currentBattleMode === "raid") {
        handleRaidAnswer(i);
        return;
    }
}

// ==========================================
// 📷 画像認識スキャン (Teachable Machine)
// ==========================================

// ⚠️ Teachable Machineで学習させた「クラス名」と「対応する教科」をここで対応付けてください。
// クラス名はTeachable Machineで自分がつけた名前と完全に一致させる必要があります。
const SCAN_CLASS_TO_SUBJECT = {
    "かえで正門": "国語",
    "さつき正門": "物理",
    "さつき校舎": "化学",
    "図書館": "歴史",
    "廣池銅像": "数学",
    "あすなろ前の像": "英語",
    "あすなろ内廣池銅像": "地理"
    // "背景" や "その他" のクラスはここに書かなければ自動的に無視されます
};

const SCAN_CONFIDENCE_THRESHOLD = 0.90; // この確信度を超えたら候補としてカウント
const SCAN_STREAK_NEEDED = 8;           // 何フレーム連続で同じ判定が出たら成功とみなすか(誤検知防止)

let tmModel = null;
let tmWebcam = null;
let tmMaxPredictions = 0;
let scanLoopId = null;
let scanStreakCount = 0;
let scanStreakSubject = null;
let scanActive = false;

async function loadTMModelIfNeeded() {
    if (tmModel) return;
    const modelURL = "./model/model.json";
    const metadataURL = "./model/metadata.json";
    tmModel = await tmImage.load(modelURL, metadataURL);
    tmMaxPredictions = tmModel.getTotalClasses();
}

const APP_BUILD = "v6-attackpose";   // 画面に表示される版番号(新しい app.js が届いたか確認用)
let scanVideo = null;
let scanCanvas = null;
let scanStream = null;
let scanFacing = "environment";  // "environment"=背面 / "user"=前面
let scanSession = 0;             // カメラ切り替え時に古いループを止めるための番号

async function startScanCamera() {
    let stream;
    try {
        // まず指定の向きを厳密に要求(iPhoneなど)
        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { exact: scanFacing } }
        });
    } catch (e) {
        // その向きのカメラが無い端末(PCなど)では、使えるカメラにフォールバック
        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: scanFacing } }
        });
    }
    scanStream = stream;

    scanVideo = document.createElement("video");
    scanVideo.setAttribute("playsinline", "");        // iPhone Safariで全画面化されないために必須
    scanVideo.setAttribute("webkit-playsinline", "");
    scanVideo.muted = true;
    scanVideo.srcObject = stream;
    await scanVideo.play();

    scanCanvas = document.createElement("canvas");
    scanCanvas.width = 300;
    scanCanvas.height = 300;
    scanCanvas.style.width = "100%";
    scanCanvas.style.height = "100%";
}

// 映像の中央を正方形に切り出して scanCanvas に描く(Teachable Machineの学習時と同じ見え方)
function drawScanFrame() {
    const v = scanVideo;
    if (!v || !v.videoWidth || !scanCanvas) return false;
    const size = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - size) / 2;
    const sy = (v.videoHeight - size) / 2;
    scanCanvas.getContext("2d").drawImage(v, sx, sy, size, size, 0, 0, 300, 300);
    return true;
}

function ensureScanExtras() {
    if (document.getElementById("scan-switch-btn")) return;
    const statusBox = document.getElementById("scan-status-box");
    if (!statusBox) return;
    const btn = document.createElement("button");
    btn.id = "scan-switch-btn";
    btn.innerText = "🔄 カメラを切り替える";
    btn.style.cssText = "width:100%;max-width:300px;padding:10px;background:#0072ff;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:bold;cursor:pointer;margin-bottom:6px;";
    btn.onclick = switchScanCamera;
    const info = document.createElement("div");
    info.id = "scan-info-text";
    info.style.cssText = "font-size:11px;color:#888;margin-bottom:8px;";
    statusBox.insertAdjacentElement("afterend", btn);
    btn.insertAdjacentElement("afterend", info);
}

function updateScanInfo() {
    const el = document.getElementById("scan-info-text");
    if (!el) return;
    let label = "不明";
    try {
        const st = scanStream.getVideoTracks()[0].getSettings();
        if (st.facingMode === "environment") label = "背面";
        else if (st.facingMode === "user") label = "前面(イン)";
    } catch (e) {}
    el.innerText = `${APP_BUILD} / 使用中: ${label}カメラ`;
}

async function switchScanCamera() {
    if (!scanVideo) return;
    scanSession++;
    scanActive = false;
    if (scanLoopId) { cancelAnimationFrame(scanLoopId); scanLoopId = null; }
    if (scanStream) {
        try { scanStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        scanStream = null;
    }
    scanFacing = (scanFacing === "environment") ? "user" : "environment";
    const statusEl = document.getElementById("scan-status-text");
    try {
        await startScanCamera();
        const container = document.getElementById("webcam-container");
        if (container && scanCanvas) { container.innerHTML = ""; container.appendChild(scanCanvas); }
        scanStreakCount = 0;
        scanStreakSubject = null;
        scanActive = true;
        updateScanInfo();
        scanLoopId = window.requestAnimationFrame(cameraScanLoop);
    } catch (err) {
        console.error(err);
        if (statusEl) statusEl.innerText = "⚠️ カメラを切り替えられませんでした。";
    }
}

async function openCameraScreen() {
    showOnlyThisScreen("camera-screen");
    scanSession++;
    scanFacing = "environment";
    ensureScanExtras();
    const statusEl = document.getElementById("scan-status-text");
    const placeholderEl = document.getElementById("camera-placeholder");
    if (statusEl) statusEl.innerText = "モデルを読み込んでいます...";

    try {
        await loadTMModelIfNeeded();
    } catch (modelErr) {
        console.error("モデル読み込みエラー:", modelErr);
        if (statusEl) statusEl.innerText = "⚠️ 認識モデルを読み込めませんでした。model フォルダ内のファイルを確認してください。";
        return;
    }

    try {
        if (statusEl) statusEl.innerText = "カメラを起動しています...";
        await startScanCamera();

        if (placeholderEl) placeholderEl.remove();
        const container = document.getElementById("webcam-container");
        if (container && scanCanvas) container.appendChild(scanCanvas);

        scanActive = true;
        scanStreakCount = 0;
        scanStreakSubject = null;
        updateScanInfo();
        if (statusEl) statusEl.innerText = "対象物を画面に収めてください";

        scanLoopId = window.requestAnimationFrame(cameraScanLoop);
    } catch (err) {
        console.error(err);
        stopCameraScan();
        if (statusEl) {
            statusEl.innerText = (err && err.name === "NotAllowedError")
                ? "⚠️ カメラの使用が許可されていません。設定でSafariのカメラを許可してください。"
                : "⚠️ カメラを起動できませんでした。";
        }
    }
}

async function cameraScanLoop() {
    if (!scanActive || !scanVideo || !tmModel) return;
    const sid = scanSession;

    if (!drawScanFrame()) {
        scanLoopId = window.requestAnimationFrame(cameraScanLoop);
        return;
    }
    const predictions = await tmModel.predict(scanCanvas);
    if (!scanActive || sid !== scanSession) return; // 判定中に画面を閉じた/カメラを切り替えた場合

    // 一番確信度の高いクラスを探す
    let top = predictions[0];
    for (let i = 1; i < predictions.length; i++) {
        if (predictions[i].probability > top.probability) top = predictions[i];
    }

    const statusEl = document.getElementById("scan-status-text");
    const barEl = document.getElementById("scan-progress-bar");
    const matchedSubject = SCAN_CLASS_TO_SUBJECT[top.className];

    if (matchedSubject && top.probability >= SCAN_CONFIDENCE_THRESHOLD) {
        if (scanStreakSubject === matchedSubject) {
            scanStreakCount++;
        } else {
            scanStreakSubject = matchedSubject;
            scanStreakCount = 1;
        }
        if (statusEl) statusEl.innerText = `🔍 「${top.className}」を検出中… (${Math.round(top.probability * 100)}%)`;
        if (barEl) barEl.style.width = `${Math.min(100, (scanStreakCount / SCAN_STREAK_NEEDED) * 100)}%`;

        if (scanStreakCount >= SCAN_STREAK_NEEDED) {
            onScanSuccess(matchedSubject, top.className);
            return;
        }
    } else {
        scanStreakSubject = null;
        scanStreakCount = 0;
        if (statusEl) statusEl.innerText = "対象物を画面に収めてください";
        if (barEl) barEl.style.width = "0%";
    }

    scanLoopId = window.requestAnimationFrame(cameraScanLoop);
}

function onScanSuccess(subject, className) {
    scanActive = false;
    stopCameraScan();

    const meta = subjectMeta[subject];
    alert(`📷 「${className}」を発見！\n${meta ? meta.name : subject}の「獲得試練」に挑戦しよう！`);

    showOnlyThisScreen("hub-screen");
    checkLevelUp(subject, true);                // スキャンで見つけたので、試練の扉が開く
}

function stopCameraScan() {
    scanActive = false;
    scanSession++;
    if (scanLoopId) { cancelAnimationFrame(scanLoopId); scanLoopId = null; }
    if (scanStream) {
        try { scanStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        scanStream = null;
    }
    scanVideo = null;
    scanCanvas = null;
    const container = document.getElementById("webcam-container");
    if (container) container.innerHTML = '<div id="camera-placeholder" style="color:#555; font-size:13px;">カメラを起動しています...</div>';
}

function closeCameraScreen() {
    stopCameraScan();
    showOnlyThisScreen("hub-screen");
    updateHubUI();
}

function backToHub() {
    closeMangaViewer();                  // 漫画を開いたまま拠点へ戻る場合は、漫画を閉じる
    stopTimer();
    timeStopActive = false;
    detachRaidListeners();
    showOnlyThisScreen("hub-screen");
    updateHubUI();
}

// ==========================================
// 🔥 オンラインレイド：ロビー
// ==========================================
function getOrCreatePlayerId() {
    let id = safeStorageGet("raidPlayerId");
    if (!id) {
        id = "p_" + Math.random().toString(36).slice(2, 10);
        safeStorageSet("raidPlayerId", id);
    }
    return id;
}

function getOrCreatePlayerName() {
    const chosen = getPlayerName();      // 主人公の名前があれば、それをレイドでも使う
    if (chosen) return chosen;
    let name = safeStorageGet("raidPlayerName");
    if (!name) {
        const adjectives = ["勇敢な", "ねむい", "元気な", "謎の", "伝説の", "ふらふらな"];
        const nouns = ["冒険者", "先輩", "生徒", "旅人", "戦士"];
        name = adjectives[Math.floor(Math.random() * adjectives.length)]
             + nouns[Math.floor(Math.random() * nouns.length)]
             + Math.floor(Math.random() * 900 + 100);
        safeStorageSet("raidPlayerName", name);
    }
    return name;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.innerText = str;
    return div.innerHTML;
}

function raidResetData() {
    return { status: "waiting", bossHp: RAID_DEFAULT_HP, maxBossHp: RAID_DEFAULT_HP };
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
}

// ロビー入室前に raid の状態を点検し、古い状態(前回の残骸)なら初期化する
async function ensureRaidReady() {
    const snap = await withTimeout(db.ref("raid").once("value"), 8000);
    const raid = snap.val() || {};
    const others = Object.keys(raid.players || {}).filter(id => id !== raidPlayerId);
    const stale = !raid.status ||
        (raid.status === "battling" && (others.length === 0 || !(raid.bossHp > 0)));
    if (stale) await db.ref("raid").update(raidResetData());
}

function registerRaidPlayer() {
    const ref = db.ref(`raid/players/${raidPlayerId}`);
    ref.onDisconnect().remove();
    ref.set({ name: raidPlayerName, joinedAt: Date.now() });
}

async function goToLobby() {
    raidPlayerId = getOrCreatePlayerId();
    raidPlayerName = getOrCreatePlayerName();
    showOnlyThisScreen("lobby-screen");
    const statusEl = document.getElementById("lobby-status-text");
    if (statusEl) statusEl.innerText = "サーバーに接続中...";

    const myToken = ++lobbyEnterToken;
    try {
        await ensureRaidReady();
    } catch (e) {
        console.error("レイド接続エラー:", e);
        if (myToken === lobbyEnterToken) {
            const reason = (e && (e.code || e.message)) ? (e.code || e.message) : "不明";
            alert("オンラインに接続できませんでした。\n(原因: " + reason + ")\nWi-Fiを確認して、もう一度試してください。");
            backToHub();
        }
        return;
    }
    if (myToken !== lobbyEnterToken) return; // 接続待ち中に抜けた

    raidActive = true;
    raidInLobby = true;
    registerRaidPlayer();

    // 通信が一時的に切れて復帰したとき、自分を参加者に登録し直す
    db.ref(".info/connected").on("value", snap => {
        if (!raidActive) return;
        if (snap.val() === true) {
            registerRaidPlayer();
            if (raidInLobby) updateLobbyUI(lastLobbyPlayers);
        } else if (raidInLobby && statusEl) {
            statusEl.innerText = "⚠ 接続が切れました。再接続中...";
        }
    });

    if (!raidPlayersListenerAttached) {
        db.ref("raid/players").on("value", snap => {
            lastLobbyPlayers = snap.val() || {};
            if (raidInLobby) updateLobbyUI(lastLobbyPlayers);
        });
        raidPlayersListenerAttached = true;
    }

    if (!raidStatusListenerAttached) {
        db.ref("raid/status").on("value", snap => {
            if (raidInLobby && snap.val() === "battling") enterRaidBattle();
        });
        raidStatusListenerAttached = true;
    }
}

function updateLobbyUI(players) {
    const count = Object.keys(players).length;
    const countEl = document.getElementById("current-player-count");
    if (countEl) countEl.innerText = count;

    const statusEl = document.getElementById("lobby-status-text");
    if (statusEl) statusEl.innerText = `${count}人が集合中... 準備ができたら出撃しよう！`;

    const grid = document.getElementById("lobby-member-grid");
    if (grid) {
        grid.innerHTML = Object.values(players).map(p =>
            `<div style="display:inline-block; margin:4px; padding:6px 10px; background:rgba(0,255,204,0.1); border:1px solid #00ffcc; border-radius:8px; font-size:12px;">🧑‍🎓 ${escapeHtml(p.name)}</div>`
        ).join("");
    }
}

function removeSelfFromRaidPlayers() {
    if (!raidPlayerId) return;
    const ref = db.ref(`raid/players/${raidPlayerId}`);
    ref.onDisconnect().cancel();
    ref.remove().then(resetRaidIfEmpty).catch(e => console.error(e));
}

// 最後の1人が抜けたのに戦闘中のまま残らないよう、誰もいなければ初期化する
function resetRaidIfEmpty() {
    return db.ref("raid").once("value").then(snap => {
        const raid = snap.val() || {};
        if (raid.status === "battling" && Object.keys(raid.players || {}).length === 0) {
            return db.ref("raid").update(raidResetData());
        }
    });
}

function detachRaidListeners() {
    db.ref("raid/bossHp").off();
    db.ref("raid/players").off();
    db.ref("raid/status").off();
    db.ref(".info/connected").off();
    raidBossHpListenerAttached = false;
    raidPlayersListenerAttached = false;
    raidStatusListenerAttached = false;
    raidActive = false;
    raidInLobby = false;
    raidEventToken++;                                // 予約済みの第二形態イベントを無効にする
    raidStage = "normal";
    clearRaidEventClasses();
}

function leaveLobby() {
    lobbyEnterToken++;
    removeSelfFromRaidPlayers();
    backToHub();
}

function forceStartRaid() {
    // status だけを原子的に切り替える(同時に押されても1回だけ開始)
    db.ref("raid/status").transaction(cur => (cur === "battling" ? undefined : "battling"));
}

// ==========================================
// 🔥 オンラインレイド：バトル本体
// ==========================================
let raidFighter = "国語";   // レイドで実際に戦うキャラ(enterRaidBattle で決まる)

// パーティの先頭(解放済み) → 解放済みの誰か → 誰もいなければ結月(Lv1相当)の順で選ぶ
function getRaidFighter() {
    const unlocked = sub => characterLevels[sub] && characterLevels[sub].level > 0;
    const fromParty = playerParty.find(unlocked);
    if (fromParty) return fromParty;
    const anyone = Object.keys(subjectMeta).find(unlocked);
    return anyone || "国語";
}

function enterRaidBattle() {
    raidFighter = getRaidFighter();
    currentBattleMode = "raid";
    raidInLobby = false;
    showOnlyThisScreen("battle-screen");

    const lv = Math.max(1, characterLevels[raidFighter].level);
    const stats = getPlayerStats(lv);
    raidPlayerHearts = stats.hearts;
    raidPlayerMaxHearts = stats.hearts;
    lastActiveHp = null;   // 前回の戦闘のHPを引き継がない

    raidPhase = 1;
    raidPhaseChecked = false;
    raidStage = "normal";
    raidSurvivor = null;
    raidAwakenedSubjects = [];
    raidAwakenedKey = null;
    raidEventToken++;                                // 前回の予約済みの演出を無効にする
    raidDeployed = [raidFighter, ...playerParty.filter(sub => sub !== raidFighter)].slice(0, 4);   // 画面の左に並ぶ出撃キャラ
    setRaidBossForm(1, false);                       // 第一形態の姿・名前から始める
    const preloadP2 = new Image(); preloadP2.src = RAID_BOSS_IMG_P2;   // 変身の瞬間に遅れないよう先読み
    const p2Audio = bgmGetAudio("raid2");            // 第二形態の曲も先に読み込み始める(覚醒の瞬間に無音にならないように)
    if (p2Audio) { try { p2Audio.load(); } catch (e) {} }

    setupSkillBar(stats);

    updateRaidHeartsUI();
    setBattleCharacterDisplay(raidFighter);

    if (!raidBossHpListenerAttached) {
        db.ref("raid/bossHp").on("value", snap => {
            const hp = snap.val();
            if (hp == null) return;
            updateRaidBossUI(hp);
            if (hp <= 0) onRaidVictory();
        });
        db.ref("raid/maxBossHp").once("value", snap => {
            window.__raidMaxBossHp = snap.val() || 100000;
        });
        raidBossHpListenerAttached = true;
    }

    generateRaidQuestion();
    startTimer();
}

function updateRaidHeartsUI() {
    updateActivePartyHpBar(raidPlayerHearts, raidPlayerMaxHearts);
}

// ==========================================
// 👹 レイドボスの第二形態
//   ボスのHPが一定の割合以下になると、全員の画面で第二形態に変身する(HPは全員で共通なので、みんな同じタイミング)
//   画像は index.html と同じ場所に置く(第二形態: raid-boss2.webp)
// ==========================================
const RAID_PHASE2_RATIO = 0.5;                       // HPが何割以下で変身するか(0.5 = 半分)
const RAID_BOSS_IMG_P1 = "raid-boss.png";
const RAID_BOSS_IMG_P2 = "raid-boss2.webp";
const RAID_BOSS_NAME_P1 = "共闘レイドボス";
const RAID_BOSS_NAME_P2 = "共闘レイドボス【第二形態】";
let raidPhase = 1;
let raidPhaseChecked = false;                        // 入室後、最初のHP更新かどうか

// 変身の演出に使う全画面フラッシュ(無ければ作る)
function ensurePhaseFlash() {
    let el = document.getElementById("phase-flash");
    if (!el) {
        const field = document.getElementById("battlefield");
        if (!field) return null;
        el = document.createElement("div");
        el.id = "phase-flash";
        el.setAttribute("aria-hidden", "true");
        field.appendChild(el);
    }
    return el;
}

// phase: 1 or 2 / withEffect: true なら変身の演出つき
function setRaidBossForm(phase, withEffect) {
    const field = document.getElementById("battlefield");
    const nameEl = document.getElementById("boss-name");
    const img = document.getElementById("boss-img");
    const wrap = document.getElementById("boss-img-wrap");

    const apply = () => {
        if (img) { img.style.display = "block"; img.src = (phase === 2) ? RAID_BOSS_IMG_P2 : RAID_BOSS_IMG_P1; }
        if (nameEl) nameEl.innerText = (phase === 2) ? RAID_BOSS_NAME_P2 : RAID_BOSS_NAME_P1;
        if (field) field.classList.toggle("raid-phase2", phase === 2);
        if (phase === 1) setBgmScene("raid");            // 第一形態の曲。第二形態に変身しても曲は変えない(覚醒したときに raid2 へ切り替わる)
    };
    if (!withEffect) { apply(); return; }

    showBattleMessage("⚠️ ボスが第二形態に変身した！");
    const flash = ensurePhaseFlash();
    if (flash) { flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on"); }
    if (field) {
        field.classList.remove("phase-shake"); void field.offsetWidth; field.classList.add("phase-shake");
        setTimeout(() => field.classList.remove("phase-shake"), 900);
    }
    setTimeout(() => {                       // フラッシュで画面が白く光った瞬間に姿を入れ替える
        apply();
        if (wrap) { wrap.classList.remove("phase-pop"); void wrap.offsetWidth; wrap.classList.add("phase-pop"); }
    }, 280);
    setTimeout(() => { if (flash) flash.classList.remove("on"); if (wrap) wrap.classList.remove("phase-pop"); }, 1100);
}

// ==========================================
// ⚔️ 第二形態イベント: 負けイベ → 覚醒(決戦)    ※各自の画面で、自分のパーティについて起きる
//   1) 第一形態が終わって第二形態になると、そのまま問題が出続ける。ただし、正解しても不正解になる(攻撃は通じない)
//   2) 1問答える(または時間切れになる)たびに、出撃しているキャラのうち1体が、一撃で倒される(全員同じ確率)
//   3) 最後の1体になったら、そのキャラが覚醒する。以降は、どの選択肢を選んでも必ず正解になる(タイマーも止まる)
//   4) 覚醒の一撃は大ダメージ。ボスのHPが0になると、全員で勝利して終わる
//   ・出撃が1体だけのときは、倒されるキャラがいないので、すぐ覚醒する
//   ・変身したあとに入室した人は、負けイベを飛ばして、最初から覚醒した状態で始まる
//   ・負けイベ中は、スキルを使えない
// ==========================================
const RAID_AWAKEN_DAMAGE_RATIO = 0.1;    // 覚醒の一撃のダメージ = ボス最大HPのこの割合(0.1 = 1割)
const RAID_EVENT_START_DELAY_MS = 1800;  // 変身の演出が落ち着いてから、負けイベを始めるまでの待ち時間
const RAID_EVENT_STEP_MS = 1100;         // 仲間が倒されてから、次の問題が出るまでの間隔(これに 0.6 秒を足した時間)
let raidStage = "normal";                // "normal"(通常) / "loss"(負けイベ中) / "awakened"(覚醒中)
let raidEventToken = 0;                  // 退出・再入室のとき、予約済みの演出を無効にするための番号
let raidSurvivor = null;                 // 覚醒するキャラ(2体のときは先頭の1体。戦いの先頭=raidFighter になる)
let raidAwakenedSubjects = [];           // 覚醒したキャラの一覧(通常は1体。特別ルートだけ2体)
let raidAwakenedKey = null;              // 特別ルートのとき、ペアの key(漫画の名前に使う)
let raidDeployed = [];                   // 出撃しているキャラ(画面の左に並ぶ最大4体)

function raidEventLater(token, ms, fn) {
    setTimeout(() => { if (raidActive && token === raidEventToken) fn(); }, ms);
}

function lockRaidChoices(disabled) {
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById("choice" + i);
        if (btn) btn.disabled = disabled;
    }
}

// タイマー欄に、状態の表示を出す(負けイベ中・覚醒中はタイマーを使わない)
function setSpecialTimerUI(text, color) {
    const t = document.getElementById("battle-timer");
    const b = document.getElementById("battle-timer-bar");
    if (t) t.innerText = text;
    if (b) { b.style.width = "100%"; b.style.background = color; }
}

function clearRaidEventClasses() {
    for (let i = 0; i < 4; i++) {
        const el = document.getElementById(`party-slot-${i}`);
        if (el) el.classList.remove("vanished", "survivor", "awakened");
    }
}

function raidGoldFlash() {
    const flash = ensurePhaseFlash();
    if (!flash) return;
    flash.classList.add("gold");
    flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on");
    setTimeout(() => flash.classList.remove("gold"), 1200);
}

// 覚醒: 残った1体だけが画面に残り、金色に光る。ここから問題は「必ず正解」になる
function awakenRaidSurvivor(token, withScript) {
    // 負けイベを最後まで見た人は、覚醒する前に覚醒の漫画を見る(変身後に入室した人は見ない)
    if (withScript && raidActive) {
        const key = raidMangaKey();
        showAwakenManga(key, () => {
            if (raidActive && token === raidEventToken) applyRaidAwakening(token, true);   // 退出・レイド終了していたら、何もしない
        });
        return;
    }
    applyRaidAwakening(token, withScript);
}

function applyRaidAwakening(token, withScript) {
    raidStage = "awakened";
    raidFighter = raidSurvivor;
    // ゲストの登場(特別ルートではなく、ゲストを連れたキャラが1人で覚醒したとき)
    const guest = (!raidAwakenedKey && raidAwakenedSubjects.length === 1) ? RAID_GUESTS[raidFighter] : null;
    if (guest && !raidAwakenedSubjects.includes(guest)) raidAwakenedSubjects = [raidFighter, guest];
    if (raidActive) setBgmScene("raid2");            // キャラが覚醒した瞬間に、第二形態の曲へ切り替える(変身後に入室した人は、入室してすぐ)
    clearRaidEventClasses();
    setBattleCharacterDisplay(raidFighter);          // 残った1体だけを表示(raidStage が awakened なので、控えは出ない)
    refreshSkillBarForSubject();                     // スキル欄も、残った1体のものにする(覚醒中は使えない)
    for (let i = 0; i < battlePartySlots.length; i++) {      // 覚醒したキャラ全員が、金色に光る
        const el = document.getElementById(`party-slot-${i}`);
        if (el) el.classList.add("awakened");
    }

    const lv = Math.max(1, characterLevels[raidFighter].level);
    const stats = getPlayerStats(lv);
    raidPlayerHearts = stats.hearts;                 // 覚醒で全回復(覚醒中は、もう間違えない)
    raidPlayerMaxHearts = stats.hearts;
    updateRaidHeartsUI();

    setSpecialTimerUI("✨ 覚醒中 ― 必ず正解！", "#ffcc33");
    const duo = !!raidAwakenedKey;                   // 特別ルート(2人とも覚醒)
    const name = duo ? raidNamesOf(raidAwakenedSubjects) : subjectMeta[raidFighter].name;
    const guestName = guest ? subjectMeta[guest].name : "";
    if (withScript) {
        raidGoldFlash();
        showBattleMessage(duo
            ? `✨ ${name}が、二人同時に覚醒した！ どんな問題も必ず正解になる！`
            : (guest
                ? `✨ ${name}が覚醒した！ そこへ${guestName}が駆けつけた！ どんな問題も必ず正解になる！`
                : `✨ ${name}が覚醒した！ どんな問題も必ず正解になる！`));
    } else {
        showBattleMessage(duo
            ? `✨ 覚醒した${name}の二人で戦おう！ どんな問題も必ず正解になる！`
            : (guest
                ? `✨ 覚醒した${name}と、駆けつけた${guestName}で戦おう！ どんな問題も必ず正解になる！`
                : `✨ 覚醒した${name}で戦おう！ どんな問題も必ず正解になる！`));
    }
    raidEventLater(token, withScript ? 2000 : 900, () => {
        generateRaidQuestion();                      // タイマーは動かさない
    });
}

let raidAlive = [];                      // 負けイベ中に、まだ倒されていないキャラ

// ✨ 特別ルート: 出撃に、下の「ペア」の2人がそろっているときだけ、この2人は倒されず、2人そろって覚醒する
//   ・RAID_PAIRS の上にあるペアが優先(4人とも出撃していて、2組そろっているときは、上の組になる)
//   ・key は漫画の画像名に使う(覚醒前: manga_awaken_キー.webp / 勝利後: manga_farewell_キー.webp)
const RAID_PAIRS = [
    { key: "pair",            subjects: ["国語", "英語"] },   // 国語=紫鳴結月 / 英語=エルメシア
    { key: "pair_algebra_phi", subjects: ["数学", "物理"] }    // 数学=アルゲブラ / 物理=ファイ
];
function raidActivePair() {              // いまの出撃で成り立つペア(無ければ null)
    return RAID_PAIRS.find(pr => pr.subjects.every(sub => raidDeployed.includes(sub))) || null;
}
function raidPairDeployed() {
    return !!raidActivePair();
}
function raidAliveTarget() {             // 負けイベが終わる人数(通常は1体 / 特別ルートは2体)
    return raidPairDeployed() ? 2 : 1;
}
// ✨ ゲストの登場: 特別ルートではない通常の覚醒で、このキャラが覚醒したときに、ゲストが駆けつけて一緒に戦う
//   ・ゲストは倒されず、覚醒した本人と並んで表示され、攻撃のときは本人と同じ確率でランダムに攻撃する(カットインあり)
//   ・左がキャラ(教科)、右がゲスト
const RAID_GUESTS = { "化学": "エリス" };   // 化学=ルイス → エリス(ルイスの妹)
function raidNamesOf(list) {
    const short = { "国語": "結月", "英語": "エルメシア", "数学": "アルゲブラ", "物理": "ファイ", "化学": "ルイス", "エリス": "エリス" };
    return list.map(sub => short[sub] || subjectMeta[sub].name).join("と");
}
// 覚醒するキャラを決める(特別ルートなら2人 / 通常は最後に立っている1体)
function decideRaidAwakened() {
    const pr = raidActivePair();
    raidAwakenedKey = pr ? pr.key : null;
    raidAwakenedSubjects = pr ? pr.subjects.slice() : [raidAlive[0] || raidFighter];
    raidSurvivor = raidAwakenedSubjects[0];
}
// 覚醒したキャラの漫画の名前(特別ルートならペアの key / 通常はキャラの接頭辞)
function raidMangaKey() {
    return raidAwakenedKey || subjectMeta[raidAwakenedSubjects[0] || raidSurvivor].imgBase;
}

function startRaidSecondPhaseEvent(lateJoin) {
    const token = ++raidEventToken;
    stopTimer();
    clearSkillEffects();                 // 第二形態のイベントに入る前に、継続効果は消す
    lockRaidChoices(true);

    // 変身したあとに入室した人: 負けイベは飛ばして、すぐ覚醒した状態で始める
    if (lateJoin) {
        raidAlive = [raidFighter];
        decideRaidAwakened();                // 特別ルートの編成なら、最初から2人が覚醒した状態で始まる
        awakenRaidSurvivor(token, false);
        return;
    }

    raidStage = "loss";
    setSpecialTimerUI("⚠ 第二形態", "#cc3355");
    raidAlive = raidDeployed.slice();

    // 倒されるキャラがいない(出撃が1体だけ / 特別ルートで出撃が2人だけ): そのまま覚醒へ
    if (raidAlive.length <= raidAliveTarget()) {
        decideRaidAwakened();
        raidEventLater(token, RAID_EVENT_START_DELAY_MS, () => raidSurvivorScene(token, false));
        return;
    }

    // 変身の演出が落ち着いたら、問題を出し始める(正解しても通じない)
    raidEventLater(token, RAID_EVENT_START_DELAY_MS, () => {
        showBattleMessage("…第二形態の圧倒的な力！ どんな攻撃も、もう通じない！");
        generateRaidQuestion();
        startTimer();
    });
}

// 負けイベ中の1問が終わったとき(kind: "correct" 正解 / "wrong" 不正解 / "timeup" 時間切れ)。
// 答えが合っていても、攻撃は通じない。出撃キャラの1体が、一撃で倒される
function raidLossBlow(kind, selectedIndex) {
    const token = raidEventToken;
    lockRaidChoices(true);

    const correctBtn = document.getElementById("choice" + raidQuestion.answer);
    if (correctBtn) { correctBtn.style.background = "#004400"; correctBtn.style.borderColor = "#00ff00"; }
    if (kind === "wrong") {
        const wrongBtn = document.getElementById("choice" + selectedIndex);
        if (wrongBtn) { wrongBtn.style.background = "#440000"; wrongBtn.style.borderColor = "#ff0000"; }
    }

    // まだ立っているキャラから、全員同じ確率で1体(特別ルートでは、結月とエルメシアは倒されない)
    const pr = raidActivePair();
    const candidates = raidAlive.filter(sub => !(pr && pr.subjects.includes(sub)));
    const victim = candidates[Math.floor(Math.random() * candidates.length)];
    raidAlive = raidAlive.filter(sub => sub !== victim);

    const head = kind === "correct" ? "✅ 正解…のはずが、第二形態には通じない！"
               : kind === "wrong"   ? "❌ 不正解！"
               :                      "⌛ 時間切れ！";
    flashScreen("wrong");
    showBattleMessage(`${head}\n💥 ${subjectMeta[victim].name}が一撃で倒された…`);
    const el = document.getElementById(`party-slot-${raidDeployed.indexOf(victim)}`);
    if (el) el.classList.add("vanished");

    if (raidAlive.length <= raidAliveTarget()) {
        decideRaidAwakened();
        raidEventLater(token, 1800, () => raidSurvivorScene(token, true));
    } else {
        raidEventLater(token, RAID_EVENT_STEP_MS + 600, () => {
            if (raidStage !== "loss") return;
            generateRaidQuestion();
            startTimer();
        });
    }
}

// 最後の1体が光って、そのあと覚醒する
function raidSurvivorScene(token, hadFallen) {
    raidAwakenedSubjects.forEach(sub => {
        const el = document.getElementById(`party-slot-${raidDeployed.indexOf(sub)}`);
        if (el) el.classList.add("survivor");
    });
    if (raidAwakenedSubjects.length > 1) {
        showBattleMessage(hadFallen
            ? `…立っているのは、${raidNamesOf(raidAwakenedSubjects)}の二人だけだ。`
            : `${raidNamesOf(raidAwakenedSubjects)}は、二人で立ち向かう…`);
    } else {
        const name = subjectMeta[raidSurvivor].name;
        showBattleMessage(hadFallen ? `…残されたのは、${name}だけだ。` : `${name}は、たった一人でも立ち向かう…`);
    }
    raidEventLater(token, 2200, () => awakenRaidSurvivor(token, true));
}

function checkRaidPhase(hp, maxHp) {
    const reached = hp > 0 && hp <= maxHp * RAID_PHASE2_RATIO;
    const first = !raidPhaseChecked;
    raidPhaseChecked = true;
    if (raidPhase >= 2 || !reached) return;
    raidPhase = 2;
    // 入室した時点ですでに第二形態の段階なら、変身の演出は出さず、そのまま第二形態の姿にする
    setRaidBossForm(2, !first);
    startRaidSecondPhaseEvent(first);
}

function updateRaidBossUI(hp) {
    const bossHpEl = document.getElementById("boss-hp");
    if (bossHpEl) bossHpEl.innerText = hp;
    const maxHp = window.__raidMaxBossHp || 100000;
    const bossBarEl = document.getElementById("boss-hp-bar");
    if (bossBarEl) bossBarEl.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    checkRaidPhase(hp, maxHp);
}

function generateRaidQuestion() {
    raidQuestion = generateRandomRaidQuestion();

    const qEl = document.getElementById("battle-question-text");
    if (qEl) qEl.innerText = raidQuestion.question;

    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById("choice" + i);
        if (btn) {
            btn.innerText = raidQuestion.choices[i];
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.background = "#333";
            btn.style.borderColor = "#666";
        }
    }
}

function handleRaidAnswer(selectedIndex) {
    stopTimer();
    if (raidStage === "loss") {                      // 負けイベ中: 答えが合っていても、攻撃は通じない
        if (raidAlive.length > raidAliveTarget()) raidLossBlow(selectedIndex === raidQuestion.answer ? "correct" : "wrong", selectedIndex);
        return;
    }

    const lv = Math.max(1, characterLevels[raidFighter].level);
    const stats = getPlayerStats(lv);

    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById("choice" + i);
        if (btn) btn.disabled = true;
    }

    // ✨ 覚醒中: どの選択肢を選んでも、必ず正解になる(大ダメージ)
    if (raidStage === "awakened") {
        const maxHp = window.__raidMaxBossHp || 100000;
        const dmg = Math.max(stats.attack, Math.ceil(maxHp * RAID_AWAKEN_DAMAGE_RATIO));
        flashScreen("correct");
        showBattleMessage(`✨ 覚醒の力！ どんな答えも正解になる！ ${dmg} ダメージ！`);
        const attacker = pickAttacker(raidFighter);                // 覚醒後の候補は覚醒したキャラだけ(通常1体 / 特別ルートは2体からランダム)
        if (attacker === raidFighter) playSpriteState(raidFighter, "attack");
        playAttackPose(attacker);

        const pickedBtn = document.getElementById("choice" + selectedIndex);
        if (pickedBtn) { pickedBtn.style.background = "#004400"; pickedBtn.style.borderColor = "#00ff00"; }

        db.ref("raid/bossHp").transaction(hp => (hp == null ? hp : Math.max(0, hp - dmg)));

        const token = raidEventToken;
        raidEventLater(token, 1300, () => {
            if (raidStage !== "awakened") return;
            playSpriteState(raidFighter, "idle");
            generateRaidQuestion();                  // タイマーは動かさない
        });
        return;
    }

    if (selectedIndex === raidQuestion.answer) {
        const attacker = pickAttacker(raidFighter);                // 出撃している味方の中から、ランダムで1体が攻撃する
        const dmg = takeSkillDamage(attackPowerOf(attacker, stats));   // 攻撃したキャラ自身の強さ + スキル(powerup)の倍率
        flashScreen("correct");
        const tickNote = endQuestionTick();                       // 毒のダメージ・継続効果を1問ぶん進める
        tickSkillCooldowns();                                     // スキルのクールタイムを、正解1回ぶん進める
        showBattleMessage(`✅ 正解！ ${subjectMeta[attacker].name}の攻撃！ ${getRandomAttackLine(attacker)} ${dmg} ダメージ！${tickNote}`);
        if (attacker === raidFighter) playSpriteState(raidFighter, "attack");   // ドット絵の切り替えは、先頭のキャラのときだけ
        playAttackPose(attacker);

        const correctBtn = document.getElementById("choice" + selectedIndex);
        if (correctBtn) { correctBtn.style.background = "#004400"; correctBtn.style.borderColor = "#00ff00"; }

        // みんなで共有しているボスHPを実際に削る(トランザクションで安全に減算)
        db.ref("raid/bossHp").transaction(hp => (hp == null ? hp : Math.max(0, hp - dmg)));
    } else {
        const m = computeMistake();                   // 行動阻害・全体防御・反射・切り傷などの効果を反映
        raidPlayerHearts -= m.lost;
        if (m.reflectDmg) applyBossDamage(m.reflectDmg);          // 反射: 受けるはずのダメージを、みんなのボスHPへ
        const tickNote = endQuestionTick();
        flashScreen("wrong");
        showBattleMessage(mistakeText("wrong", m) + tickNote);
        if (m.lost > 0) playSpriteState(raidFighter, "hurt");

        const wrongBtn = document.getElementById("choice" + selectedIndex);
        if (wrongBtn) { wrongBtn.style.background = "#440000"; wrongBtn.style.borderColor = "#ff0000"; }
        const correctBtn = document.getElementById("choice" + raidQuestion.answer);
        if (correctBtn) { correctBtn.style.background = "#004400"; correctBtn.style.borderColor = "#00ff00"; }
    }

    updateRaidHeartsUI();

    setTimeout(() => {
        if (!raidActive) return;
        if (raidPlayerHearts <= 0) {
            alert("💀 あなたは力尽きた…\n他の仲間の活躍を見守ろう！拠点に戻ります。");
            endBattle();
        } else if (raidStage === "normal") {         // 第二形態の演出に入っていたら、次の問題は出さない
            playSpriteState(raidFighter, "idle");
            generateRaidQuestion();
            startTimer();
        }
    }, 1500);
}

function onRaidVictory() {
    if (!raidActive) return; // 二重発火防止
    raidActive = false;
    closeMangaViewer();                  // 覚醒の漫画を見ている途中でボスが倒れたときは、漫画を閉じて勝利へ
    stopTimer();

    // 覚醒したキャラの手でボスを倒したときだけ、お別れの漫画を見せる(特別ルートなら2人の漫画)
    let farewellKey = null;
    if (raidStage === "awakened" && raidAwakenedSubjects.length) {
        farewellKey = raidMangaKey();
    }

    if (raidStage === "awakened" && raidSurvivor) {
        const who = raidAwakenedSubjects.length > 1 ? `${raidNamesOf(raidAwakenedSubjects)}の二人` : subjectMeta[raidSurvivor].name;
        alert(`🎉 ${who}の覚醒の一撃で、ボスは倒れた！\n…すべてが終わった。\nナイスファイト、${playerCallName()}！`);
    } else {
        alert(`🎉 レイドボス討伐成功！みんなの協力で勝利した！\nナイスファイト、${playerCallName()}！`);
    }
    // 全員が抜けた時点で resetRaidIfEmpty が初期化する。取り残しは次のロビー入室時にも掃除される
    removeSelfFromRaidPlayers();
    // お別れの漫画(覚醒したキャラの人だけ) → エンディング(エンドロール) → 拠点へ
    const goEnding = () => showEnding(backToHub);
    if (farewellKey) showFarewellManga(farewellKey, goEnding);
    else goEnding();
}

function endBattle() {
    if (currentBattleMode === "raid") {
        removeSelfFromRaidPlayers();
    }
    backToHub();
}
// ==========================================
// 📖 チュートリアル
// ==========================================
const tutorialPages = [
    {
        title: "⚔️ キャラ獲得試練",
        content: `
キャラクターを仲間にするための試練です。

📋 ルール
・10問のクイズに挑戦
・8問以上正解でキャラ加入
・失敗しても何度でも挑戦できる

💡 試練の扉の開け方
キャンパスにある、そのキャラの
場所をカメラで写すと、試練の
扉が開きます。（📷スキャン）
場所がわからないときは、キャラ
カードをタップすると、キャラが
場所を教えてくれます！
        `
    },
    {
        title: "🔥 レベルアップ戦",
        content: `
仲間のキャラをレベルアップさせる戦いです。

📋 ルール
・クイズに正解 → 敵にダメージ
・不正解 or 時間切れ → ハートが1つ減る
・敵のHPを0にすると勝利＆レベルアップ
・ハートが0になると敗北

❤️ ハート数
Lv1：5個 / Lv2：8個 / Lv3：11個
        `
    },
    {
        title: "🌋 レイドバトル",
        content: `
最大10人で巨大ボスに挑む協力バトルです。

📋 ルール
・クイズに正解 → ボスにダメージ
・不正解 or 時間切れ → ハートが1つ減る
・みんなでボスのHP10万を削り切れ！

💡 ポイント
キャラのレベルが高いほど
与えるダメージが大きくなります！
        `
    }
];

let tutorialCurrentPage = 0;

function showTutorial() {
    tutorialCurrentPage = 0;
    showOnlyThisScreen("tutorial-screen");
    renderTutorialPage();
}

function renderTutorialPage() {
    const page = tutorialPages[tutorialCurrentPage];
    const pageNum = document.getElementById("tutorial-page-num");
    const content = document.getElementById("tutorial-content");
    const prevBtn = document.getElementById("tutorial-prev-btn");
    const nextBtn = document.getElementById("tutorial-next-btn");

    if (pageNum) {
        pageNum.innerText = tutorialCurrentPage + 1;
        // 「/ 4」の総ページ数は index.html に固定で書かれているので、実際のページ数に合わせて直す
        if (pageNum.nextSibling && pageNum.nextSibling.nodeType === 3) pageNum.nextSibling.textContent = ` / ${tutorialPages.length}`;
    }

    if (content) {
        content.innerHTML = `
            <div style="text-align:center; font-size:20px; font-weight:bold; color:#ffcc00; margin-bottom:20px;">${page.title}</div>
            <div style="background:#222; border:2px solid #444; border-radius:12px; padding:20px; color:#fff; font-size:14px; line-height:2; white-space:pre-line;">${page.content}</div>
        `;
    }

    if (prevBtn) {
        prevBtn.style.display = tutorialCurrentPage === 0 ? "none" : "block";
    }

    if (nextBtn) {
        if (tutorialCurrentPage === tutorialPages.length - 1) {
            nextBtn.innerText = "🎮 はじめる";
            nextBtn.style.background = "linear-gradient(135deg, #00cc44, #007722)";
        } else {
            nextBtn.innerText = "次へ ▶";
            nextBtn.style.background = "linear-gradient(135deg, #ff9900, #ff5500)";
        }
    }
}

function tutorialNext() {
    if (tutorialCurrentPage < tutorialPages.length - 1) {
        tutorialCurrentPage++;
        renderTutorialPage();
    } else {
        finishTutorial();
    }
}

function tutorialPrev() {
    if (tutorialCurrentPage > 0) {
        tutorialCurrentPage--;
        renderTutorialPage();
    }
}
// 敵画像を固定サイズの枠(#boss-img-wrap)で包む。
// index.html が古いままでも崩れないようにするための保険(すでに包まれていれば何もしない)
function ensureBossImgWrap() {
    const img = document.getElementById("boss-img");
    if (!img || !img.parentElement) return;
    if (img.parentElement.id === "boss-img-wrap") return;
    const wrap = document.createElement("div");
    wrap.id = "boss-img-wrap";
    img.parentElement.insertBefore(wrap, img);
    wrap.appendChild(img);
}

function initGame() {
    console.log("initGame開始");
    ensureBossImgWrap();
    ensureAttackPoseElements();
    setInterval(updateSkillBarState, 200);      // スキルボタンの押せる/押せないを、常に最新にする

    // ?reset=1 を付けて開くと、セーブデータを消して最初から始められる(テスト・展示用)
    try {
        if (new URLSearchParams(location.search).get("reset") === "1") {
            ["characterLevels", "playerParty", "tutorialSeen", "playerName", "trialUnlocked", "trialHintTaps"].forEach(safeStorageRemove);
            trialUnlockedList = [];
            trialHintTaps = {};
            playerNameMemory = "";
            history.replaceState(null, "", location.pathname);
            alert("セーブデータを消去しました。最初から始めます。");
        }
    } catch (e) {}

    checkSaveEnvironment();
    loadGame();
    playerParty = loadPlayerParty();

    // 修復: パーティにいるのに未開放になっているキャラは、獲得済みとして扱う
    // (以前の版で、獲得したのに保存されなかったデータを救うため)
    let repaired = false;
    playerParty.forEach(sub => {
        if (characterLevels[sub] && characterLevels[sub].level === 0) {
            characterLevels[sub].level = 1;
            repaired = true;
        }
    });

    saveReady = true;
    updateBgmButton();
    if (repaired) saveGame();
    console.log("characterLevels:", JSON.stringify(characterLevels));

    const seen = safeStorageGet("tutorialSeen");
    if (seen) {
        finishTutorial();
    } else {
        // 初めて開いたとき: オープニング漫画 → チュートリアル → 名前入力
        showOpeningManga(() => {
            safeStorageSet("tutorialSeen", "true");
            showTutorial();
        });
    }
}

window.onload = initGame;