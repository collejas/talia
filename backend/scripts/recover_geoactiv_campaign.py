"""Recover the authorized November 10 campaign using existing application builders."""
import asyncio
import json
from uuid import UUID
from dotenv import load_dotenv

load_dotenv('.env')

from app.repositories.crm import CRMRepository
from app.api.routes.crm import (
    _build_contact_envios_entries, _split_recontact_blocked_prospectos,
    _attach_suppressions_to_prospectos, _build_suppression_channel_map,
)

ORG = UUID('cc0b0c64-ef9c-4dbd-bf6a-faeb401922b8')
KEEP = UUID('4f8d1ddb-02cd-42f5-aa5e-824501da7757')
DUP = UUID('b60061e6-b2ed-42d4-b4e1-b0971213ea5c')

async def main():
    repo = CRMRepository()
    batch = await repo.worker_get_contact_batch(batch_id=KEEP)
    duplicate = await repo.worker_get_contact_batch(batch_id=DUP)
    assert batch and duplicate
    assert batch['organizacion_id'] == duplicate['organizacion_id'] == str(ORG)
    assert batch['filtros'] == duplicate['filtros']
    for table in ('prospeccion_contacto_envio', 'prospeccion_postmark_campaign_targets', 'prospeccion_postmark_campaign_preparation_jobs'):
        response = await repo._request('GET', '/rest/v1/' + table, params={
            'organizacion_id': f'eq.{ORG}', 'batch_id': f'in.({KEEP},{DUP})', 'select': 'id', 'limit': '1'})
        assert not response.json(), f'existing records in {table}; reconciliation required'
    assert batch['estado'] == duplicate['estado'] == 'pendiente'
    ids = batch['filtros']['prospecto_ids']
    prospects = []
    suppressions = []
    for start in range(0, len(ids), 100):
        chunk = ids[start:start+100]
        response = await repo._request('GET', '/rest/v1/prospeccion_prospectos', params={
            'organizacion_id': f'eq.{ORG}', 'id': 'in.(' + ','.join(chunk) + ')', 'limit': '100'})
        prospects.extend(response.json())
        suppressions.extend(await repo.worker_list_active_contact_suppressions_for_prospectos(
            organizacion_id=ORG, prospecto_ids=[UUID(x) for x in chunk], canal='correo'))
    assert len(prospects) == len(ids)
    by_id = {p['id']: p for p in prospects}
    prospects, blocked = _split_recontact_blocked_prospectos([by_id[x] for x in ids])
    prospects = _attach_suppressions_to_prospectos(prospects, _build_suppression_channel_map(suppressions))
    meta = batch['metadata']
    entries, omitted = _build_contact_envios_entries(
        batch_id=KEEP, prospectos=prospects, canales=meta['canales_config'],
        programacion=batch['programacion'], separacion_segundos=meta.get('separacion_segundos'),
        envios_por_lote=batch.get('envios_por_lote'),
        intervalo_entre_lotes_segundos=batch.get('intervalo_entre_lotes_segundos'), postmark_email_batch=True)
    targets = [{**e, 'ordinal': n, 'numero_lote': e.get('numero_lote') or 1} for n, e in enumerate(entries)]
    assert targets and all(e['canal'] == 'correo' for e in targets)
    await repo._request('PATCH', '/rest/v1/prospeccion_contacto_batch', params={
        'organizacion_id': f'eq.{ORG}', 'id': f'eq.{DUP}', 'estado': 'eq.pendiente'},
        json={'estado': 'cancelado'})
    job = await repo.enqueue_postmark_campaign_preparation(organizacion_id=ORG, batch_id=KEEP, entries=targets)
    print(json.dumps({'batch_id': str(KEEP), 'job_id': job['id'], 'targets': len(targets), 'blocked': len(blocked), 'omitted': omitted, 'duplicate_cancelled': str(DUP)}))

asyncio.run(main())
