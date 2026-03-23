"use client"

import { useActionState, useEffect, useRef } from "react"
import { useFormStatus } from "react-dom"

import {
  createDepartmentAction,
  createPermissionAction,
  createRoleAction,
  createUserAction,
  CrudActionHandler,
  CrudActionState,
  deleteDepartmentAction,
  deletePermissionAction,
  deleteRoleAction,
  updateDepartmentAction,
  updatePermissionAction,
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

export function EmployeeCrudPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestión inline</CardTitle>
        <CardDescription>
          Usa los controles directamente en la tabla de empleados para agregar, editar o eliminar.
        </CardDescription>
      </CardHeader>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Gestión inline</CardTitle>
        <CardDescription>
          Utiliza los controles dentro del listado de puestos para agregar o editar registros.
        </CardDescription>
      </CardHeader>
    </Card>
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
