const form = document.querySelector('#scanForm');
const input = document.querySelector('#assetInput');
const statusBox = document.querySelector('#status');
const summary = document.querySelector('#summary');
const results = document.querySelector('#results');

function setStatus(text, type = '') {
  statusBox.className = `status ${type}`;
  statusBox.textContent = text;
  statusBox.classList.remove('hidden');
}

function clearUI() {
  summary.classList.add('hidden');
  results.classList.add('hidden');
  summary.innerHTML = '';
  results.innerHTML = '';
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function refCard(ref) {
  return `
    <div class="ref">
      ${ref.thumbnail ? `<img src="${escapeHtml(ref.thumbnail)}" alt="thumb">` : '<div class="noimg">sem imagem</div>'}
      <div>
        <strong>${escapeHtml(ref.property)}</strong>
        <code>${escapeHtml(ref.value)}</code>
        <div class="actions">
          <button data-copy="${escapeHtml(ref.id)}">Copiar ID</button>
          <a target="_blank" rel="noreferrer" href="${escapeHtml(ref.assetUrl)}">Abrir asset</a>
        </div>
      </div>
    </div>
  `;
}

function itemRow(item) {
  const refs = item.refs.length ? item.refs.map(refCard).join('') : '<span class="muted">Sem ID de asset nessa instância</span>';
  return `
    <details class="item" ${item.refs.length ? 'open' : ''}>
      <summary>
        <span class="class">${escapeHtml(item.className)}</span>
        <span>${escapeHtml(item.path)}</span>
      </summary>
      <div class="refs">${refs}</div>
    </details>
  `;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return setStatus('Cole um link ou ID primeiro.', 'error');

  clearUI();
  setStatus('Escaneando o pack... isso pode demorar alguns segundos.');

  try {
    const response = await fetch(`/api/scan?url=${encodeURIComponent(value)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error + (data.help ? `\n${data.help}` : ''));

    statusBox.classList.add('hidden');
    summary.className = 'summary';
    summary.innerHTML = `
      ${data.thumbnail ? `<img src="${escapeHtml(data.thumbnail)}" alt="thumbnail">` : ''}
      <div>
        <h2>${escapeHtml(data.name || 'Asset ' + data.assetId)}</h2>
        <p>Criador: ${escapeHtml(data.creator || 'não encontrado')}</p>
        <p>${data.totalItems} itens no Explorer • ${data.totalAssetRefs} IDs de assets encontrados</p>
      </div>
    `;

    results.className = 'results';
    results.innerHTML = data.items.map(itemRow).join('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  await navigator.clipboard.writeText(button.dataset.copy);
  button.textContent = 'Copiado!';
  setTimeout(() => button.textContent = 'Copiar ID', 900);
});
