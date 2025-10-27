import { $, ensureSession, fetchJSONWithAuth } from './common.js';
import { setupLeadsMap } from './leads_map.js';

async function loadKpis() {
  const rangeSel = $('dashboard-range');
  const rango = rangeSel ? (rangeSel.value || '7d') : '7d';
  const r = await fetchJSONWithAuth(`/api/kpis?rango=${encodeURIComponent(rango)}&breakdown=1`);
  if (r.ok && r.json && r.json.ok) {
    const d = r.json;
    $('kpi-conv').textContent = String(d.conversaciones_hoy ?? '0');
    $('kpi-contacts').textContent = String(d.contactos_nuevos ?? '0');
    $('kpi-channels').textContent = String(d.canales_activos ?? '0');
    $('kpi-webchat-visitas').textContent = String(d.visitas_webchat ?? '0');
    $('kpi-webchat-chats').textContent = String(d.conversaciones_webchat ?? '0');
    $('kpi-webchat-conversion').textContent = formatPercent(d.conversion_webchat);
    $('kpi-dialogos-gen').textContent = String(d.dialogos_generados ?? '0');
    $('kpi-dialogos-sr').textContent = String(d.dialogos_sin_replica ?? '0');
    $('kpi-lapso-medio').textContent = formatSeconds(d.lapso_medio_replica);
    $('kpi-lapso-max').textContent = formatSeconds(d.lapso_mayor_replica);
  } else {
    // fallback visual
    for (const id of [
      'kpi-conv','kpi-contacts','kpi-channels','kpi-webchat-visitas','kpi-webchat-chats','kpi-webchat-conversion','kpi-dialogos-gen','kpi-dialogos-sr','kpi-lapso-medio','kpi-lapso-max'
    ]) { const el = $(id); if (el) el.textContent = '—'; }
  }
}

function formatSeconds(s) {
  if (s == null || Number.isNaN(Number(s))) return '—';
  const sec = Math.max(0, Math.floor(Number(s)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  if (h > 0) return `${h}h ${m}m ${ss}s`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const pct = Math.max(0, Math.min(1, Number(value))) * 100;
  if (pct >= 100) return '100%';
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

async function main() {
  await ensureSession();
  await loadKpis();
  const rangeSel = $('dashboard-range');
  if (rangeSel) rangeSel.addEventListener('change', () => void loadKpis());
  setupLeadsMap();
}

void main();
