"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconListDetails, IconLoader2, IconPlus, IconRefresh, IconSearch, IconTargetArrow, IconX } from "@tabler/icons-react"

import { ProspeccionCampaignWizard } from "@/components/prospeccion/prospeccion-campaign-wizard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createProspeccionLista,
  listProspeccionListas,
  updateProspeccionLista,
  listCrmCampaigns,
  listContactoTemplates,
  listProspectosQueryMetadata,
  type ProspectosQueryMetadataResult,
  type ProspectoFiltroInput,
  type ProspeccionLista,
  type CrmCampaign,
} from "@/lib/prospeccion/prospectos-client"

type FormState = {
  canal: "correo" | "whatsapp" | "llamada" | ""
  nombre: string
  descripcion: string
  fuente: string
  search: string
  segmento: string
  actividades: string
  tipoNegocio: string
  lookupStatus: string
  emailLookupStatus: string
  websiteLookupStatus: string
  emailDomainRelation: string
  carrierType: string
  whatsappPermitido: string
  llamadaPermitida: string
  phonePresent: string
  emailPresent: string
  websitePresent: string
  geoEstado: string
  geoMunicipio: string
  minRating: string
  estratoGroup: string
  stage: string
  conEnvio: string
  conEnvioCanales: string[]
  optOutCanal: string
  optOutWhatsapp: string
  conScraper: string
  campanaId: string
  templateId: string
  metadataQueries: string
  dateFrom: string
  dateTo: string
  enviosPreset: "any" | "never" | "contacted" | "custom"
  enviosMin: string
  enviosMax: string
}

type ProspectosFuente = "google_places" | "denue" | "usuario"

const EMPTY_METADATA: ProspectosQueryMetadataResult = {
  queries: [],
  activities: [],
  segmentos: [],
  tipos_negocio: [],
}

type TaxonomyOption = {
  value: string
  label: string
}

function splitSelectedValues(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean)
}

function TaxonomySelect({
  id,
  value,
  options,
  placeholder,
  emptyMessage,
  onChange,
}: {
  id: string
  value: string
  options: TaxonomyOption[]
  placeholder: string
  emptyMessage: string
  onChange: (value: string) => void
}) {
  const selectedValues = splitSelectedValues(value)
  const optionMap = new Map(options.map((option) => [option.value, option]))
  selectedValues.forEach((selected) => {
    if (!optionMap.has(selected)) optionMap.set(selected, { value: selected, label: selected })
  })
  const availableOptions = Array.from(optionMap.values()).filter((option) => !selectedValues.includes(option.value))

  const addValue = (nextValue: string) => {
    if (!nextValue) return
    onChange([...selectedValues, nextValue].join(", "))
  }

  const removeValue = (removedValue: string) => {
    onChange(selectedValues.filter((selected) => selected !== removedValue).join(", "))
  }

  return (
    <div className="space-y-2">
      <select
        id={id}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
        value=""
        onChange={(event) => addValue(event.target.value)}
        disabled={!availableOptions.length}
      >
        <option value="">{availableOptions.length ? placeholder : emptyMessage}</option>
        {availableOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {selectedValues.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedValues.map((selected) => (
            <span key={selected} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              {optionMap.get(selected)?.label ?? selected}
              <button type="button" className="rounded-full hover:bg-primary/20" onClick={() => removeValue(selected)} aria-label={`Quitar ${selected}`}>
                <IconX className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const EMPTY_FORM: FormState = {
  canal: "",
  nombre: "",
  descripcion: "",
  fuente: "",
  search: "",
  segmento: "",
  actividades: "",
  tipoNegocio: "",
  lookupStatus: "",
  emailLookupStatus: "",
  websiteLookupStatus: "",
  emailDomainRelation: "",
  carrierType: "",
  whatsappPermitido: "",
  llamadaPermitida: "",
  phonePresent: "",
  emailPresent: "",
  websitePresent: "",
  geoEstado: "",
  geoMunicipio: "",
  minRating: "",
  estratoGroup: "",
  stage: "",
  conEnvio: "",
  conEnvioCanales: [],
  optOutCanal: "",
  optOutWhatsapp: "",
  conScraper: "",
  campanaId: "",
  templateId: "",
  metadataQueries: "",
  dateFrom: "",
  dateTo: "",
  enviosPreset: "never",
  enviosMin: "0",
  enviosMax: "0",
}

function envioCountFields(canal: FormState["canal"]): {
  min: "envios_correo_min" | "envios_whatsapp_min" | "envios_voz_min"
  max: "envios_correo_max" | "envios_whatsapp_max" | "envios_voz_max"
} | null {
  if (canal === "correo") return { min: "envios_correo_min", max: "envios_correo_max" }
  if (canal === "whatsapp") return { min: "envios_whatsapp_min", max: "envios_whatsapp_max" }
  if (canal === "llamada") return { min: "envios_voz_min", max: "envios_voz_max" }
  return null
}

function parseListValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseListValues(item))
  }
  if (typeof value !== "string") return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function valuesToText(value: unknown): string {
  return parseListValues(value).join(", ")
}

function inferChannel(filtros: Record<string, unknown>): FormState["canal"] {
  if (filtros.whatsapp_permitido !== undefined || filtros.envios_whatsapp_max !== undefined) return "whatsapp"
  if (filtros.llamada_permitida !== undefined || filtros.envios_voz_max !== undefined) return "llamada"
  if (typeof filtros.email_lookup_status === "string" || filtros.envios_correo_max !== undefined) return "correo"
  return ""
}

function formFromLista(lista?: ProspeccionLista | null): FormState {
  const filtros = lista?.filtros ?? {}
  const canal = lista?.canal ?? inferChannel(filtros)
  const countFields = envioCountFields(canal)
  const minCount = countFields ? filtros[countFields.min] : undefined
  const maxCount = countFields ? filtros[countFields.max] : undefined
  const enviosPreset = minCount === 0 && maxCount === 0 ? "never" : minCount === 1 && maxCount === undefined ? "contacted" : minCount !== undefined || maxCount !== undefined ? "custom" : "any"
  return {
    canal,
    nombre: lista?.nombre ?? "",
    descripcion: lista?.descripcion ?? "",
    fuente: typeof filtros.fuente === "string" ? filtros.fuente : "",
    search: typeof filtros.search === "string" ? filtros.search : "",
    segmento: valuesToText(filtros.segmentos) || (typeof filtros.segmento === "string" ? filtros.segmento : ""),
    actividades: valuesToText(filtros.actividades),
    tipoNegocio: valuesToText(filtros.tipo_negocio),
    lookupStatus: typeof filtros.lookup_status === "string" ? filtros.lookup_status : "",
    emailLookupStatus: typeof filtros.email_lookup_status === "string" ? filtros.email_lookup_status : "",
    websiteLookupStatus: typeof filtros.website_lookup_status === "string" ? filtros.website_lookup_status : "",
    emailDomainRelation: typeof filtros.email_domain_relation === "string" ? filtros.email_domain_relation : "",
    carrierType: typeof filtros.carrier_type === "string" ? filtros.carrier_type : "",
    whatsappPermitido:
      typeof filtros.whatsapp_permitido === "boolean" ? String(filtros.whatsapp_permitido) : "",
    llamadaPermitida: typeof filtros.llamada_permitida === "boolean" ? String(filtros.llamada_permitida) : "",
    phonePresent: typeof filtros.phone_present === "boolean" ? String(filtros.phone_present) : "",
    emailPresent: typeof filtros.email_present === "boolean" ? String(filtros.email_present) : "",
    websitePresent: typeof filtros.website_present === "boolean" ? String(filtros.website_present) : "",
    geoEstado: typeof filtros.geo_estado === "string" ? filtros.geo_estado : "",
    geoMunicipio: typeof filtros.geo_municipio === "string" ? filtros.geo_municipio : "",
    minRating: typeof filtros.min_rating === "number" ? String(filtros.min_rating) : "",
    estratoGroup: typeof filtros.estrato_group === "string" ? filtros.estrato_group : "",
    stage: typeof filtros.stage === "string" ? filtros.stage : "",
    conEnvio: typeof filtros.con_envio === "boolean" ? String(filtros.con_envio) : "",
    conEnvioCanales: parseListValues(filtros.con_envio_canales),
    optOutCanal: typeof filtros.opt_out_canal === "string" ? filtros.opt_out_canal : canal,
    optOutWhatsapp: typeof filtros.opt_out_whatsapp === "boolean" ? String(filtros.opt_out_whatsapp) : "",
    conScraper: typeof filtros.con_scraper === "boolean" ? String(filtros.con_scraper) : "",
    campanaId: typeof filtros.campana_id === "string" ? filtros.campana_id : "",
    templateId: typeof filtros.template_id === "string" ? filtros.template_id : "",
    metadataQueries: valuesToText(filtros.metadata_queries),
    dateFrom: typeof filtros.date_from === "string" ? filtros.date_from : "",
    dateTo: typeof filtros.date_to === "string" ? filtros.date_to : "",
    enviosPreset,
    enviosMin: typeof minCount === "number" ? String(minCount) : "",
    enviosMax: typeof maxCount === "number" ? String(maxCount) : "",
  }
}

function filtersFromForm(form: FormState): ProspectoFiltroInput {
  const filtros: ProspectoFiltroInput = {}
  const splitValues = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean)
  if (form.fuente) filtros.fuente = form.fuente as ProspectoFiltroInput["fuente"]
  if (form.search.trim()) filtros.search = form.search.trim()
  const segmentos = splitValues(form.segmento)
  if (segmentos.length === 1) filtros.segmento = segmentos[0]
  if (segmentos.length > 1) filtros.segmentos = segmentos
  const actividades = splitValues(form.actividades)
  const tipoNegocio = splitValues(form.tipoNegocio)
  const metadataQueries = splitValues(form.metadataQueries)
  if (actividades.length) filtros.actividades = actividades
  if (tipoNegocio.length) filtros.tipo_negocio = tipoNegocio
  if (metadataQueries.length) filtros.metadata_queries = metadataQueries
  if (form.phonePresent) filtros.phone_present = form.phonePresent === "true"
  if (form.emailPresent) filtros.email_present = form.emailPresent === "true"
  if (form.websitePresent) filtros.website_present = form.websitePresent === "true"
  if (form.geoEstado.trim()) filtros.geo_estado = form.geoEstado.trim()
  if (form.geoMunicipio.trim()) filtros.geo_municipio = form.geoMunicipio.trim()
  if (form.minRating) filtros.min_rating = Number(form.minRating)
  if (form.estratoGroup) filtros.estrato_group = form.estratoGroup
  if (form.stage) filtros.stage = form.stage as ProspectoFiltroInput["stage"]
  if (form.conEnvio) filtros.con_envio = form.conEnvio === "true"
  if (form.conEnvioCanales.length) filtros.con_envio_canales = form.conEnvioCanales as ProspectoFiltroInput["con_envio_canales"]
  if (form.canal === "correo" || form.canal === "whatsapp") filtros.opt_out_canal = form.canal
  if (form.optOutWhatsapp) filtros.opt_out_whatsapp = form.optOutWhatsapp === "true"
  if (form.conScraper) filtros.con_scraper = form.conScraper === "true"
  if (form.campanaId.trim()) filtros.campana_id = form.campanaId.trim()
  if (form.templateId.trim()) filtros.template_id = form.templateId.trim()
  if (form.dateFrom) filtros.date_from = form.dateFrom
  if (form.dateTo) filtros.date_to = form.dateTo
  const minCount = form.enviosMin.trim() ? Number.parseInt(form.enviosMin, 10) : undefined
  const maxCount = form.enviosMax.trim() ? Number.parseInt(form.enviosMax, 10) : undefined
  const countFields = envioCountFields(form.canal)
  if (countFields && typeof minCount === "number" && Number.isInteger(minCount) && minCount >= 0) {
    filtros[countFields.min] = minCount
  }
  if (countFields && typeof maxCount === "number" && Number.isInteger(maxCount) && maxCount >= 0) {
    filtros[countFields.max] = maxCount
  }
  if (form.canal === "correo") {
    if (form.emailLookupStatus) filtros.email_lookup_status = form.emailLookupStatus
  }
  if (form.canal === "whatsapp") {
    if (form.lookupStatus) filtros.lookup_status = form.lookupStatus
    if (form.carrierType) filtros.carrier_type = form.carrierType as ProspectoFiltroInput["carrier_type"]
    if (form.whatsappPermitido) filtros.whatsapp_permitido = form.whatsappPermitido === "true"
  }
  if (form.canal === "llamada") {
    if (form.lookupStatus) filtros.lookup_status = form.lookupStatus
    if (form.carrierType) filtros.carrier_type = form.carrierType as ProspectoFiltroInput["carrier_type"]
    if (form.llamadaPermitida) filtros.llamada_permitida = form.llamadaPermitida === "true"
  }
  return filtros
}

function ruleLabels(lista: ProspeccionLista): string[] {
  const filtros = lista.filtros ?? {}
  const labels: string[] = []
  if (typeof filtros.segmento === "string" && filtros.segmento.trim()) {
    labels.push(`Segmento guardado: ${filtros.segmento}`)
  }
  if (Array.isArray(filtros.segmentos) && filtros.segmentos.length) labels.push(`Segmentos guardados: ${filtros.segmentos.join(", ")}`)
  if (Array.isArray(filtros.actividades) && filtros.actividades.length) labels.push(`Actividad económica: ${filtros.actividades.join(", ")}`)
  if (Array.isArray(filtros.tipo_negocio) && filtros.tipo_negocio.length) labels.push(`Tipo de negocio (Google): ${filtros.tipo_negocio.join(", ")}`)
  if (Array.isArray(filtros.metadata_queries) && filtros.metadata_queries.length) labels.push(`Búsqueda de origen: ${filtros.metadata_queries.join(", ")}`)
  if (typeof filtros.fuente === "string" && filtros.fuente.trim()) labels.push(`Fuente: ${filtros.fuente}`)
  if (typeof filtros.geo_estado === "string" && filtros.geo_estado.trim()) labels.push(`Estado: ${filtros.geo_estado}`)
  if (typeof filtros.geo_municipio === "string" && filtros.geo_municipio.trim()) labels.push(`Municipio: ${filtros.geo_municipio}`)
  if (filtros.phone_present === true) labels.push("Tiene teléfono")
  if (filtros.phone_present === false) labels.push("No tiene teléfono")
  if (filtros.email_present === true) labels.push("Tiene correo")
  if (filtros.email_present === false) labels.push("No tiene correo")
  if (filtros.website_present === true) labels.push("Tiene sitio web")
  if (filtros.website_present === false) labels.push("No tiene sitio web")
  if (typeof filtros.min_rating === "number") labels.push(`Calificación de Google: ${filtros.min_rating} o más`)
  if (typeof filtros.estrato_group === "string" && filtros.estrato_group.trim()) labels.push(`Tamaño: ${filtros.estrato_group}`)
  if (typeof filtros.date_from === "string" && filtros.date_from.trim()) labels.push(`Creado desde: ${filtros.date_from}`)
  if (typeof filtros.date_to === "string" && filtros.date_to.trim()) labels.push(`Creado hasta: ${filtros.date_to}`)
  if (filtros.con_envio === true) labels.push("Ya fue contactado")
  if (filtros.con_envio === false) labels.push("Nunca fue contactado")
  if (typeof filtros.opt_out_canal === "string" && filtros.opt_out_canal.trim()) {
    labels.push(`Excluye bajas de ${filtros.opt_out_canal === "correo" ? "correo" : filtros.opt_out_canal === "whatsapp" ? "WhatsApp" : "voz"}`)
  }
  if (filtros.opt_out_whatsapp === true) labels.push("Pidió no recibir WhatsApp")
  if (filtros.opt_out_whatsapp === false) labels.push("Puede recibir WhatsApp")
  if (typeof filtros.campana_id === "string" && filtros.campana_id.trim()) labels.push("Campaña específica")
  if (typeof filtros.template_id === "string" && filtros.template_id.trim()) labels.push("Plantilla específica")
  if (filtros.email_lookup_status === "valido") labels.push("Correo válido")
  if (filtros.lookup_status === "verificado") labels.push("Teléfono válido")
  if (filtros.carrier_type === "mobile") labels.push("Teléfono móvil")
  if (filtros.carrier_type === "landline") labels.push("Teléfono fijo")
  if (filtros.carrier_type === "voip") labels.push("Teléfono por internet")
  if (filtros.whatsapp_permitido === true) labels.push("Se le puede enviar WhatsApp")
  if (filtros.whatsapp_permitido === false) labels.push("No se le puede enviar WhatsApp")
  if (filtros.llamada_permitida === true) labels.push("Se le puede llamar")
  if (filtros.llamada_permitida === false) labels.push("No se le puede llamar")
  const canal = lista.canal ?? inferChannel(filtros)
  const countFields = envioCountFields(canal)
  const minimum = countFields ? filtros[countFields.min] : undefined
  const maximum = countFields ? filtros[countFields.max] : undefined
  if (typeof minimum === "number" || typeof maximum === "number") {
    const channelName = canal === "correo" ? "correos" : canal === "whatsapp" ? "WhatsApps" : "llamadas"
    const countLabel =
      typeof minimum === "number" && typeof maximum === "number" && minimum === maximum
        ? `Exactamente ${minimum} ${channelName}`
        : typeof minimum === "number" && typeof maximum === "number"
          ? `${minimum} a ${maximum} ${channelName}`
          : typeof minimum === "number"
            ? `${minimum} o más ${channelName}`
            : `Hasta ${maximum} ${channelName}`
    labels.push(countLabel)
  }
  return labels
}

function currentCount(lista: ProspeccionLista): string {
  return typeof lista.total_estimado === "number" ? lista.total_estimado.toLocaleString("es-MX") : "—"
}

export function ListasParaContactarClient() {
  const [listas, setListas] = useState<ProspeccionLista[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingLista, setEditingLista] = useState<ProspeccionLista | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [wizardLista, setWizardLista] = useState<ProspeccionLista | null>(null)
  const [campaigns, setCampaigns] = useState<CrmCampaign[]>([])
  const [templates, setTemplates] = useState<Array<{ id: string; nombre: string }>>([])
  const [filterOptions, setFilterOptions] = useState<ProspectosQueryMetadataResult>(EMPTY_METADATA)
  const [sourceFilterOptions, setSourceFilterOptions] = useState<Record<ProspectosFuente, ProspectosQueryMetadataResult>>({
    google_places: EMPTY_METADATA,
    denue: EMPTY_METADATA,
    usuario: EMPTY_METADATA,
  })

  const activeFilterOptions = useMemo(() => {
    if (form.fuente === "google_places" || form.fuente === "denue" || form.fuente === "usuario") {
      return sourceFilterOptions[form.fuente]
    }
    return filterOptions
  }, [filterOptions, form.fuente, sourceFilterOptions])
  const taxonomyOptions = useMemo(() => ({
    segmentos: activeFilterOptions.segmentos.map((value) => ({ value, label: value })),
    actividades: activeFilterOptions.activities.map((value) => ({ value, label: value })),
    tiposNegocio: activeFilterOptions.tipos_negocio.map((value) => ({ value, label: value })),
    busquedasOrigen: activeFilterOptions.queries.map((item) => ({ value: item.value, label: item.label })),
  }), [activeFilterOptions])
  const googleTaxonomyOptions = useMemo(() => ({
    tiposNegocio: sourceFilterOptions.google_places.tipos_negocio.map((value) => ({ value, label: value })),
  }), [sourceFilterOptions])
  const denueTaxonomyOptions = useMemo(() => ({
    actividades: sourceFilterOptions.denue.activities.map((value) => ({ value, label: value })),
  }), [sourceFilterOptions])

  const channelCampaigns = useMemo(
    () => (form.canal ? campaigns.filter((campaign) => campaign.canal === form.canal) : campaigns),
    [campaigns, form.canal],
  )

  const loadListas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await listProspeccionListas({ limit: 100, search })
      setListas(response.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las listas.")
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadListas(), 250)
    return () => window.clearTimeout(timer)
  }, [loadListas])

  useEffect(() => {
    void listCrmCampaigns()
      .then((items) => setCampaigns(Array.isArray(items) ? items : []))
      .catch(() => setCampaigns([]))
  }, [])

  useEffect(() => {
    const sources: ProspectosFuente[] = ["google_places", "denue", "usuario"]
    void Promise.all(sources.map((fuente) => listProspectosQueryMetadata({ fuente })))
      .then((metadataList) => {
        const bySource = {
          google_places: metadataList[0],
          denue: metadataList[1],
          usuario: metadataList[2],
        }
        setSourceFilterOptions(bySource)
        const merge = <T,>(values: T[]) => Array.from(new Set(values))
        setFilterOptions({
          queries: Array.from(new Map(metadataList.flatMap((metadata) => metadata.queries).map((item) => [item.value, item])).values()),
          activities: merge(metadataList.flatMap((metadata) => metadata.activities)),
          segmentos: merge(metadataList.flatMap((metadata) => metadata.segmentos)),
          tipos_negocio: merge(metadataList.flatMap((metadata) => metadata.tipos_negocio)),
        })
      })
      .catch(() => {
        setFilterOptions(EMPTY_METADATA)
        setSourceFilterOptions({ google_places: EMPTY_METADATA, denue: EMPTY_METADATA, usuario: EMPTY_METADATA })
      })
  }, [])

  useEffect(() => {
    void listContactoTemplates({
      canal: form.canal || undefined,
      campana_id: form.campanaId || undefined,
    })
      .then((response) => setTemplates((response.items ?? []).map((item) => ({ id: item.id, nombre: item.nombre }))))
      .catch(() => setTemplates([]))
  }, [form.canal, form.campanaId])

  useEffect(() => {
    if (!form.campanaId || !campaigns.length || channelCampaigns.some((campaign) => campaign.id === form.campanaId)) return
    setForm((prev) => ({ ...prev, campanaId: "", templateId: "" }))
  }, [campaigns, channelCampaigns, form.campanaId])

  const openCreate = () => {
    setEditingLista(null)
    setForm(EMPTY_FORM)
    setNotice(null)
    setEditorOpen(true)
  }

  const openEdit = (lista: ProspeccionLista) => {
    setEditingLista(lista)
    setForm(formFromLista(lista))
    setNotice(null)
    setEditorOpen(true)
  }

  const saveLista = async () => {
    if (!form.nombre.trim()) {
      setError("Escribe un nombre para la lista.")
      return
    }
    if (!form.canal) {
      setError("Elige primero cómo quieres contactar a estos prospectos.")
      return
    }
    const minCount = form.enviosMin.trim() ? Number.parseInt(form.enviosMin, 10) : undefined
    const maxCount = form.enviosMax.trim() ? Number.parseInt(form.enviosMax, 10) : undefined
    if (
      (minCount !== undefined && (!Number.isInteger(minCount) || minCount < 0)) ||
      (maxCount !== undefined && (!Number.isInteger(maxCount) || maxCount < 0))
    ) {
      setError("Los envíos deben ser números enteros iguales o mayores que cero.")
      return
    }
    if (minCount !== undefined && maxCount !== undefined && minCount > maxCount) {
      setError("El mínimo de envíos no puede ser mayor que el máximo.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const filtros = filtersFromForm(form)
      if (editingLista) {
        await updateProspeccionLista(editingLista.id, {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
          canal: form.canal || undefined,
          filtros,
        })
        setNotice("Lista actualizada.")
      } else {
        await createProspeccionLista({
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          canal: form.canal || undefined,
          filtros,
        })
        setNotice("Lista creada.")
      }
      setEditorOpen(false)
      await loadListas()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la lista.")
    } finally {
      setSaving(false)
    }
  }

  const filteredCount = useMemo(() => listas.length, [listas])

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-muted-foreground">Prepara posibles clientes</p>
          <h1 className="text-2xl font-semibold tracking-tight">Listas para contactar</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Guarda grupos de prospectos que cumplan ciertas reglas para volver a contactarlos cuando lo necesites.
          </p>
        </div>
        <Button onClick={openCreate}>
          <IconPlus className="mr-2 size-4" />
          Crear lista
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar una lista..."
            className="pl-9"
            aria-label="Buscar una lista"
          />
        </div>
        <Button variant="outline" onClick={() => void loadListas()} disabled={loading}>
          <IconRefresh className={loading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
          Actualizar
        </Button>
      </div>

      {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-700">{notice}</div> : null}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
          <IconLoader2 className="mr-2 size-4 animate-spin" /> Cargando listas...
        </div>
      ) : !listas.length ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
            <IconListDetails className="size-10 text-muted-foreground/60" />
            <h2 className="mt-3 font-medium">Todavía no tienes listas</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Crea una lista con reglas como “teléfono móvil” o “nunca recibió WhatsApp”.
            </p>
            <Button className="mt-4" onClick={openCreate}>
              <IconPlus className="mr-2 size-4" /> Crear primera lista
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {filteredCount.toLocaleString("es-MX")} {filteredCount === 1 ? "lista" : "listas"}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {listas.map((lista) => {
              const labels = ruleLabels(lista)
              return (
                <Card key={lista.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-lg">{lista.nombre}</CardTitle>
                        <CardDescription className="mt-1 line-clamp-2">
                          {lista.descripcion || (lista.canal ? `Lista para ${lista.canal === "llamada" ? "Voz" : lista.canal}.` : "Lista basada en reglas guardadas.")}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {currentCount(lista)} prospectos
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <div className="min-h-16 space-y-1.5">
                      {labels.length ? (
                        labels.map((label) => (
                          <div key={label} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="mt-1 text-emerald-600">✓</span>
                            <span>{label}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Sin reglas específicas.</p>
                      )}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                      <Button onClick={() => setWizardLista(lista)}>
                        <IconTargetArrow className="mr-2 size-4" /> Contactar esta lista
                      </Button>
                      <Button variant="outline" onClick={() => openEdit(lista)}>
                        Editar reglas
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingLista ? "Editar lista" : "Crear lista para contactar"}</DialogTitle>
            <DialogDescription>
              Define reglas dinámicas. La lista se volverá a calcular al momento de contactar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <Label htmlFor="lista-canal">¿Cómo quieres contactar a estos prospectos?</Label>
              <p className="mt-1 text-xs text-muted-foreground">Mostraremos únicamente las reglas que aplican a ese canal.</p>
              <Select
                value={form.canal || ""}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    canal: value as FormState["canal"],
                    optOutCanal: value,
                    search: "",
                    actividades: "",
                    tipoNegocio: "",
                    lookupStatus: "",
                    emailLookupStatus: "",
                    carrierType: "",
                    whatsappPermitido: "",
                    llamadaPermitida: "",
                    phonePresent: "",
                    emailPresent: "",
                    websitePresent: "",
                    geoEstado: "",
                    geoMunicipio: "",
                    minRating: "",
                    estratoGroup: "",
                    campanaId: "",
                    templateId: "",
                    enviosPreset: "never",
                    enviosMin: "0",
                    enviosMax: "0",
                  }))
                }
              >
                <SelectTrigger id="lista-canal" className="mt-3">
                  <SelectValue placeholder="Elige un canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="correo">Correo</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="llamada">Voz</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lista-nombre">Nombre</Label>
              <Input
                id="lista-nombre"
                value={form.nombre}
                onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
                placeholder="WhatsApp · Inmobiliarias nuevas"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lista-descripcion">Descripción (opcional)</Label>
              <Textarea
                id="lista-descripcion"
                value={form.descripcion}
                onChange={(event) => setForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                placeholder="Para explicar cuándo usar esta lista."
                rows={2}
              />
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Filtros generales de Prospectos</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Estos filtros se conservan junto con los filtros del canal. Puedes escribir varios valores separados por comas.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lista-fuente">Fuente</Label>
                  <Select value={form.fuente || "any"} onValueChange={(value) => setForm((prev) => ({
                    ...prev,
                    fuente: value === "any" ? "" : value,
                    search: "",
                    actividades: "",
                    tipoNegocio: "",
                    minRating: "",
                    estratoGroup: "",
                  }))}>
                    <SelectTrigger id="lista-fuente"><SelectValue placeholder="Cualquier fuente" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Cualquier fuente</SelectItem>
                      <SelectItem value="google_places">Google</SelectItem>
                      <SelectItem value="denue">DENUE</SelectItem>
                      <SelectItem value="usuario">Agregado manualmente</SelectItem>
                  </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lista-segmento">Segmento guardado</Label>
                  <TaxonomySelect
                    id="lista-segmento"
                    value={form.segmento}
                    options={taxonomyOptions.segmentos}
                    placeholder="Selecciona uno o más segmentos"
                    emptyMessage="No hay segmentos guardados disponibles"
                    onChange={(value) => setForm((prev) => ({ ...prev, segmento: value }))}
                  />
                  <p className="text-xs text-muted-foreground">Etiqueta comercial asignada a tus prospectos.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lista-campana">Campaña</Label>
                  <Select value={form.campanaId || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, campanaId: value === "any" ? "" : value, templateId: "" }))}>
                    <SelectTrigger id="lista-campana"><SelectValue placeholder="Cualquier campaña" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Cualquier campaña</SelectItem>
                      {channelCampaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="lista-contenido">Plantilla</Label>
                  <Select value={form.templateId || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, templateId: value === "any" ? "" : value }))}>
                    <SelectTrigger id="lista-contenido"><SelectValue placeholder="Cualquier plantilla" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Cualquier plantilla</SelectItem>
                      {templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {!form.fuente || form.fuente === "google_places" ? <>
                  <div className="sm:col-span-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                    <p className="font-medium">Clasificación de Google</p>
                    <p className="mt-1">Google clasifica por tipo de negocio, nombre o texto y calificación.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-search-google">Nombre o texto de empresa</Label>
                    <Input id="lista-search-google" value={form.search} onChange={(event) => setForm((prev) => ({ ...prev, search: event.target.value }))} placeholder="Doctor, clínica, inmobiliaria..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-tipo-negocio">Tipo de negocio (Google)</Label>
                    <TaxonomySelect
                      id="lista-tipo-negocio"
                      value={form.tipoNegocio}
                      options={googleTaxonomyOptions.tiposNegocio}
                      placeholder="Selecciona uno o más tipos de negocio"
                      emptyMessage="No hay tipos de negocio de Google disponibles"
                      onChange={(value) => setForm((prev) => ({ ...prev, tipoNegocio: value }))}
                    />
                  </div>
                </> : null}
                {!form.fuente || form.fuente === "denue" ? <>
                  <div className="sm:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <p className="font-medium">Clasificación de GobMX / DENUE</p>
                    <p className="mt-1">DENUE clasifica por actividad económica y tamaño de empresa.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-actividad">Actividad económica (DENUE/SCIAN)</Label>
                    <TaxonomySelect
                      id="lista-actividad"
                      value={form.actividades}
                      options={denueTaxonomyOptions.actividades}
                      placeholder="Selecciona una o más actividades"
                      emptyMessage="No hay actividades disponibles"
                      onChange={(value) => setForm((prev) => ({ ...prev, actividades: value }))}
                    />
                  </div>
                </> : null}
                {form.fuente === "usuario" ? <div className="sm:col-span-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Los prospectos agregados manualmente no tienen clasificadores de Google o DENUE.
                </div> : null}
                <div className="space-y-2">
                  <Label htmlFor="lista-consulta">Búsqueda de origen</Label>
                  <TaxonomySelect
                    id="lista-consulta"
                    value={form.metadataQueries}
                    options={taxonomyOptions.busquedasOrigen}
                    placeholder="Selecciona una o más búsquedas"
                    emptyMessage="No hay búsquedas de origen disponibles"
                    onChange={(value) => setForm((prev) => ({ ...prev, metadataQueries: value }))}
                  />
                  <p className="text-xs text-muted-foreground">Consulta que originó el prospecto.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lista-etapa">Etapa de prospección</Label>
                  <Select value={form.stage || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, stage: value === "any" ? "" : value }))}>
                    <SelectTrigger id="lista-etapa"><SelectValue placeholder="Cualquier etapa" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Cualquier etapa</SelectItem>
                      <SelectItem value="discover">Descubierto</SelectItem>
                      <SelectItem value="enrich">Completando datos</SelectItem>
                      <SelectItem value="prepare">Preparado</SelectItem>
                      <SelectItem value="launch">Listo para contactar</SelectItem>
                      <SelectItem value="evaluate">Evaluando</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lista-scraper">Información del sitio</Label>
                  <Select value={form.conScraper || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, conScraper: value === "any" ? "" : value }))}>
                    <SelectTrigger id="lista-scraper"><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Cualquiera</SelectItem>
                      <SelectItem value="true">Tiene información extraída</SelectItem>
                      <SelectItem value="false">No tiene información extraída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {form.canal ? <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-5 rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm font-medium">
                  ¿Cuántas veces ya fueron contactados por {form.canal === "correo" ? "correo" : form.canal === "whatsapp" ? "WhatsApp" : "voz"}?
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Deja un campo vacío si no quieres limitarlo. Si escribes el mismo número en ambos, buscarás exactamente esa cantidad.
                </p>
                <div className="mt-3 space-y-2">
                  <Label htmlFor="lista-historial-contactos">Historial de contactos</Label>
                  <Select
                    value={form.enviosPreset}
                    onValueChange={(value) => setForm((prev) => ({
                      ...prev,
                      enviosPreset: value as FormState["enviosPreset"],
                      enviosMin: value === "never" ? "0" : value === "contacted" ? "1" : value === "any" ? "" : prev.enviosMin,
                      enviosMax: value === "never" ? "0" : value === "contacted" || value === "any" ? "" : prev.enviosMax,
                    }))}
                  >
                    <SelectTrigger id="lista-historial-contactos"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Cualquier cantidad</SelectItem>
                      <SelectItem value="never">Nunca contactados</SelectItem>
                      <SelectItem value="contacted">Contactados al menos una vez</SelectItem>
                      <SelectItem value="custom">Cantidad personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.enviosPreset === "custom" ? <>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lista-envios-min">Como mínimo</Label>
                    <Input id="lista-envios-min" type="number" min={0} step={1} value={form.enviosMin} onChange={(event) => setForm((prev) => ({ ...prev, enviosMin: event.target.value }))} placeholder="Ej. 2" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-envios-max">Como máximo</Label>
                    <Input id="lista-envios-max" type="number" min={0} step={1} value={form.enviosMax} onChange={(event) => setForm((prev) => ({ ...prev, enviosMax: event.target.value }))} placeholder="Ej. 5" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ejemplos: mínimo 2 = “2 o más”; máximo 2 = “2 o menos”; ambos en 2 = “exactamente 2”.
                </p>
                </> : null}
              </div>
              <div className="mt-5 border-t pt-4">
                <p className="mb-3 text-sm font-medium">Datos de contacto del canal</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {form.canal === "correo" ? <div className="space-y-2">
                    <Label htmlFor="lista-correo-valido">Correo electrónico</Label>
                    <Select value={form.emailLookupStatus || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, emailLookupStatus: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-correo-valido"><SelectValue placeholder="Cualquier correo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquier correo</SelectItem>
                        <SelectItem value="valido">Correo válido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div> : null}
                  {form.canal !== "correo" ? <>
                    <div className="space-y-2">
                      <Label htmlFor="lista-telefono">Teléfono</Label>
                      <Select value={form.lookupStatus || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, lookupStatus: value === "any" ? "" : value }))}>
                        <SelectTrigger id="lista-telefono"><SelectValue placeholder="Cualquier teléfono" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Cualquier teléfono</SelectItem>
                          <SelectItem value="verificado">Teléfono válido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lista-tipo-telefono">Tipo de teléfono</Label>
                      <Select value={form.carrierType || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, carrierType: value === "any" ? "" : value }))}>
                        <SelectTrigger id="lista-tipo-telefono"><SelectValue placeholder="Cualquier tipo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Cualquier tipo</SelectItem>
                          <SelectItem value="mobile">Móvil</SelectItem>
                          <SelectItem value="landline">Fijo</SelectItem>
                          <SelectItem value="voip">Teléfono por internet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </> : null}
                </div>
              </div>
              <div className="mt-5 border-t pt-4">
                <p className="mb-3 text-sm font-medium">Permisos para contactar</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {form.canal === "whatsapp" ? <div className="space-y-2">
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                      <p className="font-medium">Protección de permisos activa</p>
                      <p className="mt-1">Por defecto se excluyen las personas que pidieron no recibir WhatsApp.</p>
                    </div>
                    <Label htmlFor="lista-whatsapp">WhatsApp</Label>
                    <Select value={form.whatsappPermitido || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, whatsappPermitido: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-whatsapp"><SelectValue placeholder="Sin regla de WhatsApp" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Sin regla de WhatsApp</SelectItem>
                        <SelectItem value="true">Se le puede enviar WhatsApp</SelectItem>
                        <SelectItem value="false">No se le puede enviar WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div> : null}
                  {form.canal === "correo" ? <div className="space-y-2">
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                      <p className="font-medium">Protección de permisos activa</p>
                      <p className="mt-1">Por defecto se excluyen las personas que pidieron no recibir correo.</p>
                    </div>
                    <p className="text-sm text-muted-foreground">Las bajas de correo se excluyen automáticamente.</p>
                  </div> : null}
                  {form.canal === "llamada" ? <div className="space-y-2">
                    <Label htmlFor="lista-llamada">Llamadas</Label>
                    <Select value={form.llamadaPermitida || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, llamadaPermitida: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-llamada"><SelectValue placeholder="Sin regla de llamadas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Sin regla de llamadas</SelectItem>
                        <SelectItem value="true">Se le puede llamar</SelectItem>
                        <SelectItem value="false">No se le puede llamar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div> : null}
                </div>
              </div>
              <div className="mt-5 border-t pt-4">
                <p className="mb-3 text-sm font-medium">Validación, historial y CRM</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lista-correo-estado">Estado del correo</Label>
                    <Select value={form.emailLookupStatus || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, emailLookupStatus: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-correo-estado"><SelectValue placeholder="Cualquier estado" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquier estado</SelectItem>
                        <SelectItem value="valido">Correo válido</SelectItem>
                        <SelectItem value="invalido">Correo inválido</SelectItem>
                        <SelectItem value="dudoso">Correo dudoso</SelectItem>
                        <SelectItem value="sin_email">Sin correo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-sitio-estado">Estado del sitio web</Label>
                    <Select value={form.websiteLookupStatus || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, websiteLookupStatus: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-sitio-estado"><SelectValue placeholder="Cualquier estado" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquier estado</SelectItem>
                        <SelectItem value="valido">Sitio válido</SelectItem>
                        <SelectItem value="invalido">Sitio inválido</SelectItem>
                        <SelectItem value="dudoso">Sitio dudoso</SelectItem>
                        <SelectItem value="sin_sitio">Sin sitio web</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-relacion-correo">Relación correo/sitio web</Label>
                    <Select value={form.emailDomainRelation || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, emailDomainRelation: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-relacion-correo"><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquiera</SelectItem>
                        <SelectItem value="same_as_website">Mismo dominio</SelectItem>
                        <SelectItem value="different_from_website">Dominio diferente</SelectItem>
                        <SelectItem value="no_website">Sin sitio web</SelectItem>
                        <SelectItem value="no_email">Sin correo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-envios-generales">Contactos anteriores</Label>
                    <Select value={form.conEnvio || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, conEnvio: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-envios-generales"><SelectValue placeholder="Cualquier historial" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquier historial</SelectItem>
                        <SelectItem value="true">Ya fueron contactados</SelectItem>
                        <SelectItem value="false">Nunca fueron contactados</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Canales con historial</Label>
                    <div className="flex flex-wrap gap-3 rounded-md border p-3 text-sm">
                      {(["correo", "whatsapp", "llamada"] as const).map((channel) => (
                        <label key={channel} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.conEnvioCanales.includes(channel)}
                            onChange={(event) => setForm((prev) => ({
                              ...prev,
                              conEnvioCanales: event.target.checked
                                ? [...prev.conEnvioCanales, channel]
                                : prev.conEnvioCanales.filter((value) => value !== channel),
                            }))}
                          />
                          {channel === "correo" ? "Correo" : channel === "whatsapp" ? "WhatsApp" : "Voz"}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-fecha-desde">Prospectos creados desde</Label>
                    <Input id="lista-fecha-desde" type="date" value={form.dateFrom} onChange={(event) => setForm((prev) => ({ ...prev, dateFrom: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-fecha-hasta">Prospectos creados hasta</Label>
                    <Input id="lista-fecha-hasta" type="date" value={form.dateTo} onChange={(event) => setForm((prev) => ({ ...prev, dateTo: event.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="mt-5 border-t pt-4">
                <p className="mb-3 text-sm font-medium">Además, que cumplan estas condiciones generales</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lista-estado">Estado</Label>
                    <Input id="lista-estado" value={form.geoEstado} onChange={(event) => setForm((prev) => ({ ...prev, geoEstado: event.target.value }))} placeholder="San Luis Potosí" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-municipio">Municipio</Label>
                    <Input id="lista-municipio" value={form.geoMunicipio} onChange={(event) => setForm((prev) => ({ ...prev, geoMunicipio: event.target.value }))} placeholder="San Luis Potosí" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-correo-presente">Correo electrónico</Label>
                    <Select value={form.emailPresent || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, emailPresent: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-correo-presente"><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquiera</SelectItem>
                        <SelectItem value="true">Tiene correo</SelectItem>
                        <SelectItem value="false">No tiene correo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-telefono-presente">Teléfono</Label>
                    <Select value={form.phonePresent || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, phonePresent: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-telefono-presente"><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquiera</SelectItem>
                        <SelectItem value="true">Tiene teléfono</SelectItem>
                        <SelectItem value="false">No tiene teléfono</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-sitio-presente">Sitio web</Label>
                    <Select value={form.websitePresent || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, websitePresent: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-sitio-presente"><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquiera</SelectItem>
                        <SelectItem value="true">Tiene sitio web</SelectItem>
                        <SelectItem value="false">No tiene sitio web</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!form.fuente || form.fuente === "google_places" ? <div className="space-y-2">
                    <Label htmlFor="lista-calificacion">Calificación de Google</Label>
                    <Select value={form.minRating || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, minRating: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-calificacion"><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquiera</SelectItem>
                        <SelectItem value="3">3 o más</SelectItem>
                        <SelectItem value="4">4 o más</SelectItem>
                        <SelectItem value="4.5">4.5 o más</SelectItem>
                      </SelectContent>
                    </Select>
                  </div> : null}
                  {!form.fuente || form.fuente === "denue" ? <div className="space-y-2">
                    <Label htmlFor="lista-tamano">Tamaño de empresa</Label>
                    <Select value={form.estratoGroup || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, estratoGroup: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-tamano"><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquiera</SelectItem>
                        <SelectItem value="micro">Micro</SelectItem>
                        <SelectItem value="pequena">Pequeña</SelectItem>
                        <SelectItem value="mediana">Mediana</SelectItem>
                        <SelectItem value="grande">Grande</SelectItem>
                      </SelectContent>
                    </Select>
                  </div> : null}
                </div>
              </div>
            </div> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Elige un canal para mostrar las reglas correspondientes.</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void saveLista()} disabled={saving}>
              {saving ? <IconLoader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingLista ? "Guardar cambios" : "Guardar lista"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProspeccionCampaignWizard
        open={Boolean(wizardLista)}
        onClose={() => setWizardLista(null)}
        selectedIds={[]}
        preset={wizardLista ? { source: "lista", listaId: wizardLista.id, canal: wizardLista.canal } : null}
        onCompleted={() => setWizardLista(null)}
      />
    </div>
  )
}
