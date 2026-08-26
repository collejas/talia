"""Repositorio server-side para operaciones globales (cross-tenant) en Supabase."""

from __future__ import annotations

from typing import Any, Literal, Sequence
from uuid import UUID

import httpx

from app.core.config import settings


class PlatformRepositoryError(RuntimeError):
    """Errores al interactuar con Supabase para tareas de plataforma."""


class PlatformRepository:
    """Cliente ligero contra Supabase REST usando service role (server-side)."""

    def __init__(self, *, timeout: float = 10.0) -> None:
        if not settings.supabase_url or not settings.supabase_service_role:
            raise PlatformRepositoryError("Supabase no está configurado (SUPABASE_URL/SERVICE_ROLE)")
        self._base_url = settings.supabase_url.rstrip("/")
        self._service_role = settings.supabase_service_role
        self._timeout = timeout

    async def auth_get_user(self, *, user_token: str) -> dict[str, Any]:
        """Valida el JWT y devuelve el payload del usuario desde Supabase Auth."""
        url = f"{self._base_url}/auth/v1/user"
        headers = {
            "apikey": self._service_role,
            "Authorization": f"Bearer {user_token}",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url, headers=headers)
        except httpx.RequestError as exc:  # pragma: no cover
            raise PlatformRepositoryError(f"auth_user_network_error:{exc}") from exc
        if resp.status_code >= 400:
            raise PlatformRepositoryError(f"auth_user_invalid:{resp.status_code}:{resp.text}")
        data = resp.json()
        if not isinstance(data, dict):
            raise PlatformRepositoryError("auth_user_invalid_response")
        return data

    async def is_platform_admin(self, *, user_id: UUID) -> bool:
        params = {
            "select": "user_id",
            "user_id": f"eq.{user_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/platform_admins", params=params)
        return isinstance(data, list) and len(data) > 0

    async def list_organizaciones(self) -> list[dict[str, Any]]:
        params = {
            "select": "id,nombre,nombre_comercial,eslogan_empresa,razon_social,rfc,pais,pais_codigo_iso2,estado,estado_clave_entidad,ciudad,municipio_clave_entidad,municipio_clave_municipio,dominio_principal,telefono,correo_contacto_principal,correo_facturacion,contacto_nombre,contacto_apellidos,contacto_telefono,tipo_persona_fiscal,timezone,idioma,moneda,logo_url,direccion_fiscal,direccion_fiscal_calle,direccion_fiscal_numero_exterior,direccion_fiscal_numero_interior,direccion_fiscal_colonia,direccion_fiscal_localidad,direccion_fiscal_referencia,codigo_postal,regimen_fiscal,estado_onboarding,activo,config,fecha_alta",
            "order": "fecha_alta.desc",
        }
        data = await self._rest("GET", "/rest/v1/organizaciones", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("organizaciones_invalid_response")
        return data

    async def list_geo_paises(self, *, limit: int = 250) -> list[dict[str, Any]]:
        params = {
            "select": "codigo_iso2,nombre,nombre_largo",
            "activo": "eq.true",
            "order": "nombre.asc",
            "limit": str(max(1, min(limit, 300))),
        }
        data = await self._rest("GET", "/rest/v1/geo_paises", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("geo_paises_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def get_geo_pais(self, *, codigo_iso2: str) -> dict[str, Any] | None:
        code = str(codigo_iso2 or "").strip().upper()
        if len(code) != 2:
            return None
        data = await self._rest(
            "GET",
            "/rest/v1/geo_paises",
            params={
                "select": "codigo_iso2,nombre,nombre_largo",
                "codigo_iso2": f"eq.{code}",
                "activo": "eq.true",
                "limit": "1",
            },
        )
        if not isinstance(data, list) or not data:
            return None
        return data[0] if isinstance(data[0], dict) else None

    async def list_tenant_billing_accounts(self) -> list[dict[str, Any]]:
        params = {
            "select": "id,tenant_id,plan_id,billing_provider,stripe_customer_id,stripe_subscription_id,stripe_price_id,billing_status,access_status,trial_ends_at,current_period_start,current_period_end,grace_until,cancel_at_period_end,activated_at,deactivated_at,last_stripe_event_id,contract_duration_months,selected_installment_count,upfront_payment_intent_id,contract_started_at,contract_ends_at,license_price_id,license_starts_at,license_status,created_at,updated_at",
            "order": "updated_at.desc",
        }
        data = await self._rest("GET", "/rest/v1/tenant_billing_accounts", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("tenant_billing_accounts_invalid_response")
        return data

    async def get_tenant_billing_account(self, *, tenant_id: UUID) -> dict[str, Any] | None:
        params = {
            "select": "id,tenant_id,plan_id,billing_provider,stripe_customer_id,stripe_subscription_id,stripe_price_id,billing_status,access_status,trial_ends_at,current_period_start,current_period_end,grace_until,cancel_at_period_end,activated_at,deactivated_at,last_stripe_event_id,contract_duration_months,selected_installment_count,upfront_payment_intent_id,contract_started_at,contract_ends_at,license_price_id,license_starts_at,license_status,created_at,updated_at",
            "tenant_id": f"eq.{tenant_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/tenant_billing_accounts", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError("tenant_billing_account_invalid_response")
        return row

    async def get_tenant_billing_account_by_stripe_customer(
        self, *, stripe_customer_id: str
    ) -> dict[str, Any] | None:
        params = {
            "select": "id,tenant_id,plan_id,billing_provider,stripe_customer_id,stripe_subscription_id,stripe_price_id,billing_status,access_status,trial_ends_at,current_period_start,current_period_end,grace_until,cancel_at_period_end,activated_at,deactivated_at,last_stripe_event_id,contract_duration_months,selected_installment_count,upfront_payment_intent_id,contract_started_at,contract_ends_at,license_price_id,license_starts_at,license_status,created_at,updated_at",
            "stripe_customer_id": f"eq.{stripe_customer_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/tenant_billing_accounts", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError("tenant_billing_account_invalid_response")
        return row

    async def get_tenant_billing_account_by_stripe_subscription(
        self, *, stripe_subscription_id: str
    ) -> dict[str, Any] | None:
        params = {
            "select": "id,tenant_id,plan_id,billing_provider,stripe_customer_id,stripe_subscription_id,stripe_price_id,billing_status,access_status,trial_ends_at,current_period_start,current_period_end,grace_until,cancel_at_period_end,activated_at,deactivated_at,last_stripe_event_id,contract_duration_months,selected_installment_count,upfront_payment_intent_id,contract_started_at,contract_ends_at,license_price_id,license_starts_at,license_status,created_at,updated_at",
            "stripe_subscription_id": f"eq.{stripe_subscription_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/tenant_billing_accounts", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError("tenant_billing_account_invalid_response")
        return row

    async def list_commercial_plans(self) -> list[dict[str, Any]]:
        params = {
            "select": "id,code,name,description,active,sort_order,contract_duration_months,max_installment_count,pricing_model,created_at,updated_at",
            "order": "active.desc,sort_order.asc,name.asc",
        }
        data = await self._rest("GET", "/rest/v1/commercial_plans", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("commercial_plans_invalid_response")
        return data

    async def get_commercial_plan(self, *, plan_id: UUID) -> dict[str, Any] | None:
        params = {
            "select": "id,code,name,description,active,sort_order,contract_duration_months,max_installment_count,pricing_model,created_at,updated_at",
            "id": f"eq.{plan_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/commercial_plans", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError("commercial_plan_invalid_response")
        return row

    async def get_commercial_plan_price_by_provider_price_id(
        self, *, provider_price_id: str
    ) -> dict[str, Any] | None:
        params = {
            "select": "id,plan_id,billing_provider,provider_product_id,provider_price_id,currency,billing_interval,amount_cents,active,created_at,updated_at",
            "provider_price_id": f"eq.{provider_price_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/commercial_plan_prices", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError("commercial_plan_price_invalid_response")
        return row

    async def get_commercial_plan_price(self, *, price_id: UUID) -> dict[str, Any] | None:
        params = {
            "select": "id,plan_id,billing_provider,provider_product_id,provider_price_id,currency,billing_interval,amount_cents,active,created_at,updated_at",
            "id": f"eq.{price_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/commercial_plan_prices", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError("commercial_plan_price_invalid_response")
        return row

    async def update_commercial_license_price(
        self, *, price_id: UUID, payload: dict[str, Any]
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/commercial_license_prices",
            params={"id": f"eq.{price_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_license_price_update_failed")
        return data[0]

    async def create_commercial_plan(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/commercial_plans",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_create_failed")
        return data[0]

    async def update_commercial_plan(
        self,
        *,
        plan_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/commercial_plans",
            params={"id": f"eq.{plan_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_update_failed")
        return data[0]

    async def archive_commercial_plan(self, *, plan_id: UUID) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/commercial_plans",
            params={"id": f"eq.{plan_id}"},
            json={"active": False},
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_archive_failed")
        return data[0]

    async def list_commercial_plan_prices(self) -> list[dict[str, Any]]:
        params = {
            "select": "id,plan_id,billing_provider,provider_product_id,provider_price_id,currency,billing_interval,amount_cents,active,created_at,updated_at",
            "order": "active.desc,amount_cents.asc,created_at.asc",
        }
        data = await self._rest("GET", "/rest/v1/commercial_plan_prices", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("commercial_plan_prices_invalid_response")
        return data

    async def list_commercial_license_prices(self) -> list[dict[str, Any]]:
        params = {
            "select": "id,code,name,billing_provider,provider_product_id,provider_price_id,currency,billing_interval,amount_cents,active,created_at,updated_at",
            "order": "active.desc,code.asc",
        }
        data = await self._rest("GET", "/rest/v1/commercial_license_prices", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("commercial_license_prices_invalid_response")
        return data

    async def get_active_commercial_license_price(self) -> dict[str, Any] | None:
        params = {
            "select": "id,code,name,billing_provider,provider_product_id,provider_price_id,currency,billing_interval,amount_cents,active,created_at,updated_at",
            "active": "eq.true",
            "billing_interval": "eq.month",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/commercial_license_prices", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError("commercial_license_price_invalid_response")
        return row

    async def create_commercial_plan_price(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/commercial_plan_prices",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_price_create_failed")
        return data[0]

    async def update_commercial_plan_price(
        self,
        *,
        price_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/commercial_plan_prices",
            params={"id": f"eq.{price_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_price_update_failed")
        return data[0]

    async def archive_commercial_plan_price(self, *, price_id: UUID) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/commercial_plan_prices",
            params={"id": f"eq.{price_id}"},
            json={"active": False},
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_price_archive_failed")
        return data[0]

    async def list_commercial_plan_entitlements(self) -> list[dict[str, Any]]:
        params = {
            "select": "id,plan_id,entitlement_key,value_type,enabled,limit_value,value_text,value_json,limit_unit,scope,created_at",
            "order": "plan_id.asc,entitlement_key.asc",
        }
        data = await self._rest("GET", "/rest/v1/commercial_plan_entitlements", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("commercial_plan_entitlements_invalid_response")
        return data

    async def create_commercial_plan_entitlement(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/commercial_plan_entitlements",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_entitlement_create_failed")
        return data[0]

    async def update_commercial_plan_entitlement(
        self,
        *,
        entitlement_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/commercial_plan_entitlements",
            params={"id": f"eq.{entitlement_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_entitlement_update_failed")
        return data[0]

    async def archive_commercial_plan_entitlement(self, *, entitlement_id: UUID) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/commercial_plan_entitlements",
            params={"id": f"eq.{entitlement_id}"},
            json={"enabled": False},
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_entitlement_archive_failed")
        return data[0]

    async def set_prospeccion_plan_limits(
        self,
        *,
        actor_id: UUID,
        plan_id: UUID,
        credits_month: int,
        denue_raw_results_month: int,
    ) -> None:
        await self._rest(
            "POST",
            "/rest/v1/rpc/admin_set_prospeccion_plan_limits",
            json={
                "p_actor_id": str(actor_id),
                "p_plan_id": str(plan_id),
                "p_credits_month": credits_month,
                "p_denue_raw_results_month": denue_raw_results_month,
            },
        )

    async def set_tenant_prospeccion_limits(
        self,
        *,
        actor_id: UUID,
        tenant_id: UUID,
        required_contact_mode: str,
        credits_month_override: int | None,
        denue_raw_results_month_override: int | None,
        reason: str | None,
    ) -> None:
        await self._rest(
            "POST",
            "/rest/v1/rpc/admin_set_tenant_prospeccion_limits",
            json={
                "p_actor_id": str(actor_id),
                "p_tenant_id": str(tenant_id),
                "p_required_contact_mode": required_contact_mode,
                "p_credits_month_override": credits_month_override,
                "p_denue_raw_results_month_override": denue_raw_results_month_override,
                "p_reason": reason,
            },
        )

    async def get_tenant_prospeccion_settings(self, *, tenant_id: UUID) -> dict[str, Any]:
        billing = await self.get_tenant_billing_account(tenant_id=tenant_id)
        if billing is None:
            raise PlatformRepositoryError("prospeccion_plan_not_configured")

        plan_id = UUID(str(billing["plan_id"]))
        plan = await self.get_commercial_plan(plan_id=plan_id)
        if plan is None:
            raise PlatformRepositoryError("commercial_plan_not_found")

        keys = (
            "limit.prospeccion.credits_month",
            "limit.prospeccion.denue_raw_results_month",
        )
        entitlements = await self._rest(
            "GET",
            "/rest/v1/commercial_plan_entitlements",
            params={
                "select": "entitlement_key,limit_value,enabled",
                "plan_id": f"eq.{plan_id}",
                "entitlement_key": f"in.({','.join(keys)})",
            },
        )
        overrides = await self._rest(
            "GET",
            "/rest/v1/tenant_plan_overrides",
            params={
                "select": "override_key,override_value,reason,starts_at",
                "tenant_id": f"eq.{tenant_id}",
                "override_key": f"in.({','.join(keys)})",
                "ends_at": "is.null",
                "order": "starts_at.desc",
            },
        )
        policies = await self._rest(
            "GET",
            "/rest/v1/tenant_prospeccion_policies",
            params={
                "select": "required_contact_mode,effective_from,updated_at",
                "tenant_id": f"eq.{tenant_id}",
                "limit": "1",
            },
        )
        periods = await self._rest(
            "GET",
            "/rest/v1/tenant_prospeccion_usage_periods",
            params={
                "select": "period_start,period_end,credits_limit,credits_consumed,raw_results_limit,raw_results_consumed",
                "tenant_id": f"eq.{tenant_id}",
                "period_start": "lte.now()",
                "period_end": "gt.now()",
                "limit": "1",
            },
        )
        for name, value in (
            ("prospeccion_entitlements", entitlements),
            ("prospeccion_overrides", overrides),
            ("prospeccion_policies", policies),
            ("prospeccion_periods", periods),
        ):
            if not isinstance(value, list):
                raise PlatformRepositoryError(f"{name}_invalid_response")

        return {
            "billing": billing,
            "plan": plan,
            "entitlements": entitlements,
            "overrides": overrides,
            "policy": policies[0] if policies else None,
            "period": periods[0] if periods else None,
        }

    async def list_prospeccion_template_ai_prompt_configs(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        data = await self._rest(
            "GET",
            "/rest/v1/prospeccion_plantilla_ai_prompt_config",
            params={
                "select": "organizacion_id,canal,prompt_id,prompt_version,activo,actualizado_por,actualizado_en",
                "organizacion_id": f"eq.{organizacion_id}",
                "order": "canal.asc",
            },
        )
        if not isinstance(data, list):
            raise PlatformRepositoryError("prospeccion_template_ai_prompt_configs_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def upsert_prospeccion_template_ai_prompt_config(
        self,
        *,
        organizacion_id: UUID,
        canal: str,
        prompt_id: str,
        prompt_version: str,
        activo: bool,
        actualizado_por: UUID,
    ) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/prospeccion_plantilla_ai_prompt_config",
            params={"on_conflict": "organizacion_id,canal"},
            json={
                "organizacion_id": str(organizacion_id),
                "canal": canal,
                "prompt_id": prompt_id,
                "prompt_version": prompt_version,
                "activo": activo,
                "actualizado_por": str(actualizado_por),
            },
            prefer="resolution=merge-duplicates,return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("prospeccion_template_ai_prompt_config_upsert_failed")
        return data[0]

    async def list_prospeccion_template_ai_variables(self, *, canal: str) -> list[dict[str, Any]]:
        data = await self._rest(
            "GET",
            "/rest/v1/prospeccion_plantilla_ai_variable_canales",
            params={
                "select": (
                    "id,canal,permite_asunto,permite_cuerpo_texto,permite_cuerpo_html,"
                    "permite_header_media,activo,variable:prospeccion_plantilla_ai_variables!inner("
                    "id,clave,etiqueta,descripcion,tipo_dato,activo,orden)"
                ),
                "canal": f"eq.{canal}",
                "activo": "eq.true",
                "variable.activo": "eq.true",
                "order": "variable(orden).asc",
            },
        )
        if not isinstance(data, list):
            raise PlatformRepositoryError("prospeccion_template_ai_variables_invalid_response")
        return [row for row in data if isinstance(row, dict)]

    async def list_prospeccion_template_ai_layouts(
        self,
        *,
        canal: str,
        organizacion_id: UUID,
    ) -> list[dict[str, Any]]:
        layouts = await self._rest(
            "GET",
            "/rest/v1/prospeccion_plantilla_ai_layouts",
            params={
                "select": "id,organizacion_id,codigo,nombre,descripcion,instrucciones_composicion,canal,activo,orden,habilitado,predeterminado,actualizado_por,creado_en,actualizado_en",
                "canal": f"eq.{canal}",
                "organizacion_id": f"eq.{organizacion_id}",
                "order": "orden.asc",
            },
        )
        if not isinstance(layouts, list):
            raise PlatformRepositoryError("prospeccion_template_ai_layouts_invalid_response")
        return [row for row in layouts if isinstance(row, dict)]

    async def clear_prospeccion_template_ai_layout_defaults(self, *, organizacion_id: UUID) -> None:
        await self._rest(
            "PATCH",
            "/rest/v1/prospeccion_plantilla_ai_layouts",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "canal": "eq.correo",
                "predeterminado": "eq.true",
            },
            json={"predeterminado": False},
            prefer="return=minimal",
        )

    async def create_prospeccion_template_ai_layout(
        self,
        *,
        organizacion_id: UUID,
        codigo: str,
        nombre: str,
        descripcion: str,
        instrucciones_composicion: str,
        canal: str,
        orden: int,
        habilitado: bool,
        predeterminado: bool,
        actualizado_por: UUID,
    ) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/prospeccion_plantilla_ai_layouts",
            json={
                "organizacion_id": str(organizacion_id),
                "codigo": codigo,
                "nombre": nombre,
                "descripcion": descripcion,
                "instrucciones_composicion": instrucciones_composicion,
                "canal": canal,
                "orden": orden,
                "habilitado": habilitado,
                "predeterminado": predeterminado,
                "actualizado_por": str(actualizado_por),
            },
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("prospeccion_template_ai_layout_create_failed")
        return data[0]

    async def update_prospeccion_template_ai_layout(
        self,
        *,
        organizacion_id: UUID,
        layout_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        data = await self._rest(
            "PATCH",
            "/rest/v1/prospeccion_plantilla_ai_layouts",
            params={"id": f"eq.{layout_id}", "organizacion_id": f"eq.{organizacion_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return None
        return data[0]

    async def delete_prospeccion_template_ai_layout(self, *, organizacion_id: UUID, layout_id: UUID) -> bool:
        data = await self._rest(
            "DELETE",
            "/rest/v1/prospeccion_plantilla_ai_layouts",
            params={"id": f"eq.{layout_id}", "organizacion_id": f"eq.{organizacion_id}"},
            prefer="return=representation",
        )
        return isinstance(data, list) and bool(data)

    async def create_prospeccion_template_ai_generation(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/prospeccion_plantilla_ai_generaciones",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("prospeccion_template_ai_generation_create_failed")
        return data[0]

    async def create_prospeccion_template_ai_generation_variables(
        self,
        *,
        rows: list[dict[str, Any]],
    ) -> None:
        if not rows:
            return
        await self._rest(
            "POST",
            "/rest/v1/prospeccion_plantilla_ai_generacion_variables",
            json=rows,
            prefer="return=minimal",
        )

    async def update_prospeccion_template_ai_generation(
        self,
        *,
        organizacion_id: UUID,
        generation_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        data = await self._rest(
            "PATCH",
            "/rest/v1/prospeccion_plantilla_ai_generaciones",
            params={
                "id": f"eq.{generation_id}",
                "organizacion_id": f"eq.{organizacion_id}",
            },
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return None
        return data[0]

    async def update_prospeccion_template_ai_generation_variables(
        self,
        *,
        organizacion_id: UUID,
        generation_id: UUID,
        used_variables: list[str],
        variable_ids: dict[str, UUID],
    ) -> None:
        for clave, variable_id in variable_ids.items():
            await self._rest(
                "PATCH",
                "/rest/v1/prospeccion_plantilla_ai_generacion_variables",
                params={
                    "organizacion_id": f"eq.{organizacion_id}",
                    "generacion_id": f"eq.{generation_id}",
                    "variable_id": f"eq.{variable_id}",
                },
                json={"utilizada_por_modelo": clave in used_variables},
                prefer="return=minimal",
            )

    async def get_openai_usage_by_response_id(self, *, organizacion_id: UUID, response_id: str) -> dict[str, Any] | None:
        data = await self._rest(
            "GET",
            "/rest/v1/openai_request_usage",
            params={
                "select": "id,estimated_total_cost_usd,input_tokens,output_tokens,total_tokens",
                "organizacion_id": f"eq.{organizacion_id}",
                "openai_response_id": f"eq.{response_id}",
                "limit": "1",
            },
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return None
        return data[0]

    async def list_commercial_plan_defaults(self) -> list[dict[str, Any]]:
        params = {
            "select": "id,plan_id,default_key,default_value,scope,created_at",
            "order": "plan_id.asc,default_key.asc",
        }
        data = await self._rest("GET", "/rest/v1/commercial_plan_defaults", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("commercial_plan_defaults_invalid_response")
        return data

    async def create_commercial_plan_default(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/commercial_plan_defaults",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_default_create_failed")
        return data[0]

    async def update_commercial_plan_default(
        self,
        *,
        default_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/commercial_plan_defaults",
            params={"id": f"eq.{default_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("commercial_plan_default_update_failed")
        return data[0]

    async def delete_commercial_plan_default(self, *, default_id: UUID) -> None:
        await self._rest(
            "DELETE",
            "/rest/v1/commercial_plan_defaults",
            params={"id": f"eq.{default_id}"},
        )

    async def create_tenant_billing_account(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/tenant_billing_accounts",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("tenant_billing_account_create_failed")
        return data[0]

    async def update_tenant_billing_account(
        self,
        *,
        tenant_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/tenant_billing_accounts",
            params={"tenant_id": f"eq.{tenant_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("tenant_billing_account_update_failed")
        return data[0]

    async def delete_tenant_billing_account(self, *, tenant_id: UUID) -> None:
        await self._rest(
            "DELETE",
            "/rest/v1/tenant_billing_accounts",
            params={"tenant_id": f"eq.{tenant_id}"},
        )

    async def get_tenant_billing_event_by_stripe_event_id(
        self, *, stripe_event_id: str
    ) -> dict[str, Any] | None:
        params = {
            "select": "id,tenant_id,stripe_event_id,stripe_event_type,stripe_customer_id,stripe_subscription_id,event_created_at,processed_at,processing_error,created_at",
            "stripe_event_id": f"eq.{stripe_event_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/tenant_billing_events", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError("tenant_billing_event_invalid_response")
        return row

    async def list_tenant_billing_events(self, *, limit: int = 100) -> list[dict[str, Any]]:
        params = {
            "select": "id,tenant_id,stripe_event_id,stripe_event_type,stripe_customer_id,stripe_subscription_id,event_created_at,processed_at,processing_error,created_at",
            "order": "created_at.desc",
            "limit": str(limit),
        }
        data = await self._rest("GET", "/rest/v1/tenant_billing_events", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("tenant_billing_events_invalid_response")
        return data

    async def upsert_tenant_billing_event(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/tenant_billing_events",
            params={"on_conflict": "stripe_event_id"},
            json=payload,
            prefer="return=representation,resolution=merge-duplicates",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("tenant_billing_event_upsert_failed")
        return data[0]

    async def mark_tenant_billing_event_processed(
        self,
        *,
        stripe_event_id: str,
        processed_at: str,
    ) -> None:
        await self._rest(
            "PATCH",
            "/rest/v1/tenant_billing_events",
            params={"stripe_event_id": f"eq.{stripe_event_id}"},
            json={"processed_at": processed_at, "processing_error": None},
        )

    async def mark_tenant_billing_event_failed(
        self,
        *,
        stripe_event_id: str,
        processing_error: str,
    ) -> None:
        await self._rest(
            "PATCH",
            "/rest/v1/tenant_billing_events",
            params={"stripe_event_id": f"eq.{stripe_event_id}"},
            json={"processing_error": processing_error},
        )

    async def create_tenant_access_invitation(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/tenant_access_invitations",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("tenant_access_invitation_create_failed")
        return data[0]

    async def get_tenant_access_invitation_by_token_hash(
        self, *, token_hash: str
    ) -> dict[str, Any] | None:
        params = {
            "select": "id,tenant_id,email,flow_kind,status,verification_token_hash,verification_sent_at,verified_at,invited_at,invited_user_id,last_error,created_at,updated_at",
            "verification_token_hash": f"eq.{token_hash}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/tenant_access_invitations", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError("tenant_access_invitation_invalid_response")
        return row

    async def get_latest_tenant_access_invitation(
        self,
        *,
        tenant_id: UUID,
        flow_kind: str | None = None,
    ) -> dict[str, Any] | None:
        params: dict[str, Any] = {
            "select": "id,tenant_id,email,flow_kind,status,verification_token_hash,verification_sent_at,expires_at,verified_at,invited_at,invited_user_id,last_error,created_at,updated_at",
            "tenant_id": f"eq.{tenant_id}",
            "order": "created_at.desc",
            "limit": "1",
        }
        if flow_kind:
            params["flow_kind"] = f"eq.{flow_kind}"
        data = await self._rest("GET", "/rest/v1/tenant_access_invitations", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError("tenant_access_invitation_invalid_response")
        return row

    async def update_tenant_access_invitation(
        self,
        *,
        invitation_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/tenant_access_invitations",
            params={"id": f"eq.{invitation_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("tenant_access_invitation_update_failed")
        return data[0]

    async def create_tenant_provisioning_job(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/tenant_provisioning_jobs",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("tenant_provisioning_job_create_failed")
        return data[0]

    async def update_tenant_provisioning_job(
        self,
        *,
        job_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/tenant_provisioning_jobs",
            params={"id": f"eq.{job_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("tenant_provisioning_job_update_failed")
        return data[0]

    async def list_roles(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "id,nombre,codigo,descripcion",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        data = await self._rest("GET", "/rest/v1/roles", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("roles_invalid_response")
        return data

    async def list_permissions(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "id,codigo,descripcion",
            "organizacion_id": f"eq.{organizacion_id}",
        }
        data = await self._rest("GET", "/rest/v1/permisos", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("permisos_invalid_response")
        return data

    async def list_role_permissions(self, *, organizacion_id: UUID, rol_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "rol_id,permiso_id",
            "organizacion_id": f"eq.{organizacion_id}",
            "rol_id": f"eq.{rol_id}",
        }
        data = await self._rest("GET", "/rest/v1/roles_permisos", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("roles_permisos_invalid_response")
        return data

    async def delete_role_permission(
        self, *, organizacion_id: UUID, rol_id: UUID, permiso_id: UUID
    ) -> None:
        await self._rest(
            "DELETE",
            "/rest/v1/roles_permisos",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "rol_id": f"eq.{rol_id}",
                "permiso_id": f"eq.{permiso_id}",
            },
        )

    async def create_organizacion(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/organizaciones",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("organizacion_create_failed")
        return data[0]

    async def get_quote_template(
        self,
        *,
        slug: str,
        organizacion_id: UUID,
    ) -> dict[str, Any] | None:
        params = {
            "slug": f"eq.{slug}",
            "organizacion_id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/quote_templates", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError(
                f"Respuesta inválida al obtener template de cotización: {row!r}"
            )
        return row

    async def upsert_quote_template(
        self,
        *,
        slug: str,
        organizacion_id: UUID,
        payload: dict[str, Any],
        updated_by: UUID | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "slug": slug,
            "organizacion_id": str(organizacion_id),
            **payload,
        }
        if updated_by:
            body["updated_by"] = str(updated_by)
        data = await self._rest(
            "POST",
            "/rest/v1/quote_templates",
            params={"on_conflict": "slug,organizacion_id"},
            json=body,
            prefer="return=representation,resolution=merge-duplicates",
        )
        if not isinstance(data, list) or not data:
            raise PlatformRepositoryError("Supabase no devolvió el template de cotización actualizado")
        row = data[0]
        if not isinstance(row, dict):
            raise PlatformRepositoryError(
                f"Respuesta inválida al actualizar template de cotización: {row!r}"
            )
        return row

    async def delete_organizacion(self, *, organizacion_id: UUID) -> None:
        await self._rest(
            "DELETE",
            "/rest/v1/organizaciones",
            params={"id": f"eq.{organizacion_id}"},
        )

    async def list_channel_routes(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "id,organizacion_id,canal,clave,metadata,activo,creado_en,actualizado_en",
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "creado_en.desc",
        }
        data = await self._rest("GET", "/rest/v1/organizacion_rutas_canal", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("routes_invalid_response")
        return data

    async def create_channel_route(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/organizacion_rutas_canal",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("route_create_failed")
        return data[0]

    async def create_calendar_resource(
        self,
        *,
        organizacion_id: UUID,
        name: str,
        slug: str | None = None,
        timezone: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "name": name,
            "metadata": metadata or {},
        }
        if slug:
            payload["slug"] = slug
        if timezone:
            payload["timezone"] = timezone
        data = await self._rest(
            "POST",
            "/rest/v1/calendar_resources",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("calendar_resource_create_failed")
        return data[0]

    async def list_pipeline_stages(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "id,organizacion_id,codigo,nombre,orden,probabilidad,categoria,metadata,creado_en,actualizado_en",
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "orden.asc",
        }
        data = await self._rest("GET", "/rest/v1/etapas_pipeline", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("pipeline_stages_invalid_response")
        return data

    async def create_pipeline_stage(
        self,
        *,
        organizacion_id: UUID,
        codigo: str,
        nombre: str,
        orden: int,
        probabilidad: float | None = None,
        categoria: str = "abierta",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "codigo": codigo,
            "nombre": nombre,
            "orden": int(orden),
            "categoria": categoria,
            "metadata": metadata or {},
        }
        if probabilidad is not None:
            payload["probabilidad"] = probabilidad
        data = await self._rest(
            "POST",
            "/rest/v1/etapas_pipeline",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("pipeline_stage_create_failed")
        return data[0]

    async def delete_channel_route(self, *, organizacion_id: UUID, route_id: UUID) -> None:
        await self._rest(
            "DELETE",
            "/rest/v1/organizacion_rutas_canal",
            params={"organizacion_id": f"eq.{organizacion_id}", "id": f"eq.{route_id}"},
        )

    async def get_organizacion_config(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        params = {
            "select": "id,config",
            "id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/organizaciones", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        config = row.get("config")
        return config if isinstance(config, dict) else ({} if config is None else None)

    async def get_close_lead_policy(
        self, *, organizacion_id: UUID, canal: str
    ) -> dict[str, Any] | None:
        data = await self._rest(
            "GET",
            "/rest/v1/close_lead_policies",
            params={
                "organizacion_id": f"eq.{organizacion_id}",
                "canal": f"eq.{canal}",
                "select": "*",
                "limit": "1",
            },
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return None
        return data[0]

    async def upsert_close_lead_policy(self, *, payload: dict[str, Any]) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/close_lead_policies",
            params={"on_conflict": "organizacion_id,canal"},
            json=payload,
            prefer="resolution=merge-duplicates,return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("close_lead_policy_update_failed")
        return data[0]

    async def set_organizacion_config(
        self, *, organizacion_id: UUID, config: dict[str, Any]
    ) -> dict[str, Any]:
        # Nota: `public.organizaciones` no tiene columna `actualizado_por` (solo `actualizado_en`).
        payload: dict[str, Any] = {"config": config}
        data = await self._rest(
            "PATCH",
            "/rest/v1/organizaciones",
            params={"id": f"eq.{organizacion_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("organizacion_update_failed")
        return data[0]

    async def get_organizacion_details(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        params = {
            "select": "id,nombre,nombre_comercial,eslogan_empresa,razon_social,rfc,pais,pais_codigo_iso2,estado,estado_clave_entidad,ciudad,municipio_clave_entidad,municipio_clave_municipio,dominio_principal,telefono,correo_contacto_principal,correo_facturacion,contacto_nombre,contacto_apellidos,contacto_telefono,tipo_persona_fiscal,timezone,idioma,moneda,logo_url,ia_descripcion_empresa,ia_productos_servicios,ia_publico_objetivo,ia_propuesta_valor,ia_diferenciadores,ia_restricciones_comerciales,ia_color_primario,ia_color_secundario,ia_color_acento,ia_color_fondo,ia_estilo_visual,ia_radio_bordes,direccion_fiscal,direccion_fiscal_calle,direccion_fiscal_numero_exterior,direccion_fiscal_numero_interior,direccion_fiscal_colonia,direccion_fiscal_localidad,direccion_fiscal_referencia,codigo_postal,regimen_fiscal,sitio_web,config,estado_onboarding,activo,fecha_alta,fecha_pausa,fecha_cancelacion",
            "id": f"eq.{organizacion_id}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/organizaciones", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        return row if isinstance(row, dict) else None

    async def update_organizacion_details(
        self, *, organizacion_id: UUID, payload: dict[str, Any]
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/organizaciones",
            params={"id": f"eq.{organizacion_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("organizacion_update_failed")
        return data[0]

    async def get_whatsapp_assistant_schedule(self, *, organizacion_id: UUID) -> dict[str, Any] | None:
        data = await self._rest(
            "GET",
            "/rest/v1/whatsapp_asistente_horarios",
            params={
                "select": (
                    "id,organizacion_id,activo,zona_horaria,aplica_a_normal,aplica_a_prospeccion,"
                    "lunes_activo,lunes_inicio,lunes_fin,"
                    "martes_activo,martes_inicio,martes_fin,"
                    "miercoles_activo,miercoles_inicio,miercoles_fin,"
                    "jueves_activo,jueves_inicio,jueves_fin,"
                    "viernes_activo,viernes_inicio,viernes_fin,"
                    "sabado_activo,sabado_inicio,sabado_fin,"
                    "domingo_activo,domingo_inicio,domingo_fin,"
                    "creado_en,actualizado_en,actualizado_por_usuario_id"
                ),
                "organizacion_id": f"eq.{organizacion_id}",
                "limit": "1",
            },
        )
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        return row if isinstance(row, dict) else None

    async def upsert_whatsapp_assistant_schedule(
        self,
        *,
        organizacion_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        body = {"organizacion_id": str(organizacion_id), **payload}
        data = await self._rest(
            "POST",
            "/rest/v1/whatsapp_asistente_horarios",
            params={"on_conflict": "organizacion_id"},
            json=body,
            prefer="resolution=merge-duplicates,return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("whatsapp_assistant_schedule_upsert_failed")
        return data[0]

    async def list_secret_metadata(self, *, organizacion_id: UUID) -> list[dict[str, Any]]:
        params = {
            "select": "id,organizacion_id,clave,etiqueta,version,creado_por,actualizado_por,creado_en,actualizado_en",
            "organizacion_id": f"eq.{organizacion_id}",
            "order": "actualizado_en.desc",
        }
        data = await self._rest("GET", "/rest/v1/secretos", params=params)
        if not isinstance(data, list):
            raise PlatformRepositoryError("secretos_invalid_response")
        return data

    async def get_secret_row(self, *, organizacion_id: UUID, clave: str) -> dict[str, Any] | None:
        params = {
            "select": "id,organizacion_id,clave,version,etiqueta,nonce,valor_cifrado,creado_en,actualizado_en",
            "organizacion_id": f"eq.{organizacion_id}",
            "clave": f"eq.{clave}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/secretos", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        return row if isinstance(row, dict) else None

    async def upsert_secret(
        self,
        *,
        organizacion_id: UUID,
        clave: str,
        valor_cifrado: str,
        nonce: str,
        etiqueta: str | None,
        version: int,
        updated_by: UUID | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "organizacion_id": str(organizacion_id),
            "clave": clave,
            "valor_cifrado": valor_cifrado,
            "nonce": nonce,
            "etiqueta": etiqueta,
            "version": version,
        }
        if updated_by:
            payload["actualizado_por"] = str(updated_by)
            payload["creado_por"] = str(updated_by)
        data = await self._rest(
            "POST",
            "/rest/v1/secretos",
            params={"on_conflict": "organizacion_id,clave"},
            json=payload,
            prefer="return=representation,resolution=merge-duplicates",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("secret_upsert_failed")
        return data[0]

    async def delete_secret(self, *, organizacion_id: UUID, clave: str) -> None:
        await self._rest(
            "DELETE",
            "/rest/v1/secretos",
            params={"organizacion_id": f"eq.{organizacion_id}", "clave": f"eq.{clave}"},
        )

    async def resolve_org_for_route(self, *, canal: str, clave: str) -> str | None:
        params = {
            "select": "organizacion_id",
            "canal": f"eq.{canal}",
            "clave": f"eq.{clave}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/organizacion_rutas_canal", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        value = row.get("organizacion_id")
        return str(value) if value else None

    async def resolve_org_for_meta_phone_number_id(self, *, phone_number_id: str) -> str | None:
        phone_key = str(phone_number_id or "").strip()
        if not phone_key:
            return None
        params = {
            "select": "id",
            "config->whatsapp->meta->phone_number_id": f"eq.{phone_key}",
            "limit": "1",
        }
        data = await self._rest("GET", "/rest/v1/organizaciones", params=params)
        if not isinstance(data, list) or not data:
            return None
        row = data[0]
        if not isinstance(row, dict):
            return None
        value = row.get("id")
        return str(value) if value else None

    async def create_permissions(
        self, *, organizacion_id: UUID, permisos: Sequence[dict[str, str]]
    ) -> list[dict[str, Any]]:
        if not permisos:
            return []
        payload = []
        for permiso in permisos:
            payload.append(
                {
                    "organizacion_id": str(organizacion_id),
                    "codigo": permiso.get("codigo"),
                    "descripcion": permiso.get("descripcion"),
                }
            )
        data = await self._rest(
            "POST",
            "/rest/v1/permisos",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list):
            raise PlatformRepositoryError("permisos_create_failed")
        return data

    async def create_role(
        self, *, organizacion_id: UUID, nombre: str, descripcion: str | None
    ) -> dict[str, Any]:
        payload = {
            "organizacion_id": str(organizacion_id),
            "nombre": nombre,
            "descripcion": descripcion,
        }
        data = await self._rest(
            "POST",
            "/rest/v1/roles",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("role_create_failed")
        return data[0]

    async def create_role_permission(
        self, *, organizacion_id: UUID, rol_id: UUID, permiso_id: UUID
    ) -> None:
        await self._rest(
            "POST",
            "/rest/v1/roles_permisos",
            params={"on_conflict": "organizacion_id,rol_id,permiso_id"},
            json={
                "organizacion_id": str(organizacion_id),
                "rol_id": str(rol_id),
                "permiso_id": str(permiso_id),
            },
            prefer="resolution=merge-duplicates",
        )

    async def create_department(self, *, organizacion_id: UUID, nombre: str) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/departamentos",
            json={
                "organizacion_id": str(organizacion_id),
                "nombre": nombre,
            },
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("department_create_failed")
        return data[0]

    async def create_position(self, *, organizacion_id: UUID, nombre: str) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/puestos",
            json={
                "organizacion_id": str(organizacion_id),
                "nombre": nombre,
            },
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("position_create_failed")
        return data[0]

    async def list_tenant_bootstrap_catalog(self, *, tipo: Literal["departamento", "puesto"]) -> list[str]:
        data = await self._rest(
            "GET",
            "/rest/v1/tenant_bootstrap_catalog",
            params={
                "select": "nombre",
                "tipo": f"eq.{tipo}",
                "activo": "eq.true",
                "order": "orden.asc,nombre.asc",
                "limit": "500",
            },
        )
        if not isinstance(data, list):
            raise PlatformRepositoryError("tenant_bootstrap_catalog_read_failed")
        names: list[str] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            name = str(row.get("nombre") or "").strip()
            if name:
                names.append(name)
        return names

    async def upsert_usuario(
        self,
        *,
        usuario_id: UUID,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        data = await self._rest(
            "PATCH",
            "/rest/v1/usuarios",
            params={"id": f"eq.{usuario_id}"},
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("usuario_upsert_failed")
        return data[0]

    async def assign_user_role(self, *, usuario_id: UUID, rol_id: UUID, organizacion_id: UUID) -> dict[str, Any]:
        data = await self._rest(
            "POST",
            "/rest/v1/usuarios_roles",
            json={
                "usuario_id": str(usuario_id),
                "rol_id": str(rol_id),
                "organizacion_id": str(organizacion_id),
            },
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("usuario_role_assign_failed")
        return data[0]

    async def create_employee(
        self,
        *,
        usuario_id: UUID,
        departamento_id: UUID | None,
        puesto_id: UUID | None,
        organizacion_id: UUID,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "usuario_id": str(usuario_id),
            "organizacion_id": str(organizacion_id),
        }
        if departamento_id:
            payload["departamento_id"] = str(departamento_id)
        if puesto_id:
            payload["puesto_id"] = str(puesto_id)
        data = await self._rest(
            "POST",
            "/rest/v1/empleados",
            json=payload,
            prefer="return=representation",
        )
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise PlatformRepositoryError("empleado_create_failed")
        return data[0]

    async def _rest(
        self,
        method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"],
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> Any:
        url = f"{self._base_url}{path}"
        headers = {
            "Accept": "application/json",
            "apikey": self._service_role,
            "Authorization": f"Bearer {self._service_role}",
        }
        if prefer:
            headers["Prefer"] = prefer
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.request(method, url, params=params, json=json, headers=headers)
        except httpx.RequestError as exc:  # pragma: no cover
            raise PlatformRepositoryError(f"supabase_network_error:{exc}") from exc
        if resp.status_code >= 400:
            raise PlatformRepositoryError(f"supabase_error:{resp.status_code}:{path}:{resp.text}")
        if resp.status_code == 204:
            return None
        if not resp.text:
            return None
        try:
            return resp.json()
        except json.JSONDecodeError:
            return None
