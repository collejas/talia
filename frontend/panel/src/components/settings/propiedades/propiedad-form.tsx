"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardHeader, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type CatalogOption = {
  id: string;
  nombre: string;
};

type PropiedadTipo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
};

type PropiedadFormProps = {
  lineas: CatalogOption[];
  familias: CatalogOption[];
  modelos: CatalogOption[];
  tipos: PropiedadTipo[];
};

const EMPTY = "";

export function PropiedadForm({ lineas, familias, modelos, tipos }: PropiedadFormProps) {
  const [formValues, setFormValues] = useState({
    nombre: "",
    descripcion: "",
    tipoId: "",
    precio: "",
    nivel: "",
    height: "",
    minHeight: "",
    levels: "",
    estadoCve: "",
    municipioCve: "",
    codigoPostal: "",
    colonia: "",
    lineaId: "",
    familiaId: "",
    modeloId: "",
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedTipo = useMemo(() => tipos.find((tipo) => tipo.id === formValues.tipoId), [formValues.tipoId, tipos]);
  const selectedColor = selectedTipo?.color ?? "#95A5A6";

  const handleChange = (field: keyof typeof formValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      setStatusMessage("La propiedad se guardó de forma simulada. Implementa el endpoint cuando esté listo.");
    } catch (error) {
      setStatusMessage("Hubo un problema al guardar la propiedad.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="space-y-6">
      <CardHeader>
        <CardTitle>Crear o editar propiedad</CardTitle>
        <CardDescription>
          Usa este formulario para capturar los datos espaciales y la referencia jerárquica antes de
          publicar el desarrollo en el mapa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selectedColor }} />
              Datos generales
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="propiedad-nombre">Nombre</Label>
                <Input
                  id="propiedad-nombre"
                  value={formValues.nombre}
                  onChange={(event) => handleChange("nombre", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="propiedad-tipo">Tipo</Label>
                <Select
                  onValueChange={(value) => handleChange("tipoId", value)}
                  value={formValues.tipoId || EMPTY}
                >
                  <SelectTrigger id="propiedad-tipo">
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map((tipo) => (
                      <SelectItem key={tipo.id} value={tipo.id}>
                        {tipo.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="propiedad-descripcion">Descripción</Label>
              <Textarea
                id="propiedad-descripcion"
                value={formValues.descripcion}
                onChange={(event) => handleChange("descripcion", event.target.value)}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="propiedad-precio">Precio</Label>
                <Input
                  type="number"
                  id="propiedad-precio"
                  value={formValues.precio}
                  onChange={(event) => handleChange("precio", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="propiedad-nivel">Nivel</Label>
                <Input
                  type="number"
                  id="propiedad-nivel"
                  value={formValues.nivel}
                  onChange={(event) => handleChange("nivel", event.target.value)}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="propiedad-height">Altura</Label>
                  <Input
                    type="number"
                    id="propiedad-height"
                    value={formValues.height}
                    onChange={(event) => handleChange("height", event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="propiedad-min-height">Altura mínima</Label>
                  <Input
                    type="number"
                    id="propiedad-min-height"
                    value={formValues.minHeight}
                    onChange={(event) => handleChange("minHeight", event.target.value)}
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="propiedad-levels">Levels</Label>
              <Input
                type="number"
                id="propiedad-levels"
                value={formValues.levels}
                onChange={(event) => handleChange("levels", event.target.value)}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              Ubicación geográfica
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="propiedad-estado">Estado (código INEGI)</Label>
                <Input
                  id="propiedad-estado"
                  value={formValues.estadoCve}
                  onChange={(event) => handleChange("estadoCve", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="propiedad-municipio">Municipio (código INEGI)</Label>
                <Input
                  id="propiedad-municipio"
                  value={formValues.municipioCve}
                  onChange={(event) => handleChange("municipioCve", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="propiedad-codigo-postal">Código postal</Label>
                <Input
                  id="propiedad-codigo-postal"
                  value={formValues.codigoPostal}
                  onChange={(event) => handleChange("codigoPostal", event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="propiedad-colonia">Colonia</Label>
              <Input
                id="propiedad-colonia"
                value={formValues.colonia}
                onChange={(event) => handleChange("colonia", event.target.value)}
              />
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              Referencias jerárquicas (opcionales)
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="propiedad-linea">Línea de negocio</Label>
                <Select
                  id="propiedad-linea"
                  value={formValues.lineaId || EMPTY}
                  onValueChange={(value) => handleChange("lineaId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin línea" />
                  </SelectTrigger>
                  <SelectContent>
                    {lineas.map((linea) => (
                      <SelectItem key={linea.id} value={linea.id}>
                        {linea.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="propiedad-familia">Familia</Label>
                <Select
                  id="propiedad-familia"
                  value={formValues.familiaId || EMPTY}
                  onValueChange={(value) => handleChange("familiaId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin familia" />
                  </SelectTrigger>
                  <SelectContent>
                    {familias.map((familia) => (
                      <SelectItem key={familia.id} value={familia.id}>
                        {familia.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="propiedad-modelo">Modelo</Label>
                <Select
                  id="propiedad-modelo"
                  value={formValues.modeloId || EMPTY}
                  onValueChange={(value) => handleChange("modeloId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelos.map((modelo) => (
                      <SelectItem key={modelo.id} value={modelo.id}>
                        {modelo.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Guardando…" : "Guardar propiedad"}
            </Button>
            {statusMessage && <span className="text-sm text-slate-500">{statusMessage}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
