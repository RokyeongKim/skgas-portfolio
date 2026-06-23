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
function fmtBook(c) {
  if (c.book_value_label) return c.book_value_label;
  return fmt(c.book_value);
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
function renderCrossParentHeader(parent) {
  return `
    <div class="cross-parent-header" onclick="openPanel('${parent.id}')" title="${parent.name} — 클릭하여 상세 보기">
      <span class="cross-parent-name">${parent.name}</span>
      <span class="cross-parent-sub">산하 투자</span>
    </div>`;
}

function renderCard(c, isChild) {
  const cls = isChild ? 'company-card child' : 'company-card';
  return `
    <div class="${cls}" data-id="${c.id}" onclick="openPanel('${c.id}')">
      <div class="card-top">
        ${getIcon(c.type)}
        <span class="card-name">${c.name}</span>
      </div>
      <div class="card-meta">
        <span>${fmtBook(c)} | ${fmtRatio(c.equity_ratio)}</span>
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

    // 다른 섹터에 속한 부모를 가진 고아 카드: 부모별로 그룹화하여 헤더 표시
    const orphansByParent = {};
    orphan.forEach(c => {
      const pid = c.parent_id || '__none__';
      if (!orphansByParent[pid]) orphansByParent[pid] = [];
      orphansByParent[pid].push(c);
    });
    Object.entries(orphansByParent).forEach(([pid, children]) => {
      if (pid !== '__none__') {
        const parentCo = allCompanies.find(x => x.id === pid);
        if (parentCo) html += renderCrossParentHeader(parentCo);
      }
      children.forEach(c => { html += renderCard(c, true); });
    });

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
<svg viewBox="0 0 720 490" xmlns="http://www.w3.org/2000/svg"
  style="width:100%;border:1px solid #dde4ec;border-radius:8px;background:#f8fafc;margin:6px 0;font-family:'Malgun Gothic','맑은 고딕',sans-serif">

  <defs>
    <marker id="ska-bl" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
      <path d="M0,0 L9,4.5 L0,9 Z" fill="#1565c0"/>
    </marker>
    <marker id="ska-gy" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
      <path d="M0,0 L9,4.5 L0,9 Z" fill="#90a4ae"/>
    </marker>
    <marker id="ska-dk" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
      <path d="M0,0 L9,4.5 L0,9 Z" fill="#37474f"/>
    </marker>
    <marker id="ska-re" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
      <path d="M0,0 L9,4.5 L0,9 Z" fill="#c62828"/>
    </marker>
  </defs>

  <!-- ═══ 제목 배너 ═══ -->
  <rect x="0" y="0" width="720" height="36" rx="8" fill="#1565c0"/>
  <rect x="0" y="28" width="720" height="8" fill="#1565c0"/>
  <text x="360" y="23" font-size="13" fill="white" font-weight="bold" text-anchor="middle">SKA / UPP 지분 구조 ('26.4 기준)</text>

  <!-- ═══ EXIT 완료 배지 (AGIC, PIC 박스 위) ═══ -->
  <rect x="26" y="44" width="148" height="20" rx="4" fill="#ffebee" stroke="#ef9a9a" stroke-width="1"/>
  <text x="100" y="58" font-size="10.5" fill="#c62828" text-anchor="middle" font-weight="700">EXIT 완료</text>

  <rect x="376" y="44" width="118" height="20" rx="4" fill="#ffebee" stroke="#ef9a9a" stroke-width="1"/>
  <text x="435" y="58" font-size="10.5" fill="#c62828" text-anchor="middle" font-weight="700">EXIT 완료</text>

  <!-- ═══ AGIC 박스 (회색, 연하게) ═══ -->
  <rect x="26" y="68" width="148" height="62" rx="6" fill="#f5f5f5" stroke="#bdbdbd" stroke-width="1.5"/>
  <text x="100" y="95" font-size="15" fill="#9e9e9e" font-weight="bold" text-anchor="middle">AGIC</text>
  <text x="100" y="114" font-size="11" fill="#bdbdbd" text-anchor="middle">지분 30% | '26.4 Exit</text>

  <!-- ═══ SK가스 박스 (중앙, 파란색) ═══ -->
  <rect x="200" y="44" width="160" height="86" rx="7" fill="#1565c0" stroke="#0d47a1" stroke-width="2.5"/>
  <text x="280" y="78" font-size="18" fill="white" font-weight="bold" text-anchor="middle">SK가스</text>
  <text x="280" y="98" font-size="11" fill="#bbdefb" text-anchor="middle">지분 45% → 현재 100%</text>
  <text x="280" y="117" font-size="10" fill="#bbdefb" text-anchor="middle">지배주주</text>

  <!-- ═══ PIC 박스 (회색, 연하게) ═══ -->
  <rect x="376" y="68" width="118" height="62" rx="6" fill="#f5f5f5" stroke="#bdbdbd" stroke-width="1.5"/>
  <text x="435" y="95" font-size="15" fill="#9e9e9e" font-weight="bold" text-anchor="middle">PIC</text>
  <text x="435" y="114" font-size="11" fill="#bdbdbd" text-anchor="middle">지분 25% | '26.2 Exit</text>

  <!-- ═══ 대림(DL케미칼) 박스 (붉은 테두리) ═══ -->
  <rect x="510" y="44" width="100" height="50" rx="6" fill="#fff8f8" stroke="#c62828" stroke-width="2"/>
  <text x="560" y="68" font-size="12" fill="#c62828" font-weight="700" text-anchor="middle">대림(DL케미칼)</text>
  <text x="560" y="85" font-size="11" fill="#c62828" font-weight="700" text-anchor="middle">50%</text>

  <!-- ═══ LYB(라이언델바젤) 박스 (붉은 테두리) ═══ -->
  <rect x="618" y="44" width="96" height="50" rx="6" fill="#fff8f8" stroke="#c62828" stroke-width="2"/>
  <text x="666" y="63" font-size="11" fill="#c62828" font-weight="700" text-anchor="middle">LYB</text>
  <text x="666" y="78" font-size="10" fill="#c62828" font-weight="600" text-anchor="middle">(라이언델바젤)</text>
  <text x="666" y="91" font-size="11" fill="#c62828" font-weight="700" text-anchor="middle">50%</text>

  <!-- AGIC → SKA 화살표 (회색 점선) -->
  <line x1="100" y1="130" x2="140" y2="195" stroke="#bdbdbd" stroke-width="1.8" stroke-dasharray="5,3" marker-end="url(#ska-gy)"/>

  <!-- SK가스 → SKA 화살표 (파란색) -->
  <line x1="270" y1="130" x2="240" y2="195" stroke="#1565c0" stroke-width="2.8" marker-end="url(#ska-bl)"/>
  <text x="237" y="168" font-size="12" fill="#1565c0" font-weight="700">100%</text>

  <!-- PIC → SKA 화살표 (회색 점선) -->
  <line x1="435" y1="130" x2="340" y2="195" stroke="#bdbdbd" stroke-width="1.8" stroke-dasharray="5,3" marker-end="url(#ska-gy)"/>

  <!-- 대림 → PMC 화살표 (붉은색) -->
  <line x1="560" y1="94" x2="560" y2="210" stroke="#c62828" stroke-width="1.8" marker-end="url(#ska-re)"/>

  <!-- LYB → PMC 화살표 (붉은색) -->
  <line x1="666" y1="94" x2="640" y2="210" stroke="#c62828" stroke-width="1.8" marker-end="url(#ska-re)"/>

  <!-- ═══ SKA 박스 ═══ -->
  <rect x="60" y="195" width="360" height="65" rx="7" fill="#283593" stroke="#1a237e" stroke-width="2.5"/>
  <text x="240" y="224" font-size="15" fill="white" font-weight="bold" text-anchor="middle">에스케이어드밴스드 (SKA)</text>
  <text x="240" y="243" font-size="10" fill="#c5cae9" text-anchor="middle">PDH → 프로필렌 생산 | 울산 | 설립 2014 / 가동 2016~</text>

  <!-- ═══ PMC (폴리미래) 박스 ═══ -->
  <rect x="500" y="210" width="210" height="50" rx="7" fill="#37474f" stroke="#263238" stroke-width="2"/>
  <text x="605" y="232" font-size="12" fill="white" font-weight="bold" text-anchor="middle">PMC (폴리미래)</text>
  <text x="605" y="250" font-size="10" fill="#ef9a9a" text-anchor="middle">대림 50% · LYB(라이언델바젤) 50%</text>

  <!-- SKA → UPP 화살표 (50%-1주) -->
  <line x1="190" y1="260" x2="300" y2="390" stroke="#546e7a" stroke-width="2.5" marker-end="url(#ska-gy)"/>
  <text x="214" y="330" font-size="11" fill="#546e7a" font-weight="600">50%-1주</text>

  <!-- PMC → UPP 화살표 (50%+1주) -->
  <line x1="535" y1="260" x2="425" y2="390" stroke="#37474f" stroke-width="2.5" marker-end="url(#ska-dk)"/>
  <text x="500" y="325" font-size="11" fill="#37474f" font-weight="600">50%+1주</text>

  <!-- ═══ UPP 박스 ═══ -->
  <rect x="255" y="390" width="220" height="58" rx="7" fill="#455a64" stroke="#263238" stroke-width="2.5"/>
  <text x="365" y="417" font-size="15" fill="white" font-weight="bold" text-anchor="middle">UPP (울산PP)</text>
  <text x="365" y="436" font-size="10.5" fill="#b0bec5" text-anchor="middle">울산 PP 플랜트 운영</text>
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
// ATAS 유라시아터널 지분구조 SVG
// =====================================================
function getAtasSvg() {
  return `
<svg viewBox="0 0 760 540" xmlns="http://www.w3.org/2000/svg"
  style="width:100%;border:1px solid #dde4ec;border-radius:8px;background:#f8fafc;margin:6px 0;font-family:'Malgun Gothic','맑은 고딕',sans-serif">

  <defs>
    <marker id="atas-bl" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
      <path d="M0,0 L9,4.5 L0,9 Z" fill="#1565c0"/>
    </marker>
    <marker id="atas-gy" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
      <path d="M0,0 L9,4.5 L0,9 Z" fill="#78909c"/>
    </marker>
    <marker id="atas-re" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
      <path d="M0,0 L9,4.5 L0,9 Z" fill="#c62828"/>
    </marker>
  </defs>

  <!-- 제목 배너 -->
  <rect x="0" y="0" width="760" height="36" rx="8" fill="#37474f"/>
  <rect x="0" y="28" width="760" height="8" fill="#37474f"/>
  <text x="380" y="23" font-size="13" fill="white" font-weight="bold" text-anchor="middle">유라시아 SPC (ATAS) 이해관계자 현황</text>

  <!-- YM 박스 (왼쪽) -->
  <rect x="30" y="60" width="160" height="100" rx="7" fill="#455a64" stroke="#263238" stroke-width="2"/>
  <text x="110" y="88" font-size="13" fill="white" font-weight="bold" text-anchor="middle">YM</text>
  <text x="110" y="106" font-size="10" fill="#cfd8dc" text-anchor="middle">Yapi Merkezi</text>
  <text x="110" y="121" font-size="10" fill="#cfd8dc" text-anchor="middle">튀르키예 3대 건설사</text>
  <text x="110" y="148" font-size="11" fill="#ffcc80" font-weight="bold" text-anchor="middle">50% ($142.5M)</text>

  <!-- ─────────────── SK Holdco 전체 박스 ─────────────── -->
  <rect x="240" y="48" width="500" height="180" rx="8" fill="#1565c0" stroke="#0d47a1" stroke-width="2.5"/>
  <text x="490" y="70" font-size="13" fill="white" font-weight="bold" text-anchor="middle">SK Holdco. (EP/가스/MENA)</text>

  <!-- 보통주 라벨 -->
  <text x="320" y="92" font-size="10.5" fill="#bbdefb" font-weight="bold" text-anchor="middle">보통주 $72.7M</text>
  <!-- SKEP 보통주 박스 -->
  <rect x="258" y="98" width="124" height="56" rx="5" fill="#0d47a1" stroke="#bbdefb" stroke-width="1.5"/>
  <text x="320" y="120" font-size="12" fill="white" text-anchor="middle" font-weight="bold">SKEP</text>
  <text x="320" y="136" font-size="10" fill="#bbdefb" text-anchor="middle">51% / $72.7M</text>
  <text x="320" y="149" font-size="8.5" fill="#90caf9" text-anchor="middle">(보통주)</text>

  <!-- 우선주 라벨 -->
  <text x="565" y="92" font-size="10.5" fill="#ffcc80" font-weight="bold" text-anchor="middle">우선주 $69.8M (= 매각 대상 100%)</text>

  <!-- 우선주 그룹 점선 박스 (매각대상 100%) -->
  <rect x="402" y="98" width="328" height="100" rx="6" fill="rgba(255,235,238,0.08)" stroke="#ff5252" stroke-width="2.5" stroke-dasharray="6,3"/>

  <!-- SKEP 우선주 -->
  <rect x="412" y="115" width="100" height="56" rx="5" fill="#0d47a1" stroke="#bbdefb" stroke-width="1"/>
  <text x="462" y="137" font-size="11" fill="white" text-anchor="middle" font-weight="bold">SKEP</text>
  <text x="462" y="153" font-size="10" fill="#bbdefb" text-anchor="middle">5.5% / $7.8M</text>
  <text x="462" y="166" font-size="8.5" fill="#90caf9" text-anchor="middle">(우선주)</text>

  <!-- SK가스 우선주 -->
  <rect x="520" y="115" width="100" height="56" rx="5" fill="#0d47a1" stroke="#bbdefb" stroke-width="1"/>
  <text x="570" y="137" font-size="11" fill="white" text-anchor="middle" font-weight="bold">SK가스</text>
  <text x="570" y="153" font-size="10" fill="#bbdefb" text-anchor="middle">36.5% / $52M</text>
  <text x="570" y="166" font-size="8.5" fill="#90caf9" text-anchor="middle">(우선주)</text>

  <!-- SK MENA 우선주 -->
  <rect x="628" y="115" width="92" height="56" rx="5" fill="#0d47a1" stroke="#bbdefb" stroke-width="1"/>
  <text x="674" y="137" font-size="11" fill="white" text-anchor="middle" font-weight="bold">SK MENA</text>
  <text x="674" y="153" font-size="10" fill="#bbdefb" text-anchor="middle">7% / $10M</text>
  <text x="674" y="166" font-size="8.5" fill="#90caf9" text-anchor="middle">(우선주)</text>

  <!-- "매각대상" 라벨 -->
  <text x="566" y="190" font-size="10" fill="#ff8a80" text-anchor="middle" font-weight="bold">→ SK Holdco 내 우선주 100% 일괄 매각 대상</text>

  <!-- SK Holdco 50% 합계 -->
  <text x="490" y="219" font-size="12" fill="#ffcc80" font-weight="bold" text-anchor="middle">SK Holdco 합계: 50% ($142.5M)</text>

  <!-- 우선주 의결권 메모 -->
  <rect x="240" y="237" width="500" height="20" rx="3" fill="#e8f5e9"/>
  <text x="490" y="251" font-size="9.5" fill="#2e7d32" text-anchor="middle">※ 우선주는 의결권 없음 | 매각 대상은 SKEP·SK가스·SKMENA 우선주 합계 $69.8M 일괄</text>

  <!-- YM → ATAS 화살표 -->
  <line x1="190" y1="140" x2="280" y2="305" stroke="#78909c" stroke-width="2.5" marker-end="url(#atas-gy)"/>
  <text x="200" y="240" font-size="11" fill="#546e7a" font-weight="600">50%</text>

  <!-- SK Holdco → ATAS 화살표 -->
  <line x1="430" y1="228" x2="400" y2="305" stroke="#1565c0" stroke-width="2.5" marker-end="url(#atas-bl)"/>
  <text x="430" y="280" font-size="11" fill="#1565c0" font-weight="600">50%</text>

  <!-- ATAS 박스 -->
  <rect x="220" y="305" width="240" height="80" rx="7" fill="#283593" stroke="#1a237e" stroke-width="2.5"/>
  <text x="340" y="335" font-size="15" fill="white" font-weight="bold" text-anchor="middle">ATAS (유라시아 JV)</text>
  <text x="340" y="353" font-size="10" fill="#c5cae9" text-anchor="middle">이스탄불 보스포루스 해저터널 운영</text>
  <text x="340" y="370" font-size="10" fill="#9fa8da" text-anchor="middle">CAPEX: $1,245M | '17년 상업개시</text>

  <!-- ATAS Equity/Debt 박스 -->
  <rect x="55" y="305" width="120" height="62" rx="5" fill="#e3f2fd" stroke="#1565c0" stroke-width="1"/>
  <text x="115" y="328" font-size="10" fill="#0d47a1" text-anchor="middle" font-weight="bold">Equity</text>
  <text x="115" y="344" font-size="11" fill="#1565c0" text-anchor="middle" font-weight="bold">23% / $285M</text>
  <text x="115" y="358" font-size="9" fill="#1976d2" text-anchor="middle">YM+SK Holdco</text>

  <rect x="55" y="377" width="120" height="62" rx="5" fill="#fce4ec" stroke="#c62828" stroke-width="1"/>
  <text x="115" y="400" font-size="10" fill="#b71c1c" text-anchor="middle" font-weight="bold">Debt (PF)</text>
  <text x="115" y="416" font-size="11" fill="#c62828" text-anchor="middle" font-weight="bold">77% / $960M</text>
  <text x="115" y="430" font-size="9" fill="#e53935" text-anchor="middle">'25년말 잔액 $4.5억</text>

  <!-- 화살표 -->
  <line x1="175" y1="336" x2="220" y2="336" stroke="#1565c0" stroke-width="1.5" stroke-dasharray="4,2"/>
  <line x1="175" y1="408" x2="220" y2="370" stroke="#c62828" stroke-width="1.5" stroke-dasharray="4,2"/>

  <!-- 대주단 박스 -->
  <rect x="490" y="305" width="250" height="195" rx="7" fill="#f5f5f5" stroke="#90a4ae" stroke-width="1.5"/>
  <text x="615" y="327" font-size="11" fill="#37474f" text-anchor="middle" font-weight="bold">대주단 (10)</text>

  <rect x="500" y="335" width="110" height="72" rx="4" fill="#fff" stroke="#b0bec5" stroke-width="1"/>
  <text x="555" y="353" font-size="10" fill="#546e7a" text-anchor="middle" font-weight="bold">유럽계 (5)</text>
  <text x="555" y="370" font-size="9" fill="#78909c" text-anchor="middle">EIB · EBRD</text>
  <text x="555" y="384" font-size="9" fill="#78909c" text-anchor="middle">터키계 (3)</text>
  <text x="555" y="398" font-size="8.5" fill="#90a4ae" text-anchor="middle">(총 5개)</text>

  <rect x="618" y="335" width="112" height="72" rx="4" fill="#fff" stroke="#b0bec5" stroke-width="1"/>
  <text x="674" y="353" font-size="10" fill="#546e7a" text-anchor="middle" font-weight="bold">아시아계 (5)</text>
  <text x="674" y="370" font-size="9" fill="#78909c" text-anchor="middle">KEXIM · KSURE</text>
  <text x="674" y="384" font-size="9" fill="#78909c" text-anchor="middle">SMBC · Mizuho</text>
  <text x="674" y="398" font-size="9" fill="#78909c" text-anchor="middle">SC</text>

  <rect x="500" y="415" width="230" height="26" rx="4" fill="#e8f5e9" stroke="#81c784" stroke-width="1"/>
  <text x="615" y="432" font-size="9.5" fill="#2e7d32" text-anchor="middle">지정 법무법인: Clifford Chance</text>

  <rect x="500" y="448" width="230" height="42" rx="4" fill="#fff8e1" stroke="#ffca28" stroke-width="1"/>
  <text x="615" y="464" font-size="9.5" fill="#e65100" text-anchor="middle" font-weight="bold">'30년 상반기 PF 상환 완료 예정</text>
  <text x="615" y="478" font-size="9" fill="#bf360c" text-anchor="middle">→ 해당 시점부터 매각 재타진 / 배당 개시</text>

  <line x1="460" y1="336" x2="490" y2="336" stroke="#90a4ae" stroke-width="1.5" stroke-dasharray="3,2" marker-end="url(#atas-gy)"/>

  <!-- 하단 메모 -->
  <text x="380" y="520" font-size="9" fill="#90a4ae" text-anchor="middle" font-style="italic">출처: '22.6월 이사회 보고자료 — 유라시아 SPC(ATAS) 이해관계자 현황</text>
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
    const matchesQuery = (c) => {
      const text = [
        c.name || '',
        c.location || '',
        c.description || '',
        (c.recent_issues || '').replace(/<[^>]+>/g, ''),
        c.equity_structure || '',
        ...(c.bod || []).map(b => b.name + ' ' + b.role),
      ].join(' ').toLowerCase();
      return text.includes(q);
    };
    const directMatches = new Set(result.filter(matchesQuery).map(c => c.id));
    const matched = new Set(directMatches);
    directMatches.forEach(id => {
      const c = allCompanies.find(x => x.id === id);
      // 직접 매칭된 자식 → 부모만 추가 (형제는 추가 안 함)
      if (c?.parent_id) matched.add(c.parent_id);
      // 직접 매칭된 부모 → 자식 추가
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

  // ATAS 유라시아터널 지분구조 SVG
  const atasStructureHtml = c.id === 'sk-holdco' ? `
    <p class="panel-section-title">ATAS 지분구조 (이사회 자료 기준)</p>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -4px;padding-bottom:4px">
      ${getAtasSvg()}
    </div>
  ` : '';

  document.getElementById('panel-content').innerHTML = `
    <span class="panel-sector-badge" style="background:${color}">${c.sector}</span>
    <div class="panel-company-name">${c.name}</div>
    <div class="panel-type">${c.type}${parent ? ' · ' + parent.name + ' 산하' : ''}</div>
    <hr class="panel-divider">
    <table class="panel-table">
      <tr><th>지분율</th><td>${fmtRatio(c.equity_ratio)}</td></tr>
      <tr><th>장부가</th><td>${fmtBook(c)}</td></tr>
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
    ${atasStructureHtml}
    ${c.id !== 'sk-advanced' && c.id !== 'sk-holdco' ? equityStructureHtml : ''}
    ${bodHtml}
    ${descriptionHtml}
    ${exitPlanHtml}
    ${pipelineHtml}
    ${issuesHtml}
    ${c.contact_person ? `<p class="panel-section-title">실무 담당자</p><div class="panel-description">${c.contact_person}</div>` : ''}
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
