"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardHeader, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PropiedadGeomEditor } from "@/components/settings/propiedades/propiedad-geom-editor";

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
    geom: "",
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    } catch {
      setStatusMessage("Hubo un problema al guardar la propiedad.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <section className="lg:w-[420px]">
        <Card className="h-full space-y-4">
          <CardHeader>
            <CardTitle className="text-lg">Crear o editar propiedad</CardTitle>
            <CardDescription className="text-xs">
              El panel izquierdo replica la tabla de atributos de un SIG y captura cada campo antes de
              dibujar la capa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <section className="space-y-3">
                <div className="uppercase tracking-[0.2em] text-[0.65rem] text-slate-600">Datos</div>
                <div className="space-y-2">
                  <Label htmlFor="propiedad-nombre" className="text-[0.65rem]">
                    Nombre
                  </Label>
                  <Input
                    className="text-sm"
                    id="propiedad-nombre"
                    value={formValues.nombre}
                    onChange={(event) => handleChange("nombre", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="propiedad-tipo" className="text-[0.65rem]">
                    Tipo
                  </Label>
                  <Select
                    className="text-sm"
                    onValueChange={(value) => handleChange("tipoId", value)}
                    value={formValues.tipoId || EMPTY}
                  >
                    <SelectTrigger id="propiedad-tipo">
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                    <SelectContent className="text-xs">
                      {tipos.map((tipo) => (
                        <SelectItem key={tipo.id} value={tipo.id}>
                          {tipo.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="propiedad-descripcion" className="text-[0.65rem]">
                    Descripción
                  </Label>
                  <Textarea
                    className="text-sm"
                    id="propiedad-descripcion"
                    value={formValues.descripcion}
                    onChange={(event) => handleChange("descripcion", event.target.value)}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div className="uppercase tracking-[0.2em] text-[0.65rem] text-slate-600">Dimensiones</div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="propiedad-precio" className="text-[0.65rem]">
                      Precio
                    </Label>
                    <Input
                      className="text-sm"
                      type="number"
                      id="propiedad-precio"
                      value={formValues.precio}
                      onChange={(event) => handleChange("precio", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="propiedad-nivel" className="text-[0.65rem]">
                      Nivel
                    </Label>
                    <Input
                      className="text-sm"
                      type="number"
                      id="propiedad-nivel"
                      value={formValues.nivel}
                      onChange={(event) => handleChange("nivel", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="propiedad-height" className="text-[0.65rem]">
                        Altura
                      </Label>
                      <Input
                        className="text-sm"
                        type="number"
                        id="propiedad-height"
                        value={formValues.height}
                        onChange={(event) => handleChange("height", event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="propiedad-min-height" className="text-[0.65rem]">
                        Altura mínima
                      </Label>
                      <Input
                        className="text-sm"
                        type="number"
                        id="propiedad-min-height"
                        value={formValues.minHeight}
                        onChange={(event) => handleChange("minHeight", event.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="propiedad-levels" className="text-[0.65rem]">
                    Levels
                  </Label>
                  <Input
                    className="text-sm"
                    type="number"
                    id="propiedad-levels"
                    value={formValues.levels}
                    onChange={(event) => handleChange("levels", event.target.value)}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div className="uppercase tracking-[0.2em] text-[0.65rem] text-slate-600">
                  Ubicación geográfica
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="propiedad-estado" className="text-[0.65rem]">
                      Estado (INEGI)
                    </Label>
                    <Input
                      className="text-sm"
                      id="propiedad-estado"
                      value={formValues.estadoCve}
                      onChange={(event) => handleChange("estadoCve", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="propiedad-municipio" className="text-[0.65rem]">
                      Municipio (INEGI)
                    </Label>
                    <Input
                      className="text-sm"
                      id="propiedad-municipio"
                      value={formValues.municipioCve}
                      onChange={(event) => handleChange("municipioCve", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="propiedad-codigo-postal" className="text-[0.65rem]">
                      Código postal
                    </Label>
                    <Input
                      className="text-sm"
                      id="propiedad-codigo-postal"
                      value={formValues.codigoPostal}
                      onChange={(event) => handleChange("codigoPostal", event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="propiedad-colonia" className="text-[0.65rem]">
                    Colonia
                  </Label>
                  <Input
                    className="text-sm"
                    id="propiedad-colonia"
                    value={formValues.colonia}
                    onChange={(event) => handleChange("colonia", event.target.value)}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div className="uppercase tracking-[0.2em] text-[0.65rem] text-slate-600">
                  Jerarquía (opcionales)
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="propiedad-linea" className="text-[0.65rem]">
                      Línea
                    </Label>
                    <Select
                      className="text-sm"
                      id="propiedad-linea"
                      value={formValues.lineaId || EMPTY}
                      onValueChange={(value) => handleChange("lineaId", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin línea" />
                      </SelectTrigger>
                      <SelectContent className="text-xs">
                        {lineas.map((linea) => (
                          <SelectItem key={linea.id} value={linea.id}>
                            {linea.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="propiedad-familia" className="text-[0.65rem]">
                      Familia
                    </Label>
                    <Select
                      className="text-sm"
                      id="propiedad-familia"
                      value={formValues.familiaId || EMPTY}
                      onValueChange={(value) => handleChange("familiaId", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin familia" />
                      </SelectTrigger>
                      <SelectContent className="text-xs">
                        {familias.map((familia) => (
                          <SelectItem key={familia.id} value={familia.id}>
                            {familia.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="propiedad-modelo" className="text-[0.65rem]">
                      Modelo
                    </Label>
                    <Select
                      className="text-sm"
                      id="propiedad-modelo"
                      value={formValues.modeloId || EMPTY}
                      onValueChange={(value) => handleChange("modeloId", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin modelo" />
                      </SelectTrigger>
                      <SelectContent className="text-xs">
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

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button size="sm" type="submit" disabled={isSaving}>
                  {isSaving ? "Guardando…" : "Guardar propiedad"}
                </Button>
                {statusMessage && <span className="text-xs text-slate-500">{statusMessage}</span>}
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="lg:flex-1">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Mapa y capas</CardTitle>
            <CardDescription className="text-xs">
              El panel derecho es el canvas de capas: dibuja, edita y visualiza la geometría antes de
              publicarla.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1">
            <PropiedadGeomEditor
              value={formValues.geom}
              onGeometryChange={(value) => handleChange("geom", value ?? "")}
            />
            <p className="text-[0.65rem] text-slate-500">
              Usa los controles para añadir o ajustar la capa y revisar la forma antes de guardar.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
