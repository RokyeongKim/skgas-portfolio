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
// 렌더링
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
    // parent가 같은 섹터에 없는 자회사 (parent가 다른 섹터)
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
    // 검색어에 매칭된 회사 + 그 자회사 + 그 부모 포함
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

  const exitRows = c.strategy === 'Exit' ? `
    <tr><th>Exit 목표 시점</th><td>${c.exit_target_year || '-'}</td></tr>
    <tr><th>Exit 현황</th><td>${c.exit_status || '-'}</td></tr>
    ${c.exit_pending_reason ? `<tr><th>미실행 사유</th><td>${c.exit_pending_reason}</td></tr>` : ''}
  ` : '';

  const issuesHtml = c.recent_issues ? `
    <p class="panel-section-title">최근 이슈</p>
    <div class="panel-issues">${c.recent_issues}</div>
  ` : '';

  const parentRow = parent
    ? `<tr><th>상위 회사</th><td>${parent.name}</td></tr>`
    : '';

  document.getElementById('panel-content').innerHTML = `
    <span class="panel-sector-badge" style="background:${color}">${c.sector}</span>
    <div class="panel-company-name">${c.name}</div>
    <div class="panel-type">${c.type}${parent ? ' · ' + parent.name + ' 산하' : ''}</div>
    <hr class="panel-divider">
    <table class="panel-table">
      <tr><th>지분율</th><td>${fmtRatio(c.equity_ratio)}</td></tr>
      <tr><th>장부가</th><td>${fmt(c.book_value)}</td></tr>
      <tr><th>투자 시점</th><td>${c.investment_date || '-'}</td></tr>
      ${parentRow}
      <tr><th>P/F 전략</th><td>${c.strategy}</td></tr>
      <tr><th>Rebalancing</th><td>${c.rebalancing_target ? 'Y' : 'N'}</td></tr>
      ${exitRows}
    </table>
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
    applyAndRender();
  } catch (e) {
    document.getElementById('sector-grid').innerHTML =
      '<p style="color:red;padding:20px">데이터를 불러올 수 없습니다. 로컬 서버로 실행해주세요.<br><code>python -m http.server 8080</code></p>';
  }
}

init();
