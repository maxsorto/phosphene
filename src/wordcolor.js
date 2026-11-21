// Colours from the words. Once the lyrics of the song playing are known, this reads them (and the
// title) for colours: colour words first, in any of the languages below, then things with a colour
// (the sea, fire, gold, the night sky), then the mood of the words (love, sadness, joy, anger, dreams,
// darkness). The strongest of these becomes the song's palette. A colour named in the line being sung
// tints the picture for a while on its own.
//
// "Blue (Da Ba Dee)" turns blue, "Oro de ley" turns gold, a song that never names a colour takes the
// colour of its mood, and a song with too few words to judge keeps its album's colours.
//
// It is a word list, not a translator: it knows these languages, and only the words in it. Nothing is
// kept but the scores.

// The colours. Each is the two ends of a gradient the shaders draw from.
export const FAMILIES = {
  red:    { name: 'Red',    c1: [.95, .12, .1],  c2: [.42, .02, .08] },
  orange: { name: 'Orange', c1: [1, .55, .1],    c2: [.72, .16, .04] },
  gold:   { name: 'Gold',   c1: [1, .8, .3],     c2: [.62, .34, .04] },
  yellow: { name: 'Yellow', c1: [1, .93, .25],   c2: [.95, .58, .06] },
  green:  { name: 'Green',  c1: [.25, .9, .35],  c2: [.02, .38, .22] },
  teal:   { name: 'Teal',   c1: [.1, .85, .78],  c2: [.02, .28, .45] },
  sky:    { name: 'Sky',    c1: [.55, .8, 1],    c2: [.12, .38, .88] },
  blue:   { name: 'Blue',   c1: [.15, .45, 1],   c2: [.03, .08, .52] },
  sea:    { name: 'Sea',    c1: [.08, .62, .9],  c2: [.02, .16, .42] },
  night:  { name: 'Night',  c1: [.38, .28, .9],  c2: [.04, .04, .22] },
  violet: { name: 'Violet', c1: [.7, .3, 1],     c2: [.28, .05, .5] },
  pink:   { name: 'Pink',   c1: [1, .45, .78],   c2: [.78, .12, .45] },
  rose:   { name: 'Rose',   c1: [1, .28, .45],   c2: [.55, .04, .28] },
  white:  { name: 'White',  c1: [.95, .96, 1],   c2: [.5, .6, .78] },
  silver: { name: 'Silver', c1: [.85, .9, 1],    c2: [.35, .42, .6] },
  ice:    { name: 'Ice',    c1: [.82, .97, 1],   c2: [.25, .6, .92] },
  black:  { name: 'Black',  c1: [.4, .34, .48],  c2: [.02, .02, .04], floor: .2 },
  fire:   { name: 'Fire',   c1: [1, .6, .12],    c2: [.75, .04, .03] },
  candy:  { name: 'Candy',  c1: [1, .35, .8],    c2: [.2, .82, 1] },
  dream:  { name: 'Dream',  c1: [.75, .62, 1],   c2: [.2, .62, .72] },
  sad:    { name: 'Blue mood', c1: [.3, .45, .9], c2: [.05, .07, .32] },
  rage:   { name: 'Rage',   c1: [.95, .12, .04], c2: [.18, 0, .03], floor: .24 },
  dark:   { name: 'Dark',   c1: [.45, .12, .55], c2: [.05, 0, .08], floor: .22 },
};

// How much one word counts: a colour by name, a thing with a colour, a mood.
const NAMED = 1, THING = 0.45, MOOD = 0.22;
const TITLE = 5;                       // a word in the title counts this many times over

// Word lists. A word ending in * is a stem (Russian, Polish, Turkish and Korean put their endings on
// the end). Words in Chinese, Japanese and Thai are found inside a run of text, since those languages
// leave no spaces. Accents are ignored everywhere (azúl = azul).
const WORDS = [
  // colours by name
  ['red', NAMED, `แดง red reds crimson scarlet ruby cherry rojo roja rojos rojas carmesi escarlata colorado vermelho vermelha vermelhos rouge rouges rosso rossa rossi rot rote roten rood rød merah kirmizi pula czerwon* красн* أحمر حمراء लाल 赤 紅 红 빨간* 빨강* 레드 レッド`],
  ['orange', NAMED, `orange oranges amber naranja anaranjado laranja arancione arancio oranje turuncu jingga pomarańcz* оранжев* برتقالي नारंगी 橙 オレンジ 주황* 오렌지`],
  ['gold', NAMED, `ทอง gold golden oro dorado dorada dorados doradas ouro dourado dourada dore doree dorato dorata goldene goldenen goud guld gull emas altin ginto złot* золот* ذهب ذهبي सुनहरा 金色 黄金 金 ゴールド 황금* 금빛 골드`],
  ['yellow', NAMED, `เหลือง yellow amarillo amarilla amarillos amarelo amarela jaune jaunes giallo gialla gelb gelbe gelben geel gul gult kuning sari dilaw żółt* жёлт* желт* أصفر صفراء पीला पीली 黄 黃 黄色 イエロー 노란* 노랑* 옐로`],
  ['green', NAMED, `เขียว green greens emerald jade verde verdes vert verte grun grune grunen groen gron gronn hijau yesil berde luntian zielon* зелен* зелён* أخضر خضراء हरा हरी हरे 緑 绿 綠 グリーン 초록* 녹색 그린`],
  ['teal', NAMED, `teal turquoise aqua cyan turquesa turquoise turchese turkis turkuaz бирюз*`],
  ['sky', NAMED, `ฟ้า celeste azzurro azzurra azzurri himmelblau голуб*`],
  ['blue', NAMED, `น้ำเงิน blue blues sapphire navy azul azules bleu bleue bleus bleues blu blau blaue blauen blauw biru mavi asul bughaw niebiesk* син* أزرق زرقاء नीला नीली नीले 青 蓝 藍 ブルー 파란* 파랑* 블루`],
  ['violet', NAMED, `ม่วง purple violet violets lilac lavender indigo morado morada violeta lila roxo roxa violette viola lila paars ungu fiolet* фиолет* сиренев* بنفسجي बैंगनी 紫 パープル 보라* 퍼플`],
  ['pink', NAMED, `ชมพู pink rosa rosado rosada rose roze rosas pembe merah-muda różow* розов* وردي गुलाबी 粉红 粉紅 桃色 ピンク 분홍* 핑크`],
  ['white', NAMED, `ขาว white blanco blanca blancos blancas branco branca blanc blanche bianco bianca weiss weisse weissen weiß weiße weißen wit vit hvit putih beyaz puti biał* бел* أبيض بيضاء सफेद 白 白い ホワイト 하얀* 흰 화이트`],
  ['silver', NAMED, `เงิน silver grey gray plata plateado plateada prata argent argente argento silber zilver silver solv perak gumus pilak srebr* серебр* فضة فضي चांदी 銀 银 シルバー 은빛 실버`],
  ['black', NAMED, `ดำ black negro negra negros negras preto preta noir noire noirs nero nera neri schwarz schwarze schwarzen zwart svart hitam siyah kara itim czarn* чёрн* черн* أسود سوداء काला काली 黒 黑 ブラック 검은* 까만* 블랙`],
  // things with a colour
  ['sky', THING, `sky skies cielo cielos ceu ciel cieux himmel hemel himmel langit gokyuzu langit niebo небо небес* سماء आसमान आकाश 空 天空 하늘*`],
  ['sea', THING, `ทะเล sea seas ocean oceans wave waves mar mares oceano ola olas onda ondas mer ocean vague vagues mare oceano meer ozean welle wellen zee hav deniz dagat morze море океан* بحر समुंदर समुद्र 海 海洋 波 바다*`],
  ['fire', THING, `ไฟ fire fires flame flames burn burning blaze fuego llama llamas arder fogo chama queimar feu flamme brule fuoco fiamma bruciare feuer flamme brennen vuur eld ild api ates apoy ogień огон* огн* пламя نار आग 火 炎 불꽃* 불타*`],
  ['gold', THING, `sun sunshine sunlight sunset sol soleil sole sonne zon sol matahari gunes araw słońc* солнц* شمس सूरज 太陽 太阳 夕日 夕阳 해가 태양*`],
  ['night', THING, `night nights midnight noche noches medianoche noite meia-noite nuit nuits minuit notte notti mezzanotte nacht nachte mitternacht nacht natt malam gece gabi noc* ноч* ночь ليل ليلة रात 夜 深夜 밤*`],
  ['silver', THING, `moon moonlight luna lua lune luna mond maan bulan buwan księżyc* лун* قمر चाँद चांद 月光 月亮 달빛`],
  ['violet', THING, `star stars starlight estrella estrellas estrela estrelas etoile etoiles stella stelle stern sterne ster stjarna bintang yildiz bituin gwiazd* звезд* نجم نجوم तारा तारे 星 星星 별빛`],
  ['red', THING, `blood bloody кровь крови sangre sangue sangue blut bloed blod darah dugo krew دم खून 血 피가`],
  ['rose', THING, `heart hearts corazon coracao coeur cuore herz hart hjarta jantung kalp puso serc* сердц* قلب दिल 心 心臓 마음* 심장*`],
  ['ice', THING, `snow ice winter frozen cold nieve hielo invierno frio neve gelo inverno frio neige glace hiver froid neve ghiaccio inverno freddo schnee eis winter kalt sneeuw ijs sno salju kar buz niyebe śnieg* lód снег* лёд лед зим* холод* ثلج جليد बर्फ 雪 冰 氷 冬 눈꽃 겨울*`],
  ['green', THING, `forest forests tree trees las lasy lasu grass jungle bosque selva arbol arboles floresta arvore foret arbre bosco foresta albero wald baum baume bos boom skog hutan orman gubat лес* شجر जंगल 森 森林 树 숲*`],
  ['candy', THING, `neon neones neons glitter disco`],
  ['gold', THING, `diamond diamonds diamante diamantes diamant diamanti brillante brilla brillar brilhar shine shining`],
  // moods
  ['rose', MOOD, `รัก love loved lover lovers loving kiss kisses amor amar amo te-quiero beso besos amour aime aimer bisou amore amare bacio liebe lieben kuss liefde kus kärlek karlek elsker cinta sayang sevgi askim mahal pag-ibig halik miłoś* kocha* любов* любл* целу* حب حبيبي حبيبتي प्यार इश्क़ इश्क मोहब्बत 愛 恋 爱 戀 사랑* 키스`],
  ['sad', MOOD, `sad sadness cry crying cried tears tear lonely alone goodbye miss blues triste tristeza llorar llanto lagrimas lagrima adios chorar lagrimas saudade sozinho sozinha tristesse pleurer larmes seul seule adieu piangere lacrime addio traurig weinen tranen allein abschied verdriet huilen tranen ledsen grata sedih menangis sendiri huzun aglamak yalniz malungkot iyak luha smut* płacz* łz* грус* печал* плач* слез* слёз* одино* حزن حزين دموع उदास आंसू अकेला 悲 泣 涙 寂 孤独 伤心 哭 眼泪 寂寞 슬픔* 슬퍼* 눈물* 외로*`],
  ['candy', MOOD, `happy happiness joy party dance dancing fun smile baila bailar bailando fiesta feliz alegria sonrisa dancar danca festa felicidade sorriso danser danse fete heureux joie sourire ballare ballo festa felice gioia sorriso tanzen tanz party glucklich freude lacheln dansen feest gelukkig dansa fest lycklig glad menari pesta bahagia senyum mutlu sayaw saya masaya tańcz* taniec szczęś* танц* праздн* счаст* радост* رقص فرح سعيد नाच खुश ख़ुशी 踊 幸せ 笑顔 跳舞 快乐 快樂 幸福 춤* 행복* 웃음*`],
  ['rage', MOOD, `hate rage anger angry fight kill odio rabia ira guerra pelea matar raiva briga haine colere guerre rabbia guerra hass wut krieg haat woede oorlog krig benci marah perang nefret ofke savas galit digmaan nienawi* wojn* ненави* злост* гнев* войн* كره غضب حرب नफरत गुस्सा 怒 憎 戦争 恨 愤怒 战争 분노* 전쟁*`],
  ['dream', MOOD, `ฝัน dream dreams dreaming sleep float floating peace calm paradise heaven sueno suenos sonar paz calma paraiso sonho sonhos sonhar paz reve reves rever paix calme paradis sogno sogni sognare pace calma paradiso traum traume traumen frieden ruhe paradies droom dromen vrede drom dromma mimpi damai ruya sen marzenie marzenia baris huzur panaginip kapayapaan мечт* сон сны рай* покой* حلم أحلام سلام सपना सपने शांति 夢 梦 夢見 平和 和平 꿈* 평화*`],
  ['dark', MOOD, `dark darkness shadow shadows death dead dying grave ghost oscuro oscura oscuridad sombra sombras muerte muerto morir escuro escuridao sombra morte morrer sombre obscur obscurite ombre mort mourir buio oscuro ombra morte morire dunkel dunkelheit schatten tod sterben donker duister schaduw dood mork skugga dod gelap bayangan mati karanlik golge olum madilim anino kamatayan ciemn* śmier* тьм* темн* тень смерт* мёртв* мертв* ظلام موت ظل अंधेरा अँधेरा मौत 闇 影 死 黑暗 死亡 어둠* 죽음*`],
];

// Words in Chinese and Japanese that contain a colour but do not mean one (明白 is "understand").
const NOT = ['明白', '告白', '空白', '坦白', '白状', '赤ちゃん', '金曜', 'お金', '金钱', '金錢', '现金', '現金', '心配', '中心', '小心', '关心', '開心', '开心', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '月曜', '今夜', '青春', '火曜', '一緒'];

// Accents off (but not the marks Japanese uses), lower case.
export const fold = s => String(s || '').normalize('NFD').replace(/[̀-़ͯ]/g, '').normalize('NFC').toLowerCase();
const DENSE = /[぀-ヿ㐀-鿿฀-๿]/;   // kana, Han, Thai: no spaces between words

const exact = new Map(), stems = [], dense = [];
for (const [fam, w, list] of WORDS) for (const raw of list.split(/\s+/)) {
  if (!raw) continue;
  const word = fold(raw.replace(/-/g, ' ')), hit = { fam, w };
  if (DENSE.test(word)) dense.push([word, hit]);
  else if (word.endsWith('*')) stems.push([word.slice(0, -1), hit]);
  else if (!word.includes(' ') && !exact.has(word)) exact.set(word, hit);
}
dense.sort((a, b) => b[0].length - a[0].length);           // 粉红 before 红, 黄金 before 金

// Every colour hit in a piece of text: [{ fam, w }].
export function hits(text) {
  const out = [], t = fold(text);
  for (const tok of t.match(/[\p{L}\p{M}']+/gu) || []) {
    if (DENSE.test(tok)) continue;
    let word = tok.replace(/^'+|'+$/g, '');
    if (/^[\u0600-\u06ff]/.test(word) && !exact.has(word)) word = word.replace(/^(?:وال|بال|لل|ال|و|ب)(?=[\u0600-\u06ff]{2})/, '');
    const e = exact.get(word);
    if (e) { out.push(e); continue; }
    for (const [s, h] of stems) if (word.startsWith(s) && word.length <= s.length + 6) { out.push(h); break; }
  }
  // the dense scripts: blank out the compounds that only look like colours, then take the longest words first
  let d = (t.match(/[぀-ヿ㐀-鿿฀-๿가-힯]+/g) || []).join(' ');
  if (d) {
    for (const n of NOT) d = d.split(n).join(' ');
    for (const [word, h] of dense) if (d.includes(word)) { const parts = d.split(word); for (let i = 1; i < parts.length; i++) out.push(h); d = parts.join(' '); }
  }
  return out;
}

// Two ends of a gradient -> a cosine palette (the shaders' colour(t) = a + b cos(2 pi (f t + d))).
// With f and d nearly equal across channels it runs from one end to the other, so it stays in the family.
export function pairPalette(c1, c2, name, floor = 0.3) {
  const a = c1.map((v, i) => (v + c2[i]) / 2);
  const b = c1.map((v, i) => { const d = (v - c2[i]) / 2; return Math.sign(d || 1) * Math.max(0.12, Math.abs(d)); });
  const lum = a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11;
  if (lum < floor) { const k = floor / Math.max(lum, 0.02); for (let i = 0; i < 3; i++) a[i] = Math.min(0.85, a[i] * k); }
  return { name, a, b, f: [1, 1, 1], d: [0, 0.04, 0.08], c1, c2 };
}
export const familyPalette = (fam, second) => {
  const F = FAMILIES[fam], S = second && FAMILIES[second];
  return pairPalette(F.c1, S ? S.c1 : F.c2, S ? `${F.name} and ${S.name.toLowerCase()}` : F.name, Math.min(F.floor ?? 0.3, S ? S.floor ?? 0.3 : 1));
};

// The whole song: its lines and title -> what the words say.
//   { fam, second, palette, by: 'colour' | 'words', why }   a colour named often enough (or in the title), or
//                                                            things and moods strong enough on their own
//   { fam: null, scores, why }                               too little to go on: moodOf() adds the music
// why lists the scores, strongest first, for the status file.
const NEAR = { blue: ['sky', 'sea', 'sad', 'night'], sky: ['blue', 'sea'], sea: ['blue', 'sky', 'teal'], gold: ['yellow', 'orange'], yellow: ['gold'], red: ['rose', 'fire', 'rage'], rose: ['red', 'pink'], pink: ['rose'], fire: ['red', 'orange'], white: ['silver', 'ice'], silver: ['white', 'ice'], ice: ['white', 'silver'], night: ['dark', 'blue', 'black'], dark: ['night', 'black'], black: ['dark', 'night'], sad: ['blue', 'night'] };
export function readSong(lines, title = '') {
  const score = {}, named = {};
  const add = (text, k) => { for (const h of hits(text)) { score[h.fam] = (score[h.fam] || 0) + h.w * k; if (h.w === NAMED) named[h.fam] = (named[h.fam] || 0) + k; } };
  add(title.replace(/\(.*?\)|\[.*?\]/g, m => ' ' + m.slice(1, -1) + ' '), TITLE);   // "Blue (Da Ba Dee)": the brackets count too
  for (const l of lines) add(typeof l === 'string' ? l : l.text, 1);
  const ranked = Object.entries(score).sort((x, y) => y[1] - x[1]);
  const why = ranked.slice(0, 4).map(([f, s]) => [f, +s.toFixed(1)]);
  // a colour sung by name (three times, or once in the title) comes first; then things and moods, if they are strong
  let pick = ranked.find(([f]) => (named[f] || 0) >= 3), by = 'colour';
  if (!pick && ranked[0] && ranked[0][1] >= 2.4) { pick = ranked[0]; by = 'words'; }
  if (!pick) return { fam: null, scores: score, why };
  const [fam, top] = pick;
  // a second colour joins only when it is nearly as strong and not too close a cousin
  const sec = ranked.find(([f, s]) => f !== fam && s >= top * 0.55 && !(NEAR[fam] || []).includes(f));
  const second = sec ? sec[0] : null;
  return { fam, second, palette: familyPalette(fam, second), by, why };
}

// When the words alone say too little, the music settles the mood: a minor key leans sad or fierce, a major
// one bright or tender, and the tempo says which. Whatever the words did say still counts.
//   scores   readSong's scores     music   { minor, keyConf, bpm }
export function moodOf(scores, music = {}) {
  const s = f => scores[f] || 0, total = Object.values(scores).reduce((x, y) => x + y, 0) + 1;
  const keyed = Math.min(1, (music.keyConf || 0) * 2.5);
  const valence = (s('candy') + 0.6 * s('rose') + 0.4 * s('dream') + 0.3 * s('gold') - s('sad') - s('rage') - s('dark')) / total
    + (music.minor ? -0.5 : 0.5) * keyed;
  const arousal = (music.bpm ? (music.bpm - 108) / 40 : 0) + (s('candy') + s('rage') + s('fire') - s('sad') - s('dream')) / total;
  let fam;
  if (valence >= 0) fam = arousal >= 0 ? (s('rose') > s('candy') ? 'pink' : 'candy') : (s('rose') >= s('dream') ? 'rose' : 'dream');
  else fam = arousal >= 0 ? (s('dark') > s('rage') ? 'violet' : 'fire') : (s('dark') + s('night') > s('sad') ? 'night' : 'sad');
  return { fam, second: null, palette: familyPalette(fam), by: 'mood', valence: +valence.toFixed(2), arousal: +arousal.toFixed(2) };
}

// One sung line: the colour it names, if it names one (things and moods are left to the whole song).
export function readLine(text) {
  const named = hits(text).filter(h => h.w === NAMED);
  return named.length ? named[0].fam : null;
}
