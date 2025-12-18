"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useFormStatus } from "react-dom"

import {
  createDepartmentAction,
  createEmployeeAction,
  createPermissionAction,
  createPositionAction,
  createRoleAction,
  createUserAction,
  CrudActionHandler,
  CrudActionState,
  deleteDepartmentAction,
  deleteEmployeeAction,
  deletePermissionAction,
  deletePositionAction,
  deleteRoleAction,
  updateDepartmentAction,
  updateEmployeeAction,
  updatePermissionAction,
  updatePositionAction,
  updateRoleAction,
} from "@/app/settings/hr/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type CrudTabProps = {
  title: string
  description: string
  tabs: Array<{ value: string; label: string; content: React.ReactNode }>
}

const INITIAL_CRUD_STATE: CrudActionState = Object.freeze({ status: "idle" })

function CrudTabs({ title, description, tabs }: CrudTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={tabs[0]?.value}>
          <TabsList className="grid grid-cols-3">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="pt-4">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

function useCrudForm(action: CrudActionHandler) {
  const [state, formAction] = useActionState(action, createInitialCrudState())
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset()
    }
  }, [state])
  return { state, formAction, formRef }
}

function createInitialCrudState(): CrudActionState {
  return { ...INITIAL_CRUD_STATE }
}

function FormStatusMessage({ state }: { state: CrudActionState }) {
  if (state.status === "idle") return null
  if (state.status === "success") {
    return (
      <p className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
        {state.message ?? "Cambios guardados correctamente."}
      </p>
    )
  }
  if (state.status === "error") {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {state.message ?? "Ocurrió un error al procesar la acción."}
      </p>
    )
  }
  return null
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : label}
    </Button>
  )
}

function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string
  label: string
  defaultChecked?: boolean
}) {
  const [checked, setChecked] = useState(defaultChecked ?? false)
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
        className="h-4 w-4 rounded border-border"
      />
      {label}
    </label>
  )
}

export function EmployeeCrudPanel() {
  return (
    <CrudTabs
      title="Gestionar empleados"
      description="Registra, actualiza o elimina colaboradores vinculados a usuarios existentes."
      tabs={[
        {
          value: "create",
          label: "Agregar",
          content: <EmployeeCreateForm />,
        },
        {
          value: "update",
          label: "Editar",
          content: <EmployeeUpdateForm />,
        },
        {
          value: "delete",
          label: "Eliminar",
          content: <EmployeeDeleteForm />,
        },
      ]}
    />
  )
}

function EmployeeCreateForm() {
  const { state, formAction, formRef } = useCrudForm(createEmployeeAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="employee-create-usuario">Usuario ID</Label>
          <Input
            id="employee-create-usuario"
            name="usuario_id"
            placeholder="uuid del usuario"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="employee-create-departamento">Departamento ID (opcional)</Label>
          <Input
            id="employee-create-departamento"
            name="departamento_id"
            placeholder="uuid del departamento"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="employee-create-puesto">Puesto ID (opcional)</Label>
          <Input id="employee-create-puesto" name="puesto_id" placeholder="uuid del puesto" />
        </div>
        <div className="space-y-1">
          <Label>Permisos adicionales</Label>
          <div className="flex gap-4 rounded-md border border-border/60 p-3">
            <CheckboxField name="es_gestor" label="Gestor" />
            <CheckboxField name="es_vendedor" label="Vendedor" />
          </div>
        </div>
      </div>
      <SubmitButton label="Guardar empleado" />
    </form>
  )
}

function EmployeeUpdateForm() {
  const { state, formAction, formRef } = useCrudForm(updateEmployeeAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="employee-update-id">Usuario ID</Label>
          <Input id="employee-update-id" name="usuario_id" placeholder="uuid" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="employee-update-departamento">
            Departamento ID (deja vacío para conservar)
          </Label>
          <Input id="employee-update-departamento" name="departamento_id" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="employee-update-puesto">Puesto ID (deja vacío para conservar)</Label>
          <Input id="employee-update-puesto" name="puesto_id" />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Permisos adicionales</Label>
          <div className="flex gap-4 rounded-md border border-border/60 p-3">
            <CheckboxField name="es_gestor" label="Gestor" />
            <CheckboxField name="es_vendedor" label="Vendedor" />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Si necesitas limpiar un campo, escribe <strong>null</strong> en el input correspondiente.
      </p>
      <SubmitButton label="Actualizar empleado" />
    </form>
  )
}

function EmployeeDeleteForm() {
  const { state, formAction, formRef } = useCrudForm(deleteEmployeeAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="space-y-1">
        <Label htmlFor="employee-delete-id">Usuario ID</Label>
        <Input id="employee-delete-id" name="usuario_id" placeholder="uuid" required />
      </div>
      <SubmitButton label="Eliminar empleado" />
    </form>
  )
}

export function DepartmentCrudPanel() {
  return (
    <CrudTabs
      title="Gestionar departamentos"
      description="Controla la jerarquía de áreas utilizando el identificador de cada departamento."
      tabs={[
        { value: "create", label: "Agregar", content: <DepartmentCreateForm /> },
        { value: "update", label: "Editar", content: <DepartmentUpdateForm /> },
        { value: "delete", label: "Eliminar", content: <DepartmentDeleteForm /> },
      ]}
    />
  )
}

function DepartmentCreateForm() {
  const { state, formAction, formRef } = useCrudForm(createDepartmentAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="department-create-nombre">Nombre</Label>
          <Input id="department-create-nombre" name="nombre" placeholder="Ventas" required />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="department-create-padre">Departamento padre (opcional)</Label>
          <Input
            id="department-create-padre"
            name="departamento_padre_id"
            placeholder="uuid"
          />
        </div>
      </div>
      <SubmitButton label="Crear departamento" />
    </form>
  )
}

function DepartmentUpdateForm() {
  const { state, formAction, formRef } = useCrudForm(updateDepartmentAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="department-update-id">Departamento ID</Label>
          <Input id="department-update-id" name="id" placeholder="uuid" required />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="department-update-nombre">Nombre (opcional)</Label>
          <Input id="department-update-nombre" name="nombre" placeholder="Nuevo nombre" />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="department-update-padre">Departamento padre (opcional)</Label>
          <Input id="department-update-padre" name="departamento_padre_id" placeholder="uuid" />
        </div>
      </div>
      <SubmitButton label="Actualizar departamento" />
    </form>
  )
}

function DepartmentDeleteForm() {
  const { state, formAction, formRef } = useCrudForm(deleteDepartmentAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="space-y-1">
        <Label htmlFor="department-delete-id">Departamento ID</Label>
        <Input id="department-delete-id" name="id" placeholder="uuid" required />
      </div>
      <SubmitButton label="Eliminar departamento" />
    </form>
  )
}

export function PositionCrudPanel() {
  return (
    <CrudTabs
      title="Gestionar puestos"
      description="Crea o ajusta los puestos asociados a cada departamento."
      tabs={[
        { value: "create", label: "Agregar", content: <PositionCreateForm /> },
        { value: "update", label: "Editar", content: <PositionUpdateForm /> },
        { value: "delete", label: "Eliminar", content: <PositionDeleteForm /> },
      ]}
    />
  )
}

function PositionCreateForm() {
  const { state, formAction, formRef } = useCrudForm(createPositionAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="position-create-nombre">Nombre</Label>
          <Input id="position-create-nombre" name="nombre" placeholder="Ej. Ejecutivo" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="position-create-departamento">Departamento ID (opcional)</Label>
          <Input id="position-create-departamento" name="departamento_id" placeholder="uuid" />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="position-create-descripcion">Descripción</Label>
          <Textarea
            id="position-create-descripcion"
            name="descripcion"
            placeholder="Funciones principales..."
          />
        </div>
      </div>
      <SubmitButton label="Crear puesto" />
    </form>
  )
}

function PositionUpdateForm() {
  const { state, formAction, formRef } = useCrudForm(updatePositionAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="position-update-id">Puesto ID</Label>
          <Input id="position-update-id" name="id" placeholder="uuid" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="position-update-nombre">Nombre (opcional)</Label>
          <Input id="position-update-nombre" name="nombre" placeholder="Nuevo nombre" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="position-update-departamento">Departamento ID</Label>
          <Input id="position-update-departamento" name="departamento_id" placeholder="uuid" />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="position-update-descripcion">Descripción</Label>
          <Textarea id="position-update-descripcion" name="descripcion" />
        </div>
      </div>
      <SubmitButton label="Actualizar puesto" />
    </form>
  )
}

function PositionDeleteForm() {
  const { state, formAction, formRef } = useCrudForm(deletePositionAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="space-y-1">
        <Label htmlFor="position-delete-id">Puesto ID</Label>
        <Input id="position-delete-id" name="id" placeholder="uuid" required />
      </div>
      <SubmitButton label="Eliminar puesto" />
    </form>
  )
}

export function UserCrudPanel() {
  return (
    <CrudTabs
      title="Gestionar usuarios"
      description="Da de alta identidades nuevas antes de asignarles roles y permisos."
      tabs={[
        { value: "create", label: "Agregar", content: <UserCreateForm /> },
      ]}
    />
  )
}

function UserCreateForm() {
  const { state, formAction, formRef } = useCrudForm(createUserAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="user-create-estado">Estado</Label>
          <Input id="user-create-estado" name="estado" placeholder="activo" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="user-create-nombre">Nombre</Label>
          <Input id="user-create-nombre" name="nombre_completo" placeholder="Nombre completo" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="user-create-correo">Correo</Label>
          <Input
            id="user-create-correo"
            name="correo"
            type="email"
            placeholder="usuario@empresa.com"
            required
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="user-create-telefono">Teléfono E164</Label>
          <Input id="user-create-telefono" name="telefono" placeholder="+521231231234" />
        </div>
      </div>
      <SubmitButton label="Crear usuario" />
    </form>
  )
}

export function RoleCrudPanel() {
  return (
    <CrudTabs
      title="Gestionar roles"
      description="Registra o corrige rápidamente los roles disponibles para asignaciones."
      tabs={[
        { value: "create", label: "Agregar", content: <RoleCreateForm /> },
        { value: "update", label: "Editar", content: <RoleUpdateForm /> },
        { value: "delete", label: "Eliminar", content: <RoleDeleteForm /> },
      ]}
    />
  )
}

function RoleCreateForm() {
  const { state, formAction, formRef } = useCrudForm(createRoleAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="role-create-nombre">Nombre</Label>
          <Input id="role-create-nombre" name="nombre" placeholder="Administrador" required />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="role-create-descripcion">Descripción</Label>
          <Textarea id="role-create-descripcion" name="descripcion" placeholder="Opcional" />
        </div>
      </div>
      <SubmitButton label="Crear rol" />
    </form>
  )
}

function RoleUpdateForm() {
  const { state, formAction, formRef } = useCrudForm(updateRoleAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="role-update-id">Rol ID</Label>
          <Input id="role-update-id" name="id" placeholder="uuid" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="role-update-nombre">Nombre</Label>
          <Input id="role-update-nombre" name="nombre" placeholder="Administrador" />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="role-update-descripcion">Descripción</Label>
          <Textarea id="role-update-descripcion" name="descripcion" />
        </div>
      </div>
      <SubmitButton label="Actualizar rol" />
    </form>
  )
}

function RoleDeleteForm() {
  const { state, formAction, formRef } = useCrudForm(deleteRoleAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="space-y-1">
        <Label htmlFor="role-delete-id">Rol ID</Label>
        <Input id="role-delete-id" name="id" placeholder="uuid" required />
      </div>
      <SubmitButton label="Eliminar rol" />
    </form>
  )
}

export function PermissionCrudPanel() {
  return (
    <CrudTabs
      title="Gestionar permisos"
      description="Registra códigos nuevos o depura los existentes."
      tabs={[
        { value: "create", label: "Agregar", content: <PermissionCreateForm /> },
        { value: "update", label: "Editar", content: <PermissionUpdateForm /> },
        { value: "delete", label: "Eliminar", content: <PermissionDeleteForm /> },
      ]}
    />
  )
}

function PermissionCreateForm() {
  const { state, formAction, formRef } = useCrudForm(createPermissionAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="space-y-1">
        <Label htmlFor="permission-create-codigo">Código</Label>
        <Input
          id="permission-create-codigo"
          name="codigo"
          placeholder="crm.leads.read"
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="permission-create-descripcion">Descripción</Label>
        <Textarea
          id="permission-create-descripcion"
          name="descripcion"
          placeholder="Descripción breve"
        />
      </div>
      <SubmitButton label="Crear permiso" />
    </form>
  )
}

function PermissionUpdateForm() {
  const { state, formAction, formRef } = useCrudForm(updatePermissionAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="space-y-1">
        <Label htmlFor="permission-update-id">Permiso ID</Label>
        <Input id="permission-update-id" name="id" placeholder="uuid" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="permission-update-codigo">Código</Label>
        <Input id="permission-update-codigo" name="codigo" placeholder="crm.leads.read" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="permission-update-descripcion">Descripción</Label>
        <Textarea id="permission-update-descripcion" name="descripcion" />
      </div>
      <SubmitButton label="Actualizar permiso" />
    </form>
  )
}

function PermissionDeleteForm() {
  const { state, formAction, formRef } = useCrudForm(deletePermissionAction)
  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <FormStatusMessage state={state} />
      <div className="space-y-1">
        <Label htmlFor="permission-delete-id">Permiso ID</Label>
        <Input id="permission-delete-id" name="id" placeholder="uuid" required />
      </div>
      <SubmitButton label="Eliminar permiso" />
    </form>
  )
}
