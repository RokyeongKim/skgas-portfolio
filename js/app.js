// =====================================================
// 설정
// =====================================================
const SECTORS = [
  { key: 'LPG',   label: '석유/석유화학(LPG)', cssClass: 'lpg',       color: '#388e3c' },
  { key: 'LNG',   label: '천연가스(LNG)',       cssClass: 'lng',       color: '#1565c0' },
  { key: '발전',  label: '발전',                cssClass: 'power',     color: '#283593' },
  { key: '신재생', label: '신재생',             cssClass: 'renewable', color: '#00695c' },
  { key: '기타',  label: '기타',                cssClass: 'etc',       color: '#455a64' },
];

let allCompanies = [];
let allMeta      = null;
let activeFilter = '전체';
let searchQuery  = '';

// =====================================================
// 헬퍼
// =====================================================
function fmt(v) {
  if (v === null || v === undefined) return '-';
  return Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '억';
}
function fmtRatio(v) {
  if (v === null || v === undefined) return '-';
  return v + '%';
}

function getBadge(c) {
  if (c.exit_status === 'Exit 완료') return '<span class="badge badge-exit-done">Exit완료</span>';
  if (c.exit_status === '실행 중')   return '<span class="badge badge-exit-active">Exit진행</span>';
  if (c.strategy === 'Exit')         return '<span class="badge badge-exit">Exit예정</span>';
  return '<span class="badge badge-hold">보유</span>';
}

function getIcon(type) {
  if (type === '국내계열사') return '<span class="card-icon" title="국내계열사">●</span>';
  if (type === '해외계열사') return '<span class="card-icon" title="해외계열사">▲</span>';
  return '<span class="card-icon" title="기타지분">◆</span>';
}

// =====================================================
// 카드 렌더링
// =====================================================
function renderCard(c, isChild) {
  const cls = isChild ? 'company-card child' : 'company-card';
  return `
    <div class="${cls}" data-id="${c.id}" onclick="openPanel('${c.id}')">
      <div class="card-top">
        ${getIcon(c.type)}
        <span class="card-name">${c.name}</span>
      </div>
      <div class="card-meta">
        <span>${fmt(c.book_value)} | ${fmtRatio(c.equity_ratio)}</span>
        ${getBadge(c)}
      </div>
    </div>`;
}

function renderSectors(companies) {
  const grid = document.getElementById('sector-grid');
  const emptyMsg = document.getElementById('empty-msg');
  grid.innerHTML = '';

  let totalRendered = 0;

  SECTORS.forEach(sector => {
    const all    = companies.filter(c => c.sector === sector.key);
    const top    = all.filter(c => !c.parent_id);
    const orphan = all.filter(c => c.parent_id && !all.find(t => t.id === c.parent_id));

    if (all.length === 0) return;
    totalRendered += all.length;

    let html = '';
    top.forEach(p => {
      html += renderCard(p, false);
      all.filter(c => c.parent_id === p.id).forEach(child => {
        html += renderCard(child, true);
      });
    });
    orphan.forEach(c => { html += renderCard(c, true); });

    const col = document.createElement('div');
    col.className = `sector-col ${sector.cssClass}`;
    col.innerHTML = `
      <div class="sector-header">
        <span>${sector.label}</span>
        <span class="count">${all.length}</span>
      </div>
      <div class="sector-body">${html}</div>`;
    grid.appendChild(col);
  });

  emptyMsg.style.display = totalRendered === 0 ? 'block' : 'none';
  document.getElementById('total-count').textContent = `(${totalRendered}개사)`;
}

// =====================================================
// 소액투자회사 footnote
// =====================================================
function renderMinorHoldings() {
  if (!allMeta?.minor_holdings?.length) return;

  let section = document.getElementById('minor-holdings-section');
  if (!section) {
    section = document.createElement('div');
    section.id = 'minor-holdings-section';
    section.style.cssText = [
      'padding:10px 20px 18px',
      'border-top:1px dashed #cfd8dc',
      'margin-top:8px',
      'background:#fafafa',
    ].join(';');
    section.innerHTML = `
      <div style="font-size:11px;color:#90a4ae;font-weight:700;letter-spacing:.06em;margin-bottom:8px;">
        ※ 별도 관리 (소액·관리종결 대상)
      </div>
      <div id="minor-holdings-list" style="display:flex;flex-wrap:wrap;gap:8px;"></div>`;
    document.querySelector('.dashboard').appendChild(section);
  }

  const list = document.getElementById('minor-holdings-list');
  list.innerHTML = allMeta.minor_holdings.map(h => `
    <div style="
      background:#fff;border:1px solid #eceff1;border-radius:5px;
      padding:7px 11px;font-size:11px;color:#546e7a;max-width:340px;
      box-shadow:0 1px 3px rgba(0,0,0,.05);">
      <strong style="color:#37474f;display:block;margin-bottom:3px">${h.name}</strong>
      <span style="line-height:1.5">${h.note}</span>
    </div>`).join('');
}

// =====================================================
// SKA/UPP 지분 구조 SVG
// =====================================================
function getSkaSvg() {
  return `
<svg viewBox="0 0 640 340" xmlns="http://www.w3.org/2000/svg"
  style="width:100%;border:1px solid #dde4ec;border-radius:6px;background:#f8fafc;margin:6px 0;font-family:'Malgun Gothic',sans-serif">

  <!-- 상단 제목 -->
  <rect x="8" y="8" width="624" height="22" rx="3" fill="#e3f0fb" stroke="#b0c8e8" stroke-width="1"/>
  <text x="320" y="23" font-size="11" fill="#1565c0" font-weight="bold" text-anchor="middle">SKA/UPP 사업 및 지분 구조 ('26.4 AGIC Exit 후 SK가스 100%)</text>

  <!-- ── SKG 박스 ── -->
  <rect x="40" y="50" width="110" height="44" rx="5" fill="#1565c0" stroke="#0d3c7d" stroke-width="1.5"/>
  <text x="95" y="70" font-size="12" fill="white" font-weight="bold" text-anchor="middle">SK가스</text>
  <text x="95" y="86" font-size="10.5" fill="#bbdefb" text-anchor="middle">70% (PIC 25% 인수 후)</text>

  <!-- ── AGIC 박스 ── -->
  <rect x="360" y="50" width="110" height="44" rx="5" fill="#c62828" stroke="#8b0000" stroke-width="1.5"/>
  <text x="415" y="70" font-size="12" fill="white" font-weight="bold" text-anchor="middle">AGIC</text>
  <text x="415" y="86" font-size="10.5" fill="#ffcdd2" text-anchor="middle">30% → '26.4 Exit</text>

  <!-- PIC 노트 -->
  <rect x="510" y="50" width="120" height="44" rx="5" fill="#e8f5e9" stroke="#388e3c" stroke-width="1"/>
  <text x="570" y="68" font-size="10" fill="#2e7d32" text-anchor="middle">PIC (25%)</text>
  <text x="570" y="82" font-size="10" fill="#2e7d32" text-anchor="middle">'26.2 Exit 완료</text>
  <text x="570" y="93" font-size="9" fill="#81c784" text-anchor="middle">✓</text>

  <!-- SKG → SKA 연결선 -->
  <line x1="95" y1="94" x2="95" y2="128" stroke="#1565c0" stroke-width="2"/>
  <line x1="95" y1="128" x2="240" y2="128" stroke="#1565c0" stroke-width="2"/>
  <line x1="240" y1="128" x2="240" y2="154" stroke="#1565c0" stroke-width="2" marker-end="url(#ah-bl)"/>
  <text x="168" y="122" font-size="9.5" fill="#1565c0" text-anchor="middle">70%</text>

  <!-- AGIC → SKA 연결선 -->
  <line x1="415" y1="94" x2="415" y2="128" stroke="#c62828" stroke-width="2" stroke-dasharray="5,3"/>
  <line x1="415" y1="128" x2="280" y2="128" stroke="#c62828" stroke-width="2" stroke-dasharray="5,3"/>
  <line x1="280" y1="128" x2="280" y2="154" stroke="#c62828" stroke-width="2" stroke-dasharray="5,3" marker-end="url(#ah-rd)"/>
  <text x="352" y="122" font-size="9.5" fill="#c62828" text-anchor="middle">30% (Exit 예정)</text>

  <!-- 화살표 마커 -->
  <defs>
    <marker id="ah-bl" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#1565c0"/>
    </marker>
    <marker id="ah-rd" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#c62828"/>
    </marker>
    <marker id="ah-gr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#37474f"/>
    </marker>
    <marker id="ah-dk" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#455a64"/>
    </marker>
  </defs>

  <!-- ── SKA 박스 ── -->
  <rect x="180" y="154" width="120" height="48" rx="5" fill="#283593" stroke="#1a237e" stroke-width="1.5"/>
  <text x="240" y="176" font-size="13" fill="white" font-weight="bold" text-anchor="middle">SKA</text>
  <text x="240" y="193" font-size="10" fill="#c5cae9" text-anchor="middle">(에스케이어드밴스드)</text>

  <!-- SKA → UPP 연결선 (50%-1주) -->
  <line x1="210" y1="202" x2="150" y2="202" stroke="#455a64" stroke-width="2"/>
  <line x1="150" y1="202" x2="150" y2="248" stroke="#455a64" stroke-width="2" marker-end="url(#ah-dk)"/>
  <text x="110" y="228" font-size="9.5" fill="#455a64" text-anchor="middle">50%-1주</text>

  <!-- PMC → UPP 연결선 (50%+1주) -->
  <line x1="270" y1="202" x2="370" y2="202" stroke="#37474f" stroke-width="2"/>
  <line x1="370" y1="202" x2="370" y2="248" stroke="#37474f" stroke-width="2" marker-end="url(#ah-gr)"/>
  <text x="410" y="228" font-size="9.5" fill="#37474f" text-anchor="middle">50%+1주</text>

  <!-- ── UPP 박스 ── -->
  <rect x="80" y="248" width="140" height="44" rx="5" fill="#455a64" stroke="#263238" stroke-width="1.5"/>
  <text x="150" y="268" font-size="12" fill="white" font-weight="bold" text-anchor="middle">UPP (울산피피)</text>
  <text x="150" y="284" font-size="9.5" fill="#b0bec5" text-anchor="middle">울산 PP 플랜트 운영</text>

  <!-- ── PMC 박스 ── -->
  <rect x="300" y="248" width="150" height="44" rx="5" fill="#37474f" stroke="#263238" stroke-width="1.5"/>
  <text x="375" y="268" font-size="12" fill="white" font-weight="bold" text-anchor="middle">PMC (폴리미래)</text>
  <text x="375" y="284" font-size="9.5" fill="#b0bec5" text-anchor="middle">DL케미칼 50% / LYB 50%</text>

  <!-- 범례 -->
  <rect x="8" y="306" width="624" height="26" rx="3" fill="#ecf3fb" stroke="#b0c8e8" stroke-width="1"/>
  <line x1="18" y1="319" x2="40" y2="319" stroke="#1565c0" stroke-width="2"/>
  <text x="45" y="323" font-size="9.5" fill="#333">실선: 현재 지배구조</text>
  <line x1="140" y1="319" x2="162" y2="319" stroke="#c62828" stroke-width="2" stroke-dasharray="4,2"/>
  <text x="167" y="323" font-size="9.5" fill="#333">점선: Exit 예정 (AGIC '26.4)</text>
  <rect x="330" y="313" width="10" height="10" rx="2" fill="#e8f5e9" stroke="#388e3c"/>
  <text x="344" y="323" font-size="9.5" fill="#333">PIC: '26.2 Exit 완료</text>
</svg>`;
}

// =====================================================
// KD ECOHUB 배관망 SVG
// =====================================================
function getKdEcohubSvg() {
  // Legend colors: green=SK가스, red=KD ECOHUB, gray=수요처
  return `
<svg viewBox="0 0 700 470" xmlns="http://www.w3.org/2000/svg"
  style="min-width:600px;width:100%;border:1px solid #dde4ec;border-radius:6px;background:#f8fafc;margin:10px 0 4px;font-family:'Malgun Gothic',sans-serif">
  <defs>
    <marker id="ah-g" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#2e7d32"/>
    </marker>
    <marker id="ah-r" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#c62828"/>
    </marker>
    <marker id="ah-k" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#78909c"/>
    </marker>
    <marker id="ah-o" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#e65100"/>
    </marker>
  </defs>

  <!-- ── 범례 ── -->
  <rect x="8" y="8" width="684" height="30" rx="4" fill="#ecf3fb" stroke="#b0c8e8" stroke-width="1"/>
  <line x1="18" y1="23" x2="46" y2="23" stroke="#2e7d32" stroke-width="2.5" marker-end="url(#ah-g)"/>
  <text x="51" y="27" font-size="10" fill="#333">SK가스 소유</text>
  <line x1="128" y1="23" x2="156" y2="23" stroke="#c62828" stroke-width="2.5" marker-end="url(#ah-r)"/>
  <text x="161" y="27" font-size="10" fill="#333">KD ECOHUB 소유</text>
  <line x1="264" y1="23" x2="292" y2="23" stroke="#78909c" stroke-width="2.5" marker-end="url(#ah-k)"/>
  <text x="297" y="27" font-size="10" fill="#333">수요처 소유</text>
  <text x="395" y="27" font-size="10" fill="#546e7a">
    C3=프로필렌 · NG=천연가스 · C4=부탄 · H2=수소
  </text>

  <!-- ══════════════ 노드 ══════════════ -->

  <!-- 울산기지 (central hub) -->
  <rect x="285" y="48" width="90" height="30" rx="5" fill="#1565c0" stroke="#0d3c7d" stroke-width="1.5"/>
  <text x="330" y="68" font-size="11.5" fill="white" text-anchor="middle" font-weight="bold">울산기지</text>

  <!-- SK에너지 -->
  <rect x="160" y="48" width="78" height="30" rx="5" fill="#c62828" stroke="#8b0000" stroke-width="1.5"/>
  <text x="199" y="68" font-size="10.5" fill="white" text-anchor="middle">SK에너지</text>

  <!-- G/S -->
  <rect x="14" y="100" width="38" height="26" rx="4" fill="#455a64" stroke="#263238" stroke-width="1.5"/>
  <text x="33" y="118" font-size="10" fill="white" text-anchor="middle">G/S</text>

  <!-- UGPS -->
  <rect x="60" y="100" width="52" height="26" rx="4" fill="#455a64" stroke="#263238" stroke-width="1.5"/>
  <text x="86" y="118" font-size="10" fill="white" text-anchor="middle">UGPS</text>

  <!-- SKE 자체배관 -->
  <rect x="155" y="100" width="84" height="26" rx="4" fill="#ffcdd2" stroke="#c62828" stroke-width="1"/>
  <text x="197" y="118" font-size="9.5" fill="#b71c1c" text-anchor="middle">SKE 자체배관</text>

  <!-- SKMU -->
  <rect x="218" y="162" width="62" height="28" rx="5" fill="#1565c0" stroke="#0d3c7d" stroke-width="1.5"/>
  <text x="249" y="181" font-size="11.5" fill="white" text-anchor="middle" font-weight="bold">SKMU</text>

  <!-- CEC -->
  <rect x="390" y="200" width="58" height="28" rx="5" fill="#1565c0" stroke="#0d3c7d" stroke-width="1.5"/>
  <text x="419" y="219" font-size="11.5" fill="white" text-anchor="middle" font-weight="bold">CEC</text>

  <!-- KET -->
  <rect x="296" y="285" width="62" height="28" rx="5" fill="#1565c0" stroke="#0d3c7d" stroke-width="1.5"/>
  <text x="327" y="304" font-size="11.5" fill="white" text-anchor="middle" font-weight="bold">KET</text>

  <!-- 27번 교차로 -->
  <rect x="435" y="140" width="74" height="24" rx="4" fill="#e8f5e9" stroke="#388e3c" stroke-width="1"/>
  <text x="472" y="156" font-size="9.5" fill="#2e7d32" text-anchor="middle">27번 교차로</text>

  <!-- C4 유휴부지 -->
  <rect x="556" y="140" width="76" height="24" rx="4" fill="#fff3e0" stroke="#e65100" stroke-width="1"/>
  <text x="594" y="156" font-size="9.5" fill="#bf360c" text-anchor="middle">C4 유휴부지</text>

  <!-- 동서발전 -->
  <rect x="570" y="200" width="72" height="28" rx="4" fill="#e8eaf6" stroke="#3949ab" stroke-width="1"/>
  <text x="606" y="219" font-size="10" fill="#283593" text-anchor="middle">동서발전</text>

  <!-- KOGAS 울산G/S -->
  <rect x="550" y="285" width="86" height="28" rx="4" fill="#e8eaf6" stroke="#3949ab" stroke-width="1"/>
  <text x="593" y="298" font-size="9" fill="#283593" text-anchor="middle">KOGAS</text>
  <text x="593" y="310" font-size="9" fill="#283593" text-anchor="middle">울산G/S</text>

  <!-- S-OIL -->
  <rect x="14" y="195" width="50" height="26" rx="4" fill="#ffe0b2" stroke="#e65100" stroke-width="1"/>
  <text x="39" y="213" font-size="10" fill="#bf360c" text-anchor="middle">S-OIL</text>

  <!-- 고려아연 -->
  <rect x="74" y="195" width="60" height="26" rx="4" fill="#ffe0b2" stroke="#e65100" stroke-width="1"/>
  <text x="104" y="213" font-size="10" fill="#bf360c" text-anchor="middle">고려아연</text>

  <!-- 고려마덴TP -->
  <rect x="14" y="260" width="76" height="24" rx="4" fill="#f3e5f5" stroke="#7b1fa2" stroke-width="1"/>
  <text x="52" y="276" font-size="9.5" fill="#4a148c" text-anchor="middle">고려마덴TP</text>

  <!-- H2 공급 예정 -->
  <rect x="610" y="100" width="76" height="30" rx="4" fill="#fff9c4" stroke="#f9a825" stroke-width="1"/>
  <text x="648" y="116" font-size="9" fill="#e65100" text-anchor="middle">H2(부생수소)</text>
  <text x="648" y="127" font-size="8.5" fill="#888" text-anchor="middle">SKA→에너루트</text>

  <!-- ══════════════ 배관 연결 ══════════════ -->

  <!-- SK에너지→울산기지 (C3, SK가스소유 green) -->
  <line x1="238" y1="63" x2="285" y2="63" stroke="#2e7d32" stroke-width="2" marker-end="url(#ah-g)"/>
  <text x="258" y="58" font-size="8" fill="#2e7d32">C3①</text>

  <!-- 울산기지→SKMU (C3, SK가스→KD배관) -->
  <line x1="320" y1="78" x2="270" y2="162" stroke="#c62828" stroke-width="2" marker-end="url(#ah-r)"/>
  <text x="286" y="126" font-size="8" fill="#c62828">C3②</text>

  <!-- SKE자체배관→SKMU -->
  <line x1="197" y1="126" x2="240" y2="162" stroke="#c62828" stroke-width="1.5" stroke-dasharray="4,2" marker-end="url(#ah-r)"/>
  <text x="208" y="150" font-size="8" fill="#c62828">③NG</text>

  <!-- 울산기지→CEC (NG, KD ECOHUB소유) -->
  <line x1="375" y1="75" x2="419" y2="200" stroke="#c62828" stroke-width="2" marker-end="url(#ah-r)"/>
  <text x="404" y="140" font-size="8" fill="#c62828">④NG</text>

  <!-- CEC→SKMU (NG) -->
  <line x1="390" y1="210" x2="280" y2="175" stroke="#c62828" stroke-width="1.5" marker-end="url(#ah-r)"/>
  <text x="330" y="186" font-size="8" fill="#c62828">④NG</text>

  <!-- SKMU→KET -->
  <line x1="249" y1="190" x2="310" y2="285" stroke="#c62828" stroke-width="1.5" marker-end="url(#ah-r)"/>

  <!-- CEC→KET -->
  <line x1="419" y1="228" x2="358" y2="285" stroke="#c62828" stroke-width="1.5" marker-end="url(#ah-r)"/>

  <!-- KET→UGPS (⑥NG, KD ECOHUB) -->
  <path d="M310,299 Q180,260 112,126" stroke="#c62828" stroke-width="2" fill="none" marker-end="url(#ah-r)"/>
  <text x="175" y="250" font-size="8" fill="#c62828">⑥⑦NG</text>

  <!-- GPS정압소→고려마덴TP (⑤NG, KD ECOHUB) -->
  <line x1="327" y1="313" x2="90" y2="260" stroke="#c62828" stroke-width="1.5" stroke-dasharray="none" marker-end="url(#ah-r)"/>
  <text x="175" y="288" font-size="8" fill="#c62828">⑤NG→고려마덴</text>

  <!-- KET→동서발전 (⑧NG, 이관예정 점선) -->
  <line x1="358" y1="299" x2="570" y2="214" stroke="#c62828" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#ah-r)"/>
  <text x="468" y="248" font-size="8" fill="#888">⑧NG(이관예정)</text>

  <!-- KET→KOGAS울산G/S (⑨NG) -->
  <line x1="358" y1="305" x2="550" y2="299" stroke="#c62828" stroke-width="1.5" marker-end="url(#ah-r)"/>
  <text x="442" y="295" font-size="8" fill="#c62828">⑨NG</text>

  <!-- 울산기지→27번교차로 (C4, SK가스) -->
  <line x1="375" y1="63" x2="435" y2="152" stroke="#2e7d32" stroke-width="2" marker-end="url(#ah-g)"/>
  <text x="418" y="107" font-size="8" fill="#2e7d32">C4⑩</text>

  <!-- 27번교차로→C4유휴부지 -->
  <line x1="509" y1="152" x2="556" y2="152" stroke="#2e7d32" stroke-width="1.5" marker-end="url(#ah-g)"/>
  <text x="527" y="148" font-size="8" fill="#2e7d32">C4</text>

  <!-- H2→동서발전 (⑪, 점선 예정) -->
  <line x1="648" y1="130" x2="642" y2="200" stroke="#f9a825" stroke-width="1.5" stroke-dasharray="4,2" marker-end="url(#ah-o)"/>
  <text x="652" y="168" font-size="8" fill="#e65100">⑪H2</text>

  <!-- G/S·UGPS←울산기지 연결 -->
  <path d="M330,78 Q120,90 112,100" stroke="#2e7d32" stroke-width="1.5" fill="none" marker-end="url(#ah-g)"/>

  <!-- S-OIL / 고려아연 공급 (수요처 소유 gray) -->
  <line x1="64" y1="195" x2="64" y2="126" stroke="#78909c" stroke-width="1.5" stroke-dasharray="3,2" marker-end="url(#ah-k)"/>
  <line x1="104" y1="195" x2="104" y2="126" stroke="#78909c" stroke-width="1.5" stroke-dasharray="3,2" marker-end="url(#ah-k)"/>

  <!-- ══════════════ 배관 설명 ══════════════ -->
  <rect x="8" y="335" width="684" height="126" rx="5" fill="#f0f4f8" stroke="#d0dce8" stroke-width="1"/>
  <text x="18" y="352" font-size="10" fill="#37474f" font-weight="700">배관 설명</text>
  <text x="18" y="368" font-size="9" fill="#546e7a">① C3 하역배관: CEC → 울산기지</text>
  <text x="18" y="381" font-size="9" fill="#546e7a">② C3 SKMU 공급: KET/CEC 열조합</text>
  <text x="18" y="394" font-size="9" fill="#546e7a">③ NG SKE 도외자 배관 (직도입 천연가스 공급)</text>
  <text x="18" y="407" font-size="9" fill="#546e7a">④ NG CEC → SKMU 공급배관</text>
  <text x="18" y="420" font-size="9" fill="#546e7a">⑤ NG GPS정압소 → 고려마덴TP 공급배관</text>
  <text x="18" y="433" font-size="9" fill="#546e7a">⑥⑦ NG KET → UGPS 공급배관 (전이 구간 포함)</text>
  <text x="355" y="368" font-size="9" fill="#546e7a">⑧ NG 동서발전 공급 → 동서발전 이관 예정</text>
  <text x="355" y="381" font-size="9" fill="#546e7a">⑨ NG KOGAS 주배관 인입용 배관</text>
  <text x="355" y="394" font-size="9" fill="#546e7a">⑩ C4 공급배관</text>
  <text x="355" y="407" font-size="9" fill="#546e7a">⑪ H2 SKA → 동서발전 부생수소 공급 → 에너루트 이관 예정</text>
  <text x="355" y="425" font-size="8.5" fill="#90a4ae" font-style="italic">※ CEC TP 확인 / 동서발전 연결배관 확인 진행 중</text>
  <text x="355" y="438" font-size="8.5" fill="#90a4ae" font-style="italic">※ O&M: 울산 북항 LNG터미널~산업단지 배관망 유지관리</text>
</svg>`;
}

// =====================================================
// 필터 + 검색
// =====================================================
function applyAndRender() {
  let result = allCompanies;

  if (activeFilter === '보유') {
    result = result.filter(c => c.strategy === '보유');
  } else if (activeFilter === 'Exit') {
    result = result.filter(c => c.strategy === 'Exit');
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const matched = new Set(result.filter(c => c.name.toLowerCase().includes(q)).map(c => c.id));
    matched.forEach(id => {
      const c = allCompanies.find(x => x.id === id);
      if (c?.parent_id) matched.add(c.parent_id);
      allCompanies.filter(x => x.parent_id === id).forEach(x => matched.add(x.id));
    });
    result = result.filter(c => matched.has(c.id));
  }

  renderSectors(result);
}

// =====================================================
// 상세 패널
// =====================================================
const SECTOR_COLORS = Object.fromEntries(SECTORS.map(s => [s.key, s.color]));

function openPanel(id) {
  const c = allCompanies.find(x => x.id === id);
  if (!c) return;

  const color  = SECTOR_COLORS[c.sector] || '#333';
  const parent = c.parent_id ? allCompanies.find(x => x.id === c.parent_id) : null;

  // Exit 관련 행
  const exitRows = c.strategy === 'Exit' ? `
    <tr><th>Exit 목표 시점</th><td>${c.exit_target_year || '-'}</td></tr>
    <tr><th>Exit 현황</th><td>${c.exit_status || '-'}</td></tr>
    ${c.exit_pending_reason ? `<tr><th>미실행 사유</th><td>${c.exit_pending_reason}</td></tr>` : ''}
  ` : '';

  // 테이블 행: 선택적으로 표시
  const parentRow = parent
    ? `<tr><th>상위 회사</th><td>${parent.name}</td></tr>`
    : '';
  const investedRow = (c.invested_amount !== null && c.invested_amount !== undefined)
    ? `<tr><th>기 투자금</th><td>${fmt(c.invested_amount)}</td></tr>`
    : '';
  const locationRow = c.location
    ? `<tr><th>소재지</th><td>${c.location}</td></tr>`
    : '';
  const websiteRow = c.website
    ? `<tr><th>홈페이지</th><td><a href="${c.website}" target="_blank" rel="noopener noreferrer" style="color:#1565c0;word-break:break-all">${c.website}</a></td></tr>`
    : '';

  // 지분 구조 섹션
  const equityStructureHtml = c.equity_structure ? `
    <p class="panel-section-title">지분 구조</p>
    <div class="panel-description" style="white-space:pre-line;font-size:13px">${c.equity_structure}</div>
  ` : '';

  // BOD 현황 섹션 (배열 형식)
  const bodHtml = (c.bod && c.bod.length > 0) ? `
    <p class="panel-section-title">BOD 현황</p>
    <table class="panel-table">
      ${c.bod.map(b => `<tr><th style="width:110px">${b.role}</th><td>${b.name}</td></tr>`).join('')}
    </table>
  ` : (c.bod_participation ? `
    <p class="panel-section-title">BOD 구성</p>
    <div class="panel-description">${c.bod_participation}</div>
  ` : '');

  // 텍스트 섹션
  const exitPlanHtml = c.exit_plan ? `
    <p class="panel-section-title">Exit Plan</p>
    <div class="panel-description">${c.exit_plan}</div>
  ` : '';

  const descriptionHtml = c.description ? `
    <p class="panel-section-title">사업 개요</p>
    <div class="panel-description">${c.description}</div>
  ` : '';

  const issuesHtml = c.recent_issues ? `
    <p class="panel-section-title">최근 이슈</p>
    <div class="panel-issues">${c.recent_issues}</div>
  ` : '';

  // KD ECOHUB 배관망 SVG (가로 스크롤 가능 컨테이너)
  const pipelineHtml = c.id === 'kd-ecohub' ? `
    <p class="panel-section-title">배관망 현황</p>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -4px;padding-bottom:4px">
      ${getKdEcohubSvg()}
    </div>
  ` : '';

  // SKA 지분 구조 SVG
  const skaStructureHtml = c.id === 'sk-advanced' ? `
    <p class="panel-section-title">지분 구조 (SKA/UPP)</p>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -4px;padding-bottom:4px">
      ${getSkaSvg()}
    </div>
  ` : '';

  document.getElementById('panel-content').innerHTML = `
    <span class="panel-sector-badge" style="background:${color}">${c.sector}</span>
    <div class="panel-company-name">${c.name}</div>
    <div class="panel-type">${c.type}${parent ? ' · ' + parent.name + ' 산하' : ''}</div>
    <hr class="panel-divider">
    <table class="panel-table">
      <tr><th>지분율</th><td>${fmtRatio(c.equity_ratio)}</td></tr>
      <tr><th>장부가</th><td>${fmt(c.book_value)}</td></tr>
      ${investedRow}
      <tr><th>투자 시점</th><td>${c.investment_date || '-'}</td></tr>
      ${locationRow}
      ${websiteRow}
      ${parentRow}
      <tr><th>P/F 전략</th><td>${c.strategy}</td></tr>
      <tr><th>Rebalancing</th><td>${c.rebalancing_target ? 'Y' : 'N'}</td></tr>
      ${exitRows}
    </table>
    ${skaStructureHtml}
    ${c.id !== 'sk-advanced' ? equityStructureHtml : ''}
    ${bodHtml}
    ${descriptionHtml}
    ${exitPlanHtml}
    ${pipelineHtml}
    ${issuesHtml}
    <p class="panel-updated">최종 업데이트: ${c.last_updated || '-'}</p>
  `;

  document.getElementById('detail-panel').classList.add('active');
  document.getElementById('panel-overlay').classList.add('active');
}

function closePanel() {
  document.getElementById('detail-panel').classList.remove('active');
  document.getElementById('panel-overlay').classList.remove('active');
}

// =====================================================
// 이벤트 리스너
// =====================================================
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    applyAndRender();
  });
});

document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  applyAndRender();
});

document.getElementById('panel-close').addEventListener('click', closePanel);
document.getElementById('panel-overlay').addEventListener('click', closePanel);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

// =====================================================
// 초기화
// =====================================================
async function init() {
  try {
    const res  = await fetch('data/portfolio.json');
    const data = await res.json();
    allCompanies = data.companies;
    allMeta      = data.meta;
    applyAndRender();
    renderMinorHoldings();
  } catch (e) {
    document.getElementById('sector-grid').innerHTML =
      '<p style="color:red;padding:20px">데이터를 불러올 수 없습니다. 로컬 서버로 실행해주세요.<br><code>python -m http.server 8080</code></p>';
  }
}

init();
