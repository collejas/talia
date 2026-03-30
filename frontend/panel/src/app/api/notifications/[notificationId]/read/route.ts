import { proxyProspeccionRequest } from "../../../prospeccion/prospectos/proxy-helpers"

export async function POST(
  request: Request,
  context: { params: Promise<{ notificationId: string }> }
) {
  const { notificationId } = await context.params
  return proxyProspeccionRequest(request, {
    method: "POST",
    backendPath: `/crm/me/notifications/${notificationId}/read`,
    forwardSearch: false,
  })
}
