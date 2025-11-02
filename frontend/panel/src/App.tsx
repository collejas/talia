import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/layouts/ProtectedRoute'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { VisitasPage } from '@/features/visitas/VisitasPage'
import { LeadsPage } from '@/features/leads/LeadsPage'
import { LoginPage } from '@/pages/LoginPage'

function App() {
  return (
    <BrowserRouter basename="/panel-react">
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute component={PanelLayout} />}>
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/visitas" element={<VisitasPage />} />
          <Route path="/" element={<Navigate to="/visitas" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/visitas" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
